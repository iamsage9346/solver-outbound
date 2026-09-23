/** PRD 4절: 리드 상태 값 고정 */
export const LEAD_STATUSES = [
  "listed", // 리스트업
  "audited", // 진단완료
  "queued", // 발송대기
  "sent", // 발송
  "replied", // 응답
  "meeting", // 미팅
  "proposal", // 제안
  "won", // 계약
  "hold", // 보류
  "unsubscribed", // 수신거부
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  listed: "리스트업",
  audited: "진단완료",
  queued: "발송대기",
  sent: "발송",
  replied: "응답",
  meeting: "미팅",
  proposal: "제안",
  won: "계약",
  hold: "보류",
  unsubscribed: "수신거부",
};

export const TIERS = ["T1", "T2", "T3", "EXCLUDED"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  T1: "Tier 1",
  T2: "Tier 2",
  T3: "Tier 3",
  EXCLUDED: "제외",
};

export const CONTACT_TYPES = ["email", "phone", "form", "person"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_ROLES = ["director", "representative", "admin", "general"] as const; // 원장·대표·행정실장·대표메일
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_SOURCES = ["hira", "crawl", "manual", "form"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const SEQUENCE_STATES = ["active", "paused", "stopped", "done"] as const;
export type SequenceState = (typeof SEQUENCE_STATES)[number];

export const MESSAGE_DIRECTIONS = ["out", "in"] as const;

/** PRD 8절: 회신 자동 분류 8종 */
export const REPLY_CLASSES = [
  "positive",
  "question",
  "forward",
  "negative",
  "unsubscribe",
  "auto_reply",
  "bounce",
  "other",
] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];
export const REPLY_CLASS_LABEL: Record<ReplyClass, string> = {
  positive: "긍정",
  question: "질문",
  forward: "담당자 전달",
  negative: "부정",
  unsubscribe: "수신거부",
  auto_reply: "부재중",
  bounce: "바운스",
  other: "기타",
};

export const EVENT_TYPES = [
  "open",
  "click",
  "reply",
  "bounce",
  "unsubscribe",
  "form",
  "booking",
  "call",
  "note",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const TASK_TYPES = ["call", "email", "meeting", "proposal"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_STATUSES = ["open", "done", "cancelled"] as const;

export const CAMPAIGN_HOOKS = ["GEO", "AI_EDU", "REFERRAL"] as const;

/** 시퀀스 중단 사유 */
export const STOP_REASONS = ["reply", "booking", "unsubscribe", "bounce", "manual"] as const;
export type StopReason = (typeof STOP_REASONS)[number];
