import { DashboardClient } from "@/components/dashboard-client";

export default function DashboardPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(120%_90%_at_0%_0%,#fdf2f8_0%,#eef6ff_45%,#eefaf3_100%)] p-3 md:p-4">
      <div className="pointer-events-none absolute -left-20 top-8 h-72 w-72 rounded-full bg-rose-200/45 blur-3xl" />
      <div className="pointer-events-none absolute right-8 top-1/4 h-80 w-80 rounded-full bg-sky-200/45 blur-3xl" />
      <div className="pointer-events-none absolute bottom-6 left-1/3 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-white/25" />
      <div className="relative mx-auto aspect-[9/16] h-[calc(100vh-1.5rem)] max-h-[2560px] w-full max-w-[1440px] md:h-[calc(100vh-2rem)]">
        <DashboardClient />
      </div>
    </div>
  );
}
