"use client";

import dynamic from "next/dynamic";

const DashboardNoSSR = dynamic(
  () => import("./dashboard").then((mod) => mod.Dashboard),
  { ssr: false },
);

export function DashboardClient() {
  return <DashboardNoSSR />;
}
