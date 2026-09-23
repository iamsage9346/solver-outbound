CREATE TYPE "public"."campaign_hook" AS ENUM('GEO', 'AI_EDU', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."contact_role" AS ENUM('director', 'representative', 'admin', 'general');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('hira', 'crawl', 'manual', 'form');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('email', 'phone', 'form', 'person');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('open', 'click', 'reply', 'bounce', 'unsubscribe', 'form', 'booking', 'call', 'note');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('listed', 'audited', 'queued', 'sent', 'replied', 'meeting', 'proposal', 'won', 'hold', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('out', 'in');--> statement-breakpoint
CREATE TYPE "public"."render_mode" AS ENUM('static', 'browser');--> statement-breakpoint
CREATE TYPE "public"."reply_class" AS ENUM('positive', 'question', 'forward', 'negative', 'unsubscribe', 'auto_reply', 'bounce', 'other');--> statement-breakpoint
CREATE TYPE "public"."sequence_state" AS ENUM('active', 'paused', 'stopped', 'done');--> statement-breakpoint
CREATE TYPE "public"."stop_reason" AS ENUM('reply', 'booking', 'unsubscribe', 'bounce', 'manual');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('call', 'email', 'meeting', 'proposal');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('T1', 'T2', 'T3', 'EXCLUDED');--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"query" text NOT NULL,
	"run_no" integer NOT NULL,
	"mentioned" boolean DEFAULT false NOT NULL,
	"position" integer,
	"competitors" text[] DEFAULT '{}' NOT NULL,
	"sources" text[] DEFAULT '{}' NOT NULL,
	"raw_response" text,
	"error" text,
	"cost_krw" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"place" jsonb,
	"site" jsonb,
	"geo" jsonb,
	"scores" jsonb,
	"top_fixes" text[] DEFAULT '{}' NOT NULL,
	"report_pdf_path" text,
	"landing_token" text,
	"banned_terms" text[] DEFAULT '{}' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audits_landing_token_unique" UNIQUE("landing_token")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hook" "campaign_hook" DEFAULT 'GEO' NOT NULL,
	"template_ids" uuid[] DEFAULT '{}' NOT NULL,
	"send_days" integer[] DEFAULT '{2,3,4}' NOT NULL,
	"send_time" text DEFAULT '10:00' NOT NULL,
	"daily_cap" integer DEFAULT 40 NOT NULL,
	"hourly_cap" integer DEFAULT 15 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"value" text NOT NULL,
	"role" "contact_role" DEFAULT 'general' NOT NULL,
	"source" "contact_source" NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"verified_at" timestamp with time zone,
	"is_personal" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_code" integer,
	"render_mode" "render_mode" DEFAULT 'static' NOT NULL,
	"pages_visited" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"services" text[] DEFAULT '{}' NOT NULL,
	"hours" text,
	"sns_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tech" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"harvest_refusal" boolean DEFAULT false NOT NULL,
	"emails_found" text[] DEFAULT '{}' NOT NULL,
	"form_urls" text[] DEFAULT '{}' NOT NULL,
	"representative" text,
	"error_code" text,
	"raw_html" text,
	"html_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"message_id" uuid,
	"type" "event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"slack_ts" text,
	CONSTRAINT "events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ykiho" text,
	"name" text NOT NULL,
	"cl_cd" text,
	"cl_name" text,
	"sido" text,
	"sggu" text,
	"emd" text,
	"address" text,
	"lat" real,
	"lng" real,
	"est_date" date,
	"doctor_cnt" integer,
	"staff_est" integer,
	"dept_tags" text[] DEFAULT '{}' NOT NULL,
	"tier" "tier",
	"tier_override" "tier",
	"status" "lead_status" DEFAULT 'listed' NOT NULL,
	"owner" text,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"geo_score" integer,
	"place_rank" integer,
	"review_cnt" integer,
	"phone_first" boolean DEFAULT false NOT NULL,
	"email_manual_check" boolean DEFAULT false NOT NULL,
	"homepage" text,
	"homepage_auto_found" boolean DEFAULT false NOT NULL,
	"referral_possible" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone,
	"excluded_reason" text,
	"hira_raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_ykiho_unique" UNIQUE("ykiho")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"sequence_id" uuid,
	"template_id" uuid,
	"step" integer,
	"direction" "message_direction" NOT NULL,
	"gmail_msg_id" text,
	"gmail_thread_id" text,
	"to" text,
	"from" text,
	"subject" text,
	"body" text,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"classification" "reply_class",
	"summary" text,
	"proposed_times" text[],
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tracking_token" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_gmail_msg_id_unique" UNIQUE("gmail_msg_id"),
	CONSTRAINT "messages_tracking_token_unique" UNIQUE("tracking_token")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"campaign_id" uuid,
	"current_step" integer DEFAULT 0 NOT NULL,
	"state" "sequence_state" DEFAULT 'active' NOT NULL,
	"stop_reason" "stop_reason",
	"next_step_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"source_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"sequence_id" uuid,
	"type" "task_type" NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"script" text,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"done_at" timestamp with time zone,
	"outcome" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_md" text NOT NULL,
	"variables" text[] DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_results" ADD CONSTRAINT "crawl_results_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_runs_audit_idx" ON "audit_runs" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audits_lead_idx" ON "audits" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "contacts_lead_idx" ON "contacts" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_lead_type_value" ON "contacts" USING btree ("lead_id","type","value");--> statement-breakpoint
CREATE INDEX "crawl_lead_idx" ON "crawl_results" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "events_lead_idx" ON "events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_sggu_idx" ON "leads" USING btree ("sido","sggu");--> statement-breakpoint
CREATE INDEX "leads_tier_idx" ON "leads" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "messages_lead_idx" ON "messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_seq_step_uniq" ON "messages" USING btree ("sequence_id","step") WHERE direction = 'out' AND is_test = false;--> statement-breakpoint
CREATE INDEX "sequences_lead_idx" ON "sequences" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "sequences_next_idx" ON "sequences" USING btree ("state","next_step_at");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("status","due_at");