"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { completeTask } from "@/lib/actions";

export function DoneButtons({ taskId, type }: { taskId: string; type: string }) {
  const [pending, start] = useTransition();
  const outcomes = type === "call" ? ["통화 · 미팅 관심", "통화 · 거절", "부재중", "담당자 전달"] : ["완료"];
  return (
    <div className="flex flex-wrap gap-1">
      {outcomes.map((o) => (
        <Button key={o} variant="outline" size="xs" disabled={pending} onClick={() => start(() => completeTask(taskId, o))}>
          {o}
        </Button>
      ))}
    </div>
  );
}
