"use client";

import { useEffect, useState } from "react";

function getMonthMatrix(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type HolidayResponse = {
  date: string;
  name: string;
};

export function CalendarWidget() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const currentDay = today.getDate();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const cells = getMonthMatrix(viewDate);
  const [holidays, setHolidays] = useState<Record<number, string>>({});

  useEffect(() => {
    let mounted = true;
    const queryMonth = month + 1;

    const load = async () => {
      const response = await fetch(`/api/holidays?year=${year}&month=${queryMonth}`);
      if (!response.ok) return;

      const payload = (await response.json()) as HolidayResponse[];
      const mapped: Record<number, string> = {};
      payload.forEach((holiday) => {
        const day = new Date(holiday.date).getDate();
        mapped[day] = holiday.name;
      });

      if (mounted) {
        setHolidays(mapped);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [month, year]);

  const title = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(viewDate);

  const goPrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <div className="mm-module rounded-md p-5 md:p-6">
      <p className="mm-header pb-1 text-[11px]">Calendar</p>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="previous month"
          onClick={goPrevMonth}
          className="mm-normal rounded px-2 py-1 text-xl leading-none hover:text-white"
        >
          &#x2039;
        </button>
        <p className="mm-bright text-2xl font-normal">{title}</p>
        <button
          type="button"
          aria-label="next month"
          onClick={goNextMonth}
          className="mm-normal rounded px-2 py-1 text-xl leading-none hover:text-white"
        >
          &#x203A;
        </button>
      </div>

      <div className="mt-5 grid grid-cols-7 text-center">
        {weekdays.map((day, idx) => (
          <span
            key={day}
            className={`border-b border-[color:var(--mm-line)] py-2 text-xs tracking-wide ${
              idx === 0 ? "text-rose-300" : idx === 6 ? "text-sky-300" : "mm-dim"
            }`}
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-[color:var(--mm-line)]">
        {cells.map((day, index) => {
          const isToday = day !== null && day === currentDay && isCurrentMonth;
          const weekdayIndex = index % 7;
          const isWeekend = day !== null && (weekdayIndex === 0 || weekdayIndex === 6);
          const holidayName = day ? holidays[day] : undefined;
          const isHoliday = Boolean(holidayName);

          const dayTextClass =
            day === null
              ? "text-transparent"
              : isHoliday
                ? "text-amber-300"
                : weekdayIndex === 0
                  ? "text-rose-300"
                  : weekdayIndex === 6
                    ? "text-sky-300"
                    : "mm-normal";

          return (
            <div
              key={`${day}-${index}`}
              title={holidayName ?? ""}
              className={`relative flex h-12 flex-col items-center justify-center gap-1 border-b border-r border-[color:var(--mm-line)] px-1 text-sm font-medium md:h-14 ${dayTextClass} ${
                isToday
                  ? "bg-sky-300/15 text-base font-semibold underline underline-offset-4 ring-1 ring-sky-300/40 md:text-lg"
                  : ""
              }`}
            >
              <span className={isToday ? "text-lg leading-none md:text-xl" : "leading-none"}>
                {day ?? ""}
              </span>
              {isHoliday ? (
                <span className="max-w-full truncate text-[10px] leading-none text-amber-300">
                  {holidayName}
                </span>
              ) : (
                isWeekend && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-white/20" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
