"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePageLifecycleWatchdog } from "@/hooks/use-page-lifecycle-watchdog";
import { useScheduledReload } from "@/hooks/use-scheduled-reload";
import { useYouTubePlaylistPlayer } from "@/hooks/use-youtube-playlist-player";
import { extractPlaylistId } from "@/lib/youtube";

type WeatherApiResponse = {
  city: string;
  temperature: number;
  weatherCode: number;
};

export type MovieOverlayLayout = "vertical" | "horizontal";

type MovieScreenProps = {
  /** Enables lifecycle watchdog, player event logging and stall recovery. */
  monitoring: boolean;
  /** Clock/weather overlay layout; `null` renders the video only. */
  overlay: MovieOverlayLayout | null;
  playlistUrl: string;
  /** Screen name used in player logs. */
  screen: string;
};

const OVERLAY_CLASSES: Record<
  MovieOverlayLayout,
  { city: string; clock: string; glyph: string; monthDay: string; temperature: string; temperatureRow: string; time: string; weather: string; weekday: string }
> = {
  vertical: {
    clock: "absolute left-4 top-4 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:left-6 md:top-6",
    time: "text-6xl font-semibold leading-none tracking-tight md:text-7xl",
    weekday: "mt-1 text-3xl font-semibold leading-none md:text-4xl",
    monthDay: "mt-1 text-2xl font-semibold leading-none text-white/90 md:text-3xl",
    weather: "absolute right-4 top-4 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:right-6 md:top-6",
    temperatureRow: "flex items-center gap-2 md:gap-3",
    temperature: "text-6xl font-semibold leading-none tracking-tight md:text-7xl",
    glyph: "text-6xl font-semibold leading-none md:text-7xl",
    city: "mt-1 text-right text-xl font-semibold leading-none text-white/90 md:text-2xl",
  },
  horizontal: {
    clock: "absolute left-8 top-6 [text-shadow:0_2px_12px_rgba(0,0,0,0.75)] md:left-10 md:top-8",
    time: "text-7xl font-semibold leading-none tracking-tight md:text-8xl",
    weekday: "mt-1 text-4xl font-semibold leading-none md:text-5xl",
    monthDay: "mt-1 text-3xl font-semibold leading-none text-white/90 md:text-4xl",
    weather: "absolute right-8 top-6 [text-shadow:0_2px_12px_rgba(0,0,0,0.75)] md:right-10 md:top-8",
    temperatureRow: "flex items-center gap-3 md:gap-4",
    temperature: "text-7xl font-semibold leading-none tracking-tight md:text-8xl",
    glyph: "text-7xl font-semibold leading-none md:text-8xl",
    city: "mt-2 text-right text-2xl font-semibold leading-none text-white/90 md:text-3xl",
  },
};

// Survives client-side navigation between screens so the overlay doesn't flash empty.
let lastWeatherSnapshot: WeatherApiResponse | null = null;

function getWeatherGlyph(code: number): string {
  if (code === 0 || code === 1) return "☀";
  if (code === 2 || code === 3) return "☁";
  if (code === 45 || code === 48) return "〰";
  if (code === 51 || code === 53 || code === 55) return "☔";
  if (code === 61 || code === 63 || code === 65 || code === 80 || code === 81 || code === 82) return "☂";
  if (code === 71 || code === 73 || code === 75) return "❄";
  if (code === 95) return "⚡";
  return "☁";
}

function MovieOverlay({ layout }: { layout: MovieOverlayLayout }) {
  const classes = OVERLAY_CLASSES[layout];
  const [weather, setWeather] = useState<WeatherApiResponse | null>(() => lastWeatherSnapshot);
  const [now, setNow] = useState(() => new Date());
  const weatherGlyph = useMemo(() => getWeatherGlyph(weather?.weatherCode ?? 0), [weather?.weatherCode]);
  const timeText = useMemo(
    () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: false }).format(now),
    [now],
  );
  const weekdayText = useMemo(() => new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now), [now]);
  const monthDayText = useMemo(() => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(now), [now]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/weather");
        if (!response.ok) return;

        const data: WeatherApiResponse = await response.json();
        lastWeatherSnapshot = data;
        if (mounted) setWeather(data);
      } catch {
        // Ignore transient weather failures for the overlay.
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 10 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 isolate text-white" style={{ transform: "translateZ(0)" }}>
      <section className={classes.clock}>
        <p className={classes.time}>{timeText}</p>
        <p className={classes.weekday}>{weekdayText}</p>
        <p className={classes.monthDay}>{monthDayText}</p>
      </section>
      {weather && (
        <section className={classes.weather}>
          <div className={classes.temperatureRow}>
            <p className={classes.temperature}>{Math.round(weather.temperature)}&deg;</p>
            <p className={classes.glyph}>{weatherGlyph}</p>
          </div>
          <p className={classes.city}>{weather.city}</p>
        </section>
      )}
    </div>
  );
}

export function MovieScreen({ monitoring, overlay, playlistUrl, screen }: MovieScreenProps) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playlistId = useMemo(() => extractPlaylistId(playlistUrl.trim()), [playlistUrl]);

  usePageLifecycleWatchdog(screen, monitoring);
  useScheduledReload(screen, monitoring);
  useYouTubePlaylistPlayer(playerHostRef, playlistId, { monitoring, screen });

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {playlistId ? (
        <div className="absolute inset-0 z-0">
          <div ref={playerHostRef} className="h-full w-full" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-neutral-200">
          <p className="max-w-xl text-base md:text-lg">No valid YouTube playlist URL is configured for this screen.</p>
        </div>
      )}

      {overlay && <MovieOverlay layout={overlay} />}
    </main>
  );
}
