"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
};

const NAV_ITEMS: NavigationItem[] = [
  { href: "/verticalMovie", label: "vertical", shortLabel: "VM" },
  { href: "/horizontalMovie", label: "horizon", shortLabel: "HM" },
  { href: "/dashboard", label: "dashboard", shortLabel: "DB" },
  { href: "/playerLogs", label: "log", shortLabel: "LOG" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function EdgeNavigation() {
  const pathname = usePathname();

  return (
    <aside className="pointer-events-none fixed inset-y-0 left-0 z-50 flex items-center">
      <div className="pointer-events-auto group relative h-[min(78vh,760px)] w-72">
        <div className="absolute inset-y-0 left-0 w-4" aria-hidden="true" />
        <nav
          aria-label="Page navigation"
          className="flex h-full w-full -translate-x-[calc(100%-0.25rem)] flex-col justify-between rounded-r-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,18,31,0.96),rgba(6,12,22,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl transition-transform duration-300 ease-out group-hover:translate-x-0 focus-within:translate-x-0"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-sky-200/55">Pages</p>
            <p className="mt-2 text-sm leading-6 text-slate-300/80">자주 쓰는 화면을 빠르게 전환합니다.</p>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
                    active
                      ? "border-sky-300/35 bg-sky-300/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-white/6 bg-white/[0.03] text-slate-300/88 hover:border-sky-200/20 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tracking-[0.24em] ${
                      active
                        ? "bg-sky-300/18 text-sky-100"
                        : "bg-slate-200/[0.06] text-slate-300/75 group-hover:bg-sky-200/10 group-hover:text-sky-100"
                    }`}
                  >
                    {item.shortLabel}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <p className="mt-1 text-[11px] tracking-[0.22em] text-slate-400/70">{item.href}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-6 text-[11px] leading-5 text-slate-400/72">왼쪽 가장자리에 마우스를 올리면 메뉴가 열립니다.</p>
        </nav>
      </div>
    </aside>
  );
}
