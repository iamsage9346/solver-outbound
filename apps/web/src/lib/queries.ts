import "server-only";
import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { audits, contacts, crawlResults, events, leads, messages, notes, sequences, tasks } from "@solver/db";
import { db } from "./db";

export interface LeadFilters {
  q?: string;
  sido?: string;
  sggu?: string;
  tier?: string;
  status?: string;
  email?: "yes" | "no";
  cl?: string;
}

export const PAGE_SIZE = 50;

function leadWhere(f: LeadFilters): SQL | undefined {
  const where: SQL[] = [];
  if (f.q) where.push(or(ilike(leads.name, `%${f.q}%`), ilike(leads.address, `%${f.q}%`))!);
  if (f.sido) where.push(eq(leads.sido, f.sido));
  if (f.sggu) where.push(ilike(leads.sggu, `%${f.sggu}%`));
  if (f.tier) where.push(sql`coalesce(${leads.tierOverride}, ${leads.tier}) = ${f.tier}`);
  if (f.status) where.push(eq(leads.status, f.status as never));
  if (f.cl) where.push(eq(leads.clCd, f.cl));
  const emailSub = sql`exists (select 1 from ${contacts} c where c.lead_id = "leads"."id" and c.type = 'email')`;
  if (f.email === "yes") where.push(emailSub);
  if (f.email === "no") where.push(sql`not ${emailSub}`);
  return where.length ? and(...where) : undefined;
}

export async function countLeads(f: LeadFilters): Promise<number> {
  const [row] = await db.select({ c: count() }).from(leads).where(leadWhere(f));
  return Number(row?.c ?? 0);
}

/** page는 1부터. pageSize에 0을 주면 전체(CSV 내보내기용) */
export async function listLeads(f: LeadFilters, page = 1, pageSize: number = PAGE_SIZE) {
  const rows = await db
    .select({
      lead: leads,
      email: sql<string | null>`(select c.value from ${contacts} c where c.lead_id = "leads"."id" and c.type = 'email' order by c.is_personal, c.confidence desc limit 1)`,
      phone: sql<string | null>`(select c.value from ${contacts} c where c.lead_id = "leads"."id" and c.type = 'phone' limit 1)`,
      form: sql<string | null>`(select c.value from ${contacts} c where c.lead_id = "leads"."id" and c.type = 'form' limit 1)`,
      audited: sql<boolean>`exists (select 1 from ${audits} a where a.lead_id = "leads"."id" and a.landing_token is not null)`,
      approved: sql<boolean>`exists (select 1 from ${audits} a where a.lead_id = "leads"."id" and a.approved_at is not null)`,
    })
    .from(leads)
    .where(leadWhere(f))
    .orderBy(sql`case coalesce(${leads.tierOverride}, ${leads.tier}) when 'T1' then 0 when 'T2' then 1 when 'T3' then 2 else 3 end`, desc(leads.lastActivityAt), leads.name, leads.id)
    .limit(pageSize > 0 ? pageSize : 100000)
    .offset(pageSize > 0 ? (Math.max(1, page) - 1) * pageSize : 0);
  return rows;
}

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function leadFacets() {
  const [byStatus, byTier, bySido] = await Promise.all([
    db.select({ k: leads.status, c: count() }).from(leads).groupBy(leads.status),
    db.select({ k: sql<string>`coalesce(${leads.tierOverride}, ${leads.tier})`, c: count() }).from(leads).groupBy(sql`1`),
    db.select({ k: leads.sido, c: count() }).from(leads).groupBy(leads.sido),
  ]);
  return { byStatus, byTier, bySido };
}

export async function getLeadDetail(id: string) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) return null;
  const [cs, crawl, audit, seqs, msgs, evs, ts, ns] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.leadId, id)).orderBy(contacts.type, contacts.role),
    db.select().from(crawlResults).where(eq(crawlResults.leadId, id)).orderBy(desc(crawlResults.fetchedAt)).limit(1),
    db.select().from(audits).where(eq(audits.leadId, id)).orderBy(desc(audits.auditedAt)).limit(1),
    db.select().from(sequences).where(eq(sequences.leadId, id)).orderBy(desc(sequences.createdAt)),
    db.select().from(messages).where(eq(messages.leadId, id)).orderBy(desc(messages.createdAt)),
    db.select().from(events).where(eq(events.leadId, id)).orderBy(desc(events.occurredAt)),
    db.select().from(tasks).where(eq(tasks.leadId, id)).orderBy(desc(tasks.dueAt)),
    db.select().from(notes).where(eq(notes.leadId, id)).orderBy(desc(notes.createdAt)),
  ]);
  return { lead, contacts: cs, crawl: crawl[0] ?? null, audit: audit[0] ?? null, sequences: seqs, messages: msgs, events: evs, tasks: ts, notes: ns };
}

/** 리드별 최신 진단 1건 (리포트가 생성된 것만) */
export async function listAudits() {
  return db
    .select({ audit: audits, lead: leads })
    .from(audits)
    .innerJoin(leads, eq(leads.id, audits.leadId))
    .where(sql`${audits.landingToken} is not null and ${audits.id} = (select a2.id from audits a2 where a2.lead_id = ${audits.leadId} and a2.landing_token is not null order by a2.audited_at desc limit 1)`)
    .orderBy(desc(audits.auditedAt));
}

export async function listQueue() {
  return db
    .select({ lead: leads, audit: audits, email: sql<string | null>`(select c.value from ${contacts} c where c.lead_id = "leads"."id" and c.type = 'email' and not c.is_personal order by c.confidence desc limit 1)` })
    .from(leads)
    .leftJoin(audits, sql`${audits.id} = (select a2.id from audits a2 where a2.lead_id = "leads"."id" and a2.landing_token is not null order by a2.approved_at desc nulls last, a2.audited_at desc limit 1)`)
    .where(or(eq(leads.status, "queued"), eq(leads.status, "audited")))
    .orderBy(leads.status, leads.name);
}

export async function listTemplates() {
  const { templates } = await import("@solver/db");
  return db.select().from(templates).orderBy(templates.createdAt);
}

export async function listSentStats() {
  const [row] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${messages.direction} = 'out' and not ${messages.isTest})`,
      test: sql<number>`count(*) filter (where ${messages.isTest})`,
      replies: sql<number>`count(*) filter (where ${messages.direction} = 'in')`,
    })
    .from(messages);
  const [ev] = await db.select({ clicks: sql<number>`count(*) filter (where ${events.type} = 'click')`, bookings: sql<number>`count(*) filter (where ${events.type} = 'booking')`, unsub: sql<number>`count(*) filter (where ${events.type} = 'unsubscribe')` }).from(events);
  return { ...row!, ...ev! };
}

export async function listInboxMessages(filter?: string) {
  const where: SQL[] = [eq(messages.direction, "in")];
  if (filter === "unmatched") where.push(isNull(messages.leadId));
  else if (filter) where.push(eq(messages.classification, filter as never));
  return db.select({ message: messages, lead: leads }).from(messages).leftJoin(leads, eq(leads.id, messages.leadId)).where(and(...where)).orderBy(desc(messages.receivedAt)).limit(200);
}

export async function getThread(threadId: string) {
  return db.select().from(messages).where(eq(messages.gmailThreadId, threadId)).orderBy(messages.createdAt);
}

export async function listTasks(status: "open" | "done" = "open") {
  return db.select({ task: tasks, lead: leads, phone: sql<string | null>`(select c.value from ${contacts} c where c.lead_id = "leads"."id" and c.type = 'phone' limit 1)` }).from(tasks).innerJoin(leads, eq(leads.id, tasks.leadId)).where(eq(tasks.status, status)).orderBy(tasks.dueAt).limit(200);
}

export async function listSuppressions() {
  const { suppressions } = await import("@solver/db");
  return db.select().from(suppressions).orderBy(desc(suppressions.createdAt)).limit(200);
}
