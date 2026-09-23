import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { leads, upsertTask } from "@solver/db";
import { ctx, db } from "@/lib/db";

/** PRD 8절 Slack 버튼 액션 수신. 버튼 → 리드 상태·태스크 반영 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (secret) {
    const ts = req.headers.get("x-slack-request-timestamp") ?? "";
    const sig = req.headers.get("x-slack-signature") ?? "";
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return new NextResponse("stale", { status: 401 });
    const expected = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return new NextResponse("bad signature", { status: 401 });
  }
  const payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}") as { type?: string; actions?: { action_id: string; value: string }[]; user?: { username?: string } };
  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ ok: true });
  const leadId = action.value;
  switch (action.action_id) {
    case "create_call_task":
    case "call":
      await upsertTask(db, { leadId, type: "call", title: "Slack에서 생성한 전화", dueAt: new Date(Date.now() + 2 * 3600_000), dedupeKey: `slack:call:${leadId}:${Date.now()}` });
      break;
    case "send_booking": {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
      if (lead) await db.update(leads).set({ nextAction: `예약 링크 보내기 ${ctx.bookingUrl}`, nextActionAt: new Date() }).where(eq(leads.id, leadId));
      break;
    }
  }
  return NextResponse.json({ ok: true, text: "처리했습니다." });
}
