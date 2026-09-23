import "@solver/shared/node"; // .env 로드
import PgBoss from "pg-boss";
import { eq } from "drizzle-orm";
import { leads } from "@solver/db";
import { createContext, runCrawlBatch, auditLead, pollGmail, runFollowup, runDailyDigest, runWeeklyDigest, runOpenDigest, listQueued, prepareMail, sendPrepared } from "@solver/pipeline";
import { nextSendSlot, KR_HOLIDAYS_2026, kstParts } from "@solver/mailer";

/**
 * PRD 11절: pg-boss 하나로 배치·스케줄·이벤트를 처리한다.
 * 잡: crawl, audit, send, poll-gmail, followup, digest(daily/weekly/open)
 * 모든 잡은 멱등 — 파이프라인 함수가 dedupeKey·unique 제약으로 보장.
 */
const ctx = createContext();
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });

boss.on("error", (e) => console.error("[pg-boss]", e));

await boss.start();
const queues = ["crawl", "audit", "send-slot", "poll-gmail", "followup", "digest-daily", "digest-weekly", "digest-open"] as const;
for (const q of queues) await boss.createQueue(q);

// ── 배치 잡 (담당이 CLI/화면에서 enqueue) ──
await boss.work<{ leadIds?: string[]; force?: boolean }>("crawl", { batchSize: 1 }, async ([job]) => {
  const r = await runCrawlBatch(ctx, { leadIds: job!.data.leadIds, force: job!.data.force });
  return r.summary;
});

await boss.work<{ leadId: string; skipGeo?: boolean }>("audit", { batchSize: 1 }, async ([job]) => {
  const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, job!.data.leadId) });
  if (!lead) throw new Error(`lead ${job!.data.leadId} not found`);
  return auditLead(ctx, lead, { skipGeo: job!.data.skipGeo });
});

// ── 발송 슬롯: 화·수·목 10:00 ±15 분에 승인된 큐를 20통 단위로 발송 ──
await boss.work<{ limit?: number }>("send-slot", { batchSize: 1 }, async ([job]) => {
  const { weekday } = kstParts(new Date());
  if (!ctx.settings.send.days.includes(weekday)) return { skipped: "not a send day" };
  const queued = await listQueued(ctx, job!.data.limit ?? 20);
  const results = [];
  for (const lead of queued) {
    const prepared = await prepareMail(ctx, lead);
    results.push({ lead: lead.name, ...(await sendPrepared(ctx, prepared)) });
  }
  return results;
});

// ── 이벤트·스케줄 잡 ──
await boss.work("poll-gmail", { batchSize: 1 }, async () => pollGmail(ctx));
await boss.work("followup", { batchSize: 1 }, async () => runFollowup(ctx));
await boss.work("digest-daily", { batchSize: 1 }, async () => runDailyDigest(ctx));
await boss.work("digest-weekly", { batchSize: 1 }, async () => runWeeklyDigest(ctx));
await boss.work("digest-open", { batchSize: 1 }, async () => runOpenDigest(ctx));

// 스케줄 (KST). pg-boss cron은 UTC 기준이라 tz 옵션을 준다.
const tz = { tz: "Asia/Seoul" };
await boss.schedule("poll-gmail", "* * * * *", {}, tz); // 60초 폴링
await boss.schedule("followup", "0 9 * * *", {}, tz);
await boss.schedule("digest-daily", "0 9 * * *", {}, tz);
await boss.schedule("digest-weekly", "0 9 * * 1", {}, tz);
await boss.schedule("digest-open", "30 10,16 * * *", {}, tz);
// 발송 슬롯: 화·수·목 10:00, ±15분 지터는 잡 안에서 딜레이
await boss.schedule("send-slot", "0 10 * * 2,3,4", { limit: 20 }, { ...tz, startAfter: Math.floor(Math.random() * ctx.settings.send.jitterMinutes * 60) });

console.log(`[worker] started (dryRun=${ctx.dryRun}). next send slot: ${nextSendSlot(new Date(), { holidays: KR_HOLIDAYS_2026 }).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

process.on("SIGINT", async () => {
  await boss.stop({ graceful: true });
  process.exit(0);
});

export { boss };
