import { NextResponse } from "next/server";
import { handleBooking } from "@solver/pipeline";
import { ctx } from "@/lib/db";

/**
 * PRD 8절 예약 확정. Google Calendar 예약 페이지는 직접 웹훅이 없으므로
 * 1차는 (a) Apps Script/Zapier가 이 엔드포인트를 호출하거나 (b) 워커가 Calendar API를 폴링해 호출한다.
 * body: { eventId, hospitalName?, email?, startAt(ISO), calendarUrl?, needsDrSong? }
 */
export async function POST(req: Request) {
  const b = (await req.json()) as { eventId: string; hospitalName?: string; email?: string; startAt: string; calendarUrl?: string; needsDrSong?: boolean };
  if (!b.eventId || !b.startAt) return NextResponse.json({ error: "eventId, startAt required" }, { status: 400 });
  const r = await handleBooking(ctx, { ...b, startAt: new Date(b.startAt) });
  return NextResponse.json({ ok: true, ...r });
}
