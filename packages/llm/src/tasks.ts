import { z } from "zod";
import { REPLY_CLASSES, findBannedTerms, type ReplyClass } from "@solver/shared";
import { ask, parseJson } from "./client";

const SYSTEM = `당신은 병의원 대상 B2B 아웃리치를 돕는 어시스턴트입니다. 한국어로, 과장 없이, 짧게 씁니다.
금지: "순위 보장", "상승", 리뷰 유도, 최고/유일 같은 과장 표현. 의료광고 규제를 의식해 현재 상태와 개선 구조만 말합니다.`;

/** PRD 5절: 홈페이지 3문장 요약(특징, 강조 진료, 톤) */
export async function summarizeSite(input: { name: string; text: string }): Promise<string> {
  const prompt = `아래는 "${input.name}" 홈페이지 본문입니다. 특징·강조 진료·톤을 각각 한 문장씩, 총 3문장으로 요약하세요. 문장만 출력합니다.\n\n${input.text.slice(0, 6000)}`;
  return ask(prompt, { system: SYSTEM, maxTokens: 300, dryRunAnswer: `${input.name}은 도수치료와 체외충격파를 강조하는 정형외과입니다. 스포츠 손상과 척추 통증을 주로 다룹니다. 차분하고 설명 위주의 톤입니다.` });
}

/** PRD 7절: 개인화 첫 문장 1개 (담당 승인 후에만 발송) */
export async function personalizeOpener(input: { name: string; siteSummary: string | null; topFix: string | null; placeRank: number | null; sggu: string | null }): Promise<string> {
  const prompt = `병원명: ${input.name}
지역: ${input.sggu ?? "-"}
홈페이지 요약: ${input.siteSummary ?? "(없음)"}
진단에서 가장 먼저 손볼 것: ${input.topFix ?? "(없음)"}
플레이스 순위: ${input.placeRank ?? "-"}

원장님께 보내는 콜드메일의 첫 문장 하나를 쓰세요. 이 병원의 홈페이지나 진료 특징을 구체적으로 언급해 "우리 병원 얘기"임을 바로 알게 하되, 칭찬·과장·판매 문구 없이 관찰 사실만 한 문장(60자 이내)으로 씁니다. 문장만 출력합니다.`;
  const out = await ask(prompt, { system: SYSTEM, maxTokens: 120, temperature: 0.5, dryRunAnswer: `홈페이지에서 도수치료와 체외충격파를 앞세우고 계신 것을 봤습니다.` });
  const line = out.split("\n")[0]!.trim();
  if (findBannedTerms(line).length) throw new Error(`personalizeOpener produced banned term: ${line}`);
  return line;
}

export const ReplyAnalysis = z.object({
  classification: z.enum(REPLY_CLASSES),
  summary: z.string(),
  proposedTimes: z.array(z.string()).default([]),
  nextAction: z.string().default(""),
});
export type ReplyAnalysis = z.infer<typeof ReplyAnalysis>;

/** PRD 8절: 회신 8종 분류 + 2줄 요약 + 날짜 제안 추출 */
export async function analyzeReply(input: { from: string; subject: string; body: string }): Promise<ReplyAnalysis> {
  // 수신거부·바운스는 규칙 우선 (오분류 0건 목표)
  const lower = input.body.toLowerCase();
  if (/수신\s*거부|그만\s*보내|보내지\s*마|unsubscribe|remove me/.test(lower)) {
    return { classification: "unsubscribe", summary: "수신거부 요청", proposedTimes: [], nextAction: "억제 목록 등록 (자동)" };
  }
  const prompt = `다음 회신 메일을 분류하세요. 분류값은 ${REPLY_CLASSES.join(", ")} 중 하나입니다.
- positive: 미팅·설명에 관심
- question: 질문
- forward: 담당자(행정실장 등)에게 전달됨 또는 담당자가 대신 회신
- negative: 거절
- unsubscribe: 수신거부
- auto_reply: 부재중 자동응답
- bounce: 반송
- other: 그 외

JSON으로만 출력: {"classification": "...", "summary": "2줄 이내 요약", "proposedTimes": ["제안된 날짜/시간 문자열"], "nextAction": "담당이 할 다음 행동 한 줄"}

From: ${input.from}
Subject: ${input.subject}

${input.body.slice(0, 4000)}`;
  const raw = await ask(prompt, { system: SYSTEM, maxTokens: 400, temperature: 0, dryRunAnswer: JSON.stringify({ classification: "positive", summary: "미팅 관심 표현. 다음 주 화요일 오후 가능하다고 함.", proposedTimes: ["다음 주 화요일 오후"], nextAction: "예약 링크 회신" }) });
  return ReplyAnalysis.parse(parseJson(raw));
}

/** PRD 8절: 답장 초안 */
export async function draftReply(input: { name: string; classification: ReplyClass; theirMessage: string; bookingUrl: string; senderName: string }): Promise<string> {
  const prompt = `병원: ${input.name}\n회신 분류: ${input.classification}\n상대 메일:\n${input.theirMessage.slice(0, 3000)}\n\n위 메일에 대한 답장 초안을 5문장 이내로 쓰세요. 미팅 관심이면 예약 링크(${input.bookingUrl})를 넣고, 질문이면 답하고 30분 미팅을 제안합니다. 서명은 "솔버 ${input.senderName} 드림"으로 끝냅니다. 본문만 출력합니다.`;
  return ask(prompt, { system: SYSTEM, maxTokens: 500, dryRunAnswer: `원장님, 회신 감사합니다. 말씀하신 시간에 맞춰 30분 설명드리겠습니다. 아래 링크에서 편한 시간을 골라주세요.\n${input.bookingUrl}\n\n솔버 ${input.senderName} 드림` });
}

/** PRD 6절: 진단 결과 → "바로 손볼 3가지" */
export async function suggestTopFixes(input: { name: string; place: unknown; site: unknown; geo: unknown }): Promise<string[]> {
  const prompt = `병원 "${input.name}"의 진단 데이터입니다.\n플레이스: ${JSON.stringify(input.place)}\n홈페이지: ${JSON.stringify(input.site)}\nGEO: ${JSON.stringify(input.geo)}\n\n원장이 바로 손볼 수 있는 개선 항목 3개를 각각 40자 이내 한 문장으로, JSON 배열로만 출력하세요. 효과 보장·상승 표현 금지, 리뷰 유도 금지.`;
  const raw = await ask(prompt, { system: SYSTEM, maxTokens: 300, temperature: 0.2, dryRunAnswer: JSON.stringify(["플레이스 진료시간·주차 정보 채우기", "홈페이지 의료진 소개에 전문의 표기 추가", "홈페이지 모바일 화면 대응"]) });
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const arr = JSON.parse(cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1)) as string[];
  return arr.slice(0, 3);
}
