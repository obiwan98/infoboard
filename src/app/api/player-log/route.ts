import { NextResponse } from "next/server";

type PlayerLogPayload = {
  details?: Record<string, boolean | null | number | string>;
  event?: string;
  id?: string;
  level?: "error" | "info" | "warn";
  screen?: string;
  timestamp?: string;
};

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
