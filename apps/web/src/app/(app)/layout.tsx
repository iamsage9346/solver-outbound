import { Nav } from "@/components/shell/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-screen">
      <Nav />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
