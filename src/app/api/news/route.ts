import { XMLParser } from "fast-xml-parser";
import { NextResponse } from "next/server";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type RssNode = {
  rss?: {
    channel?: {
      title?: string;
      item?: Array<{
        title?: string;
        link?: string;
        pubDate?: string;
      }>;
    };
  };
};

const FEEDS = [
  "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko",
  "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
];

export async function GET() {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: true,
    trimValues: true,
  });

  try {
    const responses = await Promise.all(
      FEEDS.map((url) => fetch(url, { next: { revalidate: 300 } })),
    );

    const payload = await Promise.all(
      responses.map(async (response, idx) => {
        if (!response.ok) return [] as NewsItem[];
        const xml = await response.text();
        const parsed = parser.parse(xml) as RssNode;

        const channelTitle = parsed.rss?.channel?.title ?? `Feed ${idx + 1}`;
        const items = parsed.rss?.channel?.item ?? [];
        return items.slice(0, 6).map((item) => ({
          title: item.title ?? "Untitled",
          link: item.link ?? "#",
          pubDate: item.pubDate ?? "",
          source: channelTitle,
        }));
      }),
    );

    const merged = payload
      .flat()
      .filter((item) => item.link !== "#")
      .sort((a, b) => {
        const aTime = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const bTime = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);

    return NextResponse.json(merged);
  } catch {
    return NextResponse.json([]);
  }
}
