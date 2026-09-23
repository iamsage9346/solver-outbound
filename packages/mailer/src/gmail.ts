import { google, type gmail_v1 } from "googleapis";
import { isDryRun } from "@solver/shared";
import { token } from "@solver/shared/node";
import { buildRawMime, fromBase64Url } from "./mime";
import { parseBounce } from "./bounce";
import type { InboundMail, ListMessagesInput, MailTransport, SendMailInput, SendMailResult } from "./types";

export interface GmailEnv {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  sender?: string;
  senderName?: string;
}

export interface GmailClient extends MailTransport {
  api: gmail_v1.Gmail | null;
  sender: string;
  senderName: string;
}

function envOf(env?: GmailEnv): Required<GmailEnv> {
  return {
    clientId: env?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: env?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    refreshToken: env?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? "",
    sender: env?.sender ?? process.env.GMAIL_SENDER ?? "",
    senderName: env?.senderName ?? process.env.GMAIL_SENDER_NAME ?? "솔버 (SOLVER)",
  };
}

/** OAuth2 리프레시 토큰으로 Gmail API 클라이언트를 만든다. 자격이 없으면 api=null (드라이런 전용). */
export function createGmailClient(env?: GmailEnv): GmailClient {
  const e = envOf(env);
  let api: gmail_v1.Gmail | null = null;
  if (e.clientId && e.clientSecret && e.refreshToken) {
    const oauth2 = new google.auth.OAuth2(e.clientId, e.clientSecret);
    oauth2.setCredentials({ refresh_token: e.refreshToken });
    api = google.gmail({ version: "v1", auth: oauth2 });
  }
  const client: GmailClient = {
    api,
    sender: e.sender,
    senderName: e.senderName,
    sendMail: (input) => sendMail(client, input),
    listMessagesSince: (input) => listMessagesSince(client, input),
    getMessage: (id) => getMessage(client, id),
  };
  return client;
}

export async function sendMail(client: GmailClient, input: SendMailInput): Promise<SendMailResult> {
  const from = input.from ?? (client.senderName ? `${client.senderName} <${client.sender}>` : client.sender);
  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (!headers["List-Unsubscribe"] && client.sender) headers["List-Unsubscribe"] = `<mailto:${client.sender}?subject=unsubscribe>`;

  const dry = input.dryRun ?? isDryRun();
  if (dry || !client.api) {
    const t = token(6);
    console.log(`[mailer:dry-run] to=${input.to} subject="${input.subject}" thread=${input.threadId ?? "-"} attachments=${input.attachments?.length ?? 0}`);
    return { gmailMsgId: `dry_${t}`, gmailThreadId: input.threadId ?? `dry_thread_${t}`, dryRun: true };
  }

  const raw = buildRawMime({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    inReplyTo: input.inReplyTo,
    references: input.references,
    attachments: input.attachments,
    headers,
  });
  const res = await client.api.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: input.threadId },
  });
  return { gmailMsgId: res.data.id ?? "", gmailThreadId: res.data.threadId ?? input.threadId ?? "" };
}

function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  const h = payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function collectText(part: gmail_v1.Schema$MessagePart | undefined, acc: { plain: string[]; html: string[] }): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  if (part.body?.data) {
    const text = fromBase64Url(part.body.data).toString("utf8");
    if (mime === "text/plain") acc.plain.push(text);
    else if (mime === "text/html") acc.html.push(text);
  }
  for (const p of part.parts ?? []) collectText(p, acc);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Gmail 메시지 → InboundMail 정규화 (순수 함수) */
export function normalizeMessage(msg: gmail_v1.Schema$Message): InboundMail {
  const p = msg.payload;
  const acc = { plain: [] as string[], html: [] as string[] };
  collectText(p, acc);
  const textBody = acc.plain.length ? acc.plain.join("\n") : htmlToText(acc.html.join("\n"));
  const from = header(p, "From");
  const subject = header(p, "Subject");
  const autoSubmitted = header(p, "Auto-Submitted");
  const precedence = header(p, "Precedence").toLowerCase();
  const isAutoReply =
    (!!autoSubmitted && autoSubmitted.toLowerCase() !== "no") ||
    !!header(p, "X-Autoreply") ||
    !!header(p, "X-Autorespond") ||
    precedence === "auto_reply" ||
    /^(auto(matic)?[- ]?reply|out of office|부재중|자동\s*회신|자동\s*응답)/i.test(subject);
  const bounce = parseBounce({ from, subject, textBody });
  const references = header(p, "References").split(/\s+/).filter(Boolean);
  return {
    gmailMsgId: msg.id ?? "",
    gmailThreadId: msg.threadId ?? "",
    from,
    to: header(p, "To"),
    subject,
    textBody,
    inReplyTo: header(p, "In-Reply-To") || null,
    references,
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    isAutoReply,
    isBounce: bounce.isBounce,
    bouncedAddress: bounce.address,
    bounceHard: bounce.hard,
  };
}

export async function getMessage(client: GmailClient, id: string): Promise<InboundMail | null> {
  if (!client.api) return null;
  const res = await client.api.users.messages.get({ userId: "me", id, format: "full" });
  return normalizeMessage(res.data);
}

/** afterEpochSec 이후 받은 메일 (60초 폴링용). 자격이 없으면 빈 배열. */
export async function listMessagesSince(client: GmailClient, input: ListMessagesInput): Promise<InboundMail[]> {
  if (!client.api) return [];
  const q = `after:${Math.floor(input.afterEpochSec)} -from:me`;
  const list = await client.api.users.messages.list({
    userId: "me",
    q,
    labelIds: input.labelIds ?? ["INBOX"],
    maxResults: input.maxResults ?? 50,
  });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((x): x is string => !!x);
  const out: InboundMail[] = [];
  for (const id of ids) {
    const m = await getMessage(client, id);
    if (m) out.push(m);
  }
  return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

/** 테스트·드라이런용 가짜 전송 */
export function createFakeTransport(inbox: InboundMail[] = []): MailTransport & { sent: SendMailInput[] } {
  const sent: SendMailInput[] = [];
  return {
    sent,
    async sendMail(input) {
      sent.push(input);
      const t = token(6);
      return { gmailMsgId: `fake_${t}`, gmailThreadId: input.threadId ?? `fake_thread_${t}`, dryRun: true };
    },
    async listMessagesSince({ afterEpochSec }) {
      return inbox.filter((m) => m.receivedAt.getTime() / 1000 > afterEpochSec);
    },
    async getMessage(id) {
      return inbox.find((m) => m.gmailMsgId === id) ?? null;
    },
  };
}
