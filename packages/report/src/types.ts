export interface ReportData {
  hospitalName: string;
  region: string; // 예: 서울 강남구 역삼동
  auditedAt: string; // yyyy-mm-dd
  scores: { place: number | null; site: number | null; geo: number | null };
  place: {
    keywords: { keyword: string; rank: number | null }[];
    reviewCnt: number | null;
    lastReviewAt: string | null;
    missing: string[];
  } | null;
  site: {
    https: boolean;
    mobile: boolean;
    ttfbMs: number | null;
    doctorsPage: boolean;
    hoursPage: boolean;
    schemaOrg: boolean;
  } | null;
  geo: {
    questionCnt: number;
    mentionedCnt: number;
    mentionRate: number;
    questions: { query: string; mentioned: boolean; engines: string[] }[];
    failedEngines: string[];
  } | null;
  competitors: { name: string; placeRank: number | null; geoMentions: number; reviewCnt: number | null }[];
  topFixes: string[];
  bookingUrl: string;
  sender: { name: string; contact: string };
}
