"use client";

import { useEffect, useMemo, useRef } from "react";

const PLAYLIST_URLS = [
  "https://www.youtube.com/playlist?list=PL0P7WZuP1QiMk9D-S4dMvHAmxDSrxC3b_",
];

type YouTubePlayer = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
  setLoop?: (loopPlaylists: boolean) => void;
  setShuffle?: (shufflePlaylist: boolean) => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
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
        onAutoplayBlocked?: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
};

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

  const ytWindow = window as Window & {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __ytIframeApiPromise?: Promise<void>;
  };

  if (ytWindow.YT?.Player) {
    return Promise.resolve();
  }

  if (ytWindow.__ytIframeApiPromise) {
    return ytWindow.__ytIframeApiPromise;
  }

  ytWindow.__ytIframeApiPromise = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);

    ytWindow.onYouTubeIframeAPIReady = () => {
      resolve();
    };
  });

  return ytWindow.__ytIframeApiPromise;
}

export function VerticalMovieLightScreen() {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const currentPlaylistUrl = PLAYLIST_URLS[0]?.trim() ?? "";
  const playlistId = useMemo(() => extractPlaylistId(currentPlaylistUrl), [currentPlaylistUrl]);

  useEffect(() => {
    if (!playlistId || !playerHostRef.current) return;

    let disposed = false;
    let player: YouTubePlayer | null = null;

    void loadYouTubeIframeApi().then(() => {
      const ytWindow = window as Window & { YT?: YouTubeNamespace };
      if (disposed || !ytWindow.YT || !playerHostRef.current) return;

      player = new ytWindow.YT.Player(playerHostRef.current, {
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
            event.target.setShuffle?.(true);
            window.setTimeout(() => {
              if (disposed) return;
              event.target.playVideo();
            }, 200);
          },
          onAutoplayBlocked: (event) => {
            window.setTimeout(() => {
              if (disposed) return;
              event.target.mute();
              event.target.playVideo();
            }, 400);
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
    <main className="h-screen w-screen overflow-hidden bg-black">
      {playlistId ? (
        <div ref={playerHostRef} className="h-full w-full" />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-neutral-200">
          <p className="max-w-xl text-base md:text-lg">No valid YouTube playlist URL is configured in `PLAYLIST_URLS`.</p>
        </div>
      )}
    </main>
  );
}
