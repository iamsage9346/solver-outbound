import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** PRD 9절: 상단 툴바 56px (뒤로 · 제목 · 우측 액션 2개) → 탭 바 → 좌 320 / 중앙 가변 / 우 320 */
export function Toolbar({ title, back, actions, subtitle }: { title: string; back?: string; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {back && (
        <Link href={back} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-4" strokeWidth={1.5} />
        </Link>
      )}
      <h1 className="text-base font-semibold text-heading">{title}</h1>
      {subtitle && <div className="text-[13px] text-muted-foreground">{subtitle}</div>}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  );
}

export function ThreePane({ left, center, right, leftClassName, rightClassName }: { left?: ReactNode; center: ReactNode; right?: ReactNode; leftClassName?: string; rightClassName?: string }) {
  return (
    <div className="flex min-h-0 flex-1">
      {left !== undefined && <aside className={cn("w-[280px] shrink-0 overflow-y-auto border-r p-4", leftClassName)}>{left}</aside>}
      <main className="min-w-0 flex-1 overflow-auto">{center}</main>
      {right !== undefined && <aside className={cn("w-[320px] shrink-0 overflow-y-auto border-l p-4", rightClassName)}>{right}</aside>}
    </div>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="text-[13px] font-semibold text-heading">{children}</div>
      {action}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3 text-[13px]">
      <div className="shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 text-right text-foreground break-words">{children}</div>
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-[13px] text-muted-foreground">
      {text}
      {action}
    </div>
  );
}
