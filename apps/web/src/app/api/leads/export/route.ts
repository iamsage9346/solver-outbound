import { listLeads } from "@/lib/queries";
import { LEAD_STATUS_LABEL } from "@solver/shared";

/** 구글시트용 CSV 내보내기 (PRD 4절 시트 컬럼 + 추가 컬럼) */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rows = await listLeads({ q: sp.get("q") ?? undefined, sido: sp.get("sido") ?? undefined, sggu: sp.get("sggu") ?? undefined, tier: sp.get("tier") ?? undefined, status: sp.get("status") ?? undefined, email: (sp.get("email") as "yes" | "no") ?? undefined });
  const header = ["ykiho", "name", "sido", "sggu", "emd", "cl_name", "est_date", "doctor_cnt", "staff_est", "place_rank", "review_cnt", "geo_score", "homepage", "email", "phone", "form", "tier", "tier_override", "referral_possible", "referrer", "owner", "status", "next_action", "utm_source"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [r.lead.ykiho, r.lead.name, r.lead.sido, r.lead.sggu, r.lead.emd, r.lead.clName, r.lead.estDate, r.lead.doctorCnt, r.lead.staffEst, r.lead.placeRank, r.lead.reviewCnt, r.lead.geoScore, r.lead.homepage, r.email, r.phone, r.form, r.lead.tier, r.lead.tierOverride, r.lead.referralPossible ? "Y" : "N", r.lead.referrer, r.lead.owner, LEAD_STATUS_LABEL[r.lead.status], r.lead.nextAction, r.lead.utmSource].map(esc).join(","));
  const csv = "﻿" + [header.join(","), ...lines].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
