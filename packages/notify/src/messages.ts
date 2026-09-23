import type { KnownBlock } from "@slack/web-api";
import { REPLY_CLASS_LABEL, type ReplyClass } from "@solver/shared";
import type { SlackMessage } from "./slack";

/** PRD 8절 알림 이벤트별 메시지 빌더. 병원명 · 무슨 일 · 요약 2줄 · 다음 액션 버튼 */

const section = (text: string): KnownBlock => ({ type: "section", text: { type: "mrkdwn", text } });
const context = (text: string): KnownBlock => ({ type: "context", elements: [{ type: "mrkdwn", text }] });
const actions = (buttons: { text: string; actionId: string; value: string; url?: string; style?: "primary" | "danger" }[]): KnownBlock => ({
  type: "actions",
  elements: buttons.map((b) => ({
    type: "button",
    text: { type: "plain_text", text: b.text },
    action_id: b.actionId,
    value: b.value,
    ...(b.url ? { url: b.url } : {}),
    ...(b.style ? { style: b.style } : {}),
  })),
});

export interface LeadRef {
  id: string;
  name: string;
  phone?: string | null;
  appUrl?: string;
}

const leadUrl = (l: LeadRef) => `${l.appUrl ?? process.env.APP_URL ?? "http://localhost:3000"}/leads/${l.id}`;

export function replyArrived(l: LeadRef, r: { classification: ReplyClass; summary: string; proposedTimes?: string[]; messageId: string }): SlackMessage {
  const times = r.proposedTimes?.length ? `\n제안 시간: ${r.proposedTimes.join(", ")}` : "";
  return {
    text: `✉️ 회신 도착 · ${l.name} · ${REPLY_CLASS_LABEL[r.classification]}`,
    blocks: [
      section(`*✉️ 회신 도착 · ${l.name}*\n분류: *${REPLY_CLASS_LABEL[r.classification]}*\n${r.summary}${times}`),
      actions([
        { text: "답장 초안 보기", actionId: "reply_draft", value: r.messageId, url: `${leadUrl(l)}?tab=inbox`, style: "primary" },
        { text: "전화 태스크 만들기", actionId: "create_call_task", value: l.id },
        { text: "예약 링크 보내기", actionId: "send_booking", value: l.id },
      ]),
      context(`<${leadUrl(l)}|리드 열기>`),
    ],
  };
}

export function linkClicked(l: LeadRef, e: { link: "report" | "booking" | "unsubscribe"; sinceSentLabel: string }): SlackMessage {
  const label = { report: "리포트 링크", booking: "예약 링크", unsubscribe: "수신거부 링크" }[e.link];
  return {
    text: `🔗 ${label} 클릭 · ${l.name} (발송 후 ${e.sinceSentLabel})`,
    blocks: [
      section(`*🔗 ${label} 클릭 · ${l.name}*\n발송 후 ${e.sinceSentLabel}`),
      actions([
        { text: l.phone ? `전화하기 ${l.phone}` : "전화번호 없음", actionId: "call", value: l.id, style: "primary" },
        { text: "시퀀스 보기", actionId: "view_sequence", value: l.id, url: `${leadUrl(l)}?tab=sequence` },
      ]),
    ],
  };
}

export function formSubmitted(l: LeadRef, f: { director?: string | null; concern?: string | null; source?: string | null }): SlackMessage {
  return {
    text: `📝 폼 제출 · ${l.name}`,
    blocks: [
      section(`*📝 폼 제출 · ${l.name}*\n원장: ${f.director ?? "-"}\n고민: ${f.concern ?? "-"}\n경로: ${f.source ?? "-"}`),
      actions([{ text: "리드 열기", actionId: "open_lead", value: l.id, url: leadUrl(l), style: "primary" }]),
    ],
  };
}

export function bookingConfirmed(l: LeadRef, b: { when: string; needsDrSong?: boolean; calendarUrl?: string }): SlackMessage {
  return {
    text: `📅 예약 확정 · ${l.name} · ${b.when}`,
    blocks: [
      section(`*📅 예약 확정 · ${l.name}*\n일시: *${b.when}*\n송원장 동행: ${b.needsDrSong ? "필요" : "불필요"}`),
      actions([
        { text: "캘린더 열기", actionId: "open_calendar", value: l.id, url: b.calendarUrl ?? "https://calendar.google.com", style: "primary" },
        { text: "리마인드 예약 확인", actionId: "check_reminder", value: l.id, url: `${leadUrl(l)}?tab=sequence` },
      ]),
    ],
  };
}

export function suppressed(l: LeadRef, s: { kind: "unsubscribe" | "hard_bounce"; reason: string }): SlackMessage {
  const label = s.kind === "unsubscribe" ? "수신거부" : "하드 바운스";
  return { text: `⛔ ${label} · ${l.name} · ${s.reason}`, blocks: [section(`*⛔ ${label} · ${l.name}*\n${s.reason}\n_자동 처리 완료 (억제 목록 등록, 시퀀스 중단)_`)] };
}

export function openDigest(items: { name: string; count: number }[]): SlackMessage {
  const list = items.length ? items.map((i) => `• ${i.name} (${i.count})`).join("\n") : "_없음_";
  return { text: `👀 오픈 ${items.length}곳`, blocks: [section(`*👀 오픈 묶음 알림*\n${list}\n_오픈은 참고 지표입니다 (Gmail 프록시)_`)] };
}

export function dailyDigest(d: { date: string; sent: number; clicks: number; replies: number; meetings: number; callTasksToday: { name: string; phone: string | null }[]; crawlFailures: number; avgNotifyLagSec: number | null; geoCostKrw: number }): SlackMessage {
  const tasks = d.callTasksToday.length ? d.callTasksToday.map((t) => `• ${t.name} ${t.phone ?? ""}`).join("\n") : "_없음_";
  return {
    text: `📊 일일 요약 ${d.date}: 발송 ${d.sent} · 클릭 ${d.clicks} · 회신 ${d.replies} · 미팅 ${d.meetings}`,
    blocks: [
      section(`*📊 일일 요약 · ${d.date}*\n어제 발송 *${d.sent}* · 클릭 *${d.clicks}* · 회신 *${d.replies}* · 미팅 *${d.meetings}*`),
      section(`*오늘 전화 태스크 (${d.callTasksToday.length})*\n${tasks}`),
      context(`크롤링 실패 ${d.crawlFailures}건 · 알림 지연 평균 ${d.avgNotifyLagSec ?? "-"}초 · GEO 비용 누적 ₩${d.geoCostKrw.toLocaleString()}`),
    ],
  };
}

export function weeklyDigest(rows: { channel: string; sent: number; replied: number; meetings: number }[]): SlackMessage {
  const table = rows.map((r) => `• ${r.channel}: 발송 ${r.sent} / 응답 ${r.replied} / 미팅 ${r.meetings}`).join("\n") || "_없음_";
  return { text: "📈 주간 현황", blocks: [section(`*📈 주간 현황 (채널·소개 경로별)*\n${table}`)] };
}

export function systemAlert(text: string): SlackMessage {
  return { text: `🚨 시스템 알림: ${text}`, blocks: [section(`*🚨 시스템 알림*\n${text}`)] };
}

export function listChanges(changes: { name: string; change: string }[]): SlackMessage {
  const list = changes.map((c) => `• ${c.name}: ${c.change}`).join("\n") || "_변경 없음_";
  return { text: `🏥 리스트 변경 ${changes.length}건`, blocks: [section(`*🏥 주간 재조회 변경 (폐업·이전)*\n${list}`)] };
}
