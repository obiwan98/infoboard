"use client";

import { MovieScreen } from "./movie-screen";

const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PL0P7WZuP1QiMk9D-S4dMvHAmxDSrxC3b_";

// Light variant: video only, no overlay, no logging/watchdog/stall recovery.
export function VerticalMovieLightScreen() {
  return <MovieScreen monitoring={false} overlay={null} playlistUrl={PLAYLIST_URL} screen="vertical-light" />;
}
