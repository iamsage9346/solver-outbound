import Link from "next/link";
import { Toolbar } from "@/components/shell/page";
import { DoneButtons } from "@/components/tasks/done";
import { listTasks } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { TASK_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const status = sp.s === "done" ? "done" : "open";
  const rows = await listTasks(status);
  const now = Date.now();
  return (
    <>
      <Toolbar
        title="태스크"
        subtitle={`${rows.length}건`}
        actions={
          <>
            <Link href="/tasks" className={cn("text-[13px]", status === "open" ? "text-primary" : "text-muted-foreground")}>
              열림
            </Link>
            <Link href="/tasks?s=done" className={cn("text-[13px]", status === "done" ? "text-primary" : "text-muted-foreground")}>
              완료
            </Link>
          </>
        }
      />
      <div className="flex-1 overflow-auto">
        {rows.length === 0 && <div className="flex h-[240px] items-center justify-center text-[13px] text-muted-foreground">태스크가 없습니다. D+2 전화 태스크는 매일 09:00 워커가 만듭니다.</div>}
        {rows.map(({ task: t, lead, phone }) => (
          <div key={t.id} className={cn("flex items-start gap-4 border-b px-4 py-3", t.dueAt.getTime() < now && status === "open" && "bg-canvas")}>
            <div className="w-32 shrink-0 text-xs text-muted-foreground tabular">{fmtDate(t.dueAt, true)}</div>
            <span className="status-badge shrink-0 border-border text-muted-foreground">{TASK_LABEL[t.type]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-heading">
                <Link href={`/leads/${lead.id}`} className="font-medium hover:text-primary">
                  {lead.name}
                </Link>
                <span className="ml-2 text-foreground">{t.title}</span>
                {phone && t.type === "call" && <span className="ml-2 tabular text-primary">{phone}</span>}
              </div>
              {t.script && <pre className="mt-1.5 whitespace-pre-wrap rounded-md border p-2 font-sans text-xs">{t.script}</pre>}
              {t.outcome && <div className="mt-1 text-xs text-muted-foreground">결과: {t.outcome}</div>}
            </div>
            {status === "open" && (
              <div className="shrink-0">
                <DoneButtons taskId={t.id} type={t.type} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
