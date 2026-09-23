"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { makeReplyDraft, sendReply } from "@/lib/actions";

export function ReplyBox({ messageId }: { messageId: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-heading">답장 초안</div>
        <Button variant="outline" size="xs" disabled={pending} onClick={() => start(async () => setText(await makeReplyDraft(messageId)))}>
          Claude 초안
        </Button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="w-full rounded-md border p-2 text-[13px] leading-relaxed focus:border-primary focus:outline-none" placeholder="e 키 또는 Claude 초안 버튼" />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await sendReply(messageId, text);
              setMsg(r.dryRun ? "답장 (dry-run)" : "답장 발송됨");
              setText("");
            })
          }
        >
          같은 스레드로 답장
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
