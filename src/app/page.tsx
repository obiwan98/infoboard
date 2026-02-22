import { DashboardClient } from "@/components/dashboard-client";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden p-3 md:p-4">
      <div className="pointer-events-none absolute inset-0 bg-black/55" />
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[1px]" />
      <div className="relative mx-auto aspect-[9/16] h-[calc(100vh-1.5rem)] max-h-[2560px] w-full max-w-[1440px] md:h-[calc(100vh-2rem)]">
        <DashboardClient />
      </div>
    </div>
  );
}
