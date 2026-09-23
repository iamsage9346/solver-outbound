export interface EngineAnswer {
  text: string;
  /** 인용된 출처 URL */
  sources: string[];
  /** 추정 비용 (원) */
  costKrw: number;
  raw?: unknown;
}

export interface GeoEngine {
  name: string;
  ask(question: string, opts?: { signal?: AbortSignal }): Promise<EngineAnswer>;
}

/** PRD 10절 audit_runs 한 행에 해당하는 원자료 */
export interface GeoRun {
  engine: string;
  query: string;
  runNo: number;
  mentioned: boolean;
  position: number | null;
  competitors: string[];
  sources: string[];
  rawResponse: string;
  error: string | null;
  costKrw: number;
}

export interface EngineStat {
  mentionRate: number;
  runs: number;
  failed: boolean;
}

export interface GeoScoreResult {
  score: number;
  mentionRate: number;
  questionCnt: number;
  mentionedCnt: number;
  engines: Record<string, EngineStat>;
  competitors: { name: string; mentions: number }[];
  ownSourceRate: number;
  avgPosition: number | null;
}
