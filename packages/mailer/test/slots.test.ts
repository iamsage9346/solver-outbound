import { describe, it, expect } from "vitest";
import { nextSendSlot, capCheck, kstParts, KR_HOLIDAYS_2026 } from "../src";

const rng0 = () => 0.5; // jitter 0
describe("nextSendSlot", () => {
  it("Monday → Tuesday 10:00 KST", () => {
    const from = new Date("2026-09-28T09:00:00+09:00"); // 월
    const slot = nextSendSlot(from, { rng: rng0 });
    expect(slot.toISOString()).toBe(new Date("2026-09-29T10:00:00+09:00").toISOString());
  });
  it("Thursday after 10:15 → next Tuesday", () => {
    const from = new Date("2026-10-01T11:00:00+09:00"); // 목
    const slot = nextSendSlot(from, { rng: rng0 });
    expect(kstParts(slot)).toMatchObject({ ymd: "2026-10-06", weekday: 2, hour: 10, minute: 0 });
  });
  it("Friday → skips weekend, Mon and 대체공휴일", () => {
    const from = new Date("2026-10-02T15:00:00+09:00"); // 금
    const slot = nextSendSlot(from, { rng: rng0 });
    expect(kstParts(slot).ymd).toBe("2026-10-06");
  });
  it("skips 한글날(10-09, 금) and 추석 (09-24 목)", () => {
    expect(KR_HOLIDAYS_2026).toContain("2026-10-09");
    const from = new Date("2026-09-23T12:00:00+09:00"); // 수 오후
    const slot = nextSendSlot(from, { rng: rng0 });
    expect(kstParts(slot).ymd).toBe("2026-09-29"); // 목(추석)·금·토·일·월 건너뜀
  });
  it("jitter stays within ±15 minutes", () => {
    const from = new Date("2026-09-28T09:00:00+09:00");
    const lo = nextSendSlot(from, { rng: () => 0 });
    const hi = nextSendSlot(from, { rng: () => 1 });
    expect(kstParts(lo)).toMatchObject({ hour: 9, minute: 45 });
    expect(kstParts(hi)).toMatchObject({ hour: 10, minute: 15 });
  });
  it("same day before slot → today", () => {
    const from = new Date("2026-09-29T08:00:00+09:00"); // 화 아침
    expect(kstParts(nextSendSlot(from, { rng: rng0 })).ymd).toBe("2026-09-29");
  });
});

describe("capCheck", () => {
  const caps = { dailyCap: 40, hourlyCap: 15, perLeadCap: 3 };
  it("allows under caps", () => expect(capCheck({ sentToday: 10, sentThisHour: 3, sentToLead: 1, caps }).allowed).toBe(true));
  it("daily cap → carry over", () => expect(capCheck({ sentToday: 40, sentThisHour: 3, sentToLead: 1, caps })).toMatchObject({ allowed: false, carryOver: true }));
  it("per-lead cap → no carry over", () => expect(capCheck({ sentToday: 1, sentThisHour: 1, sentToLead: 3, caps })).toMatchObject({ allowed: false, carryOver: false }));
});
