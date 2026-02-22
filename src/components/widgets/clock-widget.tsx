"use client";

import { useEffect, useState } from "react";

export function ClockWidget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);

  return (
    <div className="mm-module flex h-full flex-col rounded-md p-5 md:p-6">
      <p className="mm-header pb-1 text-[11px]">Clock</p>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="mm-bright text-6xl font-light tracking-tight md:text-7xl">{time}</p>
        <p className="mm-normal mt-3 text-lg md:text-2xl">{date}</p>
      </div>
    </div>
  );
}
