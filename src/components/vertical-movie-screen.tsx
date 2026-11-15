"use client";

import { MovieScreen } from "./movie-screen";

const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PL0P7WZuP1QiMk9D-S4dMvHAmxDSrxC3b_";

export function VerticalMovieScreen() {
  return <MovieScreen monitoring overlay="vertical" playlistUrl={PLAYLIST_URL} screen="vertical" />;
}
