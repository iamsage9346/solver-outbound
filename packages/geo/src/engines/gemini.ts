import type { GeoEngine } from "../types";
import { estimateCostKrw } from "../pricing";

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

/** Gemini: SDK 없이 REST + google_search 그라운딩 */
export function createGeminiEngine(env: NodeJS.ProcessEnv = process.env, model = "gemini-2.5-flash", fetchImpl: typeof fetch = fetch): GeoEngine {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (GeoEngine: gemini)");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return {
    name: "gemini",
    async ask(question, opts) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: question }] }], tools: [{ google_search: {} }] }),
        signal: opts?.signal,
      });
      const data = (await res.json()) as GeminiResponse;
      if (!res.ok) throw new Error(`gemini ${res.status}: ${data.error?.message ?? "unknown error"}`);
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      const sources = (cand?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web?.uri).filter((u): u is string => !!u);
      const grounded = sources.length > 0 ? 1 : 0;
      return {
        text,
        sources: [...new Set(sources)],
        costKrw: estimateCostKrw("gemini", data.usageMetadata?.promptTokenCount ?? 0, data.usageMetadata?.candidatesTokenCount ?? 0, grounded),
        raw: data,
      };
    },
  };
}
