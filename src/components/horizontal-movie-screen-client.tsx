"use client";

import dynamic from "next/dynamic";

const HorizontalMovieScreenNoSSR = dynamic(
  () => import("./horizontal-movie-screen").then((mod) => mod.HorizontalMovieScreen),
  { ssr: false },
);

export function HorizontalMovieScreenClient() {
  return <HorizontalMovieScreenNoSSR />;
}
