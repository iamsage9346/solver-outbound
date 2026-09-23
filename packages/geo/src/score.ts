import { DEFAULT_SETTINGS } from "@solver/shared";
import type { GeoRun, GeoScoreResult, EngineStat } from "./types";

export interface ScoreOptions {
  hospitalName: string;
  ownDomains: string[];
  weights?: { mentionRate: number; ownSource: number; position: number };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * PRD 6절 GEO 점수(0~100):
 *   언급률 60 + 인용 출처에 자사 플레이스·홈페이지 포함 20 + 경쟁 병원 대비 언급 순서 20
 * 모든 회차가 실패한 엔진은 failed로 표시하고 비율 계산에서 제외한다.
 */
export function computeGeoScore(runs: GeoRun[], opts: ScoreOptions): GeoScoreResult {
  const weights = opts.weights ?? DEFAULT_SETTINGS.geo.weights;
  const ownHosts = opts.ownDomains.map(hostOf).filter(Boolean);

  const byEngine = new Map<string, GeoRun[]>();
  for (const r of runs) byEngine.set(r.engine, [...(byEngine.get(r.engine) ?? []), r]);

  const engines: Record<string, EngineStat> = {};
  const okRuns: GeoRun[] = [];
  for (const [name, list] of byEngine) {
    const ok = list.filter((r) => !r.error);
    const failed = ok.length === 0;
    engines[name] = {
      runs: list.length,
      failed,
      mentionRate: failed ? 0 : ok.filter((r) => r.mentioned).length / ok.length,
    };
    if (!failed) okRuns.push(...ok);
  }

  const questionSet = new Set(okRuns.map((r) => r.query));
  const mentionedRuns = okRuns.filter((r) => r.mentioned);
  const mentionRate = okRuns.length ? mentionedRuns.length / okRuns.length : 0;

  const withOwnSource = okRuns.filter((r) => r.sources.some((s) => ownHosts.some((h) => hostOf(s) === h || hostOf(s).endsWith("." + h))));
  const ownSourceRate = okRuns.length ? withOwnSource.length / okRuns.length : 0;

  const positions = mentionedRuns.map((r) => r.position).filter((p): p is number => typeof p === "number" && p > 0);
  const avgPosition = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  // 순서 점수: 1위 = 1.0, 2위 = 0.66, 3위 = 0.5 … (1/pos), 언급 안 된 회차는 0
  const positionScore = okRuns.length ? positions.reduce((a, p) => a + 1 / p, 0) / okRuns.length : 0;

  const compCount = new Map<string, number>();
  for (const r of okRuns) for (const c of r.competitors) compCount.set(c, (compCount.get(c) ?? 0) + 1);
  const competitors = [...compCount.entries()]
    .map(([name, mentions]) => ({ name, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 5);

  const score = Math.round(mentionRate * weights.mentionRate + ownSourceRate * weights.ownSource + positionScore * weights.position);

  return {
    score: Math.max(0, Math.min(100, score)),
    mentionRate,
    questionCnt: questionSet.size,
    mentionedCnt: new Set(mentionedRuns.map((r) => r.query)).size,
    engines,
    competitors,
    ownSourceRate,
    avgPosition,
  };
}
