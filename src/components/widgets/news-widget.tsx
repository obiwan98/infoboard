"use client";

import { useEffect, useState } from "react";
import { useRef } from "react";
import { useScrollVisibility } from "@/hooks/use-scroll-visibility";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

export function NewsWidget() {
  const listRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [visibleItems, setVisibleItems] = useState<NewsItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useScrollVisibility(listRef);

  const pickRandomItems = (pool: NewsItem[], count: number) => {
    if (pool.length <= count) return pool;

    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/news");
        if (!response.ok) {
          throw new Error("Unable to load news feed.");
        }

        const result = (await response.json()) as NewsItem[];
        if (mounted) {
          setItems(result);
          setVisibleItems(pickRandomItems(result, 3));
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unexpected news error.");
        }
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) return;

    const rotate = window.setInterval(() => {
      setVisibleItems(pickRandomItems(items, 3));
    }, 10 * 1000);

    return () => {
      window.clearInterval(rotate);
    };
  }, [items]);

  return (
    <div className="mm-module flex h-full min-h-0 flex-col rounded-md p-5 md:p-6">
      <p className="mm-header pb-1 text-[11px]">News Feed</p>
      <div ref={listRef} className="smart-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
        {!error && visibleItems.length === 0 && <p className="mm-normal mt-1 text-sm">Loading headlines...</p>}
        <ul className="space-y-2">
          {visibleItems.map((item) => (
            <li key={`${item.link}-${item.pubDate}`} className="border-b border-[color:var(--mm-line)] pb-2 last:border-b-0">
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer noopener"
                className="mm-normal block truncate text-sm hover:text-white"
                title={item.title}
              >
                {item.title}
              </a>
              <p className="mm-dim mt-1 text-[11px]">
                {item.source}{" "}
                {item.pubDate
                  ? `· ${new Intl.DateTimeFormat("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(item.pubDate))}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
