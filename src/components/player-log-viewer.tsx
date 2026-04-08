"use client";

import { useEffect, useState } from "react";

import { clearPlayerLogs, getPlayerLogs, type PlayerLogEntry } from "@/lib/player-log";

function formatDetails(details?: Record<string, string | number | boolean | null>) {
  if (!details || Object.keys(details).length === 0) return "-";
  return JSON.stringify(details, null, 2);
}

export function PlayerLogViewer() {
  const [logs, setLogs] = useState<PlayerLogEntry[]>([]);

  useEffect(() => {
    const refresh = () => {
      setLogs(getPlayerLogs());
    };

    refresh();
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Player Logs</h1>
            <p className="mt-1 text-sm text-neutral-400">Recent YouTube player events stored in localStorage.</p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-900"
              onClick={() => setLogs(getPlayerLogs())}
              type="button"
            >
              Refresh
            </button>
            <button
              className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-100 transition hover:bg-red-900"
              onClick={() => {
                clearPlayerLogs();
                setLogs([]);
              }}
              type="button"
            >
              Clear
            </button>
          </div>
        </header>

        <section className="mb-4 text-sm text-neutral-400">
          <p>Total entries: {logs.length}</p>
        </section>

        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-400">
              No logs recorded yet.
            </div>
          ) : (
            logs.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="rounded bg-neutral-800 px-2 py-1 font-medium uppercase tracking-wide">{entry.level}</span>
                  <span className="text-neutral-300">{entry.screen}</span>
                  <span className="font-medium text-white">{entry.event}</span>
                  <time className="text-neutral-500">{entry.timestamp}</time>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md bg-black/30 p-3 text-xs text-neutral-300">
                  {formatDetails(entry.details)}
                </pre>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
