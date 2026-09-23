import { NextResponse } from "next/server";
import { handleClick } from "@solver/pipeline";
import { ctx } from "@/lib/db";

/** PRD 7절 추적 링크: 클릭 이벤트 기록 후 목적지로 302 */
export async function GET(req: Request, { params }: RouteContext<"/r/[token]">) {
  const { token } = await params;
  const to = new URL(req.url).searchParams.get("to");
  const dest = to === "booking" || to === "unsubscribe" ? to : "report";
  const r = await handleClick(ctx, token, dest);
  return NextResponse.redirect(r.redirect, 302);
}
