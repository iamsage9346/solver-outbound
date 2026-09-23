"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Stethoscope, Send, Inbox, ListChecks, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/leads", label: "리드", icon: Users },
  { href: "/audits", label: "진단", icon: Stethoscope },
  { href: "/campaigns", label: "캠페인", icon: Send },
  { href: "/inbox", label: "인박스", icon: Inbox },
  { href: "/tasks", label: "태스크", icon: ListChecks },
  { href: "/settings", label: "설정", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-center border-r bg-background py-3">
      <Link href="/leads" className="mb-5 flex size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        S
      </Link>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn("mb-1.5 flex h-[52px] w-14 flex-col items-center justify-center gap-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-accent text-primary")}
          >
            <Icon className="size-5" strokeWidth={1.5} />
            <span className="text-[11px] leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
