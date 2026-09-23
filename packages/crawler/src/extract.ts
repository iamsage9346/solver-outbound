import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { isPersonalEmail } from "@solver/shared";
import type { EmailContext, ExtractedEmail, PageKind, SnsKey, TechSignals } from "./types";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

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

const FORM_TEXT_RE = /문의|상담|제휴|예약|contact|inquiry/i;
const FORM_URL_RE = /(form\.naver\.com|naver\.me|forms\.gle|docs\.google\.com\/forms|tally\.so|typeform\.com)/i;

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
  const out = new Set<string>();
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    const abs = absolutize(href, base);
    if (!abs) return;
    const text = ($(el).text() + " " + ($(el).attr("title") ?? "") + " " + ($(el).find("img").attr("alt") ?? "")).trim();
    if (FORM_URL_RE.test(abs) || (FORM_TEXT_RE.test(text) && !/tel:|mailto:/.test(href ?? ""))) out.add(abs);
  });
  return [...out];
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
