import { describe, it, expect } from "vitest";
import { composeMessage } from "../src";

const sender = { name: "솔버", address: "outreach@solver.kr", phone: "010-0000-0000" };
const template = {
  subject: "{병원명} 진단 결과",
  bodyMd: `{병원명} 원장님께,
리포트 → {리포트링크}
예약 → {예약링크}
솔버 {발신자명} 드림
{발신자연락처}
수신을 원치 않으시면 "수신거부"라고 회신해 주세요. {수신거부링크}`,
};
const vars = { 병원명: "A정형외과", 리포트링크: "https://x.kr/r/1", 예약링크: "https://x.kr/b/1", 수신거부링크: "https://x.kr/u/1" };

describe("composeMessage", () => {
  it("renders ok with all variables and (광고) prefix", () => {
    const r = composeMessage({ template, vars, adLabel: true, sender });
    expect(r.ok).toBe(true);
    expect(r.subject).toBe("(광고) A정형외과 진단 결과");
    expect(r.text).toContain("outreach@solver.kr");
    expect(r.linkCount).toBe(3);
  });
  it("no prefix when adLabel false", () => {
    const r = composeMessage({ template, vars, adLabel: false, sender });
    expect(r.subject).toBe("A정형외과 진단 결과");
  });
  it("blocks when a variable is missing", () => {
    const r = composeMessage({ template, vars: { ...vars, 병원명: "" }, adLabel: true, sender });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["병원명"]);
  });
  it("blocks when more than 3 links", () => {
    const t = { ...template, bodyMd: template.bodyMd + "\n추가 https://a.kr https://b.kr" };
    const r = composeMessage({ template: t, vars, adLabel: true, sender });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("링크"))).toBe(true);
  });
  it("blocks when unsubscribe method missing", () => {
    const t = { ...template, bodyMd: "{병원명} 원장님께\n솔버 {발신자명} {발신자연락처}" };
    const r = composeMessage({ template: t, vars, adLabel: true, sender });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("수신거부"))).toBe(true);
  });
  it("rejects html/images", () => {
    const t = { ...template, bodyMd: template.bodyMd + '\n<img src="x">' };
    const r = composeMessage({ template: t, vars, adLabel: true, sender });
    expect(r.ok).toBe(false);
  });
});
