import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { audits } from "@solver/db";
import { Report, type ReportData } from "@solver/report";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 병원별 리포트 랜딩 (추적용 고유 링크). PDF와 같은 HTML을 렌더링한다. */
export default async function ReportLanding({ params }: PageProps<"/report/[token]">) {
  const { token } = await params;
  const audit = await db.query.audits.findFirst({ where: eq(audits.landingToken, token) });
  if (!audit) notFound();
  const json = await readFile(join(process.cwd(), "..", "..", "storage", "reports", `${token}.json`), "utf8").catch(() => null);
  if (!json) notFound();
  const data = JSON.parse(json) as ReportData;
  return (
    <div className="min-h-screen bg-canvas py-8">
      <div className="mx-auto w-fit max-w-full overflow-auto border bg-white">
        <Report d={data} />
      </div>
      <div className="mx-auto mt-4 max-w-[794px] text-center text-xs text-muted-foreground">이 페이지는 {data.hospitalName} 전용 진단 링크입니다. 문의: {data.sender.contact}</div>
    </div>
  );
}
