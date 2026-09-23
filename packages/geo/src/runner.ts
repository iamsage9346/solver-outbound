import { buildQuestions } from "./questions";
import { detectMention } from "./mention";
import { computeGeoScore } from "./score";
import type { GeoEngine, GeoRun, GeoScoreResult } from "./types";

export interface RunGeoAuditInput {
  hospitalName: string;
  aliases?: string[];
  sggu: string;
  emd?: string | null;
  ownDomains?: string[];
  engines: GeoEngine[];
  repeats?: number;
  costCapKrw?: number;
  concurrency?: number;
  questions?: string[];
  onRun?: (run: GeoRun) => void;
}

export interface RunGeoAuditOutput {
  runs: GeoRun[];
  result: GeoScoreResult;
  totalCostKrw: number;
  stoppedByCostCap: boolean;
}

/** 병원 1곳 GEO 진단: 질문 × 엔진 × 반복. 비용 상한 도달 시 새 호출을 멈춘다. */
export async function runGeoAudit(input: RunGeoAuditInput): Promise<RunGeoAuditOutput> {
  const repeats = input.repeats ?? 3;
  const concurrency = Math.max(1, input.concurrency ?? 4);
  const cap = input.costCapKrw ?? Number.POSITIVE_INFINITY;
  const questions = input.questions ?? buildQuestions({ sggu: input.sggu, emd: input.emd });

  const jobs: { engine: GeoEngine; query: string; runNo: number }[] = [];
  for (const query of questions) for (const engine of input.engines) for (let runNo = 1; runNo <= repeats; runNo++) jobs.push({ engine, query, runNo });

  const runs: GeoRun[] = [];
  let totalCostKrw = 0;
  let stoppedByCostCap = false;
  let cursor = 0;

  const worker = async () => {
    while (cursor < jobs.length) {
      if (totalCostKrw >= cap) {
        stoppedByCostCap = true;
        return;
      }
      const job = jobs[cursor++]!;
      let run: GeoRun;
      try {
        const ans = await job.engine.ask(job.query);
        const m = detectMention(ans.text, input.hospitalName, input.aliases);
        run = {
          engine: job.engine.name,
          query: job.query,
          runNo: job.runNo,
          mentioned: m.mentioned,
          position: m.position,
          competitors: m.competitors,
          sources: ans.sources,
          rawResponse: ans.text,
          error: null,
          costKrw: ans.costKrw,
        };
      } catch (e) {
        run = {
          engine: job.engine.name,
          query: job.query,
          runNo: job.runNo,
          mentioned: false,
          position: null,
          competitors: [],
          sources: [],
          rawResponse: "",
          error: e instanceof Error ? e.message : String(e),
          costKrw: 0,
        };
      }
      totalCostKrw += run.costKrw;
      runs.push(run);
      input.onRun?.(run);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

  const result = computeGeoScore(runs, { hospitalName: input.hospitalName, ownDomains: input.ownDomains ?? [] });
  return { runs, result, totalCostKrw: Math.round(totalCostKrw * 100) / 100, stoppedByCostCap };
}
