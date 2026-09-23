"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveAuditAction, rerunAudit, updateAuditTopFixes } from "@/lib/actions";

export function AuditActions({ auditId, leadId, approved, banned, topFixes }: { auditId: string; leadId: string; approved: boolean; banned: string[]; topFixes: string[] }) {
  const [pending, start] = useTransition();
  const [fixes, setFixes] = useState(topFixes);
  const [msg, setMsg] = useState<string | null>(null);
  const [bannedNow, setBannedNow] = useState(banned);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold text-heading">바로 손볼 3가지</div>
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          value={fixes[i] ?? ""}
          onChange={(e) => setFixes((f) => Object.assign([...f], { [i]: e.target.value }))}
          className="h-8 rounded-md border px-2 text-[13px] focus:border-primary focus:outline-none"
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await updateAuditTopFixes(auditId, fixes);
            setBannedNow(r.banned);
            setMsg(r.banned.length ? `금지어: ${r.banned.join(", ")}` : "저장됨");
          })
        }
      >
        문구 저장 · 금지어 검사
      </Button>
      <div className="my-1 border-t" />
      <div className="text-[13px]">
        금지어 검사: {bannedNow.length ? <span className="text-destructive">{bannedNow.join(", ")}</span> : <span className="text-emerald-700">통과</span>}
      </div>
      {approved ? (
        <div className="status-badge w-fit border-primary text-primary">승인됨</div>
      ) : (
        <Button
          size="sm"
          disabled={pending || bannedNow.length > 0}
          onClick={() =>
            start(async () => {
              const r = await approveAuditAction(auditId);
              setMsg(r.ok ? "승인 → 발송 큐" : (r.reason ?? "실패"));
            })
          }
        >
          승인 (발송 큐로)
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await rerunAudit(leadId);
            setMsg(`재실행 완료 · 금지어 ${r.banned.length}`);
          })
        }
      >
        진단 재실행
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await rerunAudit(leadId, true);
            setMsg("재실행 (GEO 제외)");
          })
        }
      >
        재실행 (GEO 제외)
      </Button>
      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
    </div>
  );
}

export function DeviceToggle({ children }: { children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-1 border-b px-3 text-[13px]">
        <button onClick={() => setMobile(false)} className={!mobile ? "border-b-2 border-primary px-2 py-1 text-primary" : "px-2 py-1 text-muted-foreground"}>
          데스크톱
        </button>
        <button onClick={() => setMobile(true)} className={mobile ? "border-b-2 border-primary px-2 py-1 text-primary" : "px-2 py-1 text-muted-foreground"}>
          모바일
        </button>
      </div>
      <div className="flex flex-1 justify-center overflow-auto bg-canvas p-4">
        <div className="overflow-hidden border bg-background" style={{ width: mobile ? 390 : 820, height: "fit-content" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
