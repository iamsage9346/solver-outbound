import { LEAD_STATUS_LABEL, TIER_LABEL, REPLY_CLASS_LABEL, type LeadStatus, type Tier, type ReplyClass } from "@solver/shared";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<LeadStatus, string> = {
  listed: "border-border text-muted-foreground",
  audited: "border-border text-foreground",
  queued: "border-primary/40 text-primary",
  sent: "border-primary text-primary",
  replied: "border-emerald-500 text-emerald-700",
  meeting: "border-emerald-600 text-emerald-700",
  proposal: "border-heading text-heading",
  won: "border-heading bg-heading text-white",
  hold: "border-border text-muted-foreground",
  unsubscribed: "border-destructive text-destructive",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={cn("status-badge", STATUS_COLOR[status])}>{LEAD_STATUS_LABEL[status]}</span>;
}

export function TierBadge({ tier, override }: { tier: Tier | null; override?: Tier | null }) {
  const t = override ?? tier;
  if (!t) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("status-badge", t === "EXCLUDED" ? "border-border text-muted-foreground line-through" : t === "T1" ? "border-primary text-primary" : "border-border text-foreground")} title={override ? "담당 수정" : "규칙 자동"}>
      {TIER_LABEL[t]}
      {override && "*"}
    </span>
  );
}

export function ReplyBadge({ c }: { c: ReplyClass | null }) {
  if (!c) return <span className="status-badge border-border text-muted-foreground">미분류</span>;
  const color = c === "positive" ? "border-emerald-500 text-emerald-700" : c === "unsubscribe" || c === "bounce" ? "border-destructive text-destructive" : c === "negative" ? "border-border text-muted-foreground" : "border-border text-foreground";
  return <span className={cn("status-badge", color)}>{REPLY_CLASS_LABEL[c]}</span>;
}
