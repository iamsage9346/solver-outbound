import Link from "next/link";
import { notFound } from "next/navigation";
import { Toolbar, ThreePane, PanelTitle, Field } from "@/components/shell/page";
import { StatusBadge, TierBadge, ReplyBadge } from "@/components/shell/badges";
import { InlineSelect, STATUS_OPTIONS, TIER_OPTIONS } from "@/components/leads/inline";
import { AddContactForm, DetailButtons, NoteForm } from "@/components/leads/detail-actions";
import { Button } from "@/components/ui/button";
import { getLeadDetail } from "@/lib/queries";
import { fmtDate, years } from "@/lib/format";
import { CONTACT_ROLE_LABEL, CONTACT_SOURCE_LABEL, EVENT_LABEL, SEQ_STATE_LABEL, STOP_LABEL, TASK_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function LeadDetail({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const d = await getLeadDetail(id);
  if (!d) notFound();
  const { lead } = d;
  const seq = d.sequences[0] ?? null;

  type Item = { at: Date; kind: string; title: string; body?: string | null; badge?: React.ReactNode };
  const timeline: Item[] = [
    ...d.messages.map((m) => ({ at: m.sentAt ?? m.receivedAt ?? m.createdAt, kind: m.direction === "out" ? "발송" : "회신", title: `${m.direction === "out" ? "→" : "←"} ${m.subject ?? ""}${m.isTest ? " (테스트)" : ""}${m.dryRun ? " (dry-run)" : ""}`, body: m.direction === "in" ? m.summary ?? m.body?.slice(0, 200) : null, badge: m.direction === "in" ? <ReplyBadge c={m.classification} /> : undefined })),
    ...d.events.filter((e) => e.type !== "reply").map((e) => ({ at: e.occurredAt, kind: EVENT_LABEL[e.type] ?? e.type, title: `${EVENT_LABEL[e.type] ?? e.type}${typeof e.payload.link === "string" ? ` · ${e.payload.link} 링크` : ""}`, body: e.notifiedAt ? `Slack 알림 ${Math.round((e.notifiedAt.getTime() - e.occurredAt.getTime()) / 1000)}초` : null })),
    ...d.tasks.map((t) => ({ at: t.dueAt, kind: "태스크", title: `${TASK_LABEL[t.type]} · ${t.title} (${t.status === "done" ? "완료" : t.status === "cancelled" ? "취소" : "예정"})`, body: t.script })),
    ...d.notes.map((n) => ({ at: n.createdAt, kind: "메모", title: `${n.author}`, body: n.body })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <Toolbar
        title={lead.name}
        back="/leads"
        subtitle={
          <span className="flex gap-1.5">
            <StatusBadge status={lead.status} />
            <TierBadge tier={lead.tier} override={lead.tierOverride} />
          </span>
        }
        actions={
          <>
            {d.audit?.landingToken && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/report/${d.audit.landingToken}`} target="_blank">
                  리포트 보기
                </Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link href={`/campaigns?lead=${lead.id}`}>메일 초안</Link>
            </Button>
          </>
        }
      />
      <ThreePane
        left={
          <div>
            <PanelTitle>기본 정보</PanelTitle>
            <Field label="ykiho">{lead.ykiho ?? "—"}</Field>
            <Field label="종별">{lead.clName ?? "—"}</Field>
            <Field label="주소">{lead.address ?? "—"}</Field>
            <Field label="개설">{lead.estDate ? `${fmtDate(lead.estDate)} (${years(lead.estDate)}년차)` : "—"}</Field>
            <Field label="의사 수">{lead.doctorCnt ?? "—"}</Field>
            <Field label="직원 수">{lead.staffEst != null ? `${lead.staffEst}명 (추정)` : "—"}</Field>
            <Field label="진료과목">{lead.deptTags.join(", ") || "—"}</Field>
            <Field label="홈페이지">{lead.homepage ? <a href={lead.homepage} target="_blank" className="text-primary hover:underline">{lead.homepage.replace(/^https?:\/\//, "")}</a> : "없음"}{lead.homepageAutoFound && " (자동 발견)"}</Field>
            <Field label="유입">{lead.utmSource ?? "—"}</Field>
            <div className="my-3 border-t" />
            <PanelTitle>컨택 (우선순위 순)</PanelTitle>
            {lead.emailManualCheck && <div className="mb-2 rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive">이메일무단수집거부 도메인 · 담당이 직접 확인해 입력하세요</div>}
            {d.contacts.length === 0 && <div className="mb-2 text-[13px] text-muted-foreground">없음</div>}
            {d.contacts.map((c) => (
              <div key={c.id} className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate">
                  <span className="mr-1 text-muted-foreground">{{ email: "✉︎", phone: "☎", form: "▤", person: "👤" }[c.type]}</span>
                  {c.value}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {CONTACT_ROLE_LABEL[c.role]} · {CONTACT_SOURCE_LABEL[c.source]}
                  {c.isPersonal && " · 개인"}
                </span>
              </div>
            ))}
            <div className="mt-2">
              <AddContactForm leadId={lead.id} />
            </div>
            <div className="my-3 border-t" />
            <PanelTitle>진단 3축</PanelTitle>
            {d.audit?.scores ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                {(["place", "site", "geo"] as const).map((k) => (
                  <div key={k} className="rounded-md border p-2">
                    <div className="text-[11px] text-muted-foreground">{{ place: "플레이스", site: "홈페이지", geo: "GEO" }[k]}</div>
                    <div className="text-lg font-semibold tabular text-heading">{d.audit!.scores![k] ?? "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-muted-foreground">진단 전</div>
            )}
            {d.crawl?.summary && (
              <>
                <div className="my-3 border-t" />
                <PanelTitle>홈페이지 요약</PanelTitle>
                <p className="text-[13px] leading-relaxed">{d.crawl.summary}</p>
                {d.crawl.services.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{d.crawl.services.join(" · ")}</div>}
              </>
            )}
          </div>
        }
        center={
          <div className="p-4">
            <div className="mb-4">
              <NoteForm leadId={lead.id} />
            </div>
            {timeline.length === 0 && <div className="py-12 text-center text-[13px] text-muted-foreground">아직 활동이 없습니다.</div>}
            <ol className="relative border-l pl-4">
              {timeline.map((t, i) => (
                <li key={i} className="mb-4">
                  <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full border bg-background" />
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-xs text-muted-foreground">{fmtDate(t.at, true)}</span>
                    <span className="status-badge border-border text-muted-foreground">{t.kind}</span>
                    {t.badge}
                  </div>
                  <div className="mt-0.5 text-[13px] text-heading">{t.title}</div>
                  {t.body && <pre className="mt-1 whitespace-pre-wrap rounded-md border bg-canvas p-2 font-sans text-xs text-foreground">{t.body}</pre>}
                </li>
              ))}
            </ol>
          </div>
        }
        right={
          <div>
            <PanelTitle>다음 액션</PanelTitle>
            <div className="mb-2 text-[13px]">{lead.nextAction ?? "—"}{lead.nextActionAt && <span className="ml-1 text-muted-foreground">{fmtDate(lead.nextActionAt, true)}</span>}</div>
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              <InlineSelect id={lead.id} field="status" value={lead.status} options={STATUS_OPTIONS} className="w-full" />
              <InlineSelect id={lead.id} field="tierOverride" value={lead.tierOverride} options={TIER_OPTIONS} className="w-full" disabled={lead.tier === "EXCLUDED"} />
            </div>
            <DetailButtons leadId={lead.id} seqState={seq?.state ?? null} />
            <div className="my-3 border-t" />
            <PanelTitle>시퀀스</PanelTitle>
            {seq ? (
              <>
                <Field label="상태">{SEQ_STATE_LABEL[seq.state]}{seq.stopReason && ` (${STOP_LABEL[seq.stopReason]})`}</Field>
                <Field label="단계">{["D0 발송", "D+2 전화", "D+7 재메일", "2주 후 재접근"][seq.currentStep] ?? seq.currentStep}</Field>
                <Field label="다음">{fmtDate(seq.nextStepAt, true)}</Field>
              </>
            ) : (
              <div className="text-[13px] text-muted-foreground">발송 전</div>
            )}
            <div className="my-3 border-t" />
            <PanelTitle>소개</PanelTitle>
            <Field label="소개 가능">{lead.referralPossible ? "예" : "아니오"}</Field>
            <Field label="소개자">{lead.referrer ?? "—"}</Field>
            <Field label="담당">{lead.owner ?? "—"}</Field>
            {lead.excludedReason && <div className="mt-3 text-xs text-destructive">제외/억제 사유: {lead.excludedReason}</div>}
          </div>
        }
      />
    </>
  );
}
