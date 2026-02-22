import { NextResponse } from "next/server";

const SEOUL = {
  lat: 37.5665,
  lon: 126.978,
  city: "Seoul",
};

type OpenMeteoResponse = {
  current_weather?: {
    temperature: number;
    weathercode: number;
    windspeed: number;
    time: string;
  };
};

export async function GET() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${SEOUL.lat}&longitude=${SEOUL.lon}&current_weather=true&timezone=Asia%2FSeoul`;

  try {
    const response = await fetch(url, { next: { revalidate: 600 } });
    if (!response.ok) {
      return NextResponse.json({ message: "Weather fetch failed" }, { status: 502 });
    }

    const data = (await response.json()) as OpenMeteoResponse;
    if (!data.current_weather) {
      return NextResponse.json({ message: "Weather payload is missing" }, { status: 500 });
    }

    return NextResponse.json({
      city: SEOUL.city,
      temperature: data.current_weather.temperature,
      weatherCode: data.current_weather.weathercode,
      windSpeed: data.current_weather.windspeed,
      updatedAt: data.current_weather.time,
    });
  } catch {
    return NextResponse.json({ message: "Weather service unavailable" }, { status: 500 });
  }
}
