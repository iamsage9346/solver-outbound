import { describe, it, expect, beforeEach } from "vitest";
import { crawlSite, resetCaches, dryRunFixture } from "../src";
import type { FetchImpl, FetchResult } from "../src";

function fake(pages: Record<string, string | { status: number; body?: string }>): FetchImpl {
  return async (url): Promise<FetchResult> => {
    const p = pages[url];
    if (p === undefined) return { url, finalUrl: url, status: 404, headers: {}, body: "", ttfbMs: 5, errorCode: "NOT_FOUND" };
    const body = typeof p === "string" ? p : (p.body ?? "");
    const status = typeof p === "string" ? 200 : p.status;
    return { url, finalUrl: url, status, headers: {}, body, ttfbMs: 5, errorCode: status >= 400 ? "BLOCKED" : null };
  };
}
const long = (s: string) => `<p>${"병원 소개 본문 텍스트입니다. ".repeat(20)}${s}</p>`;

beforeEach(() => resetCaches());

describe("crawlSite", () => {
  it("BFS extracts emails/forms/services across pages", async () => {
    const out = await crawlSite("https://h.kr/", {
      intervalMs: 0,
      fetchImpl: fake({
        "https://h.kr/": `<html><body>${long("도수치료 전문")}<a href="/contact">문의하기</a><a href="/about">병원소개</a><a href="https://other.com/x">외부</a></body></html>`,
        "https://h.kr/contact": `<html><body>${long("")}<a href="mailto:info@h.kr">메일</a></body></html>`,
        "https://h.kr/about": `<html><body>${long("체외충격파")}<footer>대표자: 박원장</footer></body></html>`,
      }),
    });
    expect(out.errorCode).toBeNull();
    expect(out.pagesVisited).toBe(3);
    expect(out.emails.map((e) => e.value)).toEqual(["info@h.kr"]);
    expect(out.formUrls).toEqual(["https://h.kr/contact"]);
    expect(out.services.sort()).toEqual(["도수치료", "체외충격파"]);
    expect(out.representative).toBe("박원장");
    expect(out.harvestRefusal).toBe(false);
    expect(out.text.length).toBeGreaterThan(200);
  });

  it("harvest refusal on any page → emails cleared, flag set", async () => {
    const out = await crawlSite("https://h.kr/", {
      intervalMs: 0,
      fetchImpl: fake({
        "https://h.kr/": `<html><body>${long("")}<a href="mailto:info@h.kr">메일</a><a href="/privacy">개인정보처리방침</a></body></html>`,
        "https://h.kr/privacy": `<html><body>${long("")}<p>본 사이트는 이메일무단수집거부 정책을 따릅니다. cpo@h.kr</p></body></html>`,
      }),
    });
    expect(out.harvestRefusal).toBe(true);
    expect(out.emails).toEqual([]);
  });

  it("robots disallow → ROBOTS_DISALLOW", async () => {
    const out = await crawlSite("https://h.kr/", {
      intervalMs: 0,
      fetchImpl: fake({ "https://h.kr/robots.txt": "User-agent: *\nDisallow: /", "https://h.kr/": long("x") }),
    });
    expect(out.errorCode).toBe("ROBOTS_DISALLOW");
    expect(out.pagesVisited).toBe(0);
  });

  it("start page 404 → NOT_FOUND", async () => {
    const out = await crawlSite("https://h.kr/", { intervalMs: 0, fetchImpl: fake({}) });
    expect(out.errorCode).toBe("NOT_FOUND");
    expect(out.statusCode).toBe(404);
  });

  it("thin body uses renderImpl; missing renderer → RENDER_UNAVAILABLE", async () => {
    const thin = fake({ "https://h.kr/": `<html><body><div id="app"></div></body></html>` });
    const rendered = await crawlSite("https://h.kr/", { intervalMs: 0, fetchImpl: thin, renderImpl: async () => `<html><body>${long("재활")}<a href="mailto:a@h.kr">m</a></body></html>` });
    expect(rendered.renderMode).toBe("browser");
    expect(rendered.emails[0]?.value).toBe("a@h.kr");
    const none = await crawlSite("https://h.kr/", { intervalMs: 0, fetchImpl: thin, renderImpl: async () => null });
    expect(none.errorCode).toBe("RENDER_UNAVAILABLE");
  });

  it("dryRun returns fixture without network", async () => {
    const out = await crawlSite("https://dry.kr/", { dryRun: true, fetchImpl: async () => { throw new Error("no network"); } });
    expect(out).toEqual(dryRunFixture("https://dry.kr/"));
    expect(out.emails[0]?.value).toBe("info@dry.kr");
  });
});
