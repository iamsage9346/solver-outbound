import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { sleep } from "@solver/shared";

const BASIS_URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const DETAIL_BASE = "https://apis.data.go.kr/B551182/MadmDtlInfoService2.8";

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nullable());
const str = z.preprocess((v) => (v == null ? null : String(v)), z.string().nullable());

export const HospBasisItem = z.object({
  ykiho: z.string(),
  yadmNm: z.string(),
  clCd: str,
  clCdNm: str,
  sidoCd: str,
  sidoCdNm: str,
  sgguCd: str,
  sgguCdNm: str,
  emdongNm: str,
  addr: str,
  telno: str,
  hospUrl: str,
  estbDd: str, // yyyymmdd
  drTotCnt: num,
  mdeptSdrCnt: num, // 전문의 수
  XPos: num,
  YPos: num,
});
export type HospBasisItem = z.infer<typeof HospBasisItem>;

export const DgsbjtItem = z.object({
  dgsbjtCd: str,
  dgsbjtCdNm: str,
  dgsbjtPrSdrCnt: num, // 전문과목별 전문의 수
});
export type DgsbjtItem = z.infer<typeof DgsbjtItem>;

export interface HiraClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** 페이지 간 간격 */
  intervalMs?: number;
  dryRun?: boolean;
}

export interface BasisQuery {
  sidoCd: string;
  sgguCd?: string;
  clCd?: string;
  dgsbjtCd?: string;
  yadmNm?: string;
  numOfRows?: number;
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export class HiraClient {
  private apiKey: string;
  private fetchImpl: typeof fetch;
  private intervalMs: number;
  private dryRun: boolean;

  constructor(opts: HiraClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.HIRA_API_KEY ?? "";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.intervalMs = opts.intervalMs ?? 200;
    this.dryRun = opts.dryRun ?? false;
    if (!this.apiKey && !this.dryRun) throw new Error("HIRA_API_KEY is not set");
  }

  private async get(url: string, params: Record<string, string | number | undefined>) {
    const u = new URL(url);
    // data.go.kr 인증키: Encoding 키('%' 포함)는 그대로, Decoding 키('+', '/', '=' 포함)는 인코딩해서 붙인다.
    const key = this.apiKey.includes("%") ? this.apiKey : encodeURIComponent(this.apiKey);
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const full = `${u.origin}${u.pathname}?serviceKey=${key}&${qs}`;
    // data.go.kr은 간헐적으로 503/타임아웃(returnReasonCode 05)을 내므로 3회까지 재시도한다.
    let text = "";
    for (let attempt = 1; ; attempt++) {
      const res = await this.fetchImpl(full, { headers: { accept: "application/json, application/xml" } }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      text = await res.text();
      const transient = !res.ok || /SERVICETIMEOUT_ERROR|"returnReasonCode":\s*"0[45]"/.test(text);
      if (!transient) break;
      if (attempt >= 3) throw new Error(`HIRA ${res.status}: ${text.slice(0, 200)}`);
      await sleep(1500 * attempt);
    }
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = parser.parse(text);
    }
    const response = body?.response;
    const header = response?.header;
    if (header && String(header.resultCode) !== "00") {
      throw new Error(`HIRA resultCode=${header.resultCode} ${header.resultMsg ?? ""}`);
    }
    // data.go.kr 공통 오류 응답 (인증키 미등록·트래픽 초과 등)
    const openApi = body?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (openApi) throw new Error(`data.go.kr ${openApi.returnReasonCode}: ${openApi.returnAuthMsg ?? openApi.errMsg ?? ""}`);
    return {
      items: toArray<any>(response?.body?.items?.item),
      totalCount: Number(response?.body?.totalCount ?? 0),
    };
  }

  /** 병원정보서비스 getHospBasisList — 전 페이지를 돌며 모은다 */
  async listHospitals(q: BasisQuery, onPage?: (page: number, total: number) => void): Promise<HospBasisItem[]> {
    if (this.dryRun) return DRY_RUN_HOSPITALS.filter((h) => (!q.sgguCd || h.sgguCd === q.sgguCd) && (!q.clCd || h.clCd === q.clCd));
    const numOfRows = q.numOfRows ?? 100;
    const out: HospBasisItem[] = [];
    let page = 1;
    while (true) {
      const { items, totalCount } = await this.get(BASIS_URL, {
        pageNo: page,
        numOfRows,
        sidoCd: q.sidoCd,
        sgguCd: q.sgguCd,
        clCd: q.clCd,
        dgsbjtCd: q.dgsbjtCd,
        yadmNm: q.yadmNm,
        _type: "json",
      });
      for (const it of items) {
        const parsed = HospBasisItem.safeParse(it);
        if (parsed.success) out.push(parsed.data);
      }
      onPage?.(page, totalCount);
      if (page * numOfRows >= totalCount || items.length === 0) break;
      page += 1;
      await sleep(this.intervalMs);
    }
    return out;
  }

  /** 의료기관별상세정보 — 진료과목·전문의 수 */
  async getDepartments(ykiho: string): Promise<DgsbjtItem[]> {
    if (this.dryRun) return [{ dgsbjtCd: "05", dgsbjtCdNm: "정형외과", dgsbjtPrSdrCnt: 2 }];
    const { items } = await this.get(`${DETAIL_BASE}/getDgsbjtInfo2.8`, { ykiho, numOfRows: 50, _type: "json" });
    return items.map((i: unknown) => DgsbjtItem.parse(i));
  }

  /** 진료시간 등 상세 (원본 그대로 반환) */
  async getDetail(ykiho: string): Promise<Record<string, unknown> | null> {
    if (this.dryRun) return { trmtMonStart: "0900", trmtMonEnd: "1800", lunchWeek: "1300~1400" };
    const { items } = await this.get(`${DETAIL_BASE}/getDtlInfo2.8`, { ykiho, _type: "json" });
    return items[0] ?? null;
  }
}

/** DRY_RUN 용 고정 샘플 (실 API 없이 CLI 흐름 확인) */
export const DRY_RUN_HOSPITALS: HospBasisItem[] = [
  { ykiho: "DRY000001", yadmNm: "강남바른정형외과의원", clCd: "31", clCdNm: "의원", sidoCd: "110000", sidoCdNm: "서울", sgguCd: "110001", sgguCdNm: "강남구", emdongNm: "역삼동", addr: "서울특별시 강남구 테헤란로 1", telno: "02-111-1111", hospUrl: "https://example.com", estbDd: "20210315", drTotCnt: 3, mdeptSdrCnt: 3, XPos: 127.03, YPos: 37.5 },
  { ykiho: "DRY000002", yadmNm: "서초튼튼정형외과", clCd: "31", clCdNm: "의원", sidoCd: "110000", sidoCdNm: "서울", sgguCd: "110002", sgguCdNm: "서초구", emdongNm: "서초동", addr: "서울특별시 서초구 서초대로 2", telno: "02-222-2222", hospUrl: null, estbDd: "20191101", drTotCnt: 2, mdeptSdrCnt: 2, XPos: 127.01, YPos: 37.49 },
  { ykiho: "DRY000003", yadmNm: "분당연세정형외과병원", clCd: "21", clCdNm: "병원", sidoCd: "310000", sidoCdNm: "경기", sgguCd: "310401", sgguCdNm: "성남시분당구", emdongNm: "정자동", addr: "경기도 성남시 분당구 정자로 3", telno: "031-333-3333", hospUrl: "https://example.org", estbDd: "20220620", drTotCnt: 5, mdeptSdrCnt: 4, XPos: 127.1, YPos: 37.36 },
  { ykiho: "DRY000004", yadmNm: "신규개원정형외과의원", clCd: "31", clCdNm: "의원", sidoCd: "110000", sidoCdNm: "서울", sgguCd: "110001", sgguCdNm: "강남구", emdongNm: "논현동", addr: "서울특별시 강남구 논현로 4", telno: "02-444-4444", hospUrl: null, estbDd: "20260401", drTotCnt: 1, mdeptSdrCnt: 1, XPos: 127.03, YPos: 37.51 },
  { ykiho: "DRY000005", yadmNm: "강남대형종합병원", clCd: "11", clCdNm: "종합병원", sidoCd: "110000", sidoCdNm: "서울", sgguCd: "110001", sgguCdNm: "강남구", emdongNm: "삼성동", addr: "서울특별시 강남구 영동대로 5", telno: "02-555-5555", hospUrl: "https://example.net", estbDd: "19990101", drTotCnt: 120, mdeptSdrCnt: 90, XPos: 127.06, YPos: 37.51 },
];
