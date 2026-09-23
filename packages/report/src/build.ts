import type { ReportData } from "./types";

/** 3축 점수 계산. 플레이스·홈페이지는 규칙 기반, GEO는 geo 패키지 점수를 그대로 받는다. */
export function scorePlace(p: NonNullable<ReportData["place"]>): number {
  const ranks = p.keywords.map((k) => k.rank);
  const rankScore = ranks.length ? ranks.reduce<number>((a, r) => a + (r == null ? 0 : Math.max(0, 11 - r) / 10), 0) / ranks.length : 0; // 0~1
  const reviewScore = Math.min(1, (p.reviewCnt ?? 0) / 100);
  const missingScore = Math.max(0, 1 - p.missing.length / 5);
  return Math.round((rankScore * 0.5 + reviewScore * 0.25 + missingScore * 0.25) * 100);
}

export function scoreSite(s: NonNullable<ReportData["site"]>): number {
  const checks = [s.https, s.mobile, s.ttfbMs != null && s.ttfbMs < 1500, s.doctorsPage, s.hoursPage, s.schemaOrg];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function buildScores(d: Pick<ReportData, "place" | "site"> & { geoScore: number | null }): ReportData["scores"] {
  return {
    place: d.place ? scorePlace(d.place) : null,
    site: d.site ? scoreSite(d.site) : null,
    geo: d.geoScore,
  };
}

/** 개발·드라이런용 샘플 */
export function sampleReport(over: Partial<ReportData> = {}): ReportData {
  const place: ReportData["place"] = {
    keywords: [
      { keyword: "강남구 정형외과", rank: 7 },
      { keyword: "역삼동 정형외과", rank: 3 },
      { keyword: "강남구 도수치료", rank: null },
    ],
    reviewCnt: 112,
    lastReviewAt: "2026-08-30",
    missing: ["주차", "예약 버튼"],
  };
  const site: ReportData["site"] = { https: true, mobile: false, ttfbMs: 820, doctorsPage: true, hoursPage: true, schemaOrg: false };
  const base: ReportData = {
    hospitalName: "강남바른정형외과의원",
    region: "서울 강남구 역삼동",
    auditedAt: "2026-09-22",
    scores: { place: 0, site: 0, geo: 42 },
    place,
    site,
    geo: {
      questionCnt: 12,
      mentionedCnt: 4,
      mentionRate: 0.33,
      questions: [
        { query: "강남구 정형외과 추천해줘", mentioned: true, engines: ["ChatGPT", "Perplexity"] },
        { query: "역삼동 근처 정형외과 어디가 좋아?", mentioned: true, engines: ["Perplexity"] },
        { query: "강남구 도수치료 병원 어디가 좋아", mentioned: false, engines: [] },
        { query: "역삼동 근처 무릎 통증 잘 보는 병원", mentioned: true, engines: ["Gemini"] },
        { query: "강남구 어깨 통증 병원 추천", mentioned: false, engines: [] },
        { query: "강남구 허리 디스크 잘 보는 정형외과", mentioned: false, engines: [] },
        { query: "강남구 체외충격파 치료 잘하는 곳", mentioned: true, engines: ["Claude"] },
        { query: "역삼동 정형외과 야간진료 하는 곳", mentioned: false, engines: [] },
      ],
      failedEngines: [],
    },
    competitors: [
      { name: "강남에이스정형외과", placeRank: 1, geoMentions: 9, reviewCnt: 480 },
      { name: "역삼정형외과의원", placeRank: 2, geoMentions: 7, reviewCnt: 310 },
      { name: "테헤란정형외과", placeRank: 4, geoMentions: 5, reviewCnt: 150 },
    ],
    topFixes: ["플레이스에 주차 안내와 예약 버튼 채우기", "홈페이지 모바일 화면 대응", "의료진 페이지에 전문의 정보와 구조화 데이터 추가"],
    bookingUrl: "https://calendar.app.google/example",
    sender: { name: "솔버 박상화", contact: "outreach@solver.kr" },
  };
  const merged = { ...base, ...over };
  merged.scores = buildScores({ place: merged.place, site: merged.site, geoScore: merged.scores.geo });
  return merged;
}
