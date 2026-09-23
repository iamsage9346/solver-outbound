import OpenAI from "openai";
import type { GeoEngine } from "../types";
import { estimateCostKrw } from "../pricing";

/** Perplexity는 OpenAI 호환 Chat Completions API. 검색은 기본 내장 (sonar). */
export function createPerplexityEngine(env: NodeJS.ProcessEnv = process.env, model = "sonar"): GeoEngine {
  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set (GeoEngine: perplexity)");
  const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });
  return {
    name: "perplexity",
    async ask(question, opts) {
      const res = await client.chat.completions.create(
        { model, messages: [{ role: "user", content: question }] },
        { signal: opts?.signal },
      );
      const text = res.choices[0]?.message?.content ?? "";
      const extra = res as unknown as { citations?: string[]; search_results?: { url: string }[] };
      const sources = new Set<string>([...(extra.citations ?? []), ...(extra.search_results ?? []).map((s) => s.url)]);
      return {
        text,
        sources: [...sources].filter(Boolean),
        costKrw: estimateCostKrw("perplexity", res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0, 1),
        raw: res,
      };
    },
  };
}
