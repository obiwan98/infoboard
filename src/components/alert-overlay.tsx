"use client";

import { useEffect, useRef, useState } from "react";

type CalendarEventItem = {
  title: string;
  start: string;
  end: string;
  location: string;
  source: string;
};

type WeatherApiResponse = {
  city: string;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  updatedAt: string;
};

type AlertItem = {
  id: string;
  title: string;
  message: string;
  level: "normal" | "warning";
};

const SEVERE_WEATHER_CODES = new Set([65, 75, 82, 95]);

export function AlertOverlay() {
  const [alert, setAlert] = useState<AlertItem | null>(null);
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    let dismissTimer: number | null = null;

    const evaluateAlerts = async () => {
      const now = new Date();
      const to = new Date(now.getTime() + 30 * 60 * 1000);

      const [eventsRes, weatherRes] = await Promise.allSettled([
        fetch(`/api/calendar-events?from=${now.toISOString()}&to=${to.toISOString()}`),
        fetch("/api/weather"),
      ]);

      let candidate: AlertItem | null = null;

      if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
        const payload = (await eventsRes.value.json()) as {
          configured: boolean;
          events: CalendarEventItem[];
        };

        if (payload.configured && payload.events.length > 0) {
          const upcoming = payload.events
            .map((event) => ({
              ...event,
              startDate: new Date(event.start),
            }))
            .filter((event) => event.startDate.getTime() >= now.getTime())
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

          if (upcoming) {
            const minutes = Math.max(
              0,
              Math.floor((upcoming.startDate.getTime() - now.getTime()) / 60000),
            );
            candidate = {
              id: `event-${upcoming.title}-${upcoming.start}`,
              title: "Upcoming Event",
              message: `${upcoming.title} starts in ${minutes} min`,
              level: "normal",
            };
          }
        }
      }

      if (!candidate && weatherRes.status === "fulfilled" && weatherRes.value.ok) {
        const weather = (await weatherRes.value.json()) as WeatherApiResponse;
        const severeCode = SEVERE_WEATHER_CODES.has(weather.weatherCode);
        const extremeTemp = weather.temperature <= -5 || weather.temperature >= 33;
        const strongWind = weather.windSpeed >= 40;

        if (severeCode || extremeTemp || strongWind) {
          const issue = severeCode
            ? "Severe weather conditions"
            : extremeTemp
              ? "Extreme temperature"
              : "Strong wind warning";
          candidate = {
            id: `weather-${weather.weatherCode}-${Math.round(weather.temperature)}-${Math.round(weather.windSpeed)}`,
            title: "Weather Alert",
            message: `${issue} in ${weather.city}`,
            level: "warning",
          };
        }
      }

      if (!mounted || !candidate || shownRef.current.has(candidate.id)) return;

      shownRef.current.add(candidate.id);
      setAlert(candidate);
      if (dismissTimer) {
        window.clearTimeout(dismissTimer);
      }
      dismissTimer = window.setTimeout(() => {
        if (mounted) setAlert(null);
      }, 8000);
    };

    void evaluateAlerts();
    const interval = window.setInterval(() => void evaluateAlerts(), 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      if (dismissTimer) window.clearTimeout(dismissTimer);
    };
  }, []);

  if (!alert) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
      <div
        className={`pointer-events-auto w-[min(90%,520px)] rounded-md border p-5 shadow-2xl ${
          alert.level === "warning"
            ? "border-amber-300/40 bg-black/85"
            : "border-[color:var(--mm-line)] bg-black/85"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-sm uppercase tracking-[0.08em] ${alert.level === "warning" ? "text-amber-300" : "mm-bright"}`}>
              {alert.title}
            </p>
            <p className="mm-normal mt-2 text-base">{alert.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="mm-dim rounded px-2 py-1 text-sm hover:text-white"
            aria-label="close alert"
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
}
