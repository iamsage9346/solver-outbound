export type RenderMode = "static" | "browser";

export type CrawlErrorCode =
  | "BLOCKED"
  | "TIMEOUT"
  | "CERT_ERROR"
  | "NOT_FOUND"
  | "ROBOTS_DISALLOW"
  | "EMPTY_BODY"
  | "RENDER_UNAVAILABLE"
  | null;

export type EmailContext = "mailto" | "footer" | "privacy" | "body";

export interface ExtractedEmail {
  value: string;
  page: string;
  obfuscated: boolean;
  isPersonal: boolean;
  context: EmailContext;
}

export interface TechSignals {
  https: boolean;
  mobileViewport: boolean;
  ttfbMs: number | null;
  schemaOrg: boolean;
  lastModified: string | null;
  hasDoctorsPage: boolean;
  hasHoursPage: boolean;
}

export type SnsKey = "naver_blog" | "naver_place" | "youtube" | "instagram" | "kakao";

export interface CrawledPage {
  url: string;
  title: string;
  status: number | null;
}

export interface CrawlOutput {
  url: string;
  finalUrl: string;
  statusCode: number | null;
  renderMode: RenderMode;
  pagesVisited: number;
  emails: ExtractedEmail[];
  formUrls: string[];
  snsLinks: Partial<Record<SnsKey, string>>;
  representative: string | null;
  hours: string | null;
  services: string[];
  tech: TechSignals;
  harvestRefusal: boolean;
  /** 메인·소개·의료진 페이지 본문 텍스트 (최대 8000자, LLM 요약 재료) */
  text: string;
  errorCode: CrawlErrorCode;
  pages: CrawledPage[];
}

export type PageKind = "about" | "doctors" | "hours" | "privacy" | "contact" | "other";

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number | null;
  headers: Record<string, string>;
  body: string;
  ttfbMs: number | null;
  errorCode: CrawlErrorCode;
}

export type FetchImpl = (url: string) => Promise<FetchResult>;
