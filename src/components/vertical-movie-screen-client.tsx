"use client";

import dynamic from "next/dynamic";

const VerticalMovieScreenNoSSR = dynamic(
  () => import("./vertical-movie-screen").then((mod) => mod.VerticalMovieScreen),
  { ssr: false },
);

export function VerticalMovieScreenClient() {
  return <VerticalMovieScreenNoSSR />;
}
