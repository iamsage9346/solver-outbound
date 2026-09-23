import { NextResponse } from "next/server";
import { kstParts } from "@solver/mailer";
import { listQueued, pollGmail, prepareMail, runDailyDigest, runFollowup, runOpenDigest, runWeeklyDigest, sendPrepared } from "@solver/pipeline";
import { ctx } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Vercel Cron / 외부 스케줄러용 잡 엔드포인트. apps/worker(pg-boss)와 같은 파이프라인 함수를 호출한다.
 * vercel.json 크론(UTC): poll-gmail 매분, daily 09:00 KST, send-slot 화·수·목 10:00 KST, digest-open 10:30·16:00 KST.
 * Vercel Cron은 Authorization: Bearer CRON_SECRET 헤더를 자동으로 붙인다.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/cron/[job]">) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const started = Date.now();
  let result: unknown;
  switch (job) {
    case "poll-gmail":
      result = await pollGmail(ctx);
      break;
    case "followup":
      result = await runFollowup(ctx);
      break;
    case "digest-daily":
      result = await runDailyDigest(ctx);
      break;
    case "digest-weekly":
      result = await runWeeklyDigest(ctx);
      break;
    case "digest-open":
      result = await runOpenDigest(ctx);
      break;
    case "daily": {
      // 09:00 KST 묶음: 팔로업 → 일일 요약 → (월요일) 주간 현황
      const followup = await runFollowup(ctx);
      const digest = await runDailyDigest(ctx);
      const weekly = kstParts(new Date()).weekday === 1 ? await runWeeklyDigest(ctx) : null;
      result = { followup, digest, weekly };
      break;
    }
    case "send-slot": {
      const { weekday } = kstParts(new Date());
      if (!ctx.settings.send.days.includes(weekday)) {
        result = { skipped: "not a send day" };
        break;
      }
      const queued = await listQueued(ctx, 20);
      const sent = [];
      for (const lead of queued) sent.push({ lead: lead.name, ...(await sendPrepared(ctx, await prepareMail(ctx, lead))) });
      result = sent;
      break;
    }
    default:
      return NextResponse.json({ error: `unknown job ${job}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job, ms: Date.now() - started, result });
}
