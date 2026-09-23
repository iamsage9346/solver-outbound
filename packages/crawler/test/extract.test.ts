import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { extractEmails, extractFormUrls, extractServices, extractSnsLinks, extractRepresentative, classifyPageLink, techSignals, deobfuscate } from "../src";

describe("extractEmails", () => {
  it("collects mailto, plain and obfuscated emails, deduped lowercase", () => {
    const html = `<html><body>
      <a href="mailto:Info@Hospital.co.kr?subject=hi">메일</a>
      <p>제휴문의: partner [at] hospital [dot] co [dot] kr</p>
      <p>채용: hr(at)hospital.co.kr</p>
      <p>원장: doc 골뱅이 gmail.com</p>
      <footer>info@hospital.co.kr · 대표자 홍길동</footer>
    </body></html>`;
    const emails = extractEmails(html, "https://hospital.co.kr/");
    const values = emails.map((e) => e.value).sort();
    expect(values).toEqual(["doc@gmail.com", "hr@hospital.co.kr", "info@hospital.co.kr", "partner@hospital.co.kr"]);
    const partner = emails.find((e) => e.value === "partner@hospital.co.kr")!;
    expect(partner.obfuscated).toBe(true);
    expect(emails.find((e) => e.value === "doc@gmail.com")!.isPersonal).toBe(true);
    expect(emails.find((e) => e.value === "info@hospital.co.kr")!.context).toBe("mailto");
  });
  it("ignores image filenames", () => {
    expect(extractEmails(`<p>logo@2x.png</p>`, "https://a.kr/")).toHaveLength(0);
  });
  it("deobfuscate handles ' at ' + ' dot '", () => {
    expect(deobfuscate("kim at clinic dot kr").text).toBe("kim@clinic.kr");
  });
});

describe("extractFormUrls", () => {
  it("matches link text and known form hosts", () => {
    const $ = cheerio.load(`<a href="/board/inquiry">온라인 문의</a><a href="https://forms.gle/abc">폼</a><a href="/about">소개</a><a href="tel:021234">상담</a>`);
    expect(extractFormUrls($, "https://h.kr/").sort()).toEqual(["https://forms.gle/abc", "https://h.kr/board/inquiry"]);
  });
});

describe("services / sns / representative / tech", () => {
  it("services dictionary", () => {
    expect(extractServices("도수치료와 체외충격파, 입원실 운영")).toEqual(["도수치료", "체외충격파", "입원"]);
  });
  it("sns links", () => {
    const $ = cheerio.load(`<a href="https://blog.naver.com/x">블로그</a><a href="https://map.naver.com/p/entry/place/1">플레이스</a><a href="https://www.instagram.com/x">insta</a>`);
    const sns = extractSnsLinks($, "https://h.kr/");
    expect(sns.naver_blog).toBe("https://blog.naver.com/x");
    expect(sns.naver_place).toContain("map.naver.com");
    expect(sns.instagram).toContain("instagram.com");
  });
  it("representative from footer", () => {
    const $ = cheerio.load(`<footer>상호: 튼튼정형외과 | 대표자 : 김철수 | 사업자등록번호 123</footer>`);
    expect(extractRepresentative($)).toBe("김철수");
  });
  it("classifyPageLink", () => {
    expect(classifyPageLink("/privacy", "")).toBe("privacy");
    expect(classifyPageLink("/sub/02.php", "의료진 소개")).toBe("doctors");
    expect(classifyPageLink("/contact", "")).toBe("contact");
    expect(classifyPageLink("/x", "인사말")).toBe("about");
    expect(classifyPageLink("/x", "")).toBe("other");
  });
  it("techSignals", () => {
    const $ = cheerio.load(`<head><meta name="viewport" content="width=device-width"><script type="application/ld+json">{}</script></head>`);
    const t = techSignals($, { "last-modified": "Mon" }, 88, "https://h.kr/");
    expect(t).toMatchObject({ https: true, mobileViewport: true, schemaOrg: true, ttfbMs: 88, lastModified: "Mon" });
  });
});
