export interface MailAttachment {
  filename: string;
  mimeType: string;
  /** 파일 경로 또는 버퍼 중 하나 */
  path?: string;
  content?: Buffer;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  from?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
  dryRun?: boolean;
}

export interface SendMailResult {
  gmailMsgId: string;
  gmailThreadId: string;
  dryRun?: boolean;
}

export interface InboundMail {
  gmailMsgId: string;
  gmailThreadId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  inReplyTo: string | null;
  references: string[];
  receivedAt: Date;
  isAutoReply: boolean;
  isBounce: boolean;
  bouncedAddress?: string | null;
  bounceHard?: boolean;
}

export interface ListMessagesInput {
  afterEpochSec: number;
  labelIds?: string[];
  maxResults?: number;
}

/** 워커가 가짜 구현을 주입할 수 있는 전송 인터페이스 */
export interface MailTransport {
  sendMail(input: SendMailInput): Promise<SendMailResult>;
  listMessagesSince(input: ListMessagesInput): Promise<InboundMail[]>;
  getMessage(id: string): Promise<InboundMail | null>;
}
