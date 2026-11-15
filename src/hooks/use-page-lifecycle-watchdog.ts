"use client";

import { useEffect } from "react";

import { appendPlayerLog, startPlayerSessionWatchdog } from "@/lib/player-log";

/**
 * Tracks page lifecycle events (visibility, pageshow/pagehide, freeze, offline) for a player screen
 * and keeps a watchdog record so an unclean exit can be detected on the next start.
 */
export function usePageLifecycleWatchdog(screen: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const watchdog = startPlayerSessionWatchdog({
      screen,
      sendToServer: true,
    });

    const logLifecycleEvent = (event: string, details?: Record<string, unknown>) => {
      appendPlayerLog({
        event,
        details,
        level: "warn",
        sendToServer: true,
        screen,
      });
    };

    const markAt = new Date().toISOString();
    watchdog.mark("pageshow", {
      lastPageShowAt: markAt,
      lastPageShowPersisted: false,
      visibilityState: document.visibilityState,
    });
    logLifecycleEvent("pageshow", {
      initialLoad: true,
      persisted: false,
      visibilityState: document.visibilityState,
    });

    const handleVisibilityChange = () => {
      const occurredAt = new Date().toISOString();
      watchdog.mark("visibilitychange", {
        lastHiddenAt: document.visibilityState === "hidden" ? occurredAt : undefined,
        visibilityState: document.visibilityState,
      });

      if (document.visibilityState === "hidden") {
        logLifecycleEvent("page_hidden", { visibilityState: document.visibilityState });
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      watchdog.mark("pageshow", {
        lastPageShowAt: new Date().toISOString(),
        lastPageShowPersisted: event.persisted,
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("pageshow", {
        persisted: event.persisted,
        visibilityState: document.visibilityState,
      });
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      watchdog.mark("pagehide", {
        lastPageHideAt: new Date().toISOString(),
        lastPageHidePersisted: event.persisted,
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("pagehide", {
        persisted: event.persisted,
        visibilityState: document.visibilityState,
      });
    };

    const handleFreeze = () => {
      watchdog.mark("page_freeze", {
        lastFreezeAt: new Date().toISOString(),
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("page_freeze");
    };

    const handleOffline = () => {
      watchdog.mark("network_offline", {
        lastOfflineAt: new Date().toISOString(),
        visibilityState: document.visibilityState,
      });
      logLifecycleEvent("network_offline");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("freeze", handleFreeze as EventListener);
    window.addEventListener("offline", handleOffline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("freeze", handleFreeze as EventListener);
      window.removeEventListener("offline", handleOffline);
      watchdog.close("effect_cleanup");
    };
  }, [enabled, screen]);
}
