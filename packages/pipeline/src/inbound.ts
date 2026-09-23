import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { addSuppression, contacts, events, leads, messages, recordEvent, sequences, settings, tasks, upsertTask, type Lead } from "@solver/db";
import { detectUnsubscribeIntent, parseBounce, shouldStopSequence, buildCallScript, type InboundMail } from "@solver/mailer";
import { analyzeReply } from "@solver/llm";
import { slackMessages } from "@solver/notify";
import type { PipelineContext } from "./context";

const POLL_STATE_KEY = "poll:gmail";

async function leadRef(ctx: PipelineContext, lead: Lead) {
  const [phone] = await ctx.db.select({ v: contacts.value }).from(contacts).where(and(eq(contacts.leadId, lead.id), eq(contacts.type, "phone"))).limit(1);
  return { id: lead.id, name: lead.name, phone: phone?.v ?? null, appUrl: ctx.appUrl };
}

/** 회신·예약·수신거부·바운스 → 남은 시퀀스 단계 즉시 취소 (60초 내) */
export async function stopSequences(ctx: PipelineContext, leadId: string, reason: NonNullable<ReturnType<typeof shouldStopSequence>>) {
  await ctx.db.update(sequences).set({ state: "stopped", stopReason: reason, nextStepAt: null }).where(and(eq(sequences.leadId, leadId), eq(sequences.state, "active")));
  await ctx.db.update(tasks).set({ status: "cancelled" }).where(and(eq(tasks.leadId, leadId), eq(tasks.status, "open"), eq(tasks.type, "email")));
  if (reason === "unsubscribe" || reason === "bounce") {
    await ctx.db.update(tasks).set({ status: "cancelled" }).where(and(eq(tasks.leadId, leadId), eq(tasks.status, "open")));
  }
}

/** 이메일 값 + 도메인 + ykiho 억제. 개인 추정 메일은 값 자체를 해시로 보관 */
export async function suppressLead(ctx: PipelineContext, lead: Lead, email: string | null, reason: string, sourceMessageId?: string | null) {
  const { createHash } = await import("node:crypto");
  if (email) {
    const row = await ctx.db.query.contacts.findFirst({ where: and(eq(contacts.leadId, lead.id), eq(contacts.type, "email"), eq(contacts.value, email)) });
    const value = row?.isPersonal ? `sha256:${createHash("sha256").update(email.toLowerCase()).digest("hex")}` : email.toLowerCase();
    await addSuppression(ctx.db, { value, kind: "email", reason, sourceMessageId });
    if (row?.isPersonal) await ctx.db.update(contacts).set({ value }).where(eq(contacts.id, row.id));
    const domain = email.split("@")[1];
    if (domain && !row?.isPersonal) await addSuppression(ctx.db, { value: domain.toLowerCase(), kind: "domain", reason, sourceMessageId });
  }
  if (lead.ykiho) await addSuppression(ctx.db, { value: lead.ykiho, kind: "ykiho", reason, sourceMessageId });
  await ctx.db.update(leads).set({ status: "unsubscribed", excludedReason: reason }).where(eq(leads.id, lead.id));
}

/** 스레드 매칭: In-Reply-To·스레드 ID → 발송 레코드 → 리드. 실패 시 도메인 추정 */
async function matchLead(ctx: PipelineContext, mail: InboundMail): Promise<{ lead: Lead | null; outMessageId: string | null; matchedBy: string }> {
  const [byThread] = await ctx.db.select().from(messages).where(and(eq(messages.gmailThreadId, mail.gmailThreadId), eq(messages.direction, "out"))).limit(1);
  if (byThread?.leadId) {
    const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, byThread.leadId) });
    return { lead: lead ?? null, outMessageId: byThread.id, matchedBy: "thread" };
  }
  const fromEmail = mail.from.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
  if (fromEmail) {
    const c = await ctx.db.query.contacts.findFirst({ where: and(eq(contacts.type, "email"), sql`lower(${contacts.value}) = ${fromEmail}`) });
    if (c) {
      const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, c.leadId) });
      return { lead: lead ?? null, outMessageId: null, matchedBy: "email" };
    }
    const domain = fromEmail.split("@")[1]!;
    const c2 = await ctx.db.query.contacts.findFirst({ where: and(eq(contacts.type, "email"), sql`lower(${contacts.value}) like ${"%@" + domain}`) });
    if (c2) {
      const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, c2.leadId) });
      return { lead: lead ?? null, outMessageId: null, matchedBy: "domain" };
    }
  }
  return { lead: null, outMessageId: null, matchedBy: "none" };
}

/** 회신 1건 처리: 저장 → 분류 → 억제/중단 → Slack. 멱등(gmail_msg_id unique) */
export async function processInbound(ctx: PipelineContext, mail: InboundMail) {
  const [exists] = await ctx.db.select({ id: messages.id }).from(messages).where(eq(messages.gmailMsgId, mail.gmailMsgId)).limit(1);
  if (exists) return { skipped: true };

  const { lead, outMessageId, matchedBy } = await matchLead(ctx, mail);
  const bounce = mail.isBounce ? parseBounce(mail) : null;

  let classification: import("@solver/shared").ReplyClass;
  let summary = "";
  let proposedTimes: string[] = [];
  if (bounce?.isBounce) {
    classification = "bounce";
    summary = `${bounce.hard ? "하드" : "소프트"} 바운스: ${bounce.reason}`;
  } else if (mail.isAutoReply) {
    classification = "auto_reply";
    summary = "부재중 자동응답";
  } else if (detectUnsubscribeIntent(mail.textBody)) {
    classification = "unsubscribe";
    summary = "수신거부 요청";
  } else {
    const a = await analyzeReply({ from: mail.from, subject: mail.subject, body: mail.textBody }).catch(() => ({ classification: "other" as const, summary: mail.textBody.slice(0, 120), proposedTimes: [] as string[], nextAction: "" }));
    classification = a.classification;
    summary = a.summary;
    proposedTimes = a.proposedTimes;
  }

  const [msg] = await ctx.db
    .insert(messages)
    .values({ leadId: lead?.id ?? null, direction: "in", gmailMsgId: mail.gmailMsgId, gmailThreadId: mail.gmailThreadId, to: mail.to, from: mail.from, subject: mail.subject, body: mail.textBody, receivedAt: mail.receivedAt, classification, summary, proposedTimes })
    .onConflictDoNothing({ target: messages.gmailMsgId })
    .returning();
  if (!msg) return { skipped: true };

  if (!lead) {
    ctx.log(null, `미매칭 회신 ${mail.from} · ${mail.subject}`);
    return { skipped: false, unmatched: true, messageId: msg.id };
  }

  const ref = await leadRef(ctx, lead);
  const eventType = classification === "bounce" ? "bounce" : classification === "unsubscribe" ? "unsubscribe" : "reply";
  const ev = await recordEvent(ctx.db, { leadId: lead.id, messageId: msg.id, type: eventType, payload: { classification, summary, matchedBy, outMessageId }, dedupeKey: `mail:${mail.gmailMsgId}`, occurredAt: mail.receivedAt });
  if (!ev) return { skipped: true };

  // 억제·중단은 사람 확인 없이 즉시
  if (classification === "unsubscribe" || (classification === "bounce" && bounce?.hard)) {
    const email = bounce?.address ?? mail.from.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? null;
    await suppressLead(ctx, lead, email, classification === "unsubscribe" ? "수신거부 회신" : `하드 바운스: ${bounce?.reason}`, msg.id);
    await stopSequences(ctx, lead.id, classification === "unsubscribe" ? "unsubscribe" : "bounce");
    const r = await ctx.slack.post(slackMessages.suppressed(ref, { kind: classification === "unsubscribe" ? "unsubscribe" : "hard_bounce", reason: summary }));
    await ctx.db.update(events).set({ notifiedAt: new Date(), slackTs: r.ts }).where(eq(events.id, ev.id));
    return { skipped: false, classification, suppressed: true };
  }
  if (classification === "bounce") {
    // 소프트 바운스: 3일 후 1회 재시도 태스크
    await upsertTask(ctx.db, { leadId: lead.id, type: "email", title: `소프트 바운스 재시도: ${lead.name}`, dueAt: new Date(Date.now() + 3 * 86_400_000), dedupeKey: `softbounce:${mail.gmailMsgId}` });
    return { skipped: false, classification };
  }
  if (classification === "auto_reply") return { skipped: false, classification };

  await stopSequences(ctx, lead.id, "reply");
  await ctx.db.update(leads).set({ status: lead.status === "meeting" || lead.status === "proposal" || lead.status === "won" ? lead.status : "replied", nextAction: classification === "positive" ? "예약 링크 회신" : "답장", nextActionAt: new Date() }).where(eq(leads.id, lead.id));
  const r = await ctx.slack.post(slackMessages.replyArrived(ref, { classification, summary, proposedTimes, messageId: msg.id }));
  if (process.env.SLACK_OWNER_USER_ID) await ctx.slack.dm(process.env.SLACK_OWNER_USER_ID, slackMessages.replyArrived(ref, { classification, summary, proposedTimes, messageId: msg.id }));
  const notifiedAt = new Date();
  await ctx.db.update(events).set({ notifiedAt, slackTs: r.ts }).where(eq(events.id, ev.id));
  ctx.log(lead.id, `회신 알림 (${classification}) 지연 ${Math.round((notifiedAt.getTime() - mail.receivedAt.getTime()) / 1000)}s`);
  return { skipped: false, classification, messageId: msg.id };
}

/** Gmail 60초 폴링. 연속 3회 실패 시 시스템 알림 */
export async function pollGmail(ctx: PipelineContext) {
  const state = (await ctx.db.query.settings.findFirst({ where: eq(settings.key, POLL_STATE_KEY) }))?.value as { afterEpochSec?: number; failures?: number } | undefined;
  const afterEpochSec = state?.afterEpochSec ?? Math.floor(Date.now() / 1000) - 3600;
  try {
    const mails = await ctx.mail.listMessagesSince({ afterEpochSec, maxResults: 50 });
    let processed = 0;
    for (const m of mails) {
      const r = await processInbound(ctx, m);
      if (!r.skipped) processed++;
    }
    const next = { afterEpochSec: Math.max(afterEpochSec, ...mails.map((m) => Math.floor(m.receivedAt.getTime() / 1000) + 1)), failures: 0 };
    await ctx.db.insert(settings).values({ key: POLL_STATE_KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } });
    return { fetched: mails.length, processed };
  } catch (e) {
    const failures = (state?.failures ?? 0) + 1;
    await ctx.db.insert(settings).values({ key: POLL_STATE_KEY, value: { afterEpochSec, failures } }).onConflictDoUpdate({ target: settings.key, set: { value: { afterEpochSec, failures } } });
    if (failures >= 3) await ctx.slack.post(slackMessages.systemAlert(`Gmail 폴링 ${failures}회 연속 실패: ${(e as Error).message}`));
    throw e;
  }
}

/** 추적 링크 클릭 (/r/{token}) → 이벤트 + Slack */
export async function handleClick(ctx: PipelineContext, trackingToken: string, to: "report" | "booking" | "unsubscribe"): Promise<{ redirect: string; leadId: string | null }> {
  const msg = await ctx.db.query.messages.findFirst({ where: eq(messages.trackingToken, trackingToken) });
  if (!msg?.leadId) return { redirect: to === "booking" ? ctx.bookingUrl : ctx.appUrl, leadId: null };
  const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, msg.leadId) });
  if (!lead) return { redirect: ctx.appUrl, leadId: null };
  const ref = await leadRef(ctx, lead);

  if (to === "unsubscribe") {
    await suppressLead(ctx, lead, msg.to, "수신거부 링크", msg.id);
    await stopSequences(ctx, lead.id, "unsubscribe");
    const ev = await recordEvent(ctx.db, { leadId: lead.id, messageId: msg.id, type: "unsubscribe", payload: { via: "link" }, dedupeKey: `unsub:${msg.id}` });
    if (ev) {
      const r = await ctx.slack.post(slackMessages.suppressed(ref, { kind: "unsubscribe", reason: "수신거부 링크 클릭" }));
      await ctx.db.update(events).set({ notifiedAt: new Date(), slackTs: r.ts }).where(eq(events.id, ev.id));
    }
    return { redirect: `${ctx.appUrl}/unsubscribed`, leadId: lead.id };
  }

  const [audit] = await ctx.db.select().from(ctx.db._.fullSchema.audits).where(eq(ctx.db._.fullSchema.audits.leadId, lead.id)).orderBy(desc(ctx.db._.fullSchema.audits.auditedAt)).limit(1);
  const redirect = to === "booking" ? ctx.bookingUrl : audit?.landingToken ? `${ctx.appUrl}/report/${audit.landingToken}` : ctx.appUrl;
  // 같은 링크 클릭 알림은 메시지당 1회 (dedupeKey), 이후 클릭은 이벤트만 누적
  const ev = await recordEvent(ctx.db, { leadId: lead.id, messageId: msg.id, type: "click", payload: { link: to }, dedupeKey: `click:${msg.id}:${to}` });
  if (ev) {
    const since = msg.sentAt ? Math.round((Date.now() - msg.sentAt.getTime()) / 60000) : null;
    const label = since == null ? "-" : since < 60 ? `${since}분` : since < 1440 ? `${Math.round(since / 60)}시간` : `${Math.round(since / 1440)}일`;
    const r = await ctx.slack.post(slackMessages.linkClicked(ref, { link: to, sinceSentLabel: label }));
    await ctx.db.update(events).set({ notifiedAt: new Date(), slackTs: r.ts }).where(eq(events.id, ev.id));
  } else {
    await ctx.db.insert(events).values({ leadId: lead.id, messageId: msg.id, type: "click", payload: { link: to, repeat: true } });
  }
  return { redirect, leadId: lead.id };
}

/** 인바운드 폼 (Tally 등) → 리드 생성/병합 + Slack */
export async function handleFormSubmission(ctx: PipelineContext, f: { hospitalName: string; director?: string | null; contact?: string | null; concern?: string | null; source?: string | null; utm?: { source?: string; medium?: string; campaign?: string }; referrer?: string | null; submissionId: string }) {
  const name = f.hospitalName.trim();
  let lead = await ctx.db.query.leads.findFirst({ where: sql`replace(${leads.name}, ' ', '') = ${name.replace(/\s/g, "")}` });
  if (!lead) {
    [lead] = await ctx.db.insert(leads).values({ name, status: "replied", utmSource: f.utm?.source ?? f.source ?? "form", utmMedium: f.utm?.medium, utmCampaign: f.utm?.campaign, referrer: f.referrer ?? null, tier: "T1", nextAction: "연락", nextActionAt: new Date() }).returning();
  } else {
    await ctx.db.update(leads).set({ status: lead.status === "listed" || lead.status === "audited" || lead.status === "queued" || lead.status === "sent" ? "replied" : lead.status, utmSource: lead.utmSource ?? f.utm?.source ?? f.source ?? "form", referrer: lead.referrer ?? f.referrer ?? null, nextAction: "연락", nextActionAt: new Date() }).where(eq(leads.id, lead.id));
    await stopSequences(ctx, lead.id, "reply");
  }
  if (!lead) throw new Error("lead upsert failed");
  if (f.contact) {
    const isEmail = f.contact.includes("@");
    await ctx.db.insert(contacts).values({ leadId: lead.id, type: isEmail ? "email" : "phone", value: f.contact.trim(), role: "director", source: "form", confidence: 1, verifiedAt: new Date() }).onConflictDoNothing();
  }
  if (f.director) await ctx.db.insert(contacts).values({ leadId: lead.id, type: "person", value: f.director.trim(), role: "director", source: "form", confidence: 1 }).onConflictDoNothing();
  const ev = await recordEvent(ctx.db, { leadId: lead.id, type: "form", payload: { ...f }, dedupeKey: `form:${f.submissionId}` });
  if (ev) {
    const r = await ctx.slack.post(slackMessages.formSubmitted(await leadRef(ctx, lead), { director: f.director, concern: f.concern, source: f.source ?? f.utm?.source }));
    await ctx.db.update(events).set({ notifiedAt: new Date(), slackTs: r.ts }).where(eq(events.id, ev.id));
  }
  return { leadId: lead.id };
}

/** 예약 확정 (Google Calendar 예약 페이지 / 웹훅) → 상태 미팅 + 확인 메일·리마인드 태스크 + Slack */
export async function handleBooking(ctx: PipelineContext, b: { eventId: string; hospitalName?: string | null; email?: string | null; startAt: Date; calendarUrl?: string; needsDrSong?: boolean }) {
  let lead: Lead | undefined;
  if (b.email) {
    const c = await ctx.db.query.contacts.findFirst({ where: and(eq(contacts.type, "email"), sql`lower(${contacts.value}) = ${b.email.toLowerCase()}`) });
    if (c) lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, c.leadId) });
  }
  if (!lead && b.hospitalName) lead = await ctx.db.query.leads.findFirst({ where: sql`replace(${leads.name}, ' ', '') = ${b.hospitalName.replace(/\s/g, "")}` });
  if (!lead) {
    [lead] = await ctx.db.insert(leads).values({ name: b.hospitalName ?? b.email ?? "미확인 예약", status: "meeting", tier: "T1", utmSource: "booking" }).returning();
    if (b.email) await ctx.db.insert(contacts).values({ leadId: lead!.id, type: "email", value: b.email, role: "director", source: "form", confidence: 1 }).onConflictDoNothing();
  }
  if (!lead) throw new Error("lead upsert failed");
  const ev = await recordEvent(ctx.db, { leadId: lead.id, type: "booking", payload: { eventId: b.eventId, startAt: b.startAt.toISOString() }, dedupeKey: `booking:${b.eventId}` });
  if (!ev) return { leadId: lead.id, duplicate: true };
  await stopSequences(ctx, lead.id, "booking");
  await ctx.db.update(leads).set({ status: "meeting", nextAction: "미팅 준비 · 전날 재진단", nextActionAt: new Date(b.startAt.getTime() - 86_400_000) }).where(eq(leads.id, lead.id));
  const when = b.startAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  await upsertTask(ctx.db, { leadId: lead.id, type: "meeting", title: `미팅: ${lead.name} ${when}`, dueAt: b.startAt, dedupeKey: `meeting:${b.eventId}` });
  await upsertTask(ctx.db, { leadId: lead.id, type: "email", title: `리마인드 메일: ${lead.name}`, dueAt: new Date(b.startAt.getTime() - 86_400_000), dedupeKey: `remind:${b.eventId}` });
  const r = await ctx.slack.post(slackMessages.bookingConfirmed(await leadRef(ctx, lead), { when, needsDrSong: b.needsDrSong, calendarUrl: b.calendarUrl }));
  await ctx.db.update(events).set({ notifiedAt: new Date(), slackTs: r.ts }).where(eq(events.id, ev.id));
  return { leadId: lead.id };
}

/** 회신 인박스 목록 */
export async function listInbox(ctx: PipelineContext, opts: { classification?: string; unmatched?: boolean; limit?: number } = {}) {
  const where = [eq(messages.direction, "in")];
  if (opts.unmatched) where.push(isNull(messages.leadId));
  if (opts.classification) where.push(eq(messages.classification, opts.classification as never));
  return ctx.db.select().from(messages).where(and(...where)).orderBy(desc(messages.receivedAt)).limit(opts.limit ?? 100);
}

export { buildCallScript, gte };
