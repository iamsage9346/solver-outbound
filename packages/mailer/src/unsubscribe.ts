const PATTERNS: RegExp[] = [
  /수신\s*거부/,
  /수신을?\s*원하지\s*않/,
  /수신\s*(을|를)?\s*중단/,
  /그만\s*보내/,
  /보내지\s*마/,
  /더\s*이상\s*(메일|연락)/,
  /메일\s*(을|를)?\s*(중단|중지)/,
  /unsubscribe/i,
  /remove\s+me/i,
  /opt[\s-]?out/i,
  /stop\s+(emailing|sending)/i,
];

/** 회신 본문에서 수신거부 의사 감지. 인용부(> 로 시작하는 줄)는 제외한다. */
export function detectUnsubscribeIntent(text: string): boolean {
  const own = text
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith(">"))
    .join("\n");
  // 우리가 보낸 안내 문구("수신거부"라고 회신) 자체가 인용 없이 남을 수 있어, 원본 안내 문장은 제거
  const stripped = own.replace(/["“]수신거부["”]라고\s*회신/g, "").replace(/수신을 원치 않으시면/g, "");
  return PATTERNS.some((re) => re.test(stripped));
}
