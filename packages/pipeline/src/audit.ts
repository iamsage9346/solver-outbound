import { desc, eq } from "drizzle-orm";
import { auditRuns, audits, crawlResults, leads, type Lead, type PlaceAudit } from "@solver/db";
import { createEngines, runGeoAudit } from "@solver/geo";
import { suggestTopFixes } from "@solver/llm";
import { buildScores, checkReportBannedTerms, reportToHtml, reportToPdf, type ReportData } from "@solver/report";
import { token } from "@solver/shared/node";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineContext } from "./context";

/** 강우 플레이스 데이터 (JSON/CSV 입력) — PRD 14절 미결 인터페이스의 초안 */
export interface PlaceInput {
  ykiho: string;
  keywords: { keyword: string; rank: number | null }[];
  reviewCnt: number | null;
  lastReviewAt: string | null;
  missing: string[];
  placeUrl?: string;
  competitors?: { name: string; placeRank: number | null; reviewCnt: number | null }[];
}

export async function importPlaceData(ctx: PipelineContext, rows: PlaceInput[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const [lead] = await ctx.db.select({ id: leads.id }).from(leads).where(eq(leads.ykiho, r.ykiho)).limit(1);
    if (!lead) continue;
    const firstRank = r.keywords[0]?.rank ?? null;
    await ctx.db.update(leads).set({ placeRank: firstRank, reviewCnt: r.reviewCnt }).where(eq(leads.id, lead.id));
    await ctx.db.insert(audits).values({ leadId: lead.id, place: { keywords: r.keywords, reviewCnt: r.reviewCnt, lastReviewAt: r.lastReviewAt, missing: r.missing, placeUrl: r.placeUrl }, scores: null });
    n++;
  }
  return n;
}

export interface AuditOneResult {
  auditId: string;
  landingToken: string;
  scores: ReportData["scores"];
  bannedTerms: string[];
  costKrw: number;
  pdfPath: string | null;
}

/** PRD 6절: 병원 1곳 진단 → audits/audit_runs, 리포트 HTML(+PDF), 랜딩 토큰. */
export async function auditLead(ctx: PipelineContext, lead: Lead, opts: { place?: PlaceInput | null; skipGeo?: boolean } = {}): Promise<AuditOneResult> {
  // 최신 크롤 결과 → 홈페이지 축
  const [crawl] = await ctx.db.select().from(crawlResults).where(eq(crawlResults.leadId, lead.id)).orderBy(desc(crawlResults.fetchedAt)).limit(1);
  const site: ReportData["site"] | null =
    crawl && !crawl.errorCode
      ? {
          https: !!crawl.tech.https,
          mobile: !!crawl.tech.mobileViewport,
          ttfbMs: crawl.tech.ttfbMs ?? null,
          doctorsPage: !!crawl.tech.hasDoctorsPage,
          hoursPage: !!crawl.tech.hasHoursPage,
          schemaOrg: !!crawl.tech.schemaOrg,
        }
      : null;
  const siteRow = site ? { ...site, lastUpdatedEstimate: crawl?.tech.lastModified ?? null } : null;

  // 플레이스 축: 입력값 > 기존 audits.place
  let place: PlaceAudit | null = opts.place
    ? { keywords: opts.place.keywords, reviewCnt: opts.place.reviewCnt, lastReviewAt: opts.place.lastReviewAt, missing: opts.place.missing, placeUrl: opts.place.placeUrl }
    : null;
  if (!place) {
    const [prev] = await ctx.db.select({ place: audits.place }).from(audits).where(eq(audits.leadId, lead.id)).orderBy(desc(audits.auditedAt)).limit(1);
    place = prev?.place ?? null;
  }

  // GEO 축
  let geo: ReportData["geo"] | null = null;
  let geoResult: Awaited<ReturnType<typeof runGeoAudit>> | null = null;
  if (!opts.skipGeo && lead.sggu) {
    const engines = createEngines([...ctx.settings.geo.engines], { dryRun: ctx.dryRun, targetName: lead.name, skipMissing: true, onSkip: (n, why) => ctx.log(lead.id, `GEO 엔진 제외 ${n}: ${why}`) });
    if (engines.length) {
      const ownDomains = [lead.homepage, place?.placeUrl].filter((u): u is string => !!u).map((u) => new URL(u).hostname);
      geoResult = await runGeoAudit({ hospitalName: lead.name, sggu: lead.sggu, emd: lead.emd, ownDomains, engines, repeats: ctx.settings.geo.repeats, costCapKrw: ctx.settings.geo.costCapKrw });
      const byQuery = new Map<string, { mentioned: boolean; engines: Set<string> }>();
      for (const r of geoResult.runs) {
        const q = byQuery.get(r.query) ?? { mentioned: false, engines: new Set<string>() };
        if (r.mentioned) {
          q.mentioned = true;
          q.engines.add(r.engine);
        }
        byQuery.set(r.query, q);
      }
      geo = {
        questionCnt: geoResult.result.questionCnt,
        mentionedCnt: geoResult.result.mentionedCnt,
        mentionRate: geoResult.result.mentionRate,
        questions: [...byQuery.entries()].map(([query, v]) => ({ query, mentioned: v.mentioned, engines: [...v.engines] })),
        failedEngines: Object.entries(geoResult.result.engines).filter(([, s]) => s.failed).map(([n]) => n),
      };
    }
  }

  const scores = buildScores({ place: place ? { keywords: place.keywords, reviewCnt: place.reviewCnt, lastReviewAt: place.lastReviewAt, missing: place.missing } : null, site, geoScore: geoResult?.result.score ?? null });
  const topFixes = await suggestTopFixes({ name: lead.name, place, site, geo }).catch(() => ["플레이스 정보 누락 항목 채우기", "홈페이지 모바일 대응 확인", "의료진·진료시간 페이지 정비"]);

  const competitors = (opts.place?.competitors ?? []).slice(0, 3).map((c) => ({ ...c, geoMentions: geoResult?.result.competitors.find((g) => g.name === c.name)?.mentions ?? 0 }));
  if (competitors.length === 0 && geoResult) competitors.push(...geoResult.result.competitors.slice(0, 3).map((c) => ({ name: c.name, placeRank: null, reviewCnt: null, geoMentions: c.mentions })));

  const data: ReportData = {
    hospitalName: lead.name,
    region: [lead.sido, lead.sggu, lead.emd].filter(Boolean).join(" "),
    auditedAt: new Date().toISOString().slice(0, 10),
    scores,
    place: place ? { keywords: place.keywords, reviewCnt: place.reviewCnt, lastReviewAt: place.lastReviewAt, missing: place.missing } : null,
    site,
    geo,
    competitors,
    topFixes,
    bookingUrl: ctx.bookingUrl,
    sender: { name: ctx.settings.send.sender.name, contact: process.env.GMAIL_SENDER ?? "" },
  };
  const banned = checkReportBannedTerms(data).map((h) => h.term);
  const landingToken = token();

  const [audit] = await ctx.db
    .insert(audits)
    .values({
      leadId: lead.id,
      place,
      site: siteRow,
      geo: geoResult ? { score: geoResult.result.score, mentionRate: geoResult.result.mentionRate, questionCnt: geoResult.result.questionCnt, mentionedCnt: geoResult.result.mentionedCnt, engines: geoResult.result.engines, competitors: geoResult.result.competitors } : null,
      scores,
      topFixes,
      landingToken,
      bannedTerms: banned,
    })
    .returning();
  if (!audit) throw new Error("audit insert failed");

  if (geoResult) {
    for (const r of geoResult.runs) {
      await ctx.db.insert(auditRuns).values({ auditId: audit.id, engine: r.engine, query: r.query, runNo: r.runNo, mentioned: r.mentioned, position: r.position, competitors: r.competitors, sources: r.sources, rawResponse: r.rawResponse, error: r.error, costKrw: r.costKrw });
    }
  }

  // 리포트 파일 (storage/reports/<token>.html|.pdf)
  const dir = join(process.cwd(), "storage", "reports");
  await mkdir(dir, { recursive: true });
  const html = await reportToHtml(data, { standalone: true });
  await writeFile(join(dir, `${landingToken}.html`), html);
  await writeFile(join(dir, `${landingToken}.json`), JSON.stringify(data, null, 2));
  let pdfPath: string | null = null;
  const pdf = await reportToPdf(html).catch(() => null);
  if (pdf) {
    pdfPath = join(dir, `${landingToken}.pdf`);
    await writeFile(pdfPath, pdf);
  }
  await ctx.db.update(audits).set({ reportPdfPath: pdfPath }).where(eq(audits.id, audit.id));
  await ctx.db.update(leads).set({ status: lead.status === "listed" ? "audited" : lead.status, geoScore: scores.geo, placeRank: place?.keywords[0]?.rank ?? lead.placeRank, reviewCnt: place?.reviewCnt ?? lead.reviewCnt }).where(eq(leads.id, lead.id));

  const r = { auditId: audit.id, landingToken, scores, bannedTerms: banned, costKrw: geoResult?.totalCostKrw ?? 0, pdfPath };
  ctx.log(lead.id, "진단 완료", { scores, banned, costKrw: r.costKrw, pdf: !!pdfPath });
  return r;
}

/** 담당 승인 (금지어 있으면 불가) */
export async function approveAudit(ctx: PipelineContext, auditId: string, by: string): Promise<{ ok: boolean; reason?: string }> {
  const [a] = await ctx.db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!a) return { ok: false, reason: "not found" };
  if (a.bannedTerms.length) return { ok: false, reason: `금지어: ${a.bannedTerms.join(", ")}` };
  await ctx.db.update(audits).set({ approvedBy: by, approvedAt: new Date() }).where(eq(audits.id, auditId));
  await ctx.db.update(leads).set({ status: "queued" }).where(eq(leads.id, a.leadId));
  return { ok: true };
}
