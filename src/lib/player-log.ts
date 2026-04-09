"use client";

export const PLAYER_LOG_STORAGE_KEY = "infoboard:player-logs";
const PLAYER_WATCHDOG_HEARTBEAT_MS = 15000;
const PLAYER_LOG_LIMIT = 300;
const PLAYER_WATCHDOG_SESSION_PREFIX = "infoboard:player-watchdog-session";
const PLAYER_WATCHDOG_STORAGE_PREFIX = "infoboard:player-watchdog";

export type PlayerLogValue = boolean | null | number | string;

export type PlayerLogEntry = {
  details?: Record<string, PlayerLogValue>;
  event: string;
  id: string;
  level: "error" | "info" | "warn";
  screen: string;
  timestamp: string;
};

type PlayerWatchdogState = {
  closedAt?: string;
  lastEvent: string;
  lastFreezeAt?: string;
  lastHiddenAt?: string;
  lastOfflineAt?: string;
  lastPageHideAt?: string;
  lastPageHidePersisted?: boolean;
  lastPageShowAt?: string;
  lastPageShowPersisted?: boolean;
  lastSeenAt: string;
  pathname: string;
  screen: string;
  sessionId: string;
  startedAt: string;
  status: "active" | "closed";
  visibilityState: string;
};

type PlayerWatchdogUpdate = Partial<
  Pick<
    PlayerWatchdogState,
    | "lastFreezeAt"
    | "lastHiddenAt"
    | "lastOfflineAt"
    | "lastPageHideAt"
    | "lastPageHidePersisted"
    | "lastPageShowAt"
    | "lastPageShowPersisted"
    | "visibilityState"
  >
>;

export type PlayerSessionWatchdog = {
  close: (reason?: string) => void;
  mark: (event: string, update?: PlayerWatchdogUpdate) => void;
  sessionId: string;
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

function getWatchdogStorageKey(screen: string) {
  return `${PLAYER_WATCHDOG_STORAGE_PREFIX}:${screen}`;
}

function getWatchdogSessionKey(screen: string) {
  return `${PLAYER_WATCHDOG_SESSION_PREFIX}:${screen}`;
}

function readWatchdogState(screen: string): PlayerWatchdogState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getWatchdogStorageKey(screen));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.screen !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.lastSeenAt !== "string" ||
      typeof parsed.lastEvent !== "string" ||
      typeof parsed.status !== "string"
    ) {
      return null;
    }

    return parsed as PlayerWatchdogState;
  } catch {
    return null;
  }
}

function writeWatchdogState(screen: string, state: PlayerWatchdogState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getWatchdogStorageKey(screen), JSON.stringify(state));
}

function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  sendToServer?: boolean;
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
  if (input.sendToServer) {
    postPlayerLog(entry);
  }

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

export function startPlayerSessionWatchdog(input: {
  heartbeatIntervalMs?: number;
  screen: string;
  sendToServer?: boolean;
}): PlayerSessionWatchdog {
  if (typeof window === "undefined") {
    return {
      close: () => {},
      mark: () => {},
      sessionId: "server",
    };
  }

  const screen = input.screen;
  const previousState = readWatchdogState(screen);
  const sessionStorageKey = getWatchdogSessionKey(screen);
  const existingSessionId = window.sessionStorage.getItem(sessionStorageKey);
  const sessionId = existingSessionId ?? createSessionId();

  if (!existingSessionId) {
    window.sessionStorage.setItem(sessionStorageKey, sessionId);
  }

  if (previousState?.status === "active" && previousState.sessionId !== sessionId) {
    appendPlayerLog({
      event: "watchdog_previous_session_unclean_exit",
      details: previousState,
      level: "warn",
      sendToServer: input.sendToServer ?? true,
      screen,
    });
  }

  const now = new Date().toISOString();
  let closed = false;
  let currentState: PlayerWatchdogState = {
    lastEvent: "watchdog_started",
    lastSeenAt: now,
    pathname: window.location.pathname,
    screen,
    sessionId,
    startedAt: now,
    status: "active",
    visibilityState: typeof document === "undefined" ? "unknown" : document.visibilityState,
  };

  writeWatchdogState(screen, currentState);

  const mark = (event: string, update?: PlayerWatchdogUpdate) => {
    if (closed) return;

    currentState = {
      ...currentState,
      ...update,
      lastEvent: event,
      lastSeenAt: new Date().toISOString(),
      pathname: window.location.pathname,
      visibilityState: update?.visibilityState ?? (typeof document === "undefined" ? currentState.visibilityState : document.visibilityState),
    };

    writeWatchdogState(screen, currentState);
  };

  const close = (reason = "cleanup") => {
    if (closed) return;
    closed = true;

    currentState = {
      ...currentState,
      closedAt: new Date().toISOString(),
      lastEvent: `watchdog_closed:${reason}`,
      lastSeenAt: new Date().toISOString(),
      pathname: window.location.pathname,
      status: "closed",
      visibilityState: typeof document === "undefined" ? currentState.visibilityState : document.visibilityState,
    };

    writeWatchdogState(screen, currentState);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.clearInterval(heartbeatTimer);
  };

  const handleBeforeUnload = () => {
    close("beforeunload");
  };

  const heartbeatTimer = window.setInterval(() => {
    mark("watchdog_heartbeat");
  }, input.heartbeatIntervalMs ?? PLAYER_WATCHDOG_HEARTBEAT_MS);

  window.addEventListener("beforeunload", handleBeforeUnload);

  return {
    close,
    mark,
    sessionId,
  };
}
