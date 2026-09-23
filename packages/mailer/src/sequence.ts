import { DEFAULT_SETTINGS, type EventType, type StopReason } from "@solver/shared";
import { kstDate, kstParts, nextSendSlot, type SlotOptions } from "./slots";

export interface SequenceStep {
  step: number;
  kind: "call" | "email";
  templateKey?: string;
  at: Date;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** D0 발송 시각 기준 시퀀스 계획: D+2 전화 09:00 KST, D+7 재메일, D+14 재접근 (메일은 다음 발송 슬롯) */
export function planSequence(sentAt: Date, cfg: { callAfterDays: number; remailAfterDays: number; reapproachAfterDays: number } = DEFAULT_SETTINGS.followup, slot: SlotOptions = {}): SequenceStep[] {
  // D+N 날짜 자체의 슬롯이 포함되도록 그날 00:00 KST부터 탐색
  const dayStart = (n: number) => kstDate(kstParts(addDays(sentAt, n)).ymd, "00:00");
  return [
    { step: 1, kind: "call", at: kstDate(kstParts(addDays(sentAt, cfg.callAfterDays)).ymd, "09:00") },
    { step: 2, kind: "email", templateKey: "d7_remail", at: nextSendSlot(dayStart(cfg.remailAfterDays), slot) },
    { step: 3, kind: "email", templateKey: "reapproach", at: nextSendSlot(dayStart(cfg.reapproachAfterDays), slot) },
  ];
}

/** 회신·예약·수신거부·바운스 중 하나라도 오면 남은 단계를 즉시 취소 */
export function shouldStopSequence(eventType: EventType): StopReason | null {
  switch (eventType) {
    case "reply":
      return "reply";
    case "booking":
      return "booking";
    case "unsubscribe":
      return "unsubscribe";
    case "bounce":
      return "bounce";
    default:
      return null;
  }
}
