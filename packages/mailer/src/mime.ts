import { readFileSync } from "node:fs";
import type { MailAttachment } from "./types";

function encodeHeaderUtf8(value: string): string {
  // RFC 2047 encoded-word for non-ASCII headers
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function foldBase64(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

export function toBase64Url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

export interface RawMimeInput {
  from: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
  messageId?: string;
  date?: Date;
}

/** RFC 2822 MIME 메시지를 만들어 문자열로 반환 (순수 함수, 테스트용) */
export function buildMime(input: RawMimeInput): string {
  const lines: string[] = [];
  lines.push(`From: ${encodeHeaderUtf8(input.from)}`);
  lines.push(`To: ${input.to}`);
  lines.push(`Subject: ${encodeHeaderUtf8(input.subject)}`);
  lines.push(`Date: ${(input.date ?? new Date()).toUTCString()}`);
  if (input.messageId) lines.push(`Message-ID: ${input.messageId}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  const refs = [...(input.references ?? [])];
  if (input.inReplyTo && !refs.includes(input.inReplyTo)) refs.push(input.inReplyTo);
  if (refs.length) lines.push(`References: ${refs.join(" ")}`);
  lines.push("MIME-Version: 1.0");
  for (const [k, v] of Object.entries(input.headers ?? {})) lines.push(`${k}: ${v}`);

  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", foldBase64(Buffer.from(input.text, "utf8").toString("base64"))].join("\r\n");

  const attachments = input.attachments ?? [];
  if (attachments.length === 0) {
    lines.push(textPart);
    return lines.join("\r\n");
  }

  const boundary = `----=_solver_${Date.now().toString(36)}`;
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push(textPart);
  for (const a of attachments) {
    const content = a.content ?? (a.path ? readFileSync(a.path) : Buffer.alloc(0));
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${a.mimeType}; name="${encodeHeaderUtf8(a.filename)}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${encodeHeaderUtf8(a.filename)}"`);
    lines.push("");
    lines.push(foldBase64(content.toString("base64")));
  }
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

/** Gmail API `raw` 필드용 base64url */
export function buildRawMime(input: RawMimeInput): string {
  return toBase64Url(buildMime(input));
}
