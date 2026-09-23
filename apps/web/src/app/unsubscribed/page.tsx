export default function Unsubscribed() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-md border p-6 text-center">
        <div className="mb-2 text-base font-semibold text-heading">수신거부가 처리되었습니다</div>
        <p className="text-[13px] text-muted-foreground">더 이상 솔버의 메일을 보내지 않습니다. 잘못 눌렀다면 이 메일에 회신해 주세요.</p>
      </div>
    </div>
  );
}
