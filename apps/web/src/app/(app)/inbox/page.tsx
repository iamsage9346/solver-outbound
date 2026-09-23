import Link from "next/link";
import { REPLY_CLASSES, REPLY_CLASS_LABEL } from "@solver/shared";
import { Toolbar, ThreePane, PanelTitle, Field } from "@/components/shell/page";
import { ReplyBadge, StatusBadge } from "@/components/shell/badges";
import { ReplyBox } from "@/components/inbox/reply";
import { getThread, listInboxMessages } from "@/lib/queries";
import { fmtDate, fmtRel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const filter = typeof sp.f === "string" ? sp.f : undefined;
  const rows = await listInboxMessages(filter);
  const selId = typeof sp.m === "string" ? sp.m : rows[0]?.message.id;
  const sel = rows.find((r) => r.message.id === selId) ?? null;
  const thread = sel?.message.gmailThreadId ? await getThread(sel.message.gmailThreadId) : sel ? [sel.message] : [];
  const F = ({ id, label }: { id?: string; label: string }) => (
    <Link href={id ? `/inbox?f=${id}` : "/inbox"} className={cn("mb-1 block rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", filter === id && "bg-accent text-primary")}>
      {label}
    </Link>
  );
  return (
    <>
      <Toolbar title="인박스" subtitle={`${rows.length}건`} />
      <ThreePane
        left={
          <div>
            <PanelTitle>분류</PanelTitle>
            <F label="전체" />
            {REPLY_CLASSES.map((c) => (
              <F key={c} id={c} label={REPLY_CLASS_LABEL[c]} />
            ))}
            <F id="unmatched" label="미매칭" />
            <div className="my-3 border-t" />
            <PanelTitle>스레드</PanelTitle>
            {rows.length === 0 && <div className="text-[13px] text-muted-foreground">회신이 없습니다. 워커가 60초마다 Gmail을 폴링합니다.</div>}
            {rows.map(({ message: m, lead }) => (
              <Link key={m.id} href={`/inbox?${filter ? `f=${filter}&` : ""}m=${m.id}`} className={cn("mb-1 block rounded-md border px-2.5 py-2 hover:bg-muted", m.id === selId && "border-primary")}>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium text-heading">{lead?.name ?? m.from}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtRel(m.receivedAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <ReplyBadge c={m.classification} />
                  <span className="truncate text-xs text-muted-foreground">{m.summary ?? m.subject}</span>
                </div>
              </Link>
            ))}
          </div>
        }
        center={
          sel ? (
            <div className="mx-auto max-w-[760px] p-6">
              {thread.map((m) => (
                <div key={m.id} className={cn("mb-4 rounded-md border p-4", m.direction === "out" && "bg-canvas")}>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {m.direction === "out" ? "→ " : "← "}
                      {m.direction === "out" ? m.to : m.from}
                    </span>
                    <span>{fmtDate(m.sentAt ?? m.receivedAt ?? m.createdAt, true)}</span>
                  </div>
                  <div className="mb-2 text-[14px] font-medium text-heading">{m.subject}</div>
                  <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{m.body}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">스레드를 선택하세요.</div>
          )
        }
        right={
          sel ? (
            <div>
              {sel.lead && (
                <>
                  <PanelTitle
                    action={
                      <Link href={`/leads/${sel.lead.id}`} className="text-xs text-primary hover:underline">
                        리드 열기
                      </Link>
                    }
                  >
                    {sel.lead.name}
                  </PanelTitle>
                  <div className="mb-2">
                    <StatusBadge status={sel.lead.status} />
                  </div>
                  <Field label="분류">{sel.message.classification ? REPLY_CLASS_LABEL[sel.message.classification] : "—"}</Field>
                  <Field label="요약">{sel.message.summary ?? "—"}</Field>
                  {sel.message.proposedTimes?.length ? <Field label="제안 시간">{sel.message.proposedTimes.join(", ")}</Field> : null}
                  <div className="my-3 border-t" />
                </>
              )}
              {!sel.lead && <div className="mb-3 rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive">미매칭 메일 · 발신 도메인으로 병원을 찾지 못했습니다.</div>}
              <ReplyBox messageId={sel.message.id} />
            </div>
          ) : undefined
        }
      />
    </>
  );
}
