export const KR_HOLIDAYS_2026: readonly string[] = [
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-09-26", // 추석 연휴
  "2026-10-03", // 개천절
  "2026-10-05", // 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25", // 성탄절
];

export interface SlotOptions {
  /** 0=일 … 6=토. 기본 화·수·목 */
  days?: number[];
  time?: string; // "HH:MM"
  jitterMinutes?: number;
  holidays?: readonly string[];
  tz?: string;
  /** 0~1 난수 (테스트용 결정적 주입) */
  rng?: () => number;
}

const KST_OFFSET_MIN = 9 * 60;

/** Asia/Seoul 기준 yyyy-mm-dd 와 요일 */
export function kstParts(d: Date): { ymd: string; weekday: number; hour: number; minute: number } {
  const shifted = new Date(d.getTime() + KST_OFFSET_MIN * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return { ymd: `${y}-${m}-${day}`, weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

/** KST 날짜(yyyy-mm-dd)와 HH:MM → Date */
export function kstDate(ymd: string, hhmm: string): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(`${ymd}T${String(h).padStart(2, "0")}:${String(mi ?? 0).padStart(2, "0")}:00+09:00`);
}

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * `from` 이후 첫 발송 슬롯. 화·수·목 10:00 ± jitter, 공휴일 제외.
 * `from`이 같은 날 슬롯 시각 전이면 그날, 지났으면 다음 허용일.
 */
export function nextSendSlot(from: Date, opts: SlotOptions = {}): Date {
  const days = opts.days ?? [2, 3, 4];
  const time = opts.time ?? "10:00";
  const jitter = opts.jitterMinutes ?? 15;
  const holidays = new Set(opts.holidays ?? KR_HOLIDAYS_2026);
  const rng = opts.rng ?? Math.random;

  let { ymd } = kstParts(from);
  for (let i = 0; i < 60; i++) {
    const base = kstDate(ymd, time);
    const weekday = kstParts(base).weekday;
    const allowed = days.includes(weekday) && !holidays.has(ymd);
    // 지터 하한(-jitter)까지 고려해 from보다 늦은지 확인
    if (allowed && base.getTime() - jitter * 60_000 > from.getTime()) {
      const offset = Math.round((rng() * 2 - 1) * jitter);
      return new Date(base.getTime() + offset * 60_000);
    }
    ymd = addDaysYmd(ymd, 1);
  }
  throw new Error("no send slot found within 60 days");
}

export interface CapCheckInput {
  sentToday: number;
  sentThisHour: number;
  sentToLead: number;
  caps: { dailyCap: number; hourlyCap: number; perLeadCap: number };
}

export function capCheck(input: CapCheckInput): { allowed: boolean; reason: string | null; carryOver: boolean } {
  if (input.sentToLead >= input.caps.perLeadCap) return { allowed: false, reason: `병원당 상한 ${input.caps.perLeadCap}통 도달`, carryOver: false };
  if (input.sentToday >= input.caps.dailyCap) return { allowed: false, reason: `일 상한 ${input.caps.dailyCap}통 도달`, carryOver: true };
  if (input.sentThisHour >= input.caps.hourlyCap) return { allowed: false, reason: `시간당 상한 ${input.caps.hourlyCap}통 도달`, carryOver: true };
  return { allowed: true, reason: null, carryOver: false };
}
