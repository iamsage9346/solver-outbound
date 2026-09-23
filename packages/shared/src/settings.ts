/** PRD 4·6·7절: 설정 파일로 바꿀 수 있어야 하는 값들의 기본값 */
export const DEFAULT_SETTINGS = {
  send: {
    dailyCap: 40,
    hourlyCap: 15,
    perLeadCap: 3,
    days: [2, 3, 4] as number[], // 화·수·목 (0=일)
    time: "10:00",
    jitterMinutes: 15,
    adLabel: true, // "(광고)" 표기, 법무 확인 전 기본 ON
    sender: { name: "솔버 박상화", address: "", phone: "" },
  },
  followup: {
    callAfterDays: 2,
    remailAfterDays: 7,
    reapproachAfterDays: 14,
    dailyDigestTime: "09:00",
    openDigestTimes: ["10:30", "16:00"],
  },
  tier: {
    t2: { minYears: 2, maxYears: 7, minDoctors: 2, maxDoctors: 5, minStaffEst: 10 },
    t3: { placeRankWorseThan: 10, reviewLessThan: 30 },
    exclude: { minYears: 1, excludedSggu: ["강릉시", "속초시", "동해시", "삼척시", "양양군", "고성군"] },
    /** 심평원 종별코드: 01 상급종합, 11 종합병원, 21 병원, 31 의원 … */
    includeClCd: ["21", "31"],
  },
  geo: {
    engines: ["openai", "anthropic", "perplexity", "gemini"] as string[], // 키 없는 엔진은 자동 제외
    repeats: 3,
    weights: { mentionRate: 60, ownSource: 20, position: 20 },
    costCapKrw: 300_000,
    questionTemplates: [
      "{구} 정형외과 추천해줘",
      "{동} 근처 정형외과 어디가 좋아?",
      "{구} 도수치료 병원 어디가 좋아",
      "{동} 근처 무릎 통증 잘 보는 병원",
      "{구} 어깨 통증 병원 추천",
      "{구} 허리 디스크 잘 보는 정형외과",
      "{구} 체외충격파 치료 잘하는 곳",
      "{동} 정형외과 야간진료 하는 곳",
      "{구} 스포츠 손상 정형외과",
      "{구} 정형외과 리뷰 좋은 곳",
      "{구} 관절 주사치료 병원",
      "{동} 근처 물리치료 잘하는 병원",
    ],
  },
  crawl: {
    domainIntervalMs: 2000,
    maxPages: 30,
    maxDepth: 2,
    parallelDomains: 20, // 도메인 간 병렬. 도메인당 간격 2초는 유지
    userAgent: "SolverOutreachBot/0.1 (+https://solver.kr; outreach@solver.kr)",
    htmlRetentionDays: 30,
    recrawlDays: 60,
  },
  retention: {
    unansweredContactMonths: 6,
    replyBodyYears: 1,
  },
} as const;

export type AppSettings = typeof DEFAULT_SETTINGS;
