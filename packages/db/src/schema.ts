import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import {
  LEAD_STATUSES,
  TIERS,
  CONTACT_TYPES,
  CONTACT_ROLES,
  CONTACT_SOURCES,
  SEQUENCE_STATES,
  MESSAGE_DIRECTIONS,
  REPLY_CLASSES,
  EVENT_TYPES,
  TASK_TYPES,
  TASK_STATUSES,
  CAMPAIGN_HOOKS,
  STOP_REASONS,
} from "@solver/shared";

export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const tierEnum = pgEnum("tier", TIERS);
export const contactTypeEnum = pgEnum("contact_type", CONTACT_TYPES);
export const contactRoleEnum = pgEnum("contact_role", CONTACT_ROLES);
export const contactSourceEnum = pgEnum("contact_source", CONTACT_SOURCES);
export const sequenceStateEnum = pgEnum("sequence_state", SEQUENCE_STATES);
export const stopReasonEnum = pgEnum("stop_reason", STOP_REASONS);
export const messageDirectionEnum = pgEnum("message_direction", MESSAGE_DIRECTIONS);
export const replyClassEnum = pgEnum("reply_class", REPLY_CLASSES);
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPES);
export const taskTypeEnum = pgEnum("task_type", TASK_TYPES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const campaignHookEnum = pgEnum("campaign_hook", CAMPAIGN_HOOKS);
export const renderModeEnum = pgEnum("render_mode", ["static", "browser"]);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();
const updatedAt = () => ts("updated_at").defaultNow().notNull().$onUpdate(() => new Date());

/* ───────────── leads ───────────── */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ykiho: text("ykiho").unique(), // 심평원 암호화 요양기호 (인바운드 리드는 null 가능)
    name: text("name").notNull(),
    clCd: text("cl_cd"), // 종별코드
    clName: text("cl_name"),
    sido: text("sido"),
    sggu: text("sggu"),
    emd: text("emd"),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    estDate: date("est_date"), // 개설일
    doctorCnt: integer("doctor_cnt"),
    staffEst: integer("staff_est"), // 추정, UI에 "추정" 표시
    deptTags: text("dept_tags").array().notNull().default([]),
    tier: tierEnum("tier"),
    tierOverride: tierEnum("tier_override"),
    status: leadStatusEnum("status").notNull().default("listed"),
    owner: text("owner"),
    nextAction: text("next_action"),
    nextActionAt: ts("next_action_at"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    geoScore: integer("geo_score"),
    placeRank: integer("place_rank"),
    reviewCnt: integer("review_cnt"),
    phoneFirst: boolean("phone_first").notNull().default(false), // 이메일 없음 → 전화 우선
    emailManualCheck: boolean("email_manual_check").notNull().default(false), // 수집거부 감지
    homepage: text("homepage"),
    homepageAutoFound: boolean("homepage_auto_found").notNull().default(false),
    referralPossible: boolean("referral_possible").notNull().default(false),
    lastActivityAt: ts("last_activity_at"),
    excludedReason: text("excluded_reason"),
    hiraRaw: jsonb("hira_raw").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leads_status_idx").on(t.status), index("leads_sggu_idx").on(t.sido, t.sggu), index("leads_tier_idx").on(t.tier)],
);

/* ───────────── contacts ───────────── */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    type: contactTypeEnum("type").notNull(),
    value: text("value").notNull(),
    role: contactRoleEnum("role").notNull().default("general"),
    source: contactSourceEnum("source").notNull(),
    confidence: real("confidence").notNull().default(0.5),
    verifiedAt: ts("verified_at"),
    isPersonal: boolean("is_personal").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_lead_idx").on(t.leadId), uniqueIndex("contacts_lead_type_value").on(t.leadId, t.type, t.value)],
);

/* ───────────── crawl_results ───────────── */
export interface CrawlTech {
  https: boolean;
  mobileViewport: boolean;
  ttfbMs: number | null;
  schemaOrg: boolean;
  lastModified: string | null;
  hasDoctorsPage: boolean;
  hasHoursPage: boolean;
}
export const crawlResults = pgTable(
  "crawl_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    fetchedAt: ts("fetched_at").defaultNow().notNull(),
    statusCode: integer("status_code"),
    renderMode: renderModeEnum("render_mode").notNull().default("static"),
    pagesVisited: integer("pages_visited").notNull().default(0),
    summary: text("summary"),
    services: text("services").array().notNull().default([]),
    hours: text("hours"),
    snsLinks: jsonb("sns_links").$type<Record<string, string>>().notNull().default({}),
    tech: jsonb("tech").$type<Partial<CrawlTech>>().notNull().default({}),
    harvestRefusal: boolean("harvest_refusal").notNull().default(false),
    emailsFound: text("emails_found").array().notNull().default([]),
    formUrls: text("form_urls").array().notNull().default([]),
    representative: text("representative"),
    errorCode: text("error_code"),
    rawHtml: text("raw_html"),
    htmlExpiresAt: ts("html_expires_at"),
  },
  (t) => [index("crawl_lead_idx").on(t.leadId)],
);

/* ───────────── audits ───────────── */
export interface PlaceAudit {
  keywords: { keyword: string; rank: number | null }[];
  reviewCnt: number | null;
  lastReviewAt: string | null;
  missing: string[]; // 진료시간·주차·사진·소개글·예약 버튼
  placeUrl?: string;
}
export interface SiteAudit {
  https: boolean;
  mobile: boolean;
  ttfbMs: number | null;
  doctorsPage: boolean;
  hoursPage: boolean;
  schemaOrg: boolean;
  lastUpdatedEstimate: string | null;
}
export interface GeoAudit {
  score: number;
  mentionRate: number;
  questionCnt: number;
  mentionedCnt: number;
  engines: Record<string, { mentionRate: number; runs: number; failed?: boolean }>;
  competitors: { name: string; mentions: number }[];
}
export const audits = pgTable(
  "audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    auditedAt: ts("audited_at").defaultNow().notNull(),
    place: jsonb("place").$type<PlaceAudit | null>(),
    site: jsonb("site").$type<SiteAudit | null>(),
    geo: jsonb("geo").$type<GeoAudit | null>(),
    scores: jsonb("scores").$type<{ place: number | null; site: number | null; geo: number | null }>(),
    topFixes: text("top_fixes").array().notNull().default([]),
    reportPdfPath: text("report_pdf_path"),
    reportData: jsonb("report_data").$type<Record<string, unknown> | null>(), // 리포트 렌더 입력 (Vercel 등 읽기 전용 FS 대비)
    landingToken: text("landing_token").unique(),
    bannedTerms: text("banned_terms").array().notNull().default([]),
    approvedBy: text("approved_by"),
    approvedAt: ts("approved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("audits_lead_idx").on(t.leadId)],
);

export const auditRuns = pgTable(
  "audit_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
    engine: text("engine").notNull(),
    query: text("query").notNull(),
    runNo: integer("run_no").notNull(),
    mentioned: boolean("mentioned").notNull().default(false),
    position: integer("position"),
    competitors: text("competitors").array().notNull().default([]),
    sources: text("sources").array().notNull().default([]),
    rawResponse: text("raw_response"),
    error: text("error"),
    costKrw: real("cost_krw"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_runs_audit_idx").on(t.auditId)],
);

/* ───────────── campaigns / templates ───────────── */
export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  hook: campaignHookEnum("hook").notNull().default("GEO"),
  templateIds: uuid("template_ids").array().notNull().default([]),
  sendDays: integer("send_days").array().notNull().default([2, 3, 4]),
  sendTime: text("send_time").notNull().default("10:00"),
  dailyCap: integer("daily_cap").notNull().default(40),
  hourlyCap: integer("hourly_cap").notNull().default(15),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  createdAt: createdAt(),
});

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(), // cold_geo, referral, d7, reapproach, booking_confirm, ...
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyMd: text("body_md").notNull(),
  variables: text("variables").array().notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── sequences / messages / events ───────────── */
export const sequences = pgTable(
  "sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    currentStep: integer("current_step").notNull().default(0), // 0 D0, 1 D+2 call, 2 D+7 mail, 3 2주 후
    state: sequenceStateEnum("state").notNull().default("active"),
    stopReason: stopReasonEnum("stop_reason"),
    nextStepAt: ts("next_step_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sequences_lead_idx").on(t.leadId), index("sequences_next_idx").on(t.state, t.nextStepAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    sequenceId: uuid("sequence_id").references(() => sequences.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => templates.id),
    step: integer("step"),
    direction: messageDirectionEnum("direction").notNull(),
    gmailMsgId: text("gmail_msg_id").unique(),
    gmailThreadId: text("gmail_thread_id"),
    to: text("to"),
    from: text("from"),
    subject: text("subject"),
    body: text("body"),
    sentAt: ts("sent_at"),
    receivedAt: ts("received_at"),
    scheduledAt: ts("scheduled_at"),
    classification: replyClassEnum("classification"),
    summary: text("summary"),
    proposedTimes: text("proposed_times").array(),
    attachments: jsonb("attachments").$type<{ name: string; path: string }[]>().notNull().default([]),
    trackingToken: text("tracking_token").unique(),
    dryRun: boolean("dry_run").notNull().default(false),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_lead_idx").on(t.leadId),
    index("messages_thread_idx").on(t.gmailThreadId),
    // 멱등: 같은 시퀀스 같은 단계는 한 번만
    uniqueIndex("messages_seq_step_uniq").on(t.sequenceId, t.step).where(sql`direction = 'out' AND is_test = false`),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    type: eventTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text("dedupe_key").unique(), // 같은 이벤트 두 번 알림 방지
    occurredAt: ts("occurred_at").defaultNow().notNull(),
    notifiedAt: ts("notified_at"),
    slackTs: text("slack_ts"),
  },
  (t) => [index("events_lead_idx").on(t.leadId), index("events_type_idx").on(t.type, t.occurredAt)],
);

/* ───────────── tasks / suppressions / notes / settings ───────────── */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id").references(() => sequences.id, { onDelete: "set null" }),
    type: taskTypeEnum("type").notNull(),
    title: text("title").notNull(),
    dueAt: ts("due_at").notNull(),
    script: text("script"),
    status: taskStatusEnum("status").notNull().default("open"),
    doneAt: ts("done_at"),
    outcome: text("outcome"),
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_due_idx").on(t.status, t.dueAt)],
);

export const suppressions = pgTable("suppressions", {
  id: uuid("id").defaultRandom().primaryKey(),
  value: text("value").notNull().unique(), // email / domain / ykiho (해시 가능)
  kind: text("kind").notNull(), // email | domain | ykiho
  reason: text("reason").notNull(),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/* ───────────── relations ───────────── */
export const leadsRelations = relations(leads, ({ many }) => ({
  contacts: many(contacts),
  crawlResults: many(crawlResults),
  audits: many(audits),
  sequences: many(sequences),
  messages: many(messages),
  events: many(events),
  tasks: many(tasks),
  notes: many(notes),
}));
export const contactsRelations = relations(contacts, ({ one }) => ({ lead: one(leads, { fields: [contacts.leadId], references: [leads.id] }) }));
export const auditsRelations = relations(audits, ({ one, many }) => ({
  lead: one(leads, { fields: [audits.leadId], references: [leads.id] }),
  runs: many(auditRuns),
}));
export const auditRunsRelations = relations(auditRuns, ({ one }) => ({ audit: one(audits, { fields: [auditRuns.auditId], references: [audits.id] }) }));
export const sequencesRelations = relations(sequences, ({ one, many }) => ({
  lead: one(leads, { fields: [sequences.leadId], references: [leads.id] }),
  campaign: one(campaigns, { fields: [sequences.campaignId], references: [campaigns.id] }),
  messages: many(messages),
}));
export const messagesRelations = relations(messages, ({ one, many }) => ({
  lead: one(leads, { fields: [messages.leadId], references: [leads.id] }),
  sequence: one(sequences, { fields: [messages.sequenceId], references: [sequences.id] }),
  events: many(events),
}));
export const eventsRelations = relations(events, ({ one }) => ({
  lead: one(leads, { fields: [events.leadId], references: [leads.id] }),
  message: one(messages, { fields: [events.messageId], references: [messages.id] }),
}));
export const tasksRelations = relations(tasks, ({ one }) => ({ lead: one(leads, { fields: [tasks.leadId], references: [leads.id] }) }));
export const notesRelations = relations(notes, ({ one }) => ({ lead: one(leads, { fields: [notes.leadId], references: [leads.id] }) }));


export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type CrawlResult = typeof crawlResults.$inferSelect;
export type Audit = typeof audits.$inferSelect;
export type AuditRun = typeof auditRuns.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Sequence = typeof sequences.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Event = typeof events.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Suppression = typeof suppressions.$inferSelect;
export type Note = typeof notes.$inferSelect;
