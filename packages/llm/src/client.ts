import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { isDryRun } from "@solver/shared";

/**
 * LLM 공급자 선택: LLM_PROVIDER=openai | anthropic. 미지정이면 키가 있는 쪽을 쓴다 (openai 우선).
 * 모델은 LLM_MODEL로 덮어쓸 수 있다.
 */
export type Provider = "openai" | "anthropic";

export function resolveProvider(): Provider {
  const p = process.env.LLM_PROVIDER as Provider | undefined;
  if (p === "openai" || p === "anthropic") return p;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "openai";
}

const DEFAULT_MODELS: Record<Provider, string> = { openai: "gpt-5-mini", anthropic: "claude-sonnet-5" };
export function defaultModel(): string {
  return process.env.LLM_MODEL ?? DEFAULT_MODELS[resolveProvider()];
}

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return (_anthropic ??= new Anthropic());
}
export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return (_openai ??= new OpenAI());
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
  const provider = resolveProvider();
  const model = opts.model ?? defaultModel();

  if (provider === "openai") {
    const res = await getOpenAI().responses.create({
      model,
      instructions: opts.system,
      input: prompt,
      max_output_tokens: opts.maxTokens ?? 800,
      // gpt-5 계열은 temperature를 받지 않으므로 지정된 경우에만 전달
      ...(model.startsWith("gpt-5") ? {} : { temperature: opts.temperature ?? 0.3 }),
    });
    return res.output_text.trim();
  }

  const res = await getAnthropic().messages.create({
    model,
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
