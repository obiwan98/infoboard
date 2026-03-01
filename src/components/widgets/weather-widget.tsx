"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type WeatherApiResponse = {
  city: string;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  updatedAt: string;
};

type WeatherVisual = {
  src: string;
  alt: string;
};

const weatherDescriptions: Record<number, string> = {
  0: "Clear",
  1: "Mostly Clear",
  2: "Partly Cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Icy Fog",
  51: "Light Drizzle",
  53: "Drizzle",
  55: "Heavy Drizzle",
  61: "Light Rain",
  63: "Rain",
  65: "Heavy Rain",
  71: "Light Snow",
  73: "Snow",
  75: "Heavy Snow",
  80: "Light Showers",
  81: "Showers",
  82: "Heavy Showers",
  95: "Thunderstorm",
};

function getWeatherVisual(code: number): WeatherVisual {
  if (code === 0 || code === 1) return { src: "/weather/clear.svg", alt: "Clear sky" };
  if (code === 2 || code === 3) return { src: "/weather/cloudy.svg", alt: "Cloudy sky" };
  if (code === 45 || code === 48) return { src: "/weather/fog.svg", alt: "Fog" };
  if (code === 51 || code === 53 || code === 55) return { src: "/weather/drizzle.svg", alt: "Drizzle" };
  if (code === 61 || code === 63 || code === 65 || code === 80 || code === 81 || code === 82) {
    return { src: "/weather/rain.svg", alt: "Rain" };
  }
  if (code === 71 || code === 73 || code === 75) return { src: "/weather/snow.svg", alt: "Snow" };
  if (code === 95) return { src: "/weather/storm.svg", alt: "Thunderstorm" };
  return { src: "/weather/cloudy.svg", alt: "Weather" };
}

export function WeatherWidget() {
  const [data, setData] = useState<WeatherApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/weather");
        if (!response.ok) {
          throw new Error("Unable to load weather.");
        }

        const result: WeatherApiResponse = await response.json();
        if (mounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unexpected weather error.");
        }
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 10 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const description = data ? weatherDescriptions[data.weatherCode] ?? "Unknown" : "";
  const visual = useMemo(() => getWeatherVisual(data?.weatherCode ?? 0), [data?.weatherCode]);

  return (
    <div className="mm-module h-full rounded-md p-5 md:p-6">
      {!data && !error && <p className="mm-normal mt-6 text-lg">Loading weather...</p>}
      {error && <p className="mt-6 text-lg text-red-300">{error}</p>}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-center text-center">
            <p className="mm-normal text-lg">{data.city}</p>
            <p className="mm-bright mt-2 text-6xl font-light tracking-tight">{Math.round(data.temperature)}&deg;</p>
            <p className="mm-normal mt-2 text-xl">{description}</p>
          </div>
          <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
            <div className="relative h-24 w-24 md:h-28 md:w-28">
              <Image src={visual.src} alt={visual.alt} fill sizes="112px" className="object-contain opacity-90" />
            </div>
            <div className="mt-2">
              <p className="mm-dim text-sm">Wind {Math.round(data.windSpeed)} km/h</p>
              <p className="mm-dim mt-1 text-xs">
                Updated{" "}
                {new Intl.DateTimeFormat("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(data.updatedAt))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
