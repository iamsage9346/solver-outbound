import { getDb, type Db } from "@solver/db";
import { createSlack, type SlackTransport } from "@solver/notify";
import { createGmailClient, type MailTransport } from "@solver/mailer";
import { DEFAULT_SETTINGS, isDryRun, type AppSettings } from "@solver/shared";

export interface PipelineContext {
  db: Db;
  slack: SlackTransport;
  mail: MailTransport;
  settings: AppSettings;
  dryRun: boolean;
  appUrl: string;
  bookingUrl: string;
  log: (leadId: string | null, msg: string, extra?: Record<string, unknown>) => void;
}

export function createContext(over: Partial<PipelineContext> = {}): PipelineContext {
  const dryRun = over.dryRun ?? isDryRun();
  return {
    db: over.db ?? getDb(),
    slack: over.slack ?? createSlack({ dryRun }),
    mail: over.mail ?? createGmailClient(),
    settings: over.settings ?? DEFAULT_SETTINGS,
    dryRun,
    appUrl: over.appUrl ?? process.env.APP_URL ?? "http://localhost:3000",
    bookingUrl: over.bookingUrl ?? process.env.BOOKING_URL ?? "https://calendar.app.google/replace-me",
    log:
      over.log ??
      ((leadId, msg, extra) => {
        const ts = new Date().toISOString();
        console.log(`${ts} [${leadId ?? "-"}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}`);
      }),
  };
}
