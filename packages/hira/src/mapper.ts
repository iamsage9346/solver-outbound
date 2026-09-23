import { parseYmd } from "@solver/shared";
import type { HospBasisItem } from "./client";
import { CL_CODES } from "./codes";

/** 심평원 응답 → leads insert 형태 */
export function mapHospitalToLead(h: HospBasisItem) {
  const est = parseYmd(h.estbDd ?? undefined);
  return {
    ykiho: h.ykiho,
    name: h.yadmNm.trim(),
    clCd: h.clCd,
    clName: h.clCdNm ?? (h.clCd ? CL_CODES[h.clCd] ?? null : null),
    sido: normalizeSido(h.sidoCdNm),
    sggu: h.sgguCdNm,
    emd: h.emdongNm,
    address: h.addr,
    lat: h.YPos,
    lng: h.XPos,
    estDate: est ? est.toISOString().slice(0, 10) : null,
    doctorCnt: h.drTotCnt,
    homepage: normalizeUrl(h.hospUrl),
    phone: h.telno,
    hiraRaw: h as unknown as Record<string, unknown>,
  };
}

function normalizeSido(s: string | null): string | null {
  if (!s) return null;
  const map: Record<string, string> = { 서울: "서울특별시", 경기: "경기도", 인천: "인천광역시" };
  return map[s] ?? s;
}

export function normalizeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  let s = u.trim();
  if (!s || s === "-") return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}
