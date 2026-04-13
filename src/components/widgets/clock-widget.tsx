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
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);

  return (
    <div className="mm-module flex h-full flex-col rounded-md p-4 md:p-5">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex w-full justify-center overflow-hidden">
          <p
            className="mm-bright whitespace-nowrap text-[4.7rem] font-light leading-none tracking-[-0.06em] md:text-[6.6rem]"
          >
            {time}
          </p>
        </div>
        <p className="mm-normal mt-2 text-sm leading-snug md:text-lg">{date}</p>
      </div>
    </div>
  );
}
