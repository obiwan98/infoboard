"use client";

import { MovieScreen } from "./movie-screen";

const PLAYLIST_URL = "https://www.youtube.com/watch?v=ko70cExuzZM&list=PL0P7WZuP1QiMr3gPtmNalDWl6Pvw29grs";

export function HorizontalMovieScreen() {
  return <MovieScreen monitoring overlay="horizontal" playlistUrl={PLAYLIST_URL} screen="horizontal" />;
}
