"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { previewMail, sendNow, sendTestMail } from "@/lib/actions";

type Preview = Awaited<ReturnType<typeof previewMail>>;

export function QueuePanel({ leadId, leadName, hasTestSend }: { leadId: string | null; leadName: string | null; hasTestSend: boolean }) {
  const [p, setP] = useState<Preview | null>(null);
  const [mobile, setMobile] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!leadId) return <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">좌측 큐에서 리드를 선택하세요.</div>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-1 border-b px-3 text-[13px]">
        <span className="mr-2 font-semibold text-heading">{leadName}</span>
        <Button variant="outline" size="xs" disabled={pending} onClick={() => start(async () => setP(await previewMail(leadId)))}>
          초안 생성 · 미리보기
        </Button>
        <span className="ml-auto" />
        <button onClick={() => setMobile(false)} className={!mobile ? "border-b-2 border-primary px-2 py-1 text-primary" : "px-2 py-1 text-muted-foreground"}>
          데스크톱
        </button>
        <button onClick={() => setMobile(true)} className={mobile ? "border-b-2 border-primary px-2 py-1 text-primary" : "px-2 py-1 text-muted-foreground"}>
          모바일
        </button>
      </div>
      <div className="flex flex-1 justify-center overflow-auto bg-canvas p-4">
        {p ? (
          <div className="border bg-background p-6 text-[14px] leading-relaxed" style={{ width: mobile ? 390 : 680 }}>
            <div className="mb-3 border-b pb-3 text-[13px] text-muted-foreground">
              <div>To: {p.to || <span className="text-destructive">없음</span>}</div>
              <div className="text-heading">Subject: {p.subject}</div>
              {p.attachments.length > 0 && <div>첨부: {p.attachments.join(", ")}</div>}
            </div>
            <pre className="whitespace-pre-wrap font-sans">{p.text}</pre>
          </div>
        ) : (
          <div className="self-center text-[13px] text-muted-foreground">초안 생성을 누르면 Claude가 첫 문장을 만들고 변수를 채웁니다.</div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-2 text-[13px]">
        {p && (p.ok ? <span className="text-emerald-700">발송 가능</span> : <span className="text-destructive">차단: {p.reasons.join(" · ")}</span>)}
        <span className="ml-auto" />
        <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="테스트 수신 주소" className="h-7 w-48 rounded-md border px-2 text-xs focus:border-primary focus:outline-none" />
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !testTo || !p}
          onClick={() =>
            start(async () => {
              const r = await sendTestMail(leadId, testTo);
              setMsg(r.sent ? "테스트 발송됨" : (r.reason ?? "실패"));
            })
          }
        >
          테스트 발송
        </Button>
        <Button
          size="sm"
          disabled={pending || !p?.ok || !hasTestSend}
          title={!hasTestSend ? "테스트 발송 후 활성화" : undefined}
          onClick={() =>
            start(async () => {
              const r = await sendNow(leadId);
              setMsg(r.sent ? `발송됨${"dryRun" in r && r.dryRun ? " (dry-run)" : ""}` : (r.reason ?? "실패"));
            })
          }
        >
          발송하기
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
