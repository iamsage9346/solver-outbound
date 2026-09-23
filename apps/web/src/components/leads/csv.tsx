"use client";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importCsvAction } from "@/lib/csv-actions";

export function CsvButtons({ query }: { query: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/leads/export?${query}`} download>
          <Download data-icon="inline-start" /> CSV 내보내기
        </a>
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
        <Upload data-icon="inline-start" /> 가져오기
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          start(async () => {
            const text = await f.text();
            const r = await importCsvAction(text);
            setMsg(`병합 ${r.merged} · 건너뜀 ${r.skipped}`);
          });
        }}
      />
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </>
  );
}
