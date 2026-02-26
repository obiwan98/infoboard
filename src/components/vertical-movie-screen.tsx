"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WeatherApiResponse = {
  city: string;
  temperature: number;
  weatherCode: number;
};

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
  "https://www.youtube.com/playlist?list=PL0P7WZuP1QiMk9D-S4dMvHAmxDSrxC3b_",
];

type YouTubePlayer = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
  nextVideo: () => void;
  playVideoAt?: (index: number) => void;
  getPlaylist?: () => string[];
  setLoop?: (loopPlaylists: boolean) => void;
  setShuffle?: (shufflePlaylist: boolean) => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
  data: number;
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
        onStateChange: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __ytIframeApiPromise?: Promise<void>;
  }
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
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (window.__ytIframeApiPromise) {
    return window.__ytIframeApiPromise;
  }

  window.__ytIframeApiPromise = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);

    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };
  });

  return window.__ytIframeApiPromise;
}

export function VerticalMovieScreen() {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const currentPlaylistUrl = PLAYLIST_URLS[0]?.trim() ?? "";
  const playlistId = useMemo(() => extractPlaylistId(currentPlaylistUrl), [currentPlaylistUrl]);

  const [weather, setWeather] = useState<WeatherApiResponse | null>(null);
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
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!playlistId || !playerHostRef.current) return;

    let disposed = false;
    let player: YouTubePlayer | null = null;

    void loadYouTubeIframeApi().then(() => {
      if (disposed || !window.YT || !playerHostRef.current) return;

      player = new window.YT.Player(playerHostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
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
            event.target.setShuffle?.(true);
            window.setTimeout(() => {
              const playlistItems = event.target.getPlaylist?.() ?? [];
              if (playlistItems.length > 0 && event.target.playVideoAt) {
                const randomIndex = Math.floor(Math.random() * playlistItems.length);
                event.target.playVideoAt(randomIndex);
                return;
              }
              event.target.playVideo();
            }, 200);
          },
          onStateChange: (event) => {
            if (window.YT && event.data === window.YT.PlayerState.ENDED) {
              event.target.nextVideo();
            }
          },
        },
      });
    });

    return () => {
      disposed = true;
      player?.destroy();
    };
  }, [playlistId]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {playlistId ? (
        <div className="absolute inset-0">
          <div ref={playerHostRef} className="h-full w-full" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-neutral-200">
          <p className="max-w-xl text-base md:text-lg">No valid YouTube playlist URL is configured in `PLAYLIST_URLS`.</p>
        </div>
      )}

      {weather && (
        <>
          <section className="pointer-events-none absolute left-4 top-4 z-10 text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:left-6 md:top-6">
            <p className="text-6xl font-semibold leading-none tracking-tight md:text-7xl">{timeText}</p>
            <p className="mt-1 text-3xl font-semibold leading-none md:text-4xl">{weekdayText}</p>
            <p className="mt-1 text-2xl font-semibold leading-none text-white/90 md:text-3xl">{monthDayText}</p>
          </section>
          <section className="pointer-events-none absolute right-4 top-4 z-10 text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:right-6 md:top-6">
            <div className="flex items-center gap-2 md:gap-3">
              <p className="text-6xl font-semibold leading-none tracking-tight md:text-7xl">
                {Math.round(weather.temperature)}&deg;
              </p>
              <p className="text-6xl font-semibold leading-none md:text-7xl">{weatherGlyph}</p>
            </div>
            <p className="mt-1 text-right text-xl font-semibold leading-none text-white/90 md:text-2xl">{weather.city}</p>
          </section>
        </>
      )}
    </main>
  );
}
