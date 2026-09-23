"use client";
import { useState, useTransition } from "react";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, TIER_LABEL, type LeadStatus, type Tier } from "@solver/shared";
import { updateLeadField } from "@/lib/actions";
import { cn } from "@/lib/utils";

/** 셀 인라인 편집: 저장은 자동, 되돌리기 토스트 우하단 */
export function InlineSelect({ id, field, value, options, className, disabled }: { id: string; field: "status" | "tierOverride"; value: string | null; options: { value: string; label: string }[]; className?: string; disabled?: boolean }) {
  const [v, setV] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <select
      value={v}
      disabled={disabled || pending}
      onChange={(e) => {
        const prev = v;
        const next = e.target.value;
        setV(next);
        start(async () => {
          try {
            await updateLeadField(id, field, next || null);
            showUndo(`저장됨`, async () => {
              setV(prev);
              await updateLeadField(id, field, prev || null);
            });
          } catch (err) {
            setV(prev);
            alert((err as Error).message);
          }
        });
      }}
      className={cn("h-7 rounded-md border bg-background px-1.5 text-[13px] focus:border-primary focus:outline-none disabled:text-muted-foreground", className)}
    >
      {field === "tierOverride" && <option value="">규칙</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const STATUS_OPTIONS = LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s as LeadStatus] }));
export const TIER_OPTIONS = (["T1", "T2", "T3"] as Tier[]).map((t) => ({ value: t, label: TIER_LABEL[t] }));

export function InlineText({ id, field, value, placeholder }: { id: string; field: "owner" | "referrer" | "nextAction" | "homepage"; value: string | null; placeholder?: string }) {
  const [v, setV] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <input
      value={v}
      placeholder={placeholder}
      disabled={pending}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v === (value ?? "")) return;
        const prev = value ?? "";
        start(async () => {
          await updateLeadField(id, field, v);
          showUndo("저장됨", async () => {
            setV(prev);
            await updateLeadField(id, field, prev);
          });
        });
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-7 w-full min-w-[80px] rounded-md border border-transparent bg-transparent px-1.5 text-[13px] hover:border-border focus:border-primary focus:outline-none"
    />
  );
}

export function InlineCheck({ id, value }: { id: string; value: boolean }) {
  const [v, setV] = useState(value);
  const [, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={v}
      onChange={(e) => {
        setV(e.target.checked);
        start(() => updateLeadField(id, "referralPossible", e.target.checked));
      }}
      className="size-4 accent-primary"
    />
  );
}

/* ── 되돌리기 토스트 (우하단) ── */
let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function showUndo(text: string, undo: () => Promise<void>) {
  if (typeof document === "undefined") return;
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-[13px] shadow-[0_4px_12px_rgba(17,24,39,0.06)]";
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = text;
  const btn = document.createElement("button");
  btn.textContent = "되돌리기";
  btn.className = "text-primary hover:underline";
  btn.onclick = () => {
    undo();
    hide();
  };
  toastEl.append(span, btn);
  toastEl.style.display = "flex";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, 5000);
  function hide() {
    if (toastEl) toastEl.style.display = "none";
  }
}
