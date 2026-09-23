import * as cheerio from "cheerio";
import { DEFAULT_SETTINGS, detectEmailHarvestRefusal } from "@solver/shared";
import {
  absolutize,
  classifyPageLink,
  detectHarvestRefusalLinks,
  extractEmails,
  extractFormUrls,
  extractHours,
  extractRepresentative,
  extractServices,
  extractSnsLinks,
  techSignals,
  visibleText,
} from "./extract";
import { fetchPage, isAllowedByRobots, throttle } from "./fetcher";
import type { CrawlOutput, CrawledPage, ExtractedEmail, FetchImpl, PageKind, SnsKey } from "./types";

export interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  intervalMs: number;
  dryRun: boolean;
  fetchImpl: FetchImpl;
  /** 테스트용: 브라우저 렌더 함수 주입 */
  renderImpl: ((url: string) => Promise<string | null>) | null;
}

const KIND_PRIORITY: Record<PageKind, number> = { privacy: 0, contact: 1, about: 2, doctors: 3, hours: 4, other: 9 };
const TEXT_LIMIT = 8000;
const MIN_BODY_CHARS = 200;

function emptyOutput(url: string): CrawlOutput {
  return {
    url,
    finalUrl: url,
    statusCode: null,
    renderMode: "static",
    pagesVisited: 0,
    emails: [],
    formUrls: [],
    snsLinks: {},
    representative: null,
    hours: null,
    services: [],
    tech: { https: url.startsWith("https://"), mobileViewport: false, ttfbMs: null, schemaOrg: false, lastModified: null, hasDoctorsPage: false, hasHoursPage: false },
    harvestRefusal: false,
    text: "",
    errorCode: null,
    pages: [],
  };
}

/** Playwright가 설치돼 있으면 렌더링, 아니면 null (RENDER_UNAVAILABLE) */
async function renderWithBrowser(url: string): Promise<string | null> {
  try {
    const modName = "playwright";
    const pw = (await import(/* @vite-ignore */ modName)) as { chromium: { launch: (o: { headless: boolean }) => Promise<any> } };
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: DEFAULT_SETTINGS.crawl.userAgent });
      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
      return (await page.content()) as string;
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

export function dryRunFixture(startUrl: string): CrawlOutput {
  const host = new URL(startUrl).host;
  return {
    ...emptyOutput(startUrl),
    statusCode: 200,
    pagesVisited: 3,
    emails: [{ value: `info@${host}`, page: startUrl, obfuscated: false, isPersonal: false, context: "footer" }],
    formUrls: [`${new URL(startUrl).origin}/contact`],
    snsLinks: { naver_blog: "https://blog.naver.com/dryrun" },
    representative: "홍길동",
    hours: "평일 09:00 - 18:00 / 토요일 09:00 - 13:00 / 일요일·공휴일 휴진",
    services: ["도수치료", "체외충격파", "물리치료"],
    tech: { https: startUrl.startsWith("https://"), mobileViewport: true, ttfbMs: 120, schemaOrg: false, lastModified: null, hasDoctorsPage: true, hasHoursPage: true },
    text: "[DRY RUN] 병원 홈페이지 본문 샘플. 도수치료와 체외충격파를 강조하는 정형외과.",
    pages: [
      { url: startUrl, title: "메인", status: 200 },
      { url: `${new URL(startUrl).origin}/about`, title: "병원소개", status: 200 },
      { url: `${new URL(startUrl).origin}/doctors`, title: "의료진", status: 200 },
    ],
  };
}

export async function crawlSite(startUrl: string, opts: Partial<CrawlOptions> = {}): Promise<CrawlOutput> {
  const o: CrawlOptions = {
    maxPages: DEFAULT_SETTINGS.crawl.maxPages,
    maxDepth: DEFAULT_SETTINGS.crawl.maxDepth,
    intervalMs: DEFAULT_SETTINGS.crawl.domainIntervalMs,
    dryRun: false,
    fetchImpl: fetchPage,
    renderImpl: null,
    ...opts,
  };
  if (o.dryRun) return dryRunFixture(startUrl);

  const out = emptyOutput(startUrl);
  let origin: string;
  try {
    origin = new URL(startUrl).origin;
  } catch {
    return { ...out, errorCode: "NOT_FOUND" };
  }

  if (!(await isAllowedByRobots(startUrl, o.fetchImpl))) return { ...out, errorCode: "ROBOTS_DISALLOW" };

  const visited = new Set<string>();
  const queue: { url: string; depth: number; kind: PageKind }[] = [{ url: startUrl, depth: 0, kind: "other" }];
  const emails = new Map<string, ExtractedEmail>();
  const formUrls = new Set<string>();
  const pages: CrawledPage[] = [];
  const textParts: string[] = [];
  const serviceSet = new Set<string>();
  let textLen = 0;

  while (queue.length && visited.size < o.maxPages) {
    queue.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.depth - b.depth);
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    if (item.depth > 0 && !(await isAllowedByRobots(item.url, o.fetchImpl))) continue;
    await throttle(new URL(item.url).host, o.intervalMs);
    const res = await o.fetchImpl(item.url);
    const isStart = item.depth === 0;

    if (isStart) {
      out.statusCode = res.status;
      out.finalUrl = res.finalUrl;
      if (res.errorCode) return { ...out, errorCode: res.errorCode, pagesVisited: 1, pages: [{ url: item.url, title: "", status: res.status }] };
    } else if (res.errorCode || !res.body) {
      pages.push({ url: item.url, title: "", status: res.status });
      continue;
    }

    let $ = cheerio.load(res.body);
    let html = res.body;
    if (isStart && visibleText($).length < MIN_BODY_CHARS) {
      const rendered = await (o.renderImpl ?? renderWithBrowser)(item.url);
      if (rendered) {
        html = rendered;
        $ = cheerio.load(html);
        out.renderMode = "browser";
      } else {
        out.errorCode = "RENDER_UNAVAILABLE";
      }
      if (visibleText($).length < MIN_BODY_CHARS) {
        if (out.errorCode !== "RENDER_UNAVAILABLE") out.errorCode = "EMPTY_BODY";
      }
    }

    const pageText = visibleText($);
    pages.push({ url: res.finalUrl || item.url, title: $("title").first().text().trim(), status: res.status });

    // 정보통신망법 제50조의2: 수집거부 문구가 있으면 이메일 자동 추출 중단
    if (detectEmailHarvestRefusal($("body").text()) || detectHarvestRefusalLinks($)) {
      out.harvestRefusal = true;
    }

    if (isStart) {
      out.tech = techSignals($, res.headers, res.ttfbMs, res.finalUrl || item.url);
      Object.assign(out.snsLinks, extractSnsLinks($, item.url));
      out.hours = extractHours($);
    } else {
      const sns = extractSnsLinks($, item.url);
      for (const [k, v] of Object.entries(sns)) if (!out.snsLinks[k as SnsKey]) out.snsLinks[k as SnsKey] = v;
      if (!out.hours) out.hours = extractHours($);
    }
    if (item.kind === "doctors") out.tech.hasDoctorsPage = true;
    if (item.kind === "hours" || /진료\s*시간/.test(pageText)) out.tech.hasHoursPage = true;
    if (!out.representative) out.representative = extractRepresentative($, item.kind);
    for (const s of extractServices(pageText)) serviceSet.add(s);
    for (const f of extractFormUrls($, item.url)) formUrls.add(f);
    if (!out.harvestRefusal) for (const e of extractEmails(html, item.url)) if (!emails.has(e.value)) emails.set(e.value, e);

    if ((isStart || item.kind === "about" || item.kind === "doctors") && textLen < TEXT_LIMIT) {
      const piece = pageText.slice(0, TEXT_LIMIT - textLen);
      textParts.push(piece);
      textLen += piece.length;
    }

    if (item.depth < o.maxDepth) {
      $("a[href]").each((_i, el) => {
        const abs = absolutize($(el).attr("href"), item.url);
        if (!abs || !abs.startsWith(origin) || visited.has(abs)) return;
        if (/\.(pdf|jpe?g|png|gif|zip|hwp|docx?|xlsx?|mp4)$/i.test(abs)) return;
        queue.push({ url: abs, depth: item.depth + 1, kind: classifyPageLink(abs, $(el).text()) });
      });
    }
  }

  out.pagesVisited = visited.size;
  out.pages = pages;
  out.emails = out.harvestRefusal ? [] : [...emails.values()];
  out.formUrls = [...formUrls];
  out.services = [...serviceSet];
  out.text = textParts.join("\n\n").slice(0, TEXT_LIMIT);
  return out;
}
