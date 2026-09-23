import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client";
import { events, leads, suppressions, tasks } from "./schema";
import type { EventType, TaskType } from "@solver/shared";

/** 이벤트 기록 (dedupeKey로 중복 알림 방지). 이미 있으면 null 반환 */
export async function recordEvent(
  db: Db,
  input: { leadId: string | null; messageId?: string | null; type: EventType; payload?: Record<string, unknown>; dedupeKey?: string; occurredAt?: Date },
) {
  const [row] = await db
    .insert(events)
    .values({
      leadId: input.leadId,
      messageId: input.messageId ?? null,
      type: input.type,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .onConflictDoNothing({ target: events.dedupeKey })
    .returning();
  if (row && input.leadId) {
    await db.update(leads).set({ lastActivityAt: row.occurredAt }).where(eq(leads.id, input.leadId));
  }
  return row ?? null;
}

/** 태스크 생성 (멱등) */
export async function upsertTask(
  db: Db,
  input: { leadId: string; sequenceId?: string | null; type: TaskType; title: string; dueAt: Date; script?: string; dedupeKey: string },
) {
  const [row] = await db
    .insert(tasks)
    .values({ ...input, sequenceId: input.sequenceId ?? null })
    .onConflictDoNothing({ target: tasks.dedupeKey })
    .returning();
  return row ?? null;
}

export async function isSuppressed(db: Db, values: string[]): Promise<string | null> {
  const lowered = values.filter(Boolean).map((v) => v.toLowerCase());
  if (lowered.length === 0) return null;
  const rows = await db
    .select({ value: suppressions.value })
    .from(suppressions)
    .where(inArray(sql`lower(${suppressions.value})`, lowered))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function addSuppression(db: Db, input: { value: string; kind: "email" | "domain" | "ykiho"; reason: string; sourceMessageId?: string | null }) {
  await db.insert(suppressions).values(input).onConflictDoNothing({ target: suppressions.value });
}

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const { settings } = await import("./schema");
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return (row?.value as T) ?? fallback;
}

export async function listOpenTasks(db: Db, before = new Date()) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "open"), sql`${tasks.dueAt} <= ${before}`))
    .orderBy(desc(tasks.dueAt));
}
