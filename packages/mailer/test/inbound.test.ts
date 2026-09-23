import { describe, it, expect } from "vitest";
import { parseBounce, detectUnsubscribeIntent, normalizeMessage, toBase64Url } from "../src";

describe("parseBounce", () => {
  it("hard bounce 5.1.1", () => {
    const r = parseBounce({
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Delivery Status Notification (Failure)",
      textBody: "Final-Recipient: rfc822; noone@hospital.co.kr\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does not exist.",
    });
    expect(r).toMatchObject({ isBounce: true, hard: true, address: "noone@hospital.co.kr" });
  });
  it("soft bounce mailbox full", () => {
    const r = parseBounce({
      from: "postmaster@naver.com",
      subject: "Undelivered Mail Returned to Sender",
      textBody: "The recipient's mailbox is full. Status: 4.2.2 doc@naver.com",
    });
    expect(r).toMatchObject({ isBounce: true, hard: false, address: "doc@naver.com" });
  });
  it("normal reply is not a bounce", () => {
    expect(parseBounce({ from: "원장 <dr@hospital.co.kr>", subject: "Re: 진단", textBody: "네 관심 있습니다" }).isBounce).toBe(false);
  });
});

describe("detectUnsubscribeIntent", () => {
  it("korean phrases", () => {
    expect(detectUnsubscribeIntent("수신거부 부탁드립니다")).toBe(true);
    expect(detectUnsubscribeIntent("앞으로 이런 메일 그만 보내주세요")).toBe(true);
  });
  it("english phrases", () => {
    expect(detectUnsubscribeIntent("Please unsubscribe me")).toBe(true);
    expect(detectUnsubscribeIntent("remove me from this list")).toBe(true);
  });
  it("ignores quoted original with our own unsubscribe notice", () => {
    const text = "네, 다음 주 화요일 가능합니다.\n\n> 수신을 원치 않으시면 \"수신거부\"라고 회신해 주세요.";
    expect(detectUnsubscribeIntent(text)).toBe(false);
  });
});

describe("normalizeMessage", () => {
  it("extracts headers, text and auto-reply flag", () => {
    const m = normalizeMessage({
      id: "m1",
      threadId: "t1",
      internalDate: "1758510000000",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "원장 <dr@hospital.co.kr>" },
          { name: "To", value: "outreach@solver.kr" },
          { name: "Subject", value: "Re: 진단" },
          { name: "In-Reply-To", value: "<abc@mail.gmail.com>" },
          { name: "Auto-Submitted", value: "auto-replied" },
        ],
        body: { data: toBase64Url("부재중입니다") },
      },
    });
    expect(m).toMatchObject({ gmailMsgId: "m1", gmailThreadId: "t1", from: "원장 <dr@hospital.co.kr>", inReplyTo: "<abc@mail.gmail.com>", textBody: "부재중입니다", isAutoReply: true, isBounce: false });
  });
});
