import { describe, it, expect, beforeAll } from "vitest";
import { analyzeReply, parseJson, personalizeOpener } from "../src";

beforeAll(() => {
  process.env.DRY_RUN = "true";
});

describe("llm dry-run", () => {
  it("unsubscribe is rule-based before LLM", async () => {
    const r = await analyzeReply({ from: "a@b.com", subject: "Re:", body: "더 이상 메일 보내지 마세요. 수신거부 합니다." });
    expect(r.classification).toBe("unsubscribe");
  });
  it("parses fenced JSON", () => {
    expect(parseJson<{ a: number }>("```json\n{\"a\":1}\n```").a).toBe(1);
  });
  it("opener returns single line", async () => {
    const s = await personalizeOpener({ name: "A정형외과", siteSummary: null, topFix: null, placeRank: 5, sggu: "강남구" });
    expect(s.split("\n")).toHaveLength(1);
  });
});
