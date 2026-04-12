"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { appendPlayerLog, startPlayerSessionWatchdog } from "@/lib/player-log";

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
  "https://www.youtube.com/playlist?list=PL0P7WZuP1QiMk9D-S4dMvHAmxDSrxC3b_",
];
const PLAYER_SCREEN = "vertical";
const HEARTBEAT_INTERVAL_MS = 30000;
const PLAYBACK_PROGRESS_REPORT_INTERVAL = 4;
const STALL_HEARTBEAT_THRESHOLD = 2;
const SHUFFLE_PLAYLIST = true;
const PLAYBACK_COMPLETION_THRESHOLD_SEC = 5;
const PLAYBACK_COMPLETION_THRESHOLD_RATIO = 0.98;

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

function shouldSendStateChangeToServer(state?: number | null) {
  return state === 0 || state === 1 || state === 2 || state === 3;
}

function extractVideoDetails(videoUrl: string | null) {
  if (!videoUrl) {
    return {
      directVideoUrl: null,
      videoId: null,
      videoUrl: null,
    };
  }

  try {
    const url = new URL(videoUrl);
    const videoId = url.searchParams.get("v");

    if (!videoId) {
      return {
        directVideoUrl: videoUrl,
        videoId: null,
        videoUrl,
      };
    }

    return {
      directVideoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      videoUrl,
    };
  } catch {
    return {
      directVideoUrl: videoUrl,
      videoId: null,
      videoUrl,
    };
  }
}

function getPlayerSnapshot(target: YouTubePlayer) {
  const playlist = target.getPlaylist?.() ?? [];
  const playerState = target.getPlayerState?.() ?? null;
  const videoDetails = extractVideoDetails(target.getVideoUrl?.() ?? null);

  return {
    currentTimeSec: target.getCurrentTime ? Math.round(target.getCurrentTime()) : null,
    durationSec: target.getDuration ? Math.round(target.getDuration()) : null,
    playerState,
    playerStateLabel: describePlayerState(playerState),
    playlistIndex: target.getPlaylistIndex?.() ?? null,
    playlistSize: playlist.length,
    ...videoDetails,
  };
}

function getPlaybackCompletionDetails(snapshot: {
  currentTimeSec: number | null;
  durationSec: number | null;
}) {
  const { currentTimeSec, durationSec } = snapshot;

  if (currentTimeSec === null || durationSec === null || durationSec <= 0) {
    return {
      playbackNearEnd: null,
      playbackProgressPercent: null,
      remainingSec: null,
    };
  }

  const remainingSec = Math.max(durationSec - currentTimeSec, 0);
  const playbackProgressPercent = Math.round((currentTimeSec / durationSec) * 1000) / 10;
  const playbackNearEnd =
    remainingSec <= PLAYBACK_COMPLETION_THRESHOLD_SEC ||
    currentTimeSec / durationSec >= PLAYBACK_COMPLETION_THRESHOLD_RATIO;

  return {
    playbackNearEnd,
    playbackProgressPercent,
    remainingSec,
  };
}

function getPlaybackTargetKey(snapshot: {
  directVideoUrl: string | null;
  videoId: string | null;
  videoUrl: string | null;
}) {
  return snapshot.videoId ?? snapshot.directVideoUrl ?? snapshot.videoUrl;
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
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const watchdog = startPlayerSessionWatchdog({
      screen: PLAYER_SCREEN,
      sendToServer: true,
    });

    const logLifecycleEvent = (event: string, details?: Record<string, unknown>) => {
      appendPlayerLog({
        event,
        details,
        level: "warn",
        sendToServer: true,
        screen: PLAYER_SCREEN,
      });
    };

    const markAt = new Date().toISOString();
    watchdog.mark("pageshow", {
      lastPageShowAt: markAt,
      lastPageShowPersisted: false,
      visibilityState: document.visibilityState,
    });
    logLifecycleEvent("pageshow", {
      initialLoad: true,
      persisted: false,
      visibilityState: document.visibilityState,
    });

    const handleVisibilityChange = () => {
      const occurredAt = new Date().toISOString();
      watchdog.mark("visibilitychange", {
        lastHiddenAt: document.visibilityState === "hidden" ? occurredAt : undefined,
        visibilityState: document.visibilityState,
      });

      if (document.visibilityState === "hidden") {
        logLifecycleEvent("page_hidden", { visibilityState: document.visibilityState });
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      const occurredAt = new Date().toISOString();
      watchdog.mark("pageshow", {
        lastPageShowAt: occurredAt,
        lastPageShowPersisted: event.persisted,
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("pageshow", {
        persisted: event.persisted,
        visibilityState: document.visibilityState,
      });
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      const occurredAt = new Date().toISOString();
      watchdog.mark("pagehide", {
        lastPageHideAt: occurredAt,
        lastPageHidePersisted: event.persisted,
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("pagehide", {
        persisted: event.persisted,
        visibilityState: document.visibilityState,
      });
    };

    const handleFreeze = () => {
      watchdog.mark("page_freeze", {
        lastFreezeAt: new Date().toISOString(),
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("page_freeze");
    };

    const handleOffline = () => {
      watchdog.mark("network_offline", {
        lastOfflineAt: new Date().toISOString(),
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("network_offline");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("freeze", handleFreeze as EventListener);
    window.addEventListener("offline", handleOffline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("freeze", handleFreeze as EventListener);
      window.removeEventListener("offline", handleOffline);
      watchdog.close("effect_cleanup");
    };
  }, []);

  useEffect(() => {
    if (!playlistId || !playerHostRef.current) return;

    let disposed = false;
    let heartbeatTimer: number | null = null;
    let heartbeatCount = 0;
    let stalledHeartbeatCount = 0;
    let lastHeartbeatTime: number | null = null;
    let lastHeartbeatVideoUrl: string | null = null;
    let lastReportedTargetKey: string | null = null;
    let lastInterruptedTargetKey: string | null = null;
    let player: YouTubePlayer | null = null;

    appendPlayerLog({
      event: "player_init",
      details: { playlistId, shuffle: SHUFFLE_PLAYLIST },
      screen: PLAYER_SCREEN,
    });

    const schedulePlaybackRecovery = (target: YouTubePlayer, delayMs: number, reason: string, details?: Record<string, unknown>) => {
      const snapshot = getPlayerSnapshot(target);
      const completion = getPlaybackCompletionDetails(snapshot);

      appendPlayerLog({
        event: "recovery_scheduled",
        details: { delayMs, reason, ...details, ...snapshot, ...completion },
        level: "warn",
        sendToServer: true,
        screen: PLAYER_SCREEN,
      });

      const targetKey = getPlaybackTargetKey(snapshot);

      if (targetKey && completion.playbackNearEnd === false && targetKey !== lastInterruptedTargetKey) {
        lastInterruptedTargetKey = targetKey;
        appendPlayerLog({
          event: "playback_interrupted_skip",
          details: { delayMs, reason, ...details, ...snapshot, ...completion },
          level: "warn",
          sendToServer: true,
          screen: PLAYER_SCREEN,
        });
      }

      window.setTimeout(() => {
        if (disposed) return;
        const nextSnapshot = getPlayerSnapshot(target);
        appendPlayerLog({
          event: "recovery_next_video",
          details: { reason, ...nextSnapshot, ...getPlaybackCompletionDetails(nextSnapshot) },
          level: "warn",
          sendToServer: true,
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
              heartbeatCount += 1;
              const snapshot = getPlayerSnapshot(event.target);
              const isSameVideo = snapshot.videoUrl === lastHeartbeatVideoUrl;
              const isProgressStalled =
                (snapshot.playerState === 1 || snapshot.playerState === 3) &&
                snapshot.currentTimeSec !== null &&
                lastHeartbeatTime !== null &&
                snapshot.currentTimeSec <= lastHeartbeatTime &&
                isSameVideo;

              if (isProgressStalled) {
                stalledHeartbeatCount += 1;
              } else {
                stalledHeartbeatCount = 0;
              }

              lastHeartbeatTime = snapshot.currentTimeSec;
              lastHeartbeatVideoUrl = snapshot.videoUrl;

              appendPlayerLog({
                event: "heartbeat",
                details: {
                  stalledHeartbeatCount,
                  ...snapshot,
                },
                screen: PLAYER_SCREEN,
              });

              if (snapshot.playerState === 1 && heartbeatCount % PLAYBACK_PROGRESS_REPORT_INTERVAL === 0) {
                appendPlayerLog({
                  event: "playback_progress",
                  details: {
                    heartbeatCount,
                    ...snapshot,
                    ...getPlaybackCompletionDetails(snapshot),
                  },
                  sendToServer: true,
                  screen: PLAYER_SCREEN,
                });
              }

              if (stalledHeartbeatCount >= STALL_HEARTBEAT_THRESHOLD) {
                appendPlayerLog({
                  event: "stalled_detected",
                  details: {
                    stalledHeartbeatCount,
                    ...snapshot,
                  },
                  level: "warn",
                  sendToServer: true,
                  screen: PLAYER_SCREEN,
                });
                stalledHeartbeatCount = 0;
                schedulePlaybackRecovery(event.target, 0, "stalled_heartbeat", {
                  stalledHeartbeatCount: STALL_HEARTBEAT_THRESHOLD,
                });
              }
            }, HEARTBEAT_INTERVAL_MS);

            window.setTimeout(() => {
              appendPlayerLog({
                event: "playback_start_requested",
                details: { shuffledStart: SHUFFLE_PLAYLIST, ...getPlayerSnapshot(event.target) },
                sendToServer: true,
                screen: PLAYER_SCREEN,
              });
              event.target.playVideo();
            }, 200);
          },
          onStateChange: (event) => {
            heartbeatCount = 0;
            stalledHeartbeatCount = 0;
            lastHeartbeatTime = null;
            lastHeartbeatVideoUrl = event.target.getVideoUrl?.() ?? null;
            const snapshot = getPlayerSnapshot(event.target);
            const targetKey = getPlaybackTargetKey(snapshot);

            if (targetKey && targetKey !== lastReportedTargetKey) {
              lastReportedTargetKey = targetKey;
              lastInterruptedTargetKey = null;
              appendPlayerLog({
                event: "playback_target_selected",
                details: {
                  eventState: event.data ?? null,
                  eventStateLabel: describePlayerState(event.data),
                  ...snapshot,
                },
                sendToServer: true,
                screen: PLAYER_SCREEN,
              });
            }

            if (event.data === 0) {
              appendPlayerLog({
                event: "playback_completed",
                details: {
                  eventState: event.data,
                  eventStateLabel: describePlayerState(event.data),
                  ...snapshot,
                  ...getPlaybackCompletionDetails(snapshot),
                },
                sendToServer: true,
                screen: PLAYER_SCREEN,
              });
            }

            appendPlayerLog({
              event: "state_change",
              details: {
                eventState: event.data ?? null,
                eventStateLabel: describePlayerState(event.data),
                ...snapshot,
              },
              sendToServer: shouldSendStateChangeToServer(event.data),
              screen: PLAYER_SCREEN,
            });
          },
          onError: (event) => {
            appendPlayerLog({
              event: "player_error",
              details: { errorCode: event.data ?? null, ...getPlayerSnapshot(event.target) },
              level: "error",
              sendToServer: true,
              screen: PLAYER_SCREEN,
            });
            schedulePlaybackRecovery(event.target, 400, "player_error", { errorCode: event.data ?? null });
          },
          onAutoplayBlocked: (event) => {
            appendPlayerLog({
              event: "autoplay_blocked",
              details: getPlayerSnapshot(event.target),
              level: "warn",
              sendToServer: true,
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
        <section className="absolute left-4 top-4 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:left-6 md:top-6">
          <p className="text-6xl font-semibold leading-none tracking-tight md:text-7xl">{timeText}</p>
          <p className="mt-1 text-3xl font-semibold leading-none md:text-4xl">{weekdayText}</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-white/90 md:text-3xl">{monthDayText}</p>
        </section>
        {weather && (
          <section className="absolute right-4 top-4 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:right-6 md:top-6">
            <div className="flex items-center gap-2 md:gap-3">
              <p className="text-6xl font-semibold leading-none tracking-tight md:text-7xl">
                {Math.round(weather.temperature)}&deg;
              </p>
              <p className="text-6xl font-semibold leading-none md:text-7xl">{weatherGlyph}</p>
            </div>
            <p className="mt-1 text-right text-xl font-semibold leading-none text-white/90 md:text-2xl">{weather.city}</p>
          </section>
        )}
      </div>
    </main>
  );
}
