/**
 * PRD 6절·12절: 금지어 사전.
 * 리포트·템플릿에 아래 표현이 있으면 승인 불가.
 */
export const BANNED_TERMS: readonly string[] = [
  "순위 보장",
  "순위보장",
  "1위 보장",
  "상위노출 보장",
  "노출 보장",
  "상승 보장",
  "순위 상승",
  "매출 상승",
  "리뷰 작성 부탁",
  "리뷰 이벤트",
  "리뷰를 남겨",
  "후기 이벤트",
  "최고의",
  "최상의",
  "국내 유일",
  "유일한",
  "100%",
  "확실한 효과",
  "무조건",
];

export interface BannedTermHit {
  term: string;
  index: number;
  excerpt: string;
}

export function findBannedTerms(text: string, dictionary: readonly string[] = BANNED_TERMS): BannedTermHit[] {
  const hits: BannedTermHit[] = [];
  for (const term of dictionary) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(term, from);
      if (idx === -1) break;
      hits.push({
        term,
        index: idx,
        excerpt: text.slice(Math.max(0, idx - 15), idx + term.length + 15).replace(/\s+/g, " "),
      });
      from = idx + term.length;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** PRD 5절: 이메일 무단수집 거부 문구 감지 (정보통신망법 제50조의2) */
export const EMAIL_HARVEST_REFUSAL_PATTERNS: readonly RegExp[] = [
  /이메일\s*무단\s*수집\s*거부/,
  /이메일\s*주소\s*무단\s*수집\s*거부/,
  /전자\s*우편\s*(주소\s*)?무단\s*수집\s*거부/,
  /e-?mail\s*무단\s*수집\s*거부/i,
  /무단\s*수집\s*을?\s*거부/,
];

export function detectEmailHarvestRefusal(text: string): boolean {
  return EMAIL_HARVEST_REFUSAL_PATTERNS.some((re) => re.test(text));
}

/** 무료 메일 도메인 → 개인 추정 (is_personal) */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "nate.com",
  "kakao.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
]);

export function isPersonalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && FREE_MAIL_DOMAINS.has(domain);
}
