import { describe, it, expect } from "vitest";
import { createSlack, replyArrived, dailyDigest } from "../src";

describe("slack messages", () => {
  it("builds reply notification with 3 buttons", () => {
    const m = replyArrived({ id: "L1", name: "A정형외과", appUrl: "http://x" }, { classification: "positive", summary: "미팅 관심", messageId: "M1" });
    expect(m.text).toContain("A정형외과");
    const actions = m.blocks!.find((b) => b.type === "actions") as any;
    expect(actions.elements).toHaveLength(3);
  });
  it("dry-run transport does not throw without token", async () => {
    const s = createSlack({ dryRun: true });
    const r = await s.post(dailyDigest({ date: "2026-09-22", sent: 0, clicks: 0, replies: 0, meetings: 0, callTasksToday: [], crawlFailures: 0, avgNotifyLagSec: null, geoCostKrw: 0 }));
    expect(r.dryRun).toBe(true);
  });
});
