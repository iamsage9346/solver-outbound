import { DEFAULT_SETTINGS, yearsSince, type Tier } from "@solver/shared";

export type TierRules = typeof DEFAULT_SETTINGS.tier;

export interface TierInput {
  clCd: string | null;
  sggu: string | null;
  estDate: Date | string | null;
  doctorCnt: number | null;
  staffEst: number | null;
  placeRank?: number | null;
  reviewCnt?: number | null;
  hasHomepage?: boolean;
  referralPossible?: boolean;
  unsubscribed?: boolean;
}

export interface TierResult {
  tier: Tier;
  reason: string;
}

/** PRD 4절 Tier 규칙. 제외는 해제 불가, 나머지는 tier_override로 덮어쓸 수 있다. */
export function assignTier(input: TierInput, rules: TierRules = DEFAULT_SETTINGS.tier, now = new Date()): TierResult {
  const years = yearsSince(input.estDate, now);

  if (input.unsubscribed) return { tier: "EXCLUDED", reason: "수신거부 이력" };
  if (input.sggu && (rules.exclude.excludedSggu as readonly string[]).some((s) => input.sggu!.includes(s))) return { tier: "EXCLUDED", reason: "강릉·영동권 제외 지역" };
  if (input.clCd && !(rules.includeClCd as readonly string[]).includes(input.clCd)) return { tier: "EXCLUDED", reason: "종합병원 이상 또는 대상 외 종별" };
  if (years !== null && years < rules.exclude.minYears) return { tier: "EXCLUDED", reason: "개원 1년 미만" };

  if (input.referralPossible) return { tier: "T1", reason: "소개 가능" };

  const t2 = rules.t2;
  const yearsOk = years !== null && years >= t2.minYears && years <= t2.maxYears;
  const doctorsOk = input.doctorCnt !== null && input.doctorCnt >= t2.minDoctors && input.doctorCnt <= t2.maxDoctors;
  const staffOk = input.staffEst !== null && input.staffEst >= t2.minStaffEst;
  if (yearsOk && doctorsOk && staffOk) return { tier: "T2", reason: `개원 ${years!.toFixed(1)}년차 · 의사 ${input.doctorCnt}명 · 직원 ${input.staffEst}명(추정)` };

  const t3 = rules.t3;
  const rankBad = input.placeRank == null || input.placeRank > t3.placeRankWorseThan;
  const reviewBad = input.reviewCnt == null || input.reviewCnt < t3.reviewLessThan;
  const siteBad = input.hasHomepage === false;
  if (rankBad || reviewBad || siteBad) {
    const why = [rankBad && "플레이스 10위 밖", reviewBad && "리뷰 30개 미만", siteBad && "홈페이지 없음"].filter(Boolean).join(" · ");
    return { tier: "T3", reason: why };
  }
  return { tier: "T3", reason: "Tier 2 조건 미충족" };
}

/** PRD 4절: 직원 수 = 의사 수와 물리치료실·도수치료 페이지 유무로 추정 (항상 "추정" 표시) */
export function estimateStaff(doctorCnt: number | null, services: string[] = []): number | null {
  if (doctorCnt == null) return null;
  const base = 2 + doctorCnt * 3; // 원무 기본 2 + 의사 1명당 간호·원무 3명
  const pt = services.some((s) => /물리치료|도수치료|재활/.test(s)) ? 3 : 0;
  const ops = services.some((s) => /수술|입원/.test(s)) ? 4 : 0;
  return base + pt + ops;
}
