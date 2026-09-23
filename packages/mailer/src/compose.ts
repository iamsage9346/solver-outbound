import { renderTemplate, extractVariables } from "@solver/shared";

export interface ComposeInput {
  template: { subject: string; bodyMd: string; variables?: string[] };
  vars: Record<string, string | number | null | undefined>;
  adLabel: boolean;
  sender: { name: string; address: string; phone: string };
  /** 기본 3 (리포트·예약·수신거부) */
  maxLinks?: number;
}

export interface ComposeResult {
  subject: string;
  text: string;
  missing: string[];
  ok: boolean;
  reasons: string[];
  linkCount: number;
}

const LINK_RE = /https?:\/\/[^\s)>\]]+/g;
const HTML_RE = /<\s*(img|a|div|span|table|html|body|br|p)\b[^>]*>/i;
const IMG_MD_RE = /!\[[^\]]*\]\([^)]*\)/;
const UNSUB_RE = /수신\s*거부|unsubscribe/i;

/** PRD 7절 규칙대로 제목·본문을 만들고, 발송 가능 여부(ok)를 판정한다. */
export function composeMessage(input: ComposeInput): ComposeResult {
  const reasons: string[] = [];
  const vars: Record<string, string | number | null | undefined> = {
    발신자명: input.sender.name,
    발신자연락처: [input.sender.address, input.sender.phone].filter(Boolean).join(" · "),
    ...input.vars,
  };

  const subj = renderTemplate(input.template.subject, vars);
  const body = renderTemplate(input.template.bodyMd, vars);
  const declared = input.template.variables ?? extractVariables(input.template.subject + "\n" + input.template.bodyMd);
  const missing = [...new Set([...subj.missing, ...body.missing, ...declared.filter((v) => vars[v] === undefined || vars[v] === null || String(vars[v]).trim() === "")])];
  if (missing.length) reasons.push(`변수 누락: ${missing.join(", ")}`);

  let subject = subj.text.trim();
  if (input.adLabel && !subject.startsWith("(광고)")) subject = `(광고) ${subject}`;
  const text = body.text;

  if (!text.includes(input.sender.name)) reasons.push("발신자 상호가 본문에 없음");
  const contact = input.sender.address || input.sender.phone;
  if (!contact) reasons.push("발신자 연락처 설정 누락");
  else if (!text.includes(input.sender.address) && !text.includes(input.sender.phone)) reasons.push("발신자 연락처가 본문에 없음");
  if (!UNSUB_RE.test(text)) reasons.push("수신거부 방법이 본문에 없음");

  const linkCount = (text.match(LINK_RE) ?? []).length;
  const maxLinks = input.maxLinks ?? 3;
  if (linkCount > maxLinks) reasons.push(`링크 ${linkCount}개 (최대 ${maxLinks})`);
  if (HTML_RE.test(text) || IMG_MD_RE.test(text)) reasons.push("HTML·이미지 포함 불가 (텍스트 메일만)");

  return { subject, text, missing, ok: reasons.length === 0, reasons, linkCount };
}
