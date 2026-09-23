import OpenAI from "openai";
import type { GeoEngine } from "../types";
import { estimateCostKrw } from "../pricing";

export function createOpenAIEngine(env: NodeJS.ProcessEnv = process.env, model = "gpt-5-mini"): GeoEngine {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (GeoEngine: openai)");
  const client = new OpenAI({ apiKey });
  return {
    name: "openai",
    async ask(question, opts) {
      const res = await client.responses.create(
        { model, input: question, tools: [{ type: "web_search_preview" }] },
        { signal: opts?.signal },
      );
      const sources = new Set<string>();
      let calls = 0;
      for (const item of res.output) {
        if (item.type === "web_search_call") calls += 1;
        if (item.type === "message") {
          for (const part of item.content) {
            if (part.type === "output_text") for (const a of part.annotations ?? []) if (a.type === "url_citation") sources.add(a.url);
          }
        }
      }
      const usage = res.usage;
      return {
        text: res.output_text ?? "",
        sources: [...sources],
        costKrw: estimateCostKrw("openai", usage?.input_tokens ?? 0, usage?.output_tokens ?? 0, calls),
        raw: res,
      };
    },
  };
}
