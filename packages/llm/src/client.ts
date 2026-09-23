import Anthropic from "@anthropic-ai/sdk";
import { isDryRun } from "@solver/shared";

export const DEFAULT_MODEL = process.env.LLM_MODEL ?? "claude-sonnet-5";

let _client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic();
  }
  return _client;
}

export interface AskOptions {
  system?: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  /** 드라이런 시 반환할 고정 응답 */
  dryRunAnswer?: string;
}

/** 텍스트 한 번 묻고 답 받기. DRY_RUN이면 API 호출 없이 dryRunAnswer 반환. */
export async function ask(prompt: string, opts: AskOptions = {}): Promise<string> {
  if (isDryRun()) return opts.dryRunAnswer ?? "[dry-run] " + prompt.slice(0, 60);
  const res = await getAnthropic().messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 800,
    temperature: opts.temperature ?? 0.3,
    system: opts.system,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** JSON 응답 파싱 (코드펜스 제거) */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned) as T;
}
