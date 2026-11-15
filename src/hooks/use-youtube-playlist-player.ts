"use client";

import { RefObject, useEffect } from "react";

import { appendPlayerLog } from "@/lib/player-log";
import { describePlayerState, getPlayerSnapshot, loadYouTubeIframeApi, type YouTubePlayer } from "@/lib/youtube";

const HEARTBEAT_INTERVAL_MS = 30000;
const STALL_HEARTBEAT_THRESHOLD = 2;
const SHUFFLE_PLAYLIST = true;

type Options = {
  /**
   * When true: logs every player event, runs the stall-detection heartbeat and skips to the next
   * video on errors. When false ("light" mode): plain muted shuffle loop with autoplay retry only.
   */
  monitoring: boolean;
  screen: string;
};

/** Mounts a muted, looping, shuffled YouTube playlist player into `hostRef`. */
export function useYouTubePlaylistPlayer(
  hostRef: RefObject<HTMLDivElement | null>,
  playlistId: string | null,
  { monitoring, screen }: Options,
) {
  useEffect(() => {
    if (!playlistId || !hostRef.current) return;

    let disposed = false;
    let heartbeatTimer: number | null = null;
    let stalledHeartbeatCount = 0;
    let lastHeartbeatTime: number | null = null;
    let lastHeartbeatVideoUrl: string | null = null;
    let player: YouTubePlayer | null = null;

    const log = (input: Omit<Parameters<typeof appendPlayerLog>[0], "screen">) => {
      if (monitoring) appendPlayerLog({ ...input, screen });
    };

    log({ event: "player_init", details: { playlistId, shuffle: SHUFFLE_PLAYLIST } });

    const schedulePlaybackRecovery = (target: YouTubePlayer, delayMs: number, reason: string, details?: Record<string, unknown>) => {
      log({
        event: "recovery_scheduled",
        details: { delayMs, reason, ...details, ...getPlayerSnapshot(target) },
        level: "warn",
      });

      window.setTimeout(() => {
        if (disposed) return;
        log({
          event: "recovery_next_video",
          details: { reason, ...getPlayerSnapshot(target) },
          level: "warn",
        });
        target.nextVideo?.();
      }, delayMs);
    };

    const startHeartbeat = (target: YouTubePlayer) => {
      heartbeatTimer = window.setInterval(() => {
        const snapshot = getPlayerSnapshot(target);
        const isSameVideo = snapshot.videoUrl === lastHeartbeatVideoUrl;
        const isProgressStalled =
          (snapshot.playerState === 1 || snapshot.playerState === 3) &&
          snapshot.currentTimeSec !== null &&
          lastHeartbeatTime !== null &&
          snapshot.currentTimeSec <= lastHeartbeatTime &&
          isSameVideo;

        stalledHeartbeatCount = isProgressStalled ? stalledHeartbeatCount + 1 : 0;
        lastHeartbeatTime = snapshot.currentTimeSec;
        lastHeartbeatVideoUrl = snapshot.videoUrl;

        log({ event: "heartbeat", details: { stalledHeartbeatCount, ...snapshot } });

        if (stalledHeartbeatCount >= STALL_HEARTBEAT_THRESHOLD) {
          log({
            event: "stalled_detected",
            details: { stalledHeartbeatCount, ...snapshot },
            level: "warn",
            sendToServer: true,
          });
          stalledHeartbeatCount = 0;
          schedulePlaybackRecovery(target, 0, "stalled_heartbeat", {
            stalledHeartbeatCount: STALL_HEARTBEAT_THRESHOLD,
          });
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    void loadYouTubeIframeApi().then(() => {
      if (disposed || !window.YT || !hostRef.current) return;

      player = new window.YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          loop: 1,
          mute: 1,
          listType: "playlist",
          list: playlistId,
          playlist: playlistId,
        },
        events: {
          onReady: (event) => {
            event.target.mute();
            event.target.setLoop?.(true);
            event.target.setShuffle?.(SHUFFLE_PLAYLIST);
            log({
              event: "player_ready",
              details: { shuffle: SHUFFLE_PLAYLIST, ...getPlayerSnapshot(event.target) },
            });

            if (monitoring) startHeartbeat(event.target);

            window.setTimeout(() => {
              if (disposed) return;
              // setShuffle keeps the already-cued first video, so pick the start video ourselves.
              const playlistSize = event.target.getPlaylist?.()?.length ?? 0;
              const startIndex =
                SHUFFLE_PLAYLIST && playlistSize > 1 && event.target.playVideoAt
                  ? Math.floor(Math.random() * playlistSize)
                  : null;
              log({
                event: "playback_start_requested",
                details: { shuffledStart: SHUFFLE_PLAYLIST, startIndex, ...getPlayerSnapshot(event.target) },
              });
              if (startIndex !== null) {
                event.target.playVideoAt?.(startIndex);
              } else {
                event.target.playVideo();
              }
            }, 200);
          },
          ...(monitoring
            ? {
                onStateChange: (event) => {
                  stalledHeartbeatCount = 0;
                  lastHeartbeatTime = null;
                  lastHeartbeatVideoUrl = event.target.getVideoUrl?.() ?? null;

                  log({
                    event: "state_change",
                    details: {
                      eventState: event.data ?? null,
                      eventStateLabel: describePlayerState(event.data),
                      ...getPlayerSnapshot(event.target),
                    },
                  });
                },
                onError: (event) => {
                  log({
                    event: "player_error",
                    details: { errorCode: event.data ?? null, ...getPlayerSnapshot(event.target) },
                    level: "error",
                    sendToServer: true,
                  });
                  schedulePlaybackRecovery(event.target, 400, "player_error", { errorCode: event.data ?? null });
                },
              }
            : {}),
          onAutoplayBlocked: (event) => {
            log({
              event: "autoplay_blocked",
              details: getPlayerSnapshot(event.target),
              level: "warn",
              sendToServer: true,
            });
            window.setTimeout(() => {
              if (disposed) return;
              log({ event: "autoplay_retry", details: getPlayerSnapshot(event.target), level: "warn" });
              event.target.mute();
              event.target.playVideo();
            }, 400);
          },
        },
      });
    });

    return () => {
      disposed = true;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      log({
        event: "player_dispose",
        details: player ? getPlayerSnapshot(player) : { playlistId },
      });
      player?.destroy();
    };
  }, [hostRef, monitoring, playlistId, screen]);
}
