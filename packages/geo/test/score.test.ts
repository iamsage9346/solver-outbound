import { describe, it, expect } from "vitest";
import { computeGeoScore, type GeoRun } from "../src";

const run = (p: Partial<GeoRun>): GeoRun => ({
  engine: "a",
  query: "q1",
  runNo: 1,
  mentioned: false,
  position: null,
  competitors: [],
  sources: [],
  rawResponse: "",
  error: null,
  costKrw: 0,
  ...p,
});

describe("computeGeoScore", () => {
  it("gives 100 when always mentioned first with own source", () => {
    const runs = [1, 2, 3].map((n) => run({ runNo: n, mentioned: true, position: 1, sources: ["https://www.hospital.co.kr/about"] }));
    const r = computeGeoScore(runs, { hospitalName: "H", ownDomains: ["hospital.co.kr"] });
    expect(r.score).toBe(100);
    expect(r.mentionRate).toBe(1);
    expect(r.ownSourceRate).toBe(1);
    expect(r.avgPosition).toBe(1);
  });
  it("applies weights 60/20/20", () => {
    const runs = [
      run({ runNo: 1, mentioned: true, position: 2, sources: ["https://m.place.naver.com/x"], competitors: ["B의원"] }),
      run({ runNo: 2, mentioned: false, competitors: ["B의원", "C병원"] }),
    ];
    const r = computeGeoScore(runs, { hospitalName: "H", ownDomains: ["https://m.place.naver.com/x"] });
    // mention 0.5*60=30, own 0.5*20=10, position (1/2)/2=0.25*20=5 → 45
    expect(r.score).toBe(45);
    expect(r.competitors[0]).toEqual({ name: "B의원", mentions: 2 });
    expect(r.questionCnt).toBe(1);
    expect(r.mentionedCnt).toBe(1);
  });
  it("excludes fully failed engines", () => {
    const runs = [
      run({ engine: "a", mentioned: true, position: 1 }),
      run({ engine: "b", error: "timeout" }),
      run({ engine: "b", runNo: 2, error: "timeout" }),
    ];
    const r = computeGeoScore(runs, { hospitalName: "H", ownDomains: [] });
    expect(r.engines.b?.failed).toBe(true);
    expect(r.engines.a?.failed).toBe(false);
    expect(r.mentionRate).toBe(1);
    expect(r.score).toBe(80); // 60 + 0 + 20
  });
  it("returns zeros for empty runs", () => {
    const r = computeGeoScore([], { hospitalName: "H", ownDomains: [] });
    expect(r.score).toBe(0);
    expect(r.avgPosition).toBeNull();
  });
});
