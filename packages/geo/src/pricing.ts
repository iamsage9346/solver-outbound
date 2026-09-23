/**
 * 엔진별 대략적인 토큰 단가 (원 / 1k 토큰).
 * 정확한 청구액이 아니라 라운드 비용 상한(PRD 6절) 판단용 추정치다.
 * 환율 1,400원/USD 가정. 웹 검색 도구 호출 비용은 perCall에 포함.
 */
export const PRICING_KRW_PER_1K: Record<string, { input: number; output: number; perCall: number }> = {
  anthropic: { input: 4.2, output: 21, perCall: 14 }, // sonnet + web search $10/1k calls
  openai: { input: 0.35, output: 2.8, perCall: 14 }, // gpt-5-mini + web search preview
  perplexity: { input: 1.4, output: 1.4, perCall: 7 }, // sonar
  gemini: { input: 0.42, output: 3.5, perCall: 49 }, // 2.5 flash + grounding $35/1k
  dry_run: { input: 0, output: 0, perCall: 0 },
};

export function estimateCostKrw(engine: string, inTok: number, outTok: number, calls = 1): number {
  const p = PRICING_KRW_PER_1K[engine] ?? { input: 2, output: 8, perCall: 10 };
  return Math.round(((inTok / 1000) * p.input + (outTok / 1000) * p.output + calls * p.perCall) * 100) / 100;
}
