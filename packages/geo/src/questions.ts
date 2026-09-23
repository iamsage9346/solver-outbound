import { DEFAULT_SETTINGS } from "@solver/shared";

export interface BuildQuestionsInput {
  sggu: string;
  emd?: string | null;
  dept?: string;
  templates?: readonly string[];
}

/** 지역 × 진료과 × 의도 템플릿으로 병원당 질문 세트를 만든다. 동(emd)이 없으면 {동} 템플릿은 건너뛴다. */
export function buildQuestions({ sggu, emd, dept = "정형외과", templates = DEFAULT_SETTINGS.geo.questionTemplates }: BuildQuestionsInput): string[] {
  const out: string[] = [];
  for (const t of templates) {
    if (t.includes("{동}") && !emd) continue;
    const q = t.replaceAll("{구}", sggu).replaceAll("{동}", emd ?? "").replaceAll("{진료과}", dept).replace(/\s+/g, " ").trim();
    if (!out.includes(q)) out.push(q);
  }
  return out;
}
