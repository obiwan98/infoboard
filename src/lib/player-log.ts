"use client";

export const PLAYER_LOG_STORAGE_KEY = "infoboard:player-logs";
const PLAYER_LOG_LIMIT = 300;

export type PlayerLogValue = boolean | null | number | string;

export type PlayerLogEntry = {
  details?: Record<string, PlayerLogValue>;
  event: string;
  id: string;
  level: "error" | "info" | "warn";
  screen: string;
  timestamp: string;
};

function sanitizeValue(value: unknown): PlayerLogValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readStoredLogs(): PlayerLogEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PLAYER_LOG_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is PlayerLogEntry => {
      return !!entry && typeof entry === "object" && typeof entry.event === "string" && typeof entry.timestamp === "string";
    });
  } catch {
    return [];
  }
}

function writeStoredLogs(entries: PlayerLogEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, PLAYER_LOG_LIMIT)));
}

function postPlayerLog(entry: PlayerLogEntry) {
  if (typeof window === "undefined") return;

  void fetch("/api/player-log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {
    // Ignore telemetry transport errors. Logs are still kept locally.
  });
}

export function appendPlayerLog(input: {
  details?: Record<string, unknown>;
  event: string;
  level?: "error" | "info" | "warn";
  screen: string;
}) {
  if (typeof window === "undefined") return;

  const entry: PlayerLogEntry = {
    details: input.details
      ? Object.fromEntries(Object.entries(input.details).map(([key, value]) => [key, sanitizeValue(value)]))
      : undefined,
    event: input.event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level: input.level ?? "info",
    screen: input.screen,
    timestamp: new Date().toISOString(),
  };

  const logs = readStoredLogs();
  logs.unshift(entry);
  writeStoredLogs(logs);
  postPlayerLog(entry);

  const logger = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.info;
  logger(`[player:${entry.screen}] ${entry.event}`, entry.details ?? {});
}

export function getPlayerLogs() {
  return readStoredLogs();
}

export function clearPlayerLogs() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAYER_LOG_STORAGE_KEY);
}
