import { describe, it, expect } from "vitest";
import { buildQuestions } from "../src";

describe("buildQuestions", () => {
  it("substitutes 구/동 and dedupes", () => {
    const qs = buildQuestions({ sggu: "강남구", emd: "역삼동", templates: ["{구} 정형외과 추천해줘", "{동} 근처 {진료과}", "{구} 정형외과 추천해줘"] });
    expect(qs).toEqual(["강남구 정형외과 추천해줘", "역삼동 근처 정형외과"]);
  });
  it("skips {동} templates when emd is missing", () => {
    const qs = buildQuestions({ sggu: "서초구", emd: null, templates: ["{구} 도수치료", "{동} 근처 무릎"] });
    expect(qs).toEqual(["서초구 도수치료"]);
  });
  it("uses default 12 templates", () => {
    expect(buildQuestions({ sggu: "강남구", emd: "역삼동" })).toHaveLength(12);
  });
});
