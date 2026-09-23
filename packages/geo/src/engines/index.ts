import { isDryRun } from "@solver/shared";
import type { GeoEngine } from "../types";
import { createAnthropicEngine } from "./anthropic";
import { createOpenAIEngine } from "./openai";
import { createPerplexityEngine } from "./perplexity";
import { createGeminiEngine } from "./gemini";
import { createDryRunEngine } from "./dryRun";

export { createAnthropicEngine, createOpenAIEngine, createPerplexityEngine, createGeminiEngine, createDryRunEngine };

export const ENGINE_FACTORIES: Record<string, (env?: NodeJS.ProcessEnv) => GeoEngine> = {
  anthropic: (env) => createAnthropicEngine(env),
  openai: (env) => createOpenAIEngine(env),
  perplexity: (env) => createPerplexityEngine(env),
  gemini: (env) => createGeminiEngine(env),
};

export interface CreateEnginesOptions {
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  /** 대상 병원명 (dry-run 엔진 답변용) */
  targetName?: string;
  /** true면 키 없는 엔진은 건너뛰고 경고만 남김. false면 throw */
  skipMissing?: boolean;
  onSkip?: (name: string, reason: string) => void;
}

/** 설정된 엔진 이름 목록 → GeoEngine 배열. DRY_RUN이면 전부 가짜 엔진. */
export function createEngines(names: string[], opts: CreateEnginesOptions = {}): GeoEngine[] {
  const dry = opts.dryRun ?? isDryRun();
  const engines: GeoEngine[] = [];
  names.forEach((name, i) => {
    if (dry) {
      engines.push(createDryRunEngine(i + 1, { name, targetName: opts.targetName, mentionProbability: 0.4 + i * 0.1 }));
      return;
    }
    const factory = ENGINE_FACTORIES[name];
    if (!factory) {
      if (opts.skipMissing) return opts.onSkip?.(name, "unknown engine");
      throw new Error(`Unknown GEO engine: ${name}`);
    }
    try {
      engines.push(factory(opts.env));
    } catch (e) {
      if (!opts.skipMissing) throw e;
      opts.onSkip?.(name, e instanceof Error ? e.message : String(e));
    }
  });
  return engines;
}
