import { NextRequest, NextResponse } from "next/server";

type CalendarEvent = {
  title: string;
  start: string;
  end: string;
  location: string;
  source: string;
};

type ParsedEvent = {
  title: string;
  start: Date;
  end: Date;
  location: string;
  source: string;
};

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

function unfoldIcsLines(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): Date | null {
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day, 0, 0, 0);
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    return new Date(year, month, day, hour, minute, second);
  }

  return null;
}

function extractField(line: string): { key: string; value: string } | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const rawKey = line.slice(0, idx);
  const value = line.slice(idx + 1).trim();
  const key = rawKey.split(";")[0].toUpperCase();
  return { key, value };
}

function parseIcsEvents(ics: string, source: string): ParsedEvent[] {
  const lines = unfoldIcsLines(ics);
  const events: ParsedEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT" && current) {
      const start = current.DTSTART ? parseIcsDate(current.DTSTART) : null;
      const end = current.DTEND ? parseIcsDate(current.DTEND) : null;
      if (start) {
        events.push({
          title: current.SUMMARY || "Untitled",
          start,
          end: end ?? start,
          location: current.LOCATION || "",
          source,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const field = extractField(line);
    if (!field) continue;
    current[field.key] = field.value;
  }

  return events;
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

  try {
    const allItems = await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url, { next: { revalidate: 300 } });
        if (!response.ok) return [] as ParsedEvent[];
        const text = await response.text();
        return parseIcsEvents(text, getSourceName(url)).filter(
          (event) => event.end >= from && event.start <= to,
        );
      }),
    );

    const events: CalendarEvent[] = allItems
      .flat()
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 20)
      .map((event) => ({
        title: event.title,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        location: event.location,
        source: event.source,
      }));

    return NextResponse.json({ configured: true, events });
  } catch {
    return NextResponse.json({ configured: true, events: [] });
  }
}
