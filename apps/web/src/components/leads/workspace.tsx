"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeadRow } from "@/lib/queries";
import { getLeadSummary } from "@/lib/actions";
import { LeadsTable } from "./table";
import { PanelTitle, Field } from "@/components/shell/page";
import { StatusBadge, TierBadge } from "@/components/shell/badges";
import { Button } from "@/components/ui/button";
import { EVENT_LABEL } from "@/lib/labels";
import { fmtRel } from "@/lib/format";

type Summary = Awaited<ReturnType<typeof getLeadSummary>>;

/** 중앙 테이블 + 우측 요약. 행 선택은 클라이언트 상태로 즉시 반영하고 URL은 replaceState로만 동기화 (서버 재렌더 없음) */
export function LeadsWorkspace({ rows, initialSel }: { rows: LeadRow[]; initialSel: string | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(initialSel);
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [pending, start] = useTransition();
  const row = rows.find((r) => r.lead.id === sel) ?? null;

  useEffect(() => {
    if (!sel || summary[sel]) return;
    start(async () => {
      const s = await getLeadSummary(sel);
      setSummary((m) => ({ ...m, [sel]: s }));
    });
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(id: string) {
    setSel(id);
    const u = new URL(window.location.href);
    u.searchParams.set("sel", id);
    window.history.replaceState(window.history.state, "", u.toString());
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
      const idx = rows.findIndex((r) => r.lead.id === sel);
      if (e.key === "j" || e.key === "k") {
        const next = rows[Math.min(rows.length - 1, Math.max(0, idx + (e.key === "j" ? 1 : -1)))];
        if (next) select(next.lead.id);
      } else if (e.key === "Enter" && sel) router.push(`/leads/${sel}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <main className="min-w-0 flex-1 overflow-auto">
        <LeadsTable rows={rows} selected={sel} onSelect={select} />
      </main>
      <aside className="w-[320px] shrink-0 overflow-y-auto border-l p-4">
        {row ? <Summary row={row} s={summary[row.lead.id]} loading={pending && !summary[row.lead.id]} /> : <div className="text-[13px] text-muted-foreground">행을 선택하면 요약이 표시됩니다. j/k로 이동, Enter로 열기.</div>}
      </aside>
    </div>
  );
}

function Summary({ row, s, loading }: { row: LeadRow; s?: Summary; loading: boolean }) {
  const l = row.lead;
  return (
    <div>
      <PanelTitle
        action={
          <Button variant="outline" size="xs" asChild>
            <Link href={`/leads/${l.id}`}>열기</Link>
          </Button>
        }
      >
        {l.name}
      </PanelTitle>
      <div className="mb-3 flex gap-1.5">
        <StatusBadge status={l.status} />
        <TierBadge tier={l.tier} override={l.tierOverride} />
      </div>
      <Field label="주소">{l.address ?? "—"}</Field>
      <Field label="이메일">{row.email ?? (l.emailManualCheck ? <span className="text-destructive">수동 확인 필요</span> : "없음 · 전화 우선")}</Field>
      <Field label="전화">{row.phone ?? "—"}</Field>
      <Field label="문의폼">{row.form ? <a className="text-primary hover:underline" href={row.form} target="_blank">{row.form.replace(/^https?:\/\//, "").slice(0, 28)}</a> : "—"}</Field>
      <Field label="홈페이지">{l.homepage ? <a className="text-primary hover:underline" href={l.homepage} target="_blank">{l.homepage.replace(/^https?:\/\//, "").slice(0, 28)}</a> : "없음"}{l.homepageAutoFound && <span className="ml-1 text-xs text-muted-foreground">자동 발견</span>}</Field>
      <div className="my-3 border-t" />
      <PanelTitle>진단 점수</PanelTitle>
      {loading ? (
        <div className="mb-3 grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-md border bg-muted" />)}</div>
      ) : s?.audit?.scores ? (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          {(["place", "site", "geo"] as const).map((k) => (
            <div key={k} className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">{{ place: "플레이스", site: "홈페이지", geo: "GEO" }[k]}</div>
              <div className="text-lg font-semibold tabular text-heading">{s.audit!.scores![k] ?? "—"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-3 text-[13px] text-muted-foreground">진단 전</div>
      )}
      {s?.audit?.topFixes?.length ? (
        <ol className="mb-3 list-decimal pl-4 text-[13px]">
          {s.audit.topFixes.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      ) : null}
      <div className="my-3 border-t" />
      <PanelTitle>최근 활동</PanelTitle>
      {loading && <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />}
      {!loading && (!s || s.events.length === 0) && <div className="text-[13px] text-muted-foreground">없음</div>}
      {s?.events.map((e) => (
        <div key={e.id} className="mb-1.5 flex justify-between text-[13px]">
          <span>{EVENT_LABEL[e.type] ?? e.type}{typeof e.payload.link === "string" && ` · ${e.payload.link}`}</span>
          <span className="text-muted-foreground">{fmtRel(e.occurredAt)}</span>
        </div>
      ))}
    </div>
  );
}
