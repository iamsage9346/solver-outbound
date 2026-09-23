import { describe, it, expect } from "vitest";
import { findBannedTerms, detectEmailHarvestRefusal, isPersonalEmail, renderTemplate, extractVariables } from "../src";

describe("banned terms", () => {
  it("finds hits with excerpt", () => {
    const hits = findBannedTerms("저희와 하시면 순위 보장 됩니다");
    expect(hits.map((h) => h.term)).toEqual(["순위 보장"]);
  });
  it("passes clean text", () => {
    expect(findBannedTerms("현재 상태와 개선 구조를 보여드립니다")).toHaveLength(0);
  });
});

describe("email harvest refusal", () => {
  it("detects standard phrase", () => {
    expect(detectEmailHarvestRefusal("본 웹사이트는 이메일무단수집거부 정책을 따릅니다")).toBe(true);
    expect(detectEmailHarvestRefusal("전자우편 무단 수집 거부")).toBe(true);
    expect(detectEmailHarvestRefusal("문의: info@hospital.co.kr")).toBe(false);
  });
});

describe("personal email", () => {
  it("flags free mail", () => {
    expect(isPersonalEmail("doc@gmail.com")).toBe(true);
    expect(isPersonalEmail("info@hospital.co.kr")).toBe(false);
  });
});

describe("template", () => {
  it("extracts and renders", () => {
    const t = "{병원명} 원장님, {지역} 검색 {플레이스순위}위";
    expect(extractVariables(t)).toEqual(["병원명", "지역", "플레이스순위"]);
    const r = renderTemplate(t, { 병원명: "A정형외과", 지역: "강남구" });
    expect(r.missing).toEqual(["플레이스순위"]);
    expect(r.text).toContain("A정형외과 원장님");
  });
});
