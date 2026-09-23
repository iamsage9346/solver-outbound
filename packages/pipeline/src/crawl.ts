import { and, eq, isNull } from "drizzle-orm";
import { contacts, crawlResults, leads, type Lead } from "@solver/db";
import { crawlSite } from "@solver/crawler";
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
  if (!lead.homepage) {
    await ctx.db.update(leads).set({ phoneFirst: true }).where(eq(leads.id, lead.id));
    ctx.log(lead.id, "홈페이지 없음 → 전화 우선");
    return { ...base, phoneFirst: true };
  }

  const out = await crawlSite(lead.homepage, { dryRun: ctx.dryRun, intervalMs: ctx.settings.crawl.domainIntervalMs, maxPages: ctx.settings.crawl.maxPages, maxDepth: ctx.settings.crawl.maxDepth });

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
    url: out.finalUrl || lead.homepage,
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
    const rows = await ctx.db
      .select({ lead: leads })
      .from(leads)
      .leftJoin(crawlResults, eq(crawlResults.leadId, leads.id))
      .where(opts.force ? undefined : isNull(crawlResults.id))
      .limit(opts.limit ?? 50);
    const seen = new Set<string>();
    targets = rows.map((r) => r.lead).filter((l) => l.tier !== "EXCLUDED" && !seen.has(l.id) && seen.add(l.id));
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
