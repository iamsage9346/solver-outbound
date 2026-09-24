"use client";
import { useRef } from "react";
import Link from "next/link";
import type { LeadRow } from "@/lib/queries";
import { InlineSelect, InlineText, InlineCheck, STATUS_OPTIONS, TIER_OPTIONS } from "./inline";
import { TierBadge } from "@/components/shell/badges";
import { years } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 리드 테이블: 행 높이 40px. 선택은 부모(LeadsWorkspace)가 관리 */
export function LeadsTable({ rows, selected, onSelect }: { rows: LeadRow[]; selected: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLTableElement>(null);
  const select = onSelect;

  if (rows.length === 0) return <div className="flex h-[240px] items-center justify-center text-[13px] text-muted-foreground">조건에 맞는 리드가 없습니다. 좌측 필터를 바꾸거나 CLI로 리스트업하세요.</div>;

  return (
    <table ref={ref} className="min-w-max w-full border-collapse text-[13px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="h-10 border-b text-left text-xs font-medium text-muted-foreground">
          <th className="pl-4 pr-2 min-w-[180px]">병원명</th>
          <th className="px-2">지역</th>
          <th className="px-2">종별</th>
          <th className="px-2 text-right">개원</th>
          <th className="px-2 text-right">의사</th>
          <th className="px-2 text-right">직원(추정)</th>
          <th className="px-2 text-right">플레이스</th>
          <th className="px-2 text-right">리뷰</th>
          <th className="px-2 text-right">GEO</th>
          <th className="px-2">컨택</th>
          <th className="px-2">Tier</th>
          <th className="px-2">소개</th>
          <th className="px-2">담당</th>
          <th className="px-2">상태</th>
          <th className="px-2">다음 액션</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ lead: l, email, phone, form, audited, approved }) => (
          <tr key={l.id} onClick={() => select(l.id)} className={cn("h-10 cursor-pointer border-b hover:bg-muted/60", selected === l.id && "bg-accent/60", l.tier === "EXCLUDED" && "text-muted-foreground")}>
            <td className="pl-4 pr-2">
              <Link href={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-heading hover:text-primary">
                {l.name}
              </Link>
              {audited && <span className={cn("ml-1.5 text-[10px]", approved ? "text-primary" : "text-muted-foreground")}>{approved ? "승인" : "진단"}</span>}
            </td>
            <td className="px-2 whitespace-nowrap">{[l.sggu, l.emd].filter(Boolean).join(" ")}</td>
            <td className="px-2">{l.clName ?? l.clCd ?? "—"}</td>
            <td className="px-2 text-right tabular">{years(l.estDate) ? `${years(l.estDate)}년` : "—"}</td>
            <td className="px-2 text-right tabular">{l.doctorCnt ?? "—"}</td>
            <td className="px-2 text-right tabular">{l.staffEst != null ? `${l.staffEst} 추정` : "—"}</td>
            <td className="px-2 text-right tabular">{l.placeRank != null ? `${l.placeRank}위` : "—"}</td>
            <td className="px-2 text-right tabular">{l.reviewCnt ?? "—"}</td>
            <td className="px-2 text-right tabular">{l.geoScore ?? "—"}</td>
            <td className="px-2 whitespace-nowrap">
              {email ? <span title={email}>✉︎</span> : l.emailManualCheck ? <span className="text-destructive" title="수집거부 도메인 · 수동 확인">✉︎?</span> : <span className="text-muted-foreground" title="이메일 없음">—</span>}
              {phone && <span className="ml-1" title={phone}>☎</span>}
              {form && <span className="ml-1" title={form}>▤</span>}
              {l.phoneFirst && <span className="ml-1.5 text-[10px] text-muted-foreground">전화 우선</span>}
            </td>
            <td className="px-2" onClick={(e) => e.stopPropagation()}>
              {l.tier === "EXCLUDED" ? (
                <TierBadge tier={l.tier} />
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <TierBadge tier={l.tier} override={l.tierOverride} />
                  <InlineSelect id={l.id} field="tierOverride" value={l.tierOverride} options={TIER_OPTIONS} className="h-6 text-xs text-muted-foreground" />
                </span>
              )}
            </td>
            <td className="px-2" onClick={(e) => e.stopPropagation()}>
              <InlineCheck id={l.id} value={l.referralPossible} />
            </td>
            <td className="px-2" onClick={(e) => e.stopPropagation()}>
              <InlineText id={l.id} field="owner" value={l.owner} placeholder="—" />
            </td>
            <td className="px-2" onClick={(e) => e.stopPropagation()}>
              <InlineSelect id={l.id} field="status" value={l.status} options={STATUS_OPTIONS} />
            </td>
            <td className="px-2" onClick={(e) => e.stopPropagation()}>
              <InlineText id={l.id} field="nextAction" value={l.nextAction} placeholder="—" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
