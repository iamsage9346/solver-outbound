#!/usr/bin/env tsx
/**
 * PRD 11절: 1차 라운드용 CLI. 대시보드 없이 list → crawl → audit → approve → send → poll 을 돌린다.
 *   pnpm cli list --sido 서울 --sggu 강남구
 *   pnpm cli import leads.csv           (구글시트 CSV, ykiho 기준 병합)
 *   pnpm cli place place.json           (강우 플레이스 데이터)
 *   pnpm cli crawl [--force] [--limit 50]
 *   pnpm cli audit [--lead <id>] [--skip-geo]
 *   pnpm cli approve <auditId|all> --by 상화
 *   pnpm cli preview <leadId>           (메일 초안 미리보기)
 *   pnpm cli send --test me@solver.kr   (테스트 발송) / pnpm cli send --go (실발송)
 *   pnpm cli poll                       (Gmail 1회 폴링)
 *   pnpm cli followup / digest / weekly
 *   pnpm cli status
 * DRY_RUN=true(기본)면 외부 호출 없이 전체 흐름이 돈다.
 */
import "@solver/shared/node";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { audits, leads, messages, tasks } from "@solver/db";
import { LEAD_STATUS_LABEL, isDryRun } from "@solver/shared";
import { createContext, runList, importCsvRows, runCrawlBatch, auditLead, approveAudit, importPlaceData, prepareMail, sendPrepared, listQueued, pollGmail, runFollowup, runDailyDigest, runWeeklyDigest, type PlaceInput } from "@solver/pipeline";

const ctx = createContext();
const program = new Command().name("outreach").description(`병의원 GEO 아웃리치 CLI (DRY_RUN=${isDryRun()})`);

program
  .command("list")
  .requiredOption("--sido <sido>", "시도 (서울/경기/인천)")
  .option("--sggu <name>", "시군구 이름 필터")
  .option("--sggu-cd <code>", "시군구 코드")
  .option("--dept <name>", "진료과", "정형외과")
  .option("--limit <n>", "최대 건수")
  .action(async (o) => {
    const r = await runList(ctx, { sido: o.sido, sgguName: o.sggu, sgguCd: o.sgguCd, dept: o.dept, limit: o.limit ? Number(o.limit) : undefined });
    console.table(r.byTier);
    console.log(r);
    process.exit(0);
  });

program.command("import <csv>").description("구글시트 CSV → ykiho 기준 병합").action(async (file) => {
  const rows = parse(readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  console.log(await importCsvRows(ctx, rows));
  process.exit(0);
});

program.command("place <json>").description("강우 플레이스 데이터(JSON 배열) 입력").action(async (file) => {
  const rows = JSON.parse(readFileSync(file, "utf8")) as PlaceInput[];
  console.log("place rows merged:", await importPlaceData(ctx, rows));
  process.exit(0);
});

program
  .command("crawl")
  .option("--force", "이미 크롤한 리드도 다시")
  .option("--limit <n>", "최대", "50")
  .option("--lead <id>", "리드 1개")
  .action(async (o) => {
    const r = await runCrawlBatch(ctx, { force: o.force, limit: Number(o.limit), leadIds: o.lead ? [o.lead] : undefined });
    console.log(r.summary);
    process.exit(0);
  });

program
  .command("audit")
  .option("--lead <id>", "리드 1개 (없으면 크롤 완료·미진단 리드 전부)")
  .option("--skip-geo", "GEO 엔진 호출 생략")
  .option("--force", "이미 진단한 리드도 다시")
  .option("--limit <n>", "최대", "20")
  .action(async (o) => {
    let targets;
    if (o.lead) targets = await ctx.db.select().from(leads).where(eq(leads.id, o.lead));
    else {
      const rows = await ctx.db
        .select({ lead: leads })
        .from(leads)
        .where(and(sql`${leads.tier} <> 'EXCLUDED'`, o.force ? sql`true` : sql`not exists (select 1 from ${audits} where ${audits.leadId} = ${leads.id} and ${audits.landingToken} is not null)`))
        .limit(Number(o.limit));
      targets = rows.map((r) => r.lead);
    }
    for (const lead of targets) {
      const t0 = Date.now();
      const r = await auditLead(ctx, lead, { skipGeo: o.skipGeo });
      console.log(`${lead.name}: place ${r.scores.place ?? "-"} / site ${r.scores.site ?? "-"} / geo ${r.scores.geo ?? "-"} · 금지어 ${r.bannedTerms.length} · ₩${Math.round(r.costKrw)} · ${((Date.now() - t0) / 1000).toFixed(1)}s → ${ctx.appUrl}/report/${r.landingToken}`);
    }
    process.exit(0);
  });

program
  .command("approve <auditId>")
  .description("리포트 승인 → 발송 큐. 'all'이면 금지어 없는 미승인 전부")
  .requiredOption("--by <name>")
  .action(async (id, o) => {
    const ids = id === "all" ? (await ctx.db.select({ id: audits.id }).from(audits).where(isNull(audits.approvedAt))).map((r) => r.id) : [id];
    for (const a of ids) console.log(a, await approveAudit(ctx, a, o.by));
    process.exit(0);
  });

program.command("preview <leadId>").option("--template <key>", "템플릿", "cold_geo").action(async (leadId, o) => {
  const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error("lead not found");
  const p = await prepareMail(ctx, lead, o.template);
  console.log(`To: ${p.to}\nSubject: ${p.subject}\n\n${p.text}\n\n--- ok=${p.ok} ${p.reasons.join("; ")}\n첨부: ${p.attachments.map((a) => a.filename).join(", ") || "없음"}`);
  process.exit(0);
});

program
  .command("send")
  .description("승인된 큐 발송. --test <주소>면 본인에게 테스트, --go 여야 실발송")
  .option("--test <email>")
  .option("--go")
  .option("--limit <n>", "최대", "20")
  .option("--lead <id>")
  .action(async (o) => {
    const queued = o.lead ? await ctx.db.select().from(leads).where(eq(leads.id, o.lead)) : await listQueued(ctx, Number(o.limit));
    if (!o.test && !o.go) {
      console.log(`발송 대기 ${queued.length}곳. --test <주소>로 먼저 확인한 뒤 --go 로 실발송하세요.`);
      for (const l of queued) console.log(` - ${l.name} (${l.tier})`);
      process.exit(0);
    }
    // PRD 7절: 테스트 발송 기록이 있어야 실발송 활성화
    if (o.go) {
      const [t] = await ctx.db.select({ id: messages.id }).from(messages).where(eq(messages.isTest, true)).limit(1);
      if (!t) {
        console.error("테스트 발송 기록이 없습니다. 먼저 --test <주소> 로 확인하세요.");
        process.exit(1);
      }
    }
    for (const lead of queued) {
      const p = await prepareMail(ctx, lead);
      const r = await sendPrepared(ctx, p, { isTest: !!o.test, testTo: o.test });
      console.log(`${lead.name}: ${r.sent ? "sent" : "skip"} ${"reason" in r ? r.reason : ""} ${"dryRun" in r && r.dryRun ? "(dry-run)" : ""}`);
      if (o.test) break; // 테스트는 1통만
    }
    process.exit(0);
  });

program.command("poll").action(async () => {
  console.log(await pollGmail(ctx));
  process.exit(0);
});
program.command("followup").action(async () => {
  console.log(await runFollowup(ctx));
  process.exit(0);
});
program.command("digest").action(async () => {
  console.log(await runDailyDigest(ctx));
  process.exit(0);
});
program.command("weekly").action(async () => {
  console.log(await runWeeklyDigest(ctx));
  process.exit(0);
});

program.command("status").action(async () => {
  const byStatus = await ctx.db.select({ status: leads.status, c: sql<number>`count(*)` }).from(leads).groupBy(leads.status);
  console.table(byStatus.map((r) => ({ 상태: LEAD_STATUS_LABEL[r.status], 수: Number(r.c) })));
  const openTasks = await ctx.db.select().from(tasks).where(eq(tasks.status, "open")).orderBy(tasks.dueAt).limit(10);
  console.log("열린 태스크:", openTasks.map((t) => `${t.title} @ ${t.dueAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`));
  const recent = await ctx.db.select().from(messages).orderBy(desc(messages.createdAt)).limit(5);
  console.log("최근 메시지:", recent.map((m) => `${m.direction} ${m.subject} ${m.dryRun ? "(dry)" : ""}`));
  process.exit(0);
});

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});
