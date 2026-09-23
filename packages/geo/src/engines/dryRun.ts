import type { GeoEngine } from "../types";

/** 결정적 의사난수 (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DryRunEngineOptions {
  name?: string;
  /** 대상 병원명이 답변에 포함될 확률 (0~1) */
  mentionProbability?: number;
  targetName?: string;
  costKrw?: number;
  competitors?: string[];
}

/** 네트워크 없이 점수 계산·CLI 흐름을 검증하기 위한 가짜 엔진 */
export function createDryRunEngine(seed = 1, opts: DryRunEngineOptions = {}): GeoEngine {
  const next = rng(seed);
  const name = opts.name ?? "dry_run";
  const target = opts.targetName ?? "대상병원";
  const p = opts.mentionProbability ?? 0.5;
  const comps = opts.competitors ?? ["연세바른정형외과", "서울튼튼정형외과의원", "굿본정형외과"];
  const cost = opts.costKrw ?? 0;
  return {
    name,
    async ask(question) {
      const r = next();
      const mention = r < p;
      const pos = Math.floor(next() * 3); // 0..2
      const names = comps.slice(0, 2 + Math.floor(next() * 2));
      if (mention) names.splice(pos, 0, target);
      const text = `${question}에 대한 답변입니다. 추천 병원: ${names.map((n, i) => `${i + 1}. ${n}`).join(", ")}. 각 병원의 리뷰와 위치를 참고하세요.`;
      const sources = mention && next() < 0.5 ? ["https://m.place.naver.com/hospital/000/home", "https://blog.naver.com/x/1"] : ["https://blog.naver.com/x/1"];
      return { text, sources, costKrw: cost, raw: { dryRun: true } };
    },
  };
}
