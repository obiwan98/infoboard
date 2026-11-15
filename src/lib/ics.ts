/**
 * Minimal ICS (RFC 5545) parser for calendar feeds.
 *
 * Supports:
 * - DTSTART/DTEND with UTC (`Z`), `TZID=<IANA zone>`, floating times and all-day dates
 * - DURATION when DTEND is missing
 * - RRULE expansion (FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL,
 *   BYDAY incl. ordinals, BYMONTHDAY, BYMONTH, BYSETPOS, WKST)
 * - EXDATE, RECURRENCE-ID overrides and STATUS:CANCELLED
 *
 * All wall-clock math is done on "naive" millisecond values (Date.UTC of the wall time)
 * and converted to real instants with Intl, so results do not depend on the server time zone.
 */

export type CalendarOccurrence = {
  allDay: boolean;
  end: Date;
  location: string;
  source: string;
  start: Date;
  title: string;
};

type Property = { params: Record<string, string>; value: string };
type RawEvent = Record<string, Property[]>;

type DateValue = {
  allDay: boolean;
  /** Date.UTC() of the wall-clock time in `tz`. */
  naive: number;
  tz: string;
};

type Rule = {
  byDay: Array<{ ord: number; weekday: number }>;
  byMonth: number[];
  byMonthDay: number[];
  bySetPos: number[];
  count: number | null;
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  until: number | null;
  wkst: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PERIODS = 20000;
const MAX_OCCURRENCES_PER_EVENT = 500;
const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Common Windows zone names emitted by Outlook/Exchange feeds.
const WINDOWS_ZONES: Record<string, string> = {
  "Korea Standard Time": "Asia/Seoul",
  "Tokyo Standard Time": "Asia/Tokyo",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "UTC": "UTC",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
};

// ---------------------------------------------------------------------------
// Time zone helpers

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, formatter);
  }
  return formatter;
}

function isValidTimeZone(tz: string): boolean {
  try {
    getFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const cleaned = tzid.replace(/^"|"$/g, "").trim();
  if (isValidTimeZone(cleaned)) return cleaned;
  const windows = WINDOWS_ZONES[cleaned];
  if (windows) return windows;
  // e.g. "/mozilla.org/20050126_1/Asia/Seoul"
  const tail = cleaned.match(/([A-Za-z_]+\/[A-Za-z_+-]+)$/)?.[1];
  if (tail && isValidTimeZone(tail)) return tail;
  return fallback;
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffsetMs(tz: string, utcMs: number): number {
  const parts = getFormatter(tz).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - (utcMs - (((utcMs % 1000) + 1000) % 1000));
}

/** Convert a wall-clock time in `tz` (given as Date.UTC of the wall time) into a real UTC instant. */
export function wallToUtc(naive: number, tz: string): number {
  if (tz === "UTC") return naive;
  const firstGuess = naive - tzOffsetMs(tz, naive);
  const secondOffset = tzOffsetMs(tz, firstGuess);
  return naive - secondOffset;
}

// ---------------------------------------------------------------------------
// Line / property parsing

function unfoldLines(ics: string): string[] {
  const raw = ics.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(line: string): { name: string; property: Property } | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1).trim();
  const segments = head.split(";");
  const name = segments[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq > 0) params[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, property: { params, value } };
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

function parseDateValue(value: string, params: Record<string, string>, floatingTz: string, allDayTz: string): DateValue | null {
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return {
      allDay: true,
      naive: Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
      tz: allDayTz,
    };
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!dateTime) return null;

  const naive = Date.UTC(
    Number(dateTime[1]),
    Number(dateTime[2]) - 1,
    Number(dateTime[3]),
    Number(dateTime[4]),
    Number(dateTime[5]),
    Number(dateTime[6]),
  );
  const tz = dateTime[7] ? "UTC" : resolveTimeZone(params.TZID, floatingTz);
  return { allDay: false, naive, tz };
}

function parseDuration(value: string): number | null {
  const match = value.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const total =
    Number(weeks ?? 0) * 7 * DAY_MS +
    Number(days ?? 0) * DAY_MS +
    Number(hours ?? 0) * 3600000 +
    Number(minutes ?? 0) * 60000 +
    Number(seconds ?? 0) * 1000;
  return sign === "-" ? -total : total;
}

function parseRule(value: string, start: DateValue, floatingTz: string, allDayTz: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const segment of value.split(";")) {
    const eq = segment.indexOf("=");
    if (eq > 0) parts[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1).toUpperCase();
  }

  const freq = parts.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;

  const ints = (raw?: string) =>
    (raw ?? "")
      .split(",")
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item !== 0);

  const byDay = (parts.BYDAY ?? "")
    .split(",")
    .map((token) => token.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({ ord: match[1] ? Number(match[1]) : 0, weekday: WEEKDAYS[match[2]] }));

  let until: number | null = null;
  if (parts.UNTIL) {
    const parsed = parseDateValue(parts.UNTIL, {}, start.tz === "UTC" ? floatingTz : start.tz, allDayTz);
    if (parsed) {
      // A date-only UNTIL includes the whole day.
      until = wallToUtc(parsed.allDay ? parsed.naive + DAY_MS - 1 : parsed.naive, parsed.allDay ? start.tz : parsed.tz);
    }
  }

  const interval = Number(parts.INTERVAL ?? 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;

  return {
    byDay,
    byMonth: ints(parts.BYMONTH).filter((month) => month >= 1 && month <= 12),
    byMonthDay: ints(parts.BYMONTHDAY),
    bySetPos: ints(parts.BYSETPOS),
    count: count !== null && Number.isInteger(count) && count > 0 ? count : null,
    freq,
    interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
    until,
    wkst: WEEKDAYS[parts.WKST ?? "MO"] ?? 1,
  };
}

// ---------------------------------------------------------------------------
// RRULE expansion (on naive day values = Date.UTC(y, m, d))

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function weekdayOf(day: number): number {
  return new Date(day).getUTCDay();
}

function monthCandidates(year: number, month: number, rule: Rule, fallbackDay: number): number[] {
  const dim = daysInMonth(year, month);
  let byMonthDays: number[] | null = null;
  let byWeekDays: number[] | null = null;

  if (rule.byMonthDay.length > 0) {
    byMonthDays = rule.byMonthDay.map((n) => (n > 0 ? n : dim + 1 + n)).filter((n) => n >= 1 && n <= dim);
  }

  if (rule.byDay.length > 0) {
    byWeekDays = [];
    for (const { ord, weekday } of rule.byDay) {
      const matches: number[] = [];
      for (let d = 1; d <= dim; d += 1) {
        if (weekdayOf(Date.UTC(year, month, d)) === weekday) matches.push(d);
      }
      if (ord === 0) byWeekDays.push(...matches);
      else {
        const picked = ord > 0 ? matches[ord - 1] : matches[matches.length + ord];
        if (picked !== undefined) byWeekDays.push(picked);
      }
    }
  }

  let days: number[];
  if (byMonthDays && byWeekDays) {
    const weekSet = new Set(byWeekDays);
    days = byMonthDays.filter((d) => weekSet.has(d));
  } else if (byMonthDays) {
    days = byMonthDays;
  } else if (byWeekDays) {
    days = byWeekDays;
  } else {
    days = fallbackDay <= dim ? [fallbackDay] : [];
  }

  return [...new Set(days)].sort((a, b) => a - b).map((d) => Date.UTC(year, month, d));
}

function applySetPos(days: number[], rule: Rule): number[] {
  if (rule.bySetPos.length === 0) return days;
  const picked = rule.bySetPos
    .map((pos) => (pos > 0 ? days[pos - 1] : days[days.length + pos]))
    .filter((day): day is number => day !== undefined);
  return [...new Set(picked)].sort((a, b) => a - b);
}

function periodCandidates(k: number, rule: Rule, startDay: number): { anchor: number; days: number[] } {
  const start = new Date(startDay);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const date = start.getUTCDate();
  const monthFilter = (day: number) => rule.byMonth.length === 0 || rule.byMonth.includes(new Date(day).getUTCMonth() + 1);

  switch (rule.freq) {
    case "DAILY": {
      const day = startDay + k * rule.interval * DAY_MS;
      const weekdays = rule.byDay.map((item) => item.weekday);
      const ok =
        monthFilter(day) &&
        (weekdays.length === 0 || weekdays.includes(weekdayOf(day))) &&
        (rule.byMonthDay.length === 0 || monthCandidates(new Date(day).getUTCFullYear(), new Date(day).getUTCMonth(), { ...rule, byDay: [] }, 0).includes(day));
      return { anchor: day, days: ok ? [day] : [] };
    }
    case "WEEKLY": {
      const weekStart = startDay - ((weekdayOf(startDay) - rule.wkst + 7) % 7) * DAY_MS;
      const base = weekStart + k * rule.interval * 7 * DAY_MS;
      const weekdays = rule.byDay.length > 0 ? rule.byDay.map((item) => item.weekday) : [weekdayOf(startDay)];
      const days = [...new Set(weekdays)]
        .map((weekday) => base + ((weekday - rule.wkst + 7) % 7) * DAY_MS)
        .sort((a, b) => a - b)
        .filter(monthFilter);
      return { anchor: base, days: applySetPos(days, rule) };
    }
    case "MONTHLY": {
      const total = year * 12 + month + k * rule.interval;
      const y = Math.floor(total / 12);
      const m = total % 12;
      const anchor = Date.UTC(y, m, 1);
      if (!monthFilter(anchor)) return { anchor, days: [] };
      return { anchor, days: applySetPos(monthCandidates(y, m, rule, date), rule) };
    }
    case "YEARLY": {
      const y = year + k * rule.interval;
      const months = rule.byMonth.length > 0 ? rule.byMonth.map((item) => item - 1) : [month];
      const days = months.flatMap((m) => monthCandidates(y, m, rule, date)).sort((a, b) => a - b);
      return { anchor: Date.UTC(y, 0, 1), days: applySetPos(days, rule) };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API

export function parseIcsOccurrences(
  ics: string,
  options: { defaultTimeZone: string; from: Date; source: string; to: Date },
): CalendarOccurrence[] {
  const lines = unfoldLines(ics);
  const events: RawEvent[] = [];
  let calendarTz: string | null = null;
  let current: RawEvent | null = null;
  let nestedDepth = 0;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      nestedDepth = 0;
      continue;
    }
    if (current && upper.startsWith("BEGIN:")) {
      nestedDepth += 1;
      continue;
    }
    if (current && upper.startsWith("END:") && nestedDepth > 0) {
      nestedDepth -= 1;
      continue;
    }
    if (upper === "END:VEVENT" && current) {
      events.push(current);
      current = null;
      continue;
    }

    const parsed = parseLine(line);
    if (!parsed) continue;

    if (!current) {
      if (parsed.name === "X-WR-TIMEZONE") calendarTz = parsed.property.value;
      continue;
    }
    if (nestedDepth > 0) continue;
    (current[parsed.name] ??= []).push(parsed.property);
  }

  const allDayTz = resolveTimeZone(options.defaultTimeZone, "UTC");
  const floatingTz = resolveTimeZone(calendarTz ?? undefined, allDayTz);
  const fromMs = options.from.getTime();
  const toMs = options.to.getTime();

  const first = (event: RawEvent, name: string) => event[name]?.[0];
  const toUtc = (value: DateValue) => wallToUtc(value.naive, value.tz);

  // RECURRENCE-ID overrides replace the matching occurrence of their master event.
  const overrideKeys = new Set<string>();
  for (const event of events) {
    const uid = first(event, "UID")?.value;
    const recurrenceId = first(event, "RECURRENCE-ID");
    if (!uid || !recurrenceId) continue;
    const parsed = parseDateValue(recurrenceId.value, recurrenceId.params, floatingTz, allDayTz);
    if (parsed) overrideKeys.add(`${uid}|${toUtc(parsed)}`);
  }

  const occurrences: CalendarOccurrence[] = [];

  for (const event of events) {
    if (first(event, "STATUS")?.value.toUpperCase() === "CANCELLED") continue;

    const dtStart = first(event, "DTSTART");
    if (!dtStart) continue;
    const start = parseDateValue(dtStart.value, dtStart.params, floatingTz, allDayTz);
    if (!start) continue;

    const dtEnd = first(event, "DTEND");
    const parsedEnd = dtEnd ? parseDateValue(dtEnd.value, dtEnd.params, floatingTz, allDayTz) : null;
    const durationProp = first(event, "DURATION");
    const duration = durationProp ? parseDuration(durationProp.value) : null;

    // Wall-clock length of the event, applied to each occurrence (keeps all-day events whole days across DST).
    let wallLength: number;
    if (parsedEnd) {
      wallLength = parsedEnd.tz === start.tz ? parsedEnd.naive - start.naive : toUtc(parsedEnd) - toUtc(start);
    } else if (duration !== null) {
      wallLength = duration;
    } else {
      wallLength = start.allDay ? DAY_MS : 0;
    }
    wallLength = Math.max(0, wallLength);

    const base = {
      allDay: start.allDay,
      location: unescapeText(first(event, "LOCATION")?.value ?? ""),
      source: options.source,
      title: unescapeText(first(event, "SUMMARY")?.value ?? "") || "Untitled",
    };

    const pushIfInRange = (startNaive: number) => {
      const startUtc = wallToUtc(startNaive, start.tz);
      const endUtc = wallToUtc(startNaive + wallLength, start.tz);
      if (endUtc >= fromMs && startUtc <= toMs) {
        occurrences.push({ ...base, start: new Date(startUtc), end: new Date(endUtc) });
      }
      return startUtc;
    };

    const rruleProp = first(event, "RRULE");
    const isOverride = !!first(event, "RECURRENCE-ID");
    const rule = rruleProp && !isOverride ? parseRule(rruleProp.value, start, floatingTz, allDayTz) : null;

    if (!rule) {
      pushIfInRange(start.naive);
      continue;
    }

    const uid = first(event, "UID")?.value ?? "";
    const excluded = new Set<number>();
    for (const exdate of event.EXDATE ?? []) {
      for (const value of exdate.value.split(",")) {
        const parsed = parseDateValue(value.trim(), exdate.params, floatingTz, allDayTz);
        if (parsed) excluded.add(toUtc(parsed));
      }
    }

    const startDay = Math.floor(start.naive / DAY_MS) * DAY_MS;
    const timeOfDay = start.naive - startDay;
    let generated = 0;
    let emitted = 0;

    expansion: for (let k = 0; k < MAX_PERIODS; k += 1) {
      const { anchor, days } = periodCandidates(k, rule, startDay);
      if (wallToUtc(anchor, start.tz) > toMs || (rule.until !== null && wallToUtc(anchor, start.tz) > rule.until)) break;

      for (const day of days) {
        const occurrenceNaive = day + timeOfDay;
        if (occurrenceNaive < start.naive) continue;

        const occurrenceUtc = wallToUtc(occurrenceNaive, start.tz);
        if (rule.until !== null && occurrenceUtc > rule.until) break expansion;
        if (occurrenceUtc > toMs) break expansion;

        generated += 1;
        if (rule.count !== null && generated > rule.count) break expansion;
        if (excluded.has(occurrenceUtc) || overrideKeys.has(`${uid}|${occurrenceUtc}`)) continue;

        const before = occurrences.length;
        pushIfInRange(occurrenceNaive);
        if (occurrences.length > before) emitted += 1;
        if (emitted >= MAX_OCCURRENCES_PER_EVENT) break expansion;
      }
    }
  }

  return occurrences;
}
