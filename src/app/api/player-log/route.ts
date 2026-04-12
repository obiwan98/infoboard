import { NextResponse } from "next/server";

type PlayerLogPayload = {
  details?: Record<string, boolean | null | number | string>;
  event?: string;
  id?: string;
  level?: "error" | "info" | "warn";
  screen?: string;
  timestamp?: string;
};

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getSummaryLine(payload: PlayerLogPayload) {
  const details = payload.details ?? {};
  const parts = [
    `screen=${payload.screen ?? "unknown"}`,
    `event=${payload.event ?? "unknown"}`,
  ];

  const stateLabel = typeof details.eventStateLabel === "string" ? details.eventStateLabel : null;
  if (stateLabel) {
    parts.push(`state=${stateLabel}`);
  }

  const videoId = typeof details.videoId === "string" ? details.videoId : null;
  if (videoId) {
    parts.push(`video=${videoId}`);
  }

  const playlistIndex = typeof details.playlistIndex === "number" ? details.playlistIndex : null;
  const playlistSize = typeof details.playlistSize === "number" ? details.playlistSize : null;
  if (playlistIndex !== null && playlistSize !== null) {
    parts.push(`playlist=${playlistIndex + 1}/${playlistSize}`);
  }

  const currentTimeSec = typeof details.currentTimeSec === "number" ? details.currentTimeSec : null;
  const durationSec = typeof details.durationSec === "number" ? details.durationSec : null;
  if (currentTimeSec !== null || durationSec !== null) {
    parts.push(`time=${formatNumber(currentTimeSec) ?? "?"}/${formatNumber(durationSec) ?? "?"}s`);
  }

  const progressPercent = typeof details.playbackProgressPercent === "number" ? details.playbackProgressPercent : null;
  if (progressPercent !== null) {
    parts.push(`progress=${formatNumber(progressPercent)}%`);
  }

  const remainingSec = typeof details.remainingSec === "number" ? details.remainingSec : null;
  if (remainingSec !== null) {
    parts.push(`remaining=${formatNumber(remainingSec)}s`);
  }

  const reason = typeof details.reason === "string" ? details.reason : null;
  if (reason) {
    parts.push(`reason=${reason}`);
  }

  const errorCode = typeof details.errorCode === "number" ? details.errorCode : null;
  if (errorCode !== null) {
    parts.push(`errorCode=${errorCode}`);
  }

  const directVideoUrl = typeof details.directVideoUrl === "string" ? details.directVideoUrl : null;
  if (directVideoUrl) {
    parts.push(`url=${directVideoUrl}`);
  }

  return parts.join(" | ");
}

export async function POST(request: Request) {
  let payload: PlayerLogPayload | null = null;

  try {
    payload = (await request.json()) as PlayerLogPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!payload?.event || !payload?.screen || !payload?.timestamp) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const logMethod = payload.level === "error" ? console.error : payload.level === "warn" ? console.warn : console.info;
  logMethod("[player-log-summary]", getSummaryLine(payload));
  logMethod("[player-log]", {
    details: payload.details ?? {},
    event: payload.event,
    id: payload.id ?? "unknown",
    screen: payload.screen,
    timestamp: payload.timestamp,
    userAgent: request.headers.get("user-agent") ?? "unknown",
  });

  return NextResponse.json({ ok: true });
}
