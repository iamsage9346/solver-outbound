import { WebClient, type KnownBlock } from "@slack/web-api";
import { isDryRun } from "@solver/shared";

export interface SlackMessage {
  text: string; // fallback / 알림 텍스트
  blocks?: KnownBlock[];
  channel?: string;
  threadTs?: string;
}

export interface SlackTransport {
  post(msg: SlackMessage): Promise<{ ts: string | null; dryRun: boolean }>;
  dm(userId: string, msg: SlackMessage): Promise<{ ts: string | null; dryRun: boolean }>;
}

export function createSlack(opts: { token?: string; channel?: string; dryRun?: boolean } = {}): SlackTransport {
  const token = opts.token ?? process.env.SLACK_BOT_TOKEN;
  const channel = opts.channel ?? process.env.SLACK_CHANNEL_ID ?? "";
  const dry = opts.dryRun ?? (isDryRun() || !token);
  const client = dry ? null : new WebClient(token);

  async function send(target: string, msg: SlackMessage) {
    if (dry || !client) {
      console.log(`[slack:dry-run → ${target}] ${msg.text}`);
      return { ts: null, dryRun: true };
    }
    const res = await client.chat.postMessage({ channel: target, text: msg.text, blocks: msg.blocks, thread_ts: msg.threadTs, unfurl_links: false });
    return { ts: (res.ts as string) ?? null, dryRun: false };
  }

  return {
    post: (msg) => send(msg.channel ?? channel, msg),
    dm: (userId, msg) => send(userId, msg),
  };
}
