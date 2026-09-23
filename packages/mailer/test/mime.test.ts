import { describe, it, expect } from "vitest";
import { buildMime, buildRawMime, fromBase64Url } from "../src";

describe("buildRawMime", () => {
  it("produces base64url with In-Reply-To and References", () => {
    const raw = buildRawMime({ from: "솔버 <o@solver.kr>", to: "dr@h.kr", subject: "안녕", text: "본문", inReplyTo: "<x@gmail.com>", date: new Date(0) });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = fromBase64Url(raw).toString("utf8");
    expect(decoded).toContain("In-Reply-To: <x@gmail.com>");
    expect(decoded).toContain("References: <x@gmail.com>");
    expect(decoded).toContain("Subject: =?UTF-8?B?");
    expect(decoded).toContain("Content-Type: text/plain; charset=UTF-8");
  });
  it("adds multipart/mixed with attachment", () => {
    const mime = buildMime({ from: "o@solver.kr", to: "dr@h.kr", subject: "r", text: "t", attachments: [{ filename: "report.pdf", mimeType: "application/pdf", content: Buffer.from("%PDF") }], headers: { "List-Unsubscribe": "<mailto:o@solver.kr>" } });
    expect(mime).toContain("multipart/mixed");
    expect(mime).toContain("Content-Disposition: attachment");
    expect(mime).toContain("List-Unsubscribe: <mailto:o@solver.kr>");
    expect(mime).not.toContain("In-Reply-To");
  });
});
