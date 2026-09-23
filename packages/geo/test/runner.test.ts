import { describe, it, expect } from "vitest";
import { runGeoAudit, createDryRunEngine, createEngines, type GeoEngine } from "../src";

describe("runGeoAudit", () => {
  it("runs questions × engines × repeats with dry-run engines", async () => {
    const engines = [createDryRunEngine(1, { name: "e1", targetName: "강남정형외과", mentionProbability: 1 }), createDryRunEngine(2, { name: "e2", targetName: "강남정형외과", mentionProbability: 0 })];
    const out = await runGeoAudit({ hospitalName: "강남정형외과", sggu: "강남구", emd: "역삼동", engines, repeats: 2, questions: ["q1", "q2"] });
    expect(out.runs).toHaveLength(8);
    expect(out.result.engines.e1?.mentionRate).toBe(1);
    expect(out.result.engines.e2?.mentionRate).toBe(0);
    expect(out.result.mentionRate).toBe(0.5);
    expect(out.stoppedByCostCap).toBe(false);
  });
  it("stops issuing calls when cost cap is reached", async () => {
    const engine = createDryRunEngine(3, { name: "paid", targetName: "H", costKrw: 10 });
    const out = await runGeoAudit({ hospitalName: "H", sggu: "강남구", engines: [engine], repeats: 3, questions: ["a", "b", "c", "d"], costCapKrw: 30, concurrency: 1 });
    expect(out.stoppedByCostCap).toBe(true);
    expect(out.runs.length).toBe(3);
    expect(out.totalCostKrw).toBe(30);
  });
  it("records errors per run and keeps going", async () => {
    const bad: GeoEngine = { name: "bad", ask: async () => { throw new Error("boom"); } };
    const good = createDryRunEngine(4, { name: "good", targetName: "H", mentionProbability: 1 });
    const out = await runGeoAudit({ hospitalName: "H", sggu: "강남구", engines: [bad, good], repeats: 1, questions: ["q"] });
    expect(out.runs.find((r) => r.engine === "bad")?.error).toBe("boom");
    expect(out.result.engines.bad?.failed).toBe(true);
    expect(out.result.engines.good?.failed).toBe(false);
  });
  it("createEngines returns dry-run engines under DRY_RUN", () => {
    const engines = createEngines(["anthropic", "openai", "perplexity", "gemini"], { dryRun: true });
    expect(engines.map((e) => e.name)).toEqual(["anthropic", "openai", "perplexity", "gemini"]);
  });
  it("createEngines throws on missing key when not dry-run", () => {
    expect(() => createEngines(["anthropic"], { dryRun: false, env: {} })).toThrow(/ANTHROPIC_API_KEY/);
    const skipped: string[] = [];
    const engines = createEngines(["anthropic", "gemini"], { dryRun: false, env: {}, skipMissing: true, onSkip: (n) => skipped.push(n) });
    expect(engines).toHaveLength(0);
    expect(skipped).toEqual(["anthropic", "gemini"]);
  });
});
