"use client";

import { useEffect } from "react";

import { appendPlayerLog } from "@/lib/player-log";

/** Default reload period. Override per device with `?reloadHours=N` (`0` disables). */
const DEFAULT_RELOAD_HOURS = 4;
const MIN_RELOAD_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const PROBE_TIMEOUT_MS = 10 * 1000;

function readReloadIntervalMs(): number | null {
  const raw = new URLSearchParams(window.location.search).get("reloadHours")?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  // Missing, empty or non-numeric values fall back to the default; only an explicit 0 (or less) disables.
  const hours = Number.isFinite(parsed) ? parsed : DEFAULT_RELOAD_HOURS;
  if (hours <= 0) return null;
  return Math.max(hours * 60 * 60 * 1000, MIN_RELOAD_MS);
}

/**
 * Reloading while the network or server is down would leave the browser stuck on an error page
 * with no script running, so the reload only happens after the page itself answers.
 */
async function isPageReachable(): Promise<boolean> {
  if (!navigator.onLine) return false;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(window.location.href, { cache: "no-store", method: "HEAD", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Periodically reloads the page to release memory that a long-running YouTube iframe accumulates
 * on low-memory devices (e.g. Android TV boxes).
 */
export function useScheduledReload(screen: string, logging: boolean) {
  useEffect(() => {
    const intervalMs = readReloadIntervalMs();
    if (intervalMs === null) return;

    // Compare against wall-clock time so throttled or frozen timers still reload once they resume.
    const dueAt = Date.now() + intervalMs;
    let checking = false;
    let deferredLogged = false;
    let disposed = false;

    const timer = window.setInterval(async () => {
      if (checking || Date.now() < dueAt) return;

      checking = true;
      const reachable = await isPageReachable();
      checking = false;
      if (disposed) return;

      if (!reachable) {
        if (logging && !deferredLogged) {
          deferredLogged = true;
          appendPlayerLog({
            event: "scheduled_reload_deferred",
            details: { online: navigator.onLine, reason: "page_unreachable" },
            level: "warn",
            screen,
          });
        }
        return;
      }

      if (logging) {
        appendPlayerLog({
          event: "scheduled_reload",
          details: { intervalMinutes: Math.round(intervalMs / 60000) },
          sendToServer: true,
          screen,
        });
      }
      window.clearInterval(timer);
      window.location.reload();
    }, CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [logging, screen]);
}
