import { NextRequest, NextResponse } from "next/server";

import { parseIcsOccurrences, type CalendarOccurrence } from "@/lib/ics";

type CalendarEvent = {
  allDay: boolean;
  title: string;
  start: string;
  end: string;
  location: string;
  source: string;
};

// Time zone used for all-day and floating (zone-less) times. The display runs in Korea.
const DEFAULT_TIME_ZONE = process.env.CALENDAR_TIMEZONE?.trim() || "Asia/Seoul";

function toDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getSourceName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "calendar";
  }
}

export async function GET(request: NextRequest) {
  const urls = (process.env.CALENDAR_ICS_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    return NextResponse.json({ configured: false, events: [] });
  }

  const { searchParams } = new URL(request.url);
  const from = toDate(searchParams.get("from"), new Date());
  const to = toDate(searchParams.get("to"), new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));

  const allItems = await Promise.all(
    urls.map(async (url): Promise<CalendarOccurrence[]> => {
      try {
        const response = await fetch(url, { next: { revalidate: 300 } });
        if (!response.ok) return [];
        const text = await response.text();
        return parseIcsOccurrences(text, {
          defaultTimeZone: DEFAULT_TIME_ZONE,
          from,
          source: getSourceName(url),
          to,
        });
      } catch {
        // One broken feed should not hide the others.
        return [];
      }
    }),
  );

  const events: CalendarEvent[] = allItems
    .flat()
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 20)
    .map((event) => ({
      allDay: event.allDay,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      location: event.location,
      source: event.source,
    }));

  return NextResponse.json({ configured: true, events });
}
