"use client";

import dynamic from "next/dynamic";

const VerticalMovieLightScreenNoSSR = dynamic(
  () => import("./vertical-movie-light-screen").then((mod) => mod.VerticalMovieLightScreen),
  { ssr: false },
);

export function VerticalMovieLightScreenClient() {
  return <VerticalMovieLightScreenNoSSR />;
}
