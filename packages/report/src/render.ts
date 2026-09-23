import { createElement } from "react";
import { findBannedTerms, type BannedTermHit } from "@solver/shared";
import type React from "react";
import { Report } from "./Report";
import type { ReportData } from "./types";

/** Next.js 서버 컴포넌트 번들에서 react-dom/server 정적 import가 막히므로 런타임에 불러온다 */
async function staticMarkup(): Promise<(el: React.ReactElement) => string> {
  const modName = "react-dom/server";
  const mod = (await import(/* @vite-ignore */ modName)) as { renderToStaticMarkup: (el: React.ReactElement) => string };
  return mod.renderToStaticMarkup;
}

export async function reportToHtml(d: ReportData, opts: { standalone?: boolean } = {}): Promise<string> {
  const render = await staticMarkup();
  const body = render(createElement(Report, { d }));
  if (!opts.standalone) return body;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(d.hospitalName)} 진단 리포트</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>@page{size:A4;margin:0}html,body{margin:0;background:#FAFAFA}@media print{body{background:#fff}}</style></head><body>${body}</body></html>`;
}

/** 리포트 텍스트 금지어 검사 (승인 게이트) */
export function checkReportBannedTerms(d: ReportData): BannedTermHit[] {
  const text = [...d.topFixes, d.hospitalName].join("\n");
  return findBannedTerms(text);
}

/** HTML → PDF. playwright가 설치되어 있지 않으면 null 반환 (선택 의존성) */
export async function reportToPdf(html: string): Promise<Buffer | null> {
  // playwright는 선택 의존성. 설치되어 있지 않으면 PDF 없이 진행한다.
  type Pw = { chromium: { launch: () => Promise<any> } };
  let pw: Pw;
  try {
    const modName = "playwright";
    pw = (await import(/* @vite-ignore */ modName)) as Pw;
  } catch {
    return null;
  }
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
