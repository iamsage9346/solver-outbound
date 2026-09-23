export interface BounceInfo {
  isBounce: boolean;
  hard: boolean;
  address: string | null;
  reason: string | null;
}

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)|delivery status notification/i;
const BOUNCE_SUBJECT = /undeliver|delivery (status|failure)|failure notice|returned mail|mail delivery failed|전송 실패|배달 실패|반송/i;

const HARD_PATTERNS: RegExp[] = [
  /\b5\.\d\.\d\b/,
  /\b55[0-4]\b/,
  /does not exist/i,
  /user unknown/i,
  /unknown user/i,
  /no such user/i,
  /recipient (address )?rejected/i,
  /address not found/i,
  /invalid recipient/i,
  /mailbox (not found|unavailable|does not exist)/i,
  /존재하지 않는/,
];

const SOFT_PATTERNS: RegExp[] = [
  /\b4\.\d\.\d\b/,
  /\b4[2-5]\d\b/,
  /mailbox (is )?full/i,
  /over quota/i,
  /quota exceeded/i,
  /temporar/i,
  /try again later/i,
  /greylist/i,
  /용량/,
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function parseBounce(mail: { from: string; subject: string; textBody: string }): BounceInfo {
  const isBounce = BOUNCE_FROM.test(mail.from) || BOUNCE_SUBJECT.test(mail.subject);
  if (!isBounce) return { isBounce: false, hard: false, address: null, reason: null };

  const body = mail.textBody ?? "";
  // 대상 주소: "Final-Recipient: rfc822; x@y" 또는 본문의 첫 non-daemon 주소
  const finalRecipient = body.match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+)/i)?.[1];
  const originalRecipient = body.match(/Original-Recipient:\s*rfc822;\s*([^\s<>]+)/i)?.[1];
  let address: string | null = (finalRecipient ?? originalRecipient ?? null)?.toLowerCase() ?? null;
  if (!address) {
    const candidates = (body.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()).filter((e) => !/mailer-daemon|postmaster/.test(e));
    address = candidates[0] ?? null;
  }

  const hard = HARD_PATTERNS.some((re) => re.test(body));
  const soft = !hard && SOFT_PATTERNS.some((re) => re.test(body));
  const statusLine = body.match(/(Status|Diagnostic-Code):\s*(.+)/i)?.[2]?.trim();
  const reason = statusLine ?? (hard ? "hard bounce" : soft ? "soft bounce" : "unknown bounce");
  // 판별 불가 시 보수적으로 soft (3일 후 1회 재시도)
  return { isBounce: true, hard, address, reason };
}
