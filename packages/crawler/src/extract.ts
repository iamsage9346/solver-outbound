import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { isPersonalEmail } from "@solver/shared";
import type { EmailContext, ExtractedEmail, PageKind, SnsKey, TechSignals } from "./types";

// TLD 뒤에 글자가 이어지면(예: naver.comcopyright) 매치하지 않도록 경계를 둔다
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,10}(?![A-Za-z0-9])/g;

/** 병원 컨택이 아닌 이메일: 호스팅·제작사·에러추적·예시·시스템 주소. DB 정리 SQL과 같은 규칙을 유지한다. */
export const JUNK_EMAIL_DOMAIN_RE = /(^|\.)(wixpress\.com|wix\.com|sentry\.io|sentry-next\.io|gabia\.com|cafe24\.com|imweb\.me|godo\.co\.kr|makeshop\.co\.kr|sixshop\.com|creatorlink\.net|modoo\.at|domain\.com|example\.com|email\.com|mail\.com|yourdomain\.com|test\.com|spo\.go\.kr|kisa\.or\.kr|kopico\.go\.kr|privacy\.go\.kr|interactivy\.com|cenacle\.com|vizensoft\.com|mdtoday\.co\.kr|doctornow\.co\.kr|above\.com|budgestudios\.ca|bizmeka\.com|etoday\.co\.kr|solver\.kr|axsolver\.com|google\.com|facebook\.com|instagram\.com|kakao\.com|apple\.com|microsoft\.com|adobe\.com|w3\.org|00000\.co\.kr|midnight\.to)$/i;
export const JUNK_EMAIL_LOCAL_RE = /^(test|tester|sample|example|user|username|name|email|mail|cid|noreply|no-reply|donotreply|do-not-reply|sentry|webmaster|hostmaster|postmaster|root|null|undefined|xxx+|your(name|email|mail)|abc|aaa+)$|^[0-9a-f]{20,}$|^\d{6,}$/i;

export function isJunkEmail(value: string): boolean {
  const [local = "", domain = ""] = value.toLowerCase().split("@");
  if (!local || !domain) return true;
  if (JUNK_EMAIL_DOMAIN_RE.test(domain) || JUNK_EMAIL_LOCAL_RE.test(local)) return true;
  if (/\.(png|jpe?g|gif|svg|webp|js|css)$/i.test(domain)) return true;
  return false;
}

/** 난독화 패턴을 표준 형태로 되돌린다. `[at]`, `(at)`, ` at `, `골뱅이`, `[dot]`, `(dot)`, ` dot ` */
export function deobfuscate(text: string): { text: string; changed: boolean } {
  let changed = false;
  const out = text
    .replace(/\s*(\[at\]|\(at\)|\{at\}|골뱅이)\s*/gi, () => ((changed = true), "@"))
    .replace(/([A-Za-z0-9._%+-])\s+at\s+([A-Za-z0-9.-]+\s*(\[dot\]|\(dot\)|\s+dot\s+|\.))/gi, (_m, a, rest) => ((changed = true), `${a}@${rest}`))
    .replace(/\s*(\[dot\]|\(dot\)|\{dot\})\s*/gi, () => ((changed = true), "."))
    .replace(/([A-Za-z0-9-]+)\s+dot\s+([A-Za-z]{2,})/gi, (_m, a, b) => ((changed = true), `${a}.${b}`));
  return { text: out, changed };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i;

export function extractEmails(html: string, pageUrl: string): ExtractedEmail[] {
  const $ = cheerio.load(html);
  const found = new Map<string, ExtractedEmail>();
  const isPrivacy = /privacy|개인정보/i.test(pageUrl) || /개인정보\s*처리\s*방침/.test($("title").text() + $("h1,h2").text());

  const add = (raw: string, context: EmailContext, obfuscated: boolean) => {
    const value = raw.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0] ?? "";
    if (!value || IMAGE_EXT.test(value) || !EMAIL_RE.test(value)) return;
    EMAIL_RE.lastIndex = 0;
    if (isJunkEmail(value)) return;
    if (found.has(value)) return;
    found.set(value, { value, page: pageUrl, obfuscated, isPersonal: isPersonalEmail(value), context });
  };

  $('a[href^="mailto:"]').each((_i, el) => add($(el).attr("href") ?? "", "mailto", false));

  const footerText = $("footer, .footer, #footer, [class*=footer], [id*=footer]").text();
  const bodyText = $("body").text();

  const scan = (text: string, context: EmailContext) => {
    for (const m of text.matchAll(EMAIL_RE)) add(m[0], context, false);
    const { text: de, changed } = deobfuscate(text);
    if (changed) for (const m of de.matchAll(EMAIL_RE)) add(m[0], context, true);
  };
  scan(footerText, isPrivacy ? "privacy" : "footer");
  scan(bodyText, isPrivacy ? "privacy" : "body");
  return [...found.values()];
}

const FORM_TEXT_RE = /문의|상담|제휴|contact|inquiry|consult/i;
/** 외부 폼 서비스만 허용. 그 외 외부 도메인 링크(호스팅사 고객센터, 포털, SNS)는 문의폼이 아니다. */
const FORM_URL_RE = /(form\.naver\.com|forms\.gle|docs\.google\.com\/forms|tally\.so|typeform\.com|forms\.office\.com)/i;
const FORM_PATH_RE = /(contact|inquiry|consult|qna|question|counsel|문의|상담)/i;
export const MAX_FORMS_PER_SITE = 5;

/** 같은 사이트인지 (www·m 서브도메인 무시) */
export function sameSite(a: string, b: string): boolean {
  const host = (u: string) => new URL(u).hostname.replace(/^(www|m)\./, "").toLowerCase();
  try {
    return host(a) === host(b);
  } catch {
    return false;
  }
}

export function absolutize(href: string | undefined, base: string): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("#") || /^(javascript|mailto|tel|sms):/i.test(h)) return null;
  try {
    const u = new URL(h, base);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function extractFormUrls($: CheerioAPI, base: string): string[] {
  const scored = new Map<string, number>();
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    const abs = absolutize(href, base);
    if (!abs) return;
    const text = ($(el).text() + " " + ($(el).attr("title") ?? "") + " " + ($(el).find("img").attr("alt") ?? "")).trim();
    let score = 0;
    if (FORM_URL_RE.test(abs)) score = 3; // 외부 폼 서비스
    else if (sameSite(abs, base)) {
      if (FORM_PATH_RE.test(abs)) score = 2; // 자사 문의 페이지
      else if (FORM_TEXT_RE.test(text)) score = 1; // 링크 텍스트만 문의
    }
    if (score > 0 && !scored.has(abs)) scored.set(abs, score);
  });
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_FORMS_PER_SITE).map(([u]) => u);
}

const SNS_PATTERNS: [SnsKey, RegExp][] = [
  ["naver_blog", /blog\.naver\.com\//i],
  ["naver_place", /(map\.naver\.com|place\.naver\.com|naver\.me\/|m\.place\.naver\.com|pcmap\.place\.naver\.com|booking\.naver\.com)/i],
  ["youtube", /(youtube\.com|youtu\.be)\//i],
  ["instagram", /instagram\.com\//i],
  ["kakao", /(pf\.kakao\.com|open\.kakao\.com|kakao\.com\/)/i],
];

export function extractSnsLinks($: CheerioAPI, base: string): Partial<Record<SnsKey, string>> {
  const out: Partial<Record<SnsKey, string>> = {};
  $("a[href]").each((_i, el) => {
    const abs = absolutize($(el).attr("href"), base);
    if (!abs) return;
    for (const [key, re] of SNS_PATTERNS) if (!out[key] && re.test(abs)) out[key] = abs;
  });
  return out;
}

const NAME_RE = "([가-힣]{2,4})";

export function extractRepresentative($: CheerioAPI, kind: PageKind = "other"): string | null {
  const footer = $("footer, .footer, #footer, [class*=footer], [id*=footer]").text().replace(/\s+/g, " ");
  const all = $("body").text().replace(/\s+/g, " ");
  const patterns = [
    new RegExp(`대표자\\s*[:：]?\\s*${NAME_RE}`),
    new RegExp(`대표\\s*[:：]\\s*${NAME_RE}`),
    new RegExp(`대표원장\\s*[:：]?\\s*${NAME_RE}`),
    new RegExp(`병원장\\s*[:：]?\\s*${NAME_RE}`),
  ];
  for (const src of [footer, all]) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m?.[1]) return m[1];
    }
  }
  if (kind === "doctors") {
    const m = all.match(new RegExp(`${NAME_RE}\\s*(대표원장|원장)`));
    if (m?.[1]) return m[1];
  }
  return null;
}

export const SERVICE_KEYWORDS = ["도수치료", "체외충격파", "주사치료", "물리치료", "입원", "수술", "재활", "통증"] as const;

export function extractServices(text: string): string[] {
  return SERVICE_KEYWORDS.filter((k) => text.includes(k));
}

export function extractHours($: CheerioAPI): string | null {
  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
  const idx = text.search(/진료\s*시간|진료\s*안내/);
  if (idx === -1) return null;
  const chunk = text.slice(idx, idx + 400);
  const lines = chunk
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\d{1,2}\s*[:시]|평일|주말|토요일|일요일|공휴일|휴진|점심/.test(l) || /진료/.test(l));
  const hours = lines.slice(0, 8).join(" / ").trim();
  return hours.length > 5 ? hours.slice(0, 300) : null;
}

export function classifyPageLink(href: string, text: string): PageKind {
  const h = href.toLowerCase();
  const t = text.replace(/\s+/g, "");
  if (/privacy|개인정보/.test(h) || /개인정보/.test(t)) return "privacy";
  if (/doctor|staff|medical|의료진|원장/.test(h) || /의료진|원장소개|의료진소개/.test(t)) return "doctors";
  if (/hour|schedule|time|진료시간|진료안내/.test(h) || /진료시간|진료안내/.test(t)) return "hours";
  if (/contact|inquiry|consult|문의|상담|제휴|location|오시는길/.test(h) || /문의|상담|제휴|오시는길/.test(t)) return "contact";
  if (/about|intro|greeting|병원소개|인사말/.test(h) || /병원소개|인사말|소개/.test(t)) return "about";
  return "other";
}

export function techSignals($: CheerioAPI, headers: Record<string, string>, ttfbMs: number | null, url: string): TechSignals {
  const viewport = $('meta[name="viewport"]').attr("content") ?? "";
  const ld = $('script[type="application/ld+json"]').length > 0;
  const micro = $("[itemscope], [itemtype*='schema.org']").length > 0;
  return {
    https: url.startsWith("https://"),
    mobileViewport: /width\s*=\s*device-width/i.test(viewport),
    ttfbMs,
    schemaOrg: ld || micro,
    lastModified: headers["last-modified"] ?? null,
    hasDoctorsPage: false,
    hasHoursPage: false,
  };
}

export function visibleText($: CheerioAPI): string {
  const c = $.root().clone();
  c.find("script, style, noscript, nav, header, footer, iframe, svg").remove();
  return c.find("body").text().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

export function detectHarvestRefusalLinks($: CheerioAPI): boolean {
  let hit = false;
  $("a").each((_i, el) => {
    if (/무단\s*수집\s*거부/.test($(el).text().replace(/\s+/g, ""))) hit = true;
  });
  return hit;
}
