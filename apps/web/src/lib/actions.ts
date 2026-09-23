"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { audits, contacts, leads, notes, sequences, tasks, upsertTask } from "@solver/db";
import { approveAudit, prepareMail, sendPrepared, runCrawlBatch, auditLead } from "@solver/pipeline";
import { draftReply } from "@solver/llm";
import { LEAD_STATUSES, TIERS, type LeadStatus, type Tier } from "@solver/shared";
import { ctx, db } from "./db";

const OWNER = "상화";

export async function updateLeadField(id: string, field: "status" | "tierOverride" | "owner" | "referrer" | "referralPossible" | "nextAction" | "homepage", value: string | boolean | null) {
  const set: Partial<typeof leads.$inferInsert> = {};
  if (field === "status") {
    if (!LEAD_STATUSES.includes(value as LeadStatus)) throw new Error("bad status");
    set.status = value as LeadStatus;
  } else if (field === "tierOverride") {
    if (value && !TIERS.includes(value as Tier)) throw new Error("bad tier");
    const [cur] = await db.select({ tier: leads.tier }).from(leads).where(eq(leads.id, id));
    if (cur?.tier === "EXCLUDED") throw new Error("제외 리드는 해제할 수 없습니다");
    set.tierOverride = (value as Tier) || null;
  } else if (field === "referralPossible") set.referralPossible = !!value;
  else set[field] = (value as string) || null;
  await db.update(leads).set(set).where(eq(leads.id, id));
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

export async function addContact(leadId: string, type: "email" | "phone" | "form" | "person", value: string, role: "director" | "representative" | "admin" | "general" = "general") {
  if (!value.trim()) return;
  await db.insert(contacts).values({ leadId, type, value: value.trim(), role, source: "manual", confidence: 1, verifiedAt: new Date(), isPersonal: false }).onConflictDoNothing();
  if (type === "email") await db.update(leads).set({ phoneFirst: false }).where(eq(leads.id, leadId));
  revalidatePath(`/leads/${leadId}`);
}

export async function addNote(leadId: string, body: string) {
  if (!body.trim()) return;
  await db.insert(notes).values({ leadId, author: OWNER, body: body.trim() });
  revalidatePath(`/leads/${leadId}`);
}

export async function createCallTask(leadId: string, title = "전화", dueInHours = 2) {
  await upsertTask(db, { leadId, type: "call", title, dueAt: new Date(Date.now() + dueInHours * 3600_000), dedupeKey: `manual:${leadId}:${Date.now()}` });
  revalidatePath("/tasks");
  revalidatePath(`/leads/${leadId}`);
}

export async function completeTask(taskId: string, outcome: string | null) {
  await db.update(tasks).set({ status: "done", doneAt: new Date(), outcome }).where(eq(tasks.id, taskId));
  revalidatePath("/tasks");
}

export async function approveAuditAction(auditId: string) {
  const r = await approveAudit(ctx, auditId, OWNER);
  revalidatePath("/audits");
  revalidatePath("/campaigns");
  return r;
}

export async function rerunAudit(leadId: string, skipGeo = false) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error("not found");
  const r = await auditLead(ctx, lead, { skipGeo });
  revalidatePath("/audits");
  return { landingToken: r.landingToken, banned: r.bannedTerms };
}

export async function recrawl(leadId: string) {
  await runCrawlBatch(ctx, { leadIds: [leadId], force: true });
  revalidatePath(`/leads/${leadId}`);
}

export async function previewMail(leadId: string, templateKey = "cold_geo") {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error("not found");
  const p = await prepareMail(ctx, lead, templateKey);
  return { to: p.to, subject: p.subject, text: p.text, ok: p.ok, reasons: p.reasons, attachments: p.attachments.map((a) => a.filename) };
}

export async function sendTestMail(leadId: string, to: string) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error("not found");
  const p = await prepareMail(ctx, lead);
  const r = await sendPrepared(ctx, p, { isTest: true, testTo: to });
  revalidatePath("/campaigns");
  return r;
}

export async function sendNow(leadId: string) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new Error("not found");
  const p = await prepareMail(ctx, lead);
  const r = await sendPrepared(ctx, p);
  revalidatePath("/campaigns");
  revalidatePath("/leads");
  return r;
}

export async function resumeSequence(leadId: string) {
  await db.update(sequences).set({ state: "active", stopReason: null, nextStepAt: new Date() }).where(and(eq(sequences.leadId, leadId), eq(sequences.state, "stopped")));
  revalidatePath(`/leads/${leadId}`);
}

export async function pauseSequence(leadId: string) {
  await db.update(sequences).set({ state: "paused" }).where(and(eq(sequences.leadId, leadId), eq(sequences.state, "active")));
  revalidatePath(`/leads/${leadId}`);
}

export async function makeReplyDraft(messageId: string) {
  const msg = await db.query.messages.findFirst({ where: (m, { eq }) => eq(m.id, messageId) });
  if (!msg?.leadId) throw new Error("not found");
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, msg.leadId) });
  return draftReply({ name: lead?.name ?? "", classification: msg.classification ?? "other", theirMessage: msg.body ?? "", bookingUrl: ctx.bookingUrl, senderName: OWNER });
}

export async function sendReply(messageId: string, text: string) {
  const msg = await db.query.messages.findFirst({ where: (m, { eq }) => eq(m.id, messageId) });
  if (!msg) throw new Error("not found");
  const res = await ctx.mail.sendMail({ to: msg.from ?? "", subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject ?? ""}`, text, threadId: msg.gmailThreadId ?? undefined, dryRun: ctx.dryRun });
  const { messages } = await import("@solver/db");
  await db.insert(messages).values({ leadId: msg.leadId, direction: "out", gmailMsgId: res.gmailMsgId, gmailThreadId: res.gmailThreadId, to: msg.from, subject: `Re: ${msg.subject ?? ""}`, body: text, sentAt: new Date(), dryRun: !!res.dryRun });
  revalidatePath("/inbox");
  return res;
}

export async function updateAuditTopFixes(auditId: string, fixes: string[]) {
  const { findBannedTerms } = await import("@solver/shared");
  const banned = findBannedTerms(fixes.join("\n")).map((h) => h.term);
  await db.update(audits).set({ topFixes: fixes.filter(Boolean).slice(0, 3), bannedTerms: banned }).where(eq(audits.id, auditId));
  revalidatePath("/audits");
  return { banned };
}
