import { describe, it, expect } from "vitest";
import { planSequence, shouldStopSequence, buildCallScript, kstParts } from "../src";
import { findBannedTerms } from "@solver/shared";

describe("planSequence", () => {
  it("D+2 call 09:00 KST, D+7 and D+14 mails on send slots", () => {
    const sentAt = new Date("2026-09-29T10:03:00+09:00"); // 화
    const steps = planSequence(sentAt, undefined, { rng: () => 0.5 });
    expect(steps[0]).toMatchObject({ step: 1, kind: "call" });
    expect(kstParts(steps[0]!.at)).toMatchObject({ ymd: "2026-10-01", hour: 9, minute: 0 });
    expect(steps[1]).toMatchObject({ step: 2, kind: "email", templateKey: "d7_remail" });
    expect(kstParts(steps[1]!.at)).toMatchObject({ ymd: "2026-10-06", hour: 10 }); // 10/6 화
    expect(steps[2]).toMatchObject({ step: 3, templateKey: "reapproach" });
    expect(kstParts(steps[2]!.at)).toMatchObject({ ymd: "2026-10-13", hour: 10 });
  });
});

describe("shouldStopSequence", () => {
  it("stops on reply/booking/unsubscribe/bounce only", () => {
    expect(shouldStopSequence("reply")).toBe("reply");
    expect(shouldStopSequence("booking")).toBe("booking");
    expect(shouldStopSequence("unsubscribe")).toBe("unsubscribe");
    expect(shouldStopSequence("bounce")).toBe("bounce");
    expect(shouldStopSequence("open")).toBeNull();
    expect(shouldStopSequence("click")).toBeNull();
  });
});

describe("buildCallScript", () => {
  it("3 lines, no banned terms", () => {
    const s = buildCallScript({ 병원명: "A정형외과", 지역: "강남구", 플레이스순위: 7, 개선포인트1: "플레이스 진료시간 누락" });
    expect(s.split("\n")).toHaveLength(3);
    expect(s).toContain("A정형외과");
    expect(findBannedTerms(s)).toHaveLength(0);
  });
});
