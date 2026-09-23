import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleFormSubmission } from "@solver/pipeline";
import { ctx } from "@/lib/db";

/**
 * PRD 8절 인바운드 폼 웹훅 (Tally 또는 자체 폼).
 * Tally payload: { eventId, data: { submissionId, fields: [{label, value}] } }
 * 자체 폼 JSON: { hospitalName, director, contact, concern, source, utm: {...} }
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.TALLY_SIGNING_SECRET;
  const sig = req.headers.get("tally-signature");
  if (secret && sig) {
    const expected = createHmac("sha256", secret).update(raw).digest("base64");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const body = JSON.parse(raw) as Record<string, unknown>;
  const url = new URL(req.url);
  const utm = { source: url.searchParams.get("utm_source") ?? undefined, medium: url.searchParams.get("utm_medium") ?? undefined, campaign: url.searchParams.get("utm_campaign") ?? undefined };

  let input;
  if (body.data && typeof body.data === "object" && Array.isArray((body.data as { fields?: unknown }).fields)) {
    const data = body.data as { submissionId: string; fields: { label: string; value: unknown }[] };
    const get = (re: RegExp) => data.fields.find((f) => re.test(f.label))?.value;
    input = {
      hospitalName: String(get(/병원|hospital/i) ?? ""),
      director: get(/원장|성함|name/i) ? String(get(/원장|성함|name/i)) : null,
      contact: get(/연락|이메일|전화|email|phone/i) ? String(get(/연락|이메일|전화|email|phone/i)) : null,
      concern: get(/고민|문의|concern/i) ? String(get(/고민|문의|concern/i)) : null,
      source: get(/경로|알게|source/i) ? String(get(/경로|알게|source/i)) : null,
      utm,
      submissionId: data.submissionId ?? String(body.eventId ?? Date.now()),
    };
  } else {
    input = {
      hospitalName: String(body.hospitalName ?? ""),
      director: (body.director as string) ?? null,
      contact: (body.contact as string) ?? null,
      concern: (body.concern as string) ?? null,
      source: (body.source as string) ?? null,
      utm: { ...utm, ...((body.utm as object) ?? {}) },
      referrer: (body.referrer as string) ?? null,
      submissionId: String(body.submissionId ?? body.eventId ?? Date.now()),
    };
  }
  if (!input.hospitalName) return NextResponse.json({ error: "hospitalName required" }, { status: 400 });
  const r = await handleFormSubmission(ctx, input);
  return NextResponse.json({ ok: true, ...r });
}
