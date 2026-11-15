"use client";

export type YouTubePlayer = {
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

export type YouTubePlayerEvent = {
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

export function describePlayerState(state?: number | null) {
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

export function getPlayerSnapshot(target: YouTubePlayer) {
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

export function extractPlaylistId(input: string): string | null {
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

export function loadYouTubeIframeApi(): Promise<void> {
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
