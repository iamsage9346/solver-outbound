"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addContact, addNote, createCallTask, pauseSequence, recrawl, resumeSequence } from "@/lib/actions";

export function AddContactForm({ leadId }: { leadId: string }) {
  const [v, setV] = useState("");
  const [type, setType] = useState<"email" | "phone" | "person">("email");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await addContact(leadId, type, v, type === "person" ? "director" : "general");
          setV("");
        });
      }}
    >
      <select value={type} onChange={(e) => setType(e.target.value as never)} className="h-7 rounded-md border bg-background px-1 text-xs">
        <option value="email">이메일</option>
        <option value="phone">전화</option>
        <option value="person">원장명</option>
      </select>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="담당이 확인한 값" className="h-7 flex-1 rounded-md border px-2 text-xs focus:border-primary focus:outline-none" />
      <Button type="submit" size="xs" variant="outline" disabled={pending || !v}>
        추가
      </Button>
    </form>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await addNote(leadId, v);
          setV("");
        });
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="메모 (송원장 메모, 통화 내용, 청구 삭감 고충…)" className="h-8 flex-1 rounded-md border px-2 text-[13px] focus:border-primary focus:outline-none" />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !v}>
        남기기
      </Button>
    </form>
  );
}

export function DetailButtons({ leadId, seqState }: { leadId: string; seqState: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => createCallTask(leadId, "전화 팔로업"))}>
        전화 태스크 만들기
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => recrawl(leadId))}>
        다시 크롤링
      </Button>
      {seqState === "stopped" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => resumeSequence(leadId))}>
          시퀀스 재개
        </Button>
      )}
      {seqState === "active" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => pauseSequence(leadId))}>
          시퀀스 일시정지
        </Button>
      )}
    </div>
  );
}
