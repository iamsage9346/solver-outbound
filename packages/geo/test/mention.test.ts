import { describe, it, expect } from "vitest";
import { detectMention, normalizeHospitalName } from "../src";

describe("normalizeHospitalName", () => {
  it("strips spaces and suffixes", () => {
    expect(normalizeHospitalName("강남 정형외과의원")).toBe("강남정형외과");
    expect(normalizeHospitalName("강남정형외과")).toBe("강남정형외과");
    expect(normalizeHospitalName("서초튼튼정형외과 병원")).toBe("서초튼튼정형외과");
  });
});

describe("detectMention", () => {
  const text = "강남구 정형외과로는 1. 연세바른정형외과, 2. 강남 정형외과의원, 3. 서울튼튼정형외과병원을 추천합니다.";
  it("finds target with spacing/suffix variants and position", () => {
    const r = detectMention(text, "강남정형외과");
    expect(r.mentioned).toBe(true);
    expect(r.position).toBe(2);
    expect(r.competitors).toEqual(["연세바른정형외과", "서울튼튼정형외과병원"]);
  });
  it("returns competitors only when not mentioned", () => {
    const r = detectMention(text, "분당연세정형외과");
    expect(r.mentioned).toBe(false);
    expect(r.position).toBeNull();
    expect(r.competitors.length).toBe(3);
  });
  it("matches aliases", () => {
    const r = detectMention("근처에는 튼튼의원이 있습니다.", "서초튼튼정형외과", ["튼튼의원"]);
    expect(r.mentioned).toBe(true);
    expect(r.position).toBe(1);
  });
  it("dedupes repeated names", () => {
    const r = detectMention("연세바른정형외과가 좋고, 연세바른정형외과는 리뷰도 많습니다. 강남정형외과도 있습니다.", "강남정형외과");
    expect(r.competitors).toEqual(["연세바른정형외과"]);
    expect(r.position).toBe(2);
  });
});
