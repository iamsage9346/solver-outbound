import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { contacts, crawlResults, events, leads, messages, sequences, tasks, templates, upsertTask } from "@solver/db";
import { buildCallScript, composeMessage, planSequence, KR_HOLIDAYS_2026 } from "@solver/mailer";
import { slackMessages } from "@solver/notify";
import type { PipelineContext } from "./context";
import { prepareMail } from "./send";

/** PRD 6단계: 매일 09시. 활성 시퀀스의 다음 단계가 도래한 리드에 태스크·재메일을 만든다. 멱등. */
export async function runFollowup(ctx: PipelineContext, now = new Date()) {
  const due = await ctx.db.select().from(sequences).where(and(eq(sequences.state, "active"), lte(sequences.nextStepAt, now)));
  let calls = 0,
    remails = 0;
  for (const seq of due) {
    const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, seq.leadId) });
    if (!lead) continue;
    const [d0] = await ctx.db.select().from(messages).where(and(eq(messages.sequenceId, seq.id), eq(messages.step, 0))).limit(1);
    const plan = planSequence(d0?.sentAt ?? seq.createdAt, ctx.settings.followup, { holidays: KR_HOLIDAYS_2026 });
    const nextStep = seq.currentStep + 1;
    const step = plan.find((p) => p.step === nextStep);
    if (!step) {
      await ctx.db.update(sequences).set({ state: "done", nextStepAt: null }).where(eq(sequences.id, seq.id));
      continue;
    }
    if (step.kind === "call") {
      const [audit] = await ctx.db.select().from(ctx.db._.fullSchema.audits).where(eq(ctx.db._.fullSchema.audits.leadId, lead.id)).limit(1);
      const script = buildCallScript({ 병원명: lead.name, 지역: lead.sggu ?? "", 플레이스순위: lead.placeRank ?? undefined, 개선포인트1: audit?.topFixes[0] });
      const t = await upsertTask(ctx.db, { leadId: lead.id, sequenceId: seq.id, type: "call", title: `D+2 전화: ${lead.name}`, dueAt: step.at, script, dedupeKey: `seq:${seq.id}:step:${nextStep}` });
      if (t) calls++;
      await ctx.db.update(leads).set({ nextAction: "D+2 전화", nextActionAt: step.at }).where(eq(leads.id, lead.id));
    } else {
      // 재메일: 승인 큐를 거치지 않고 자동 발송 (PRD Phase 2). 실패 시 태스크로 남김
      const prepared = await prepareMail(ctx, lead, step.templateKey!, "");
      const [dup] = await ctx.db.select({ id: messages.id }).from(messages).where(and(eq(messages.sequenceId, seq.id), eq(messages.step, nextStep))).limit(1);
      if (!dup) {
        if (prepared.ok || (prepared.reasons.length === 1 && prepared.reasons[0] === "진단 리포트 미승인")) {
          const res = await ctx.mail.sendMail({ to: prepared.to, subject: prepared.subject, text: prepared.text, threadId: d0?.gmailThreadId ?? undefined, dryRun: ctx.dryRun });
          await ctx.db.insert(messages).values({ leadId: lead.id, sequenceId: seq.id, step: nextStep, direction: "out", gmailMsgId: res.gmailMsgId, gmailThreadId: res.gmailThreadId, to: prepared.to, subject: prepared.subject, body: prepared.text, sentAt: new Date(), trackingToken: prepared.trackingToken, dryRun: !!res.dryRun }).onConflictDoNothing();
          remails++;
        } else {
          await upsertTask(ctx.db, { leadId: lead.id, sequenceId: seq.id, type: "email", title: `${step.templateKey} 수동 발송 필요: ${prepared.reasons.join(", ")}`, dueAt: step.at, dedupeKey: `seq:${seq.id}:step:${nextStep}` });
        }
      }
    }
    const following = plan.find((p) => p.step === nextStep + 1);
    await ctx.db.update(sequences).set({ currentStep: nextStep, nextStepAt: following?.at ?? null, state: following ? "active" : "done" }).where(eq(sequences.id, seq.id));
  }
  ctx.log(null, "팔로업 실행", { due: due.length, calls, remails });
  return { due: due.length, calls, remails };
}

/** 매일 09:00 일일 요약 */
export async function runDailyDigest(ctx: PipelineContext, now = new Date()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const yStart = new Date(dayStart.getTime() - 86_400_000);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const count = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0);
  const sent = await count(ctx.db.select({ c: sql<number>`count(*)` }).from(messages).where(and(eq(messages.direction, "out"), eq(messages.isTest, false), gte(messages.sentAt, yStart), lt(messages.sentAt, dayStart))));
  const evCount = (type: "click" | "reply" | "booking") => count(ctx.db.select({ c: sql<number>`count(*)` }).from(events).where(and(eq(events.type, type), gte(events.occurredAt, yStart), lt(events.occurredAt, dayStart))));
  const [clicks, replies, meetings] = await Promise.all([evCount("click"), evCount("reply"), evCount("booking")]);
  const callRows = await ctx.db.select({ leadId: tasks.leadId }).from(tasks).where(and(eq(tasks.type, "call"), eq(tasks.status, "open"), lt(tasks.dueAt, dayEnd)));
  const callTasksToday: { name: string; phone: string | null }[] = [];
  for (const r of callRows) {
    const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, r.leadId) });
    const phone = await ctx.db.query.contacts.findFirst({ where: and(eq(contacts.leadId, r.leadId), eq(contacts.type, "phone")) });
    if (lead) callTasksToday.push({ name: lead.name, phone: phone?.value ?? null });
  }
  const crawlFailures = await count(ctx.db.select({ c: sql<number>`count(*)` }).from(crawlResults).where(and(sql`${crawlResults.errorCode} is not null`, gte(crawlResults.fetchedAt, yStart))));
  const [lag] = await ctx.db.select({ avg: sql<number | null>`avg(extract(epoch from (${events.notifiedAt} - ${events.occurredAt})))` }).from(events).where(and(sql`${events.notifiedAt} is not null`, gte(events.occurredAt, yStart)));
  const [cost] = await ctx.db.select({ sum: sql<number | null>`coalesce(sum(${ctx.db._.fullSchema.auditRuns.costKrw}), 0)` }).from(ctx.db._.fullSchema.auditRuns);
  const msg = slackMessages.dailyDigest({ date: dayStart.toISOString().slice(0, 10), sent, clicks, replies, meetings, callTasksToday, crawlFailures, avgNotifyLagSec: lag?.avg == null ? null : Math.round(Number(lag.avg)), geoCostKrw: Math.round(Number(cost?.sum ?? 0)) });
  await ctx.slack.post(msg);
  return msg.text;
}

/** 월요일 09:00 주간 현황: 채널·소개 경로별 발송/응답/미팅 */
export async function runWeeklyDigest(ctx: PipelineContext) {
  const rows = await ctx.db
    .select({ channel: sql<string>`coalesce(${leads.utmSource}, case when ${leads.referrer} is not null then '소개' else '메일' end)`, sent: sql<number>`count(*) filter (where ${leads.status} in ('sent','replied','meeting','proposal','won'))`, replied: sql<number>`count(*) filter (where ${leads.status} in ('replied','meeting','proposal','won'))`, meetings: sql<number>`count(*) filter (where ${leads.status} in ('meeting','proposal','won'))` })
    .from(leads)
    .groupBy(sql`1`);
  const msg = slackMessages.weeklyDigest(rows.map((r) => ({ channel: r.channel, sent: Number(r.sent), replied: Number(r.replied), meetings: Number(r.meetings) })));
  await ctx.slack.post(msg);
  return rows;
}

/** 오픈 묶음 알림 (10:30, 16:00) */
export async function runOpenDigest(ctx: PipelineContext, sinceHours = 6) {
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const rows = await ctx.db.select({ leadId: events.leadId, c: sql<number>`count(*)` }).from(events).where(and(eq(events.type, "open"), gte(events.occurredAt, since), sql`${events.notifiedAt} is null`)).groupBy(events.leadId);
  const items: { name: string; count: number }[] = [];
  for (const r of rows) {
    if (!r.leadId) continue;
    const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, r.leadId) });
    if (lead) items.push({ name: lead.name, count: Number(r.c) });
  }
  if (items.length) {
    await ctx.slack.post(slackMessages.openDigest(items));
    await ctx.db.update(events).set({ notifiedAt: new Date() }).where(and(eq(events.type, "open"), gte(events.occurredAt, since), sql`${events.notifiedAt} is null`));
  }
  return items;
}

export { composeMessage, templates };
