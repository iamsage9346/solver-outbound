import Anthropic from "@anthropic-ai/sdk";
import type { GeoEngine } from "../types";
import { estimateCostKrw } from "../pricing";

export function createAnthropicEngine(env: NodeJS.ProcessEnv = process.env, model = "claude-sonnet-5"): GeoEngine {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (GeoEngine: anthropic)");
  const client = new Anthropic({ apiKey });
  return {
    name: "anthropic",
    async ask(question, opts) {
      const res = await client.messages.create(
        {
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: question }],
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        },
        { signal: opts?.signal },
      );
      const texts: string[] = [];
      const sources = new Set<string>();
      let calls = 0;
      for (const block of res.content) {
        if (block.type === "text") {
          texts.push(block.text);
          for (const c of block.citations ?? []) if (c.type === "web_search_result_location") sources.add(c.url);
        } else if (block.type === "web_search_tool_result") {
          calls += 1;
          const content = block.content;
          if (Array.isArray(content)) for (const r of content) if (r.type === "web_search_result") sources.add(r.url);
        }
      }
      const usage = res.usage;
      return {
        text: texts.join("\n"),
        sources: [...sources],
        costKrw: estimateCostKrw("anthropic", usage.input_tokens, usage.output_tokens, calls),
        raw: res,
      };
    },
  };
}
