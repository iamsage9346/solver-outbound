import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { contacts, crawlResults, leads, type Lead } from "@solver/db";
import { crawlSite, guessHomepageFromNaver } from "@solver/crawler";
import { summarizeSite } from "@solver/llm";
import { estimateStaff } from "@solver/hira";
import type { PipelineContext } from "./context";

export interface CrawlOneResult {
  leadId: string;
  emails: number;
  forms: number;
  errorCode: string | null;
  harvestRefusal: boolean;
  phoneFirst: boolean;
}

/** PRD 5절: 홈페이지 크롤 → contacts/crawl_results 갱신. 멱등(같은 URL 재크롤은 최신 레코드로 갱신). */
export async function crawlLead(ctx: PipelineContext, lead: Lead): Promise<CrawlOneResult> {
  const base: CrawlOneResult = { leadId: lead.id, emails: 0, forms: 0, errorCode: null, harvestRefusal: false, phoneFirst: false };
  let homepage = lead.homepage;
  if (!homepage && !ctx.dryRun) {
    // 심평원에 없으면 네이버 지역검색으로 공식 홈페이지를 찾는다 (자동 발견 태그)
    const guess = await guessHomepageFromNaver(lead.name, lead.address).catch((e) => {
      ctx.log(lead.id, `홈페이지 탐색 실패: ${(e as Error).message}`);
      return null;
    });
    if (guess) {
      homepage = guess.url;
      await ctx.db.update(leads).set({ homepage, homepageAutoFound: true }).where(eq(leads.id, lead.id));
      ctx.log(lead.id, `홈페이지 자동 발견 ${homepage} (${guess.matchedName})`);
    }
  }
  if (!homepage) {
    await ctx.db.update(leads).set({ phoneFirst: true }).where(eq(leads.id, lead.id));
    ctx.log(lead.id, "홈페이지 없음 → 전화 우선");
    return { ...base, phoneFirst: true };
  }

  const out = await crawlSite(homepage, { dryRun: ctx.dryRun, intervalMs: ctx.settings.crawl.domainIntervalMs, maxPages: ctx.settings.crawl.maxPages, maxDepth: ctx.settings.crawl.maxDepth });

  let summary: string | null = null;
  if (out.text.length > 200) {
    try {
      summary = await summarizeSite({ name: lead.name, text: out.text });
    } catch (e) {
      ctx.log(lead.id, `요약 실패: ${(e as Error).message}`);
    }
  }

  await ctx.db.insert(crawlResults).values({
    leadId: lead.id,
    url: out.finalUrl || homepage,
    statusCode: out.statusCode,
    renderMode: out.renderMode,
    pagesVisited: out.pagesVisited,
    summary,
    services: out.services,
    hours: out.hours,
    snsLinks: out.snsLinks as Record<string, string>,
    tech: { https: out.tech.https, mobileViewport: out.tech.mobileViewport, ttfbMs: out.tech.ttfbMs, schemaOrg: out.tech.schemaOrg, lastModified: out.tech.lastModified, hasDoctorsPage: out.tech.hasDoctorsPage, hasHoursPage: out.tech.hasHoursPage },
    harvestRefusal: out.harvestRefusal,
    emailsFound: out.emails.map((e) => e.value),
    formUrls: out.formUrls,
    representative: out.representative,
    errorCode: out.errorCode,
    htmlExpiresAt: new Date(Date.now() + ctx.settings.crawl.htmlRetentionDays * 86_400_000),
  });

  // 컨택 반영. 수집거부 도메인은 이메일 자동 저장 없이 "수동 확인" 표시 (정보통신망법 50조의2)
  if (!out.harvestRefusal) {
    for (const e of out.emails) {
      await ctx.db
        .insert(contacts)
        .values({
          leadId: lead.id,
          type: "email",
          value: e.value,
          role: e.context === "privacy" ? "admin" : "general",
          source: "crawl",
          confidence: e.context === "mailto" ? 0.8 : e.obfuscated ? 0.5 : 0.6,
          isPersonal: e.isPersonal,
          note: `${e.context} · ${e.page}`,
        })
        .onConflictDoNothing();
    }
  }
  for (const f of out.formUrls) {
    await ctx.db.insert(contacts).values({ leadId: lead.id, type: "form", value: f, source: "crawl", confidence: 0.7 }).onConflictDoNothing();
  }
  if (out.representative) {
    await ctx.db.insert(contacts).values({ leadId: lead.id, type: "person", value: out.representative, role: "representative", source: "crawl", confidence: 0.6 }).onConflictDoNothing();
  }

  const [emailRow] = await ctx.db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.leadId, lead.id), eq(contacts.type, "email")))
    .limit(1);
  const phoneFirst = !emailRow;
  await ctx.db
    .update(leads)
    .set({ phoneFirst, emailManualCheck: out.harvestRefusal, staffEst: estimateStaff(lead.doctorCnt, out.services) })
    .where(eq(leads.id, lead.id));

  const r = { ...base, emails: out.emails.length, forms: out.formUrls.length, errorCode: out.errorCode, harvestRefusal: out.harvestRefusal, phoneFirst };
  ctx.log(lead.id, `크롤 완료`, r);
  return r;
}

/** 배치: 아직 크롤 안 된(또는 강제) 리드를 병렬 도메인 5개로 돈다 */
export async function runCrawlBatch(ctx: PipelineContext, opts: { leadIds?: string[]; limit?: number; force?: boolean } = {}) {
  let targets: Lead[];
  if (opts.leadIds?.length) {
    targets = await ctx.db.query.leads.findMany({ where: (l, { inArray }) => inArray(l.id, opts.leadIds!) });
  } else {
    const canDiscover = !!process.env.NAVER_CLIENT_ID && !!process.env.NAVER_CLIENT_SECRET;
    // 네이버 탐색이 불가능하면 홈페이지 없는 리드는 크롤 없이 "전화 우선"만 표시 (재선택 방지)
    if (!canDiscover) {
      await ctx.db
        .update(leads)
        .set({ phoneFirst: true })
        .where(and(isNull(leads.homepage), eq(leads.phoneFirst, false), sql`not exists (select 1 from ${contacts} c where c.lead_id = ${leads.id} and c.type = 'email')`));
    }
    // 대상: 크롤 기록이 없고, 홈페이지가 있거나(탐색 가능 시) 아직 탐색 안 한(phoneFirst=false) 리드
    const rows = await ctx.db
      .select({ lead: leads })
      .from(leads)
      .where(
        and(
          canDiscover ? sql`(${leads.homepage} is not null or ${leads.phoneFirst} = false)` : isNotNull(leads.homepage),
          sql`${leads.tier} is distinct from 'EXCLUDED'`,
          opts.force ? sql`true` : sql`not exists (select 1 from ${crawlResults} cr where cr.lead_id = ${leads.id})`,
        ),
      )
      .orderBy(leads.createdAt)
      .limit(opts.limit ?? 50);
    targets = rows.map((r) => r.lead);
  }
  const results: CrawlOneResult[] = [];
  const parallel = ctx.settings.crawl.parallelDomains;
  for (let i = 0; i < targets.length; i += parallel) {
    const chunk = targets.slice(i, i + parallel);
    results.push(...(await Promise.all(chunk.map((l) => crawlLead(ctx, l).catch((e) => ({ leadId: l.id, emails: 0, forms: 0, errorCode: `EXC:${(e as Error).message.slice(0, 40)}`, harvestRefusal: false, phoneFirst: true }))))));
  }
  const summary = {
    total: results.length,
    withEmail: results.filter((r) => r.emails > 0).length,
    withEmailOrForm: results.filter((r) => r.emails > 0 || r.forms > 0).length,
    failed: results.filter((r) => r.errorCode && r.errorCode !== "RENDER_UNAVAILABLE").length,
    harvestRefusal: results.filter((r) => r.harvestRefusal).length,
  };
  ctx.log(null, "크롤 배치 완료", summary);
  return { results, summary };
}
