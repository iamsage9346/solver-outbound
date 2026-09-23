import { describe, it, expect } from "vitest";
import { reportToHtml, sampleReport, checkReportBannedTerms, scoreSite } from "../src";

describe("report", () => {
  it("renders html with hospital name and 3 fixes", async () => {
    const d = sampleReport();
    const html = await reportToHtml(d, { standalone: true });
    expect(html).toContain(d.hospitalName);
    expect(html).toContain("바로 손볼 3가지");
    expect(html).toContain("12개 중 4개 언급");
  });
  it("blocks banned terms", () => {
    const d = sampleReport({ topFixes: ["순위 보장 패키지 도입"] });
    expect(checkReportBannedTerms(d)).toHaveLength(1);
  });
  it("site score", () => {
    expect(scoreSite({ https: true, mobile: true, ttfbMs: 300, doctorsPage: true, hoursPage: true, schemaOrg: true })).toBe(100);
  });
});
