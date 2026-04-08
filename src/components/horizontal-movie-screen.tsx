"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { appendPlayerLog } from "@/lib/player-log";

type WeatherApiResponse = {
  city: string;
  temperature: number;
  weatherCode: number;
};

let lastWeatherSnapshot: WeatherApiResponse | null = null;

function getWeatherGlyph(code: number): string {
  if (code === 0 || code === 1) return "\u2600";
  if (code === 2 || code === 3) return "\u2601";
  if (code === 45 || code === 48) return "\u3030";
  if (code === 51 || code === 53 || code === 55) return "\u2614";
  if (code === 61 || code === 63 || code === 65 || code === 80 || code === 81 || code === 82) return "\u2602";
  if (code === 71 || code === 73 || code === 75) return "\u2744";
  if (code === 95) return "\u26A1";
  return "\u2601";
}

const PLAYLIST_URLS = [
  "https://www.youtube.com/watch?v=ko70cExuzZM&list=PL0P7WZuP1QiMr3gPtmNalDWl6Pvw29grs",
];
const PLAYER_SCREEN = "horizontal";
const HEARTBEAT_INTERVAL_MS = 30000;
const SHUFFLE_PLAYLIST = true;

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  getPlaylist?: () => string[];
  getPlaylistIndex?: () => number;
  getVideoUrl?: () => string;
  mute: () => void;
  nextVideo?: () => void;
  playVideo: () => void;
  playVideoAt?: (index: number) => void;
  setLoop?: (loopPlaylists: boolean) => void;
  setShuffle?: (shufflePlaylist: boolean) => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
  data?: number;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    config: {
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: YouTubePlayerEvent) => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
        onError?: (event: YouTubePlayerEvent) => void;
        onAutoplayBlocked?: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __ytIframeApiPromise?: Promise<void>;
  }
}

function describePlayerState(state?: number | null) {
  switch (state) {
    case -1:
      return "unstarted";
    case 0:
      return "ended";
    case 1:
      return "playing";
    case 2:
      return "paused";
    case 3:
      return "buffering";
    case 5:
      return "cued";
    default:
      return "unknown";
  }
}

function getPlayerSnapshot(target: YouTubePlayer) {
  const playlist = target.getPlaylist?.() ?? [];
  const playerState = target.getPlayerState?.() ?? null;

  return {
    currentTimeSec: target.getCurrentTime ? Math.round(target.getCurrentTime()) : null,
    durationSec: target.getDuration ? Math.round(target.getDuration()) : null,
    playerState,
    playerStateLabel: describePlayerState(playerState),
    playlistIndex: target.getPlaylistIndex?.() ?? null,
    playlistSize: playlist.length,
    videoUrl: target.getVideoUrl?.() ?? null,
  };
}

function extractPlaylistId(input: string): string | null {
  if (!input) return null;

  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (idPattern.test(input) && (input.startsWith("PL") || input.startsWith("UU") || input.startsWith("OLAK5uy_"))) {
    return input;
  }

  try {
    const url = new URL(input);
    const playlistId = url.searchParams.get("list");
    if (idPattern.test(playlistId ?? "")) return playlistId ?? null;
  } catch {
    return null;
  }

  return null;
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (window.__ytIframeApiPromise) return window.__ytIframeApiPromise;

  window.__ytIframeApiPromise = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => resolve();
  });

  return window.__ytIframeApiPromise;
}

export function HorizontalMovieScreen() {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const currentPlaylistUrl = PLAYLIST_URLS[0]?.trim() ?? "";
  const playlistId = useMemo(() => extractPlaylistId(currentPlaylistUrl), [currentPlaylistUrl]);

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

  useEffect(() => {
    if (!playlistId || !playerHostRef.current) return;

    let disposed = false;
    let heartbeatTimer: number | null = null;
    let player: YouTubePlayer | null = null;

    appendPlayerLog({
      event: "player_init",
      details: { playlistId, shuffle: SHUFFLE_PLAYLIST },
      screen: PLAYER_SCREEN,
    });

    const schedulePlaybackRecovery = (target: YouTubePlayer, delayMs: number, reason: string, details?: Record<string, unknown>) => {
      appendPlayerLog({
        event: "recovery_scheduled",
        details: { delayMs, reason, ...details, ...getPlayerSnapshot(target) },
        level: "warn",
        screen: PLAYER_SCREEN,
      });

      window.setTimeout(() => {
        if (disposed) return;
        appendPlayerLog({
          event: "recovery_next_video",
          details: { reason, ...getPlayerSnapshot(target) },
          level: "warn",
          screen: PLAYER_SCREEN,
        });
        target.nextVideo?.();
      }, delayMs);
    };

    void loadYouTubeIframeApi().then(() => {
      if (disposed || !window.YT || !playerHostRef.current) return;

      player = new window.YT.Player(playerHostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          loop: 1,
          mute: 1,
          listType: "playlist",
          list: playlistId,
          playlist: playlistId,
        },
        events: {
          onReady: (event) => {
            event.target.mute();
            event.target.setLoop?.(true);
            event.target.setShuffle?.(SHUFFLE_PLAYLIST);
            appendPlayerLog({
              event: "player_ready",
              details: { shuffle: SHUFFLE_PLAYLIST, ...getPlayerSnapshot(event.target) },
              screen: PLAYER_SCREEN,
            });

            heartbeatTimer = window.setInterval(() => {
              appendPlayerLog({
                event: "heartbeat",
                details: getPlayerSnapshot(event.target),
                screen: PLAYER_SCREEN,
              });
            }, HEARTBEAT_INTERVAL_MS);

            window.setTimeout(() => {
              appendPlayerLog({
                event: "playback_start_requested",
                details: { shuffledStart: SHUFFLE_PLAYLIST, ...getPlayerSnapshot(event.target) },
                screen: PLAYER_SCREEN,
              });
              if (SHUFFLE_PLAYLIST && event.target.playVideoAt) {
                event.target.playVideoAt(0);
                return;
              }
              event.target.playVideo();
            }, 200);
          },
          onStateChange: (event) => {
            appendPlayerLog({
              event: "state_change",
              details: {
                eventState: event.data ?? null,
                eventStateLabel: describePlayerState(event.data),
                ...getPlayerSnapshot(event.target),
              },
              screen: PLAYER_SCREEN,
            });
          },
          onError: (event) => {
            appendPlayerLog({
              event: "player_error",
              details: { errorCode: event.data ?? null, ...getPlayerSnapshot(event.target) },
              level: "error",
              screen: PLAYER_SCREEN,
            });
            schedulePlaybackRecovery(event.target, 400, "player_error", { errorCode: event.data ?? null });
          },
          onAutoplayBlocked: (event) => {
            appendPlayerLog({
              event: "autoplay_blocked",
              details: getPlayerSnapshot(event.target),
              level: "warn",
              screen: PLAYER_SCREEN,
            });
            window.setTimeout(() => {
              if (disposed) return;
              appendPlayerLog({
                event: "autoplay_retry",
                details: getPlayerSnapshot(event.target),
                level: "warn",
                screen: PLAYER_SCREEN,
              });
              event.target.mute();
              event.target.playVideo();
            }, 400);
          },
        },
      });
    });

    return () => {
      disposed = true;
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
      }
      appendPlayerLog({
        event: "player_dispose",
        details: player ? getPlayerSnapshot(player) : { playlistId },
        screen: PLAYER_SCREEN,
      });
      player?.destroy();
    };
  }, [playlistId]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {playlistId ? (
        <div className="absolute inset-0 z-0">
          <div ref={playerHostRef} className="h-full w-full" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-neutral-200">
          <p className="max-w-xl text-base md:text-lg">No valid YouTube playlist URL is configured in `PLAYLIST_URLS`.</p>
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 z-20 isolate text-white"
        style={{ transform: "translateZ(0)" }}
      >
        <section className="absolute left-8 top-6 [text-shadow:0_2px_12px_rgba(0,0,0,0.75)] md:left-10 md:top-8">
          <p className="text-7xl font-semibold leading-none tracking-tight md:text-8xl">{timeText}</p>
          <p className="mt-1 text-4xl font-semibold leading-none md:text-5xl">{weekdayText}</p>
          <p className="mt-1 text-3xl font-semibold leading-none text-white/90 md:text-4xl">{monthDayText}</p>
        </section>
        {weather && (
          <section className="absolute right-8 top-6 [text-shadow:0_2px_12px_rgba(0,0,0,0.75)] md:right-10 md:top-8">
            <div className="flex items-center gap-3 md:gap-4">
              <p className="text-7xl font-semibold leading-none tracking-tight md:text-8xl">{Math.round(weather.temperature)}&deg;</p>
              <p className="text-7xl font-semibold leading-none md:text-8xl">{weatherGlyph}</p>
            </div>
            <p className="mt-2 text-right text-2xl font-semibold leading-none text-white/90 md:text-3xl">{weather.city}</p>
          </section>
        )}
      </div>
    </main>
  );
}
