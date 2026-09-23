import { and, desc, eq, gte, sql } from "drizzle-orm";
import { audits, contacts, isSuppressed, leads, messages, sequences, templates, type Lead } from "@solver/db";
import { composeMessage, nextSendSlot, planSequence, capCheck, KR_HOLIDAYS_2026 } from "@solver/mailer";
import { personalizeOpener } from "@solver/llm";
import { token } from "@solver/shared/node";
import { existsSync } from "node:fs";
import type { PipelineContext } from "./context";

export interface PreparedMail {
  leadId: string;
  to: string;
  subject: string;
  text: string;
  ok: boolean;
  reasons: string[];
  vars: Record<string, string | number | null>;
  attachments: { filename: string; path: string; mimeType: string }[];
  trackingToken: string;
}

/** 이메일 우선순위: 원장 → 대표 → 행정 → 일반, 개인 추정은 후순위(기본 제외) */
export async function pickEmail(ctx: PipelineContext, leadId: string, allowPersonal = false) {
  const rows = await ctx.db.select().from(contacts).where(and(eq(contacts.leadId, leadId), eq(contacts.type, "email")));
  const order = { director: 0, representative: 1, admin: 2, general: 3 } as const;
  return rows
    .filter((c) => allowPersonal || !c.isPersonal)
    .sort((a, b) => order[a.role] - order[b.role] || (b.verifiedAt ? 1 : 0) - (a.verifiedAt ? 1 : 0) || b.confidence - a.confidence)[0] ?? null;
}

/** PRD 7절: 승인된 진단 + 템플릿 → 메일 초안 (발송 전 승인 큐용). 변수 비면 ok=false */
export async function prepareMail(ctx: PipelineContext, lead: Lead, templateKey = "cold_geo", opener?: string): Promise<PreparedMail> {
  const [tpl] = await ctx.db.select().from(templates).where(eq(templates.key, templateKey)).limit(1);
  if (!tpl) throw new Error(`템플릿 없음: ${templateKey}`);
  const [audit] = await ctx.db.select().from(audits).where(eq(audits.leadId, lead.id)).orderBy(desc(audits.auditedAt)).limit(1);
  const email = await pickEmail(ctx, lead.id);
  const trackingToken = token();
  const reasons: string[] = [];

  if (!audit?.approvedAt) reasons.push("진단 리포트 미승인");
  if (!email) reasons.push("이메일 없음 (전화 우선)");
  const suppressed = email ? await isSuppressed(ctx.db, [email.value, email.value.split("@")[1] ?? "", lead.ykiho ?? ""]) : null;
  if (suppressed) reasons.push(`억제 목록: ${suppressed}`);
  if (lead.status === "unsubscribed") reasons.push("수신거부 리드");

  const firstLine = opener ?? (await personalizeOpener({ name: lead.name, siteSummary: null, topFix: audit?.topFixes[0] ?? null, placeRank: lead.placeRank, sggu: lead.sggu }).catch(() => ""));
  const geo = audit?.geo;
  const vars: Record<string, string | number | null> = {
    병원명: lead.name,
    지역: lead.sggu ?? lead.sido ?? null,
    첫문장: firstLine,
    플레이스순위: audit?.place?.keywords[0]?.rank ?? lead.placeRank ?? null,
    리뷰수: audit?.place?.reviewCnt ?? lead.reviewCnt ?? null,
    GEO언급수: geo?.mentionedCnt ?? null,
    GEO질문수: geo?.questionCnt ?? null,
    경쟁병원1: geo?.competitors[0]?.name ?? null,
    개선포인트1: audit?.topFixes[0] ?? null,
    리포트링크: audit?.landingToken ? `${ctx.appUrl}/r/${trackingToken}?to=report` : null,
    예약링크: `${ctx.appUrl}/r/${trackingToken}?to=booking`,
    수신거부링크: `${ctx.appUrl}/r/${trackingToken}?to=unsubscribe`,
    소개자: lead.referrer ?? null,
    소개자병원에서한일: null,
  };
  const composed = composeMessage({ template: tpl, vars, adLabel: ctx.settings.send.adLabel, sender: { name: ctx.settings.send.sender.name, address: process.env.GMAIL_SENDER ?? "", phone: ctx.settings.send.sender.phone } });
  reasons.push(...composed.reasons);

  const attachments = audit?.reportPdfPath && existsSync(audit.reportPdfPath) ? [{ filename: `${lead.name}_진단리포트.pdf`, path: audit.reportPdfPath, mimeType: "application/pdf" }] : [];
  return { leadId: lead.id, to: email?.value ?? "", subject: composed.subject, text: composed.text, ok: composed.ok && reasons.length === 0, reasons, vars, attachments, trackingToken };
}

/** 실제(또는 드라이런) 발송 + 시퀀스 등록. 멱등: 같은 sequence step 0 이 있으면 스킵 */
export async function sendPrepared(ctx: PipelineContext, prepared: PreparedMail, opts: { campaignId?: string | null; isTest?: boolean; testTo?: string } = {}) {
  const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, prepared.leadId) });
  if (!lead) throw new Error("lead not found");
  if (!prepared.ok && !opts.isTest) return { sent: false, reason: prepared.reasons.join("; ") };

  // 상한 체크
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const hourStart = new Date(now.getTime() - 3600_000);
  const cnt = async (since: Date) => Number((await ctx.db.select({ c: sql<number>`count(*)` }).from(messages).where(and(eq(messages.direction, "out"), eq(messages.isTest, false), gte(messages.sentAt, since))))[0]?.c ?? 0);
  const toLead = Number((await ctx.db.select({ c: sql<number>`count(*)` }).from(messages).where(and(eq(messages.direction, "out"), eq(messages.leadId, lead.id), eq(messages.isTest, false))))[0]?.c ?? 0);
  if (!opts.isTest) {
    const cap = capCheck({ sentToday: await cnt(dayStart), sentThisHour: await cnt(hourStart), sentToLead: toLead, caps: { dailyCap: ctx.settings.send.dailyCap, hourlyCap: ctx.settings.send.hourlyCap, perLeadCap: ctx.settings.send.perLeadCap } });
    if (!cap.allowed) return { sent: false, reason: cap.reason ?? "cap", carryOver: cap.carryOver, nextSlot: nextSendSlot(now, { holidays: KR_HOLIDAYS_2026 }) };
  }

  let sequenceId: string | null = null;
  if (!opts.isTest) {
    const [existing] = await ctx.db.select().from(sequences).where(and(eq(sequences.leadId, lead.id), eq(sequences.state, "active"))).limit(1);
    if (existing) {
      const [dup] = await ctx.db.select({ id: messages.id }).from(messages).where(and(eq(messages.sequenceId, existing.id), eq(messages.step, 0), eq(messages.isTest, false))).limit(1);
      if (dup) return { sent: false, reason: "이미 D0 발송됨 (멱등)" };
      sequenceId = existing.id;
    } else {
      const [seq] = await ctx.db.insert(sequences).values({ leadId: lead.id, campaignId: opts.campaignId ?? null, currentStep: 0, state: "active" }).returning();
      sequenceId = seq!.id;
    }
  }

  const res = await ctx.mail.sendMail({ to: opts.testTo ?? prepared.to, subject: prepared.subject, text: prepared.text, attachments: prepared.attachments, dryRun: ctx.dryRun });
  const sentAt = new Date();
  const [msg] = await ctx.db
    .insert(messages)
    .values({
      leadId: lead.id,
      sequenceId,
      step: opts.isTest ? null : 0,
      direction: "out",
      gmailMsgId: res.gmailMsgId,
      gmailThreadId: res.gmailThreadId,
      to: opts.testTo ?? prepared.to,
      from: process.env.GMAIL_SENDER ?? null,
      subject: prepared.subject,
      body: prepared.text,
      sentAt,
      attachments: prepared.attachments.map((a) => ({ name: a.filename, path: a.path })),
      trackingToken: prepared.trackingToken,
      dryRun: !!res.dryRun,
      isTest: !!opts.isTest,
    })
    .returning();

  if (!opts.isTest && sequenceId) {
    const plan = planSequence(sentAt, ctx.settings.followup, { holidays: KR_HOLIDAYS_2026 });
    await ctx.db.update(sequences).set({ currentStep: 0, nextStepAt: plan[0]!.at }).where(eq(sequences.id, sequenceId));
    await ctx.db.update(leads).set({ status: "sent", lastActivityAt: sentAt, nextAction: "D+2 전화", nextActionAt: plan[0]!.at }).where(eq(leads.id, lead.id));
  }
  ctx.log(lead.id, opts.isTest ? "테스트 발송" : "발송", { to: opts.testTo ?? prepared.to, gmailMsgId: res.gmailMsgId, dryRun: res.dryRun });
  return { sent: true, messageId: msg!.id, gmailMsgId: res.gmailMsgId, dryRun: !!res.dryRun };
}

/** 발송 큐: status=queued 리드 중 승인된 것들 */
export async function listQueued(ctx: PipelineContext, limit = 40) {
  return ctx.db.select().from(leads).where(eq(leads.status, "queued")).orderBy(leads.tier, leads.name).limit(limit);
}
