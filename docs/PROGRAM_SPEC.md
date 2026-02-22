# Infoboard Dashboard Program Spec

## 1. Goal
- Build a widget-based dashboard web app with Next.js.
- Target display: 27-inch monitor in portrait orientation (reference layout: 1440 x 2560 ratio).
- Core widgets: Clock, Weather, Calendar.
- Core widgets: Clock, Weather, Calendar, News Feed.
- Allow drag-and-drop widget position changes.
- Prepare for Vercel deployment.

## 2. Functional Requirements
- The dashboard displays a portrait-optimized board.
- Widgets render as cards above a blurred background image.
- Users can drag widgets to reorder layout.
- Widget order should persist locally in browser storage.
- Clock updates in real time.
- Weather loads from external weather data API (Open-Meteo).
- Calendar displays current month grid.

## 3. Non-Functional Requirements
- Responsive behavior for smaller screens.
- Fast first load with Next.js App Router.
- No paid API dependency for baseline weather widget.
- Deployment compatibility with Vercel without custom server.

## 4. Technical Stack
- Framework: Next.js (App Router, TypeScript)
- UI: React + Tailwind CSS
- Drag and drop: @dnd-kit/core, @dnd-kit/sortable
- Weather source: Open-Meteo API via Next.js route handler
- Calendar event source: ICS feeds via `CALENDAR_ICS_URLS`

## 5. Information Architecture
- `src/app/page.tsx`: Dashboard page entry.
- `src/components/dashboard.tsx`: Grid layout, drag/drop, persistence.
- `src/components/widgets/*`: Clock, Weather, Calendar widgets.
- `src/app/api/weather/route.ts`: Weather proxy endpoint.
- `src/app/api/weather/route.ts`: Weather proxy endpoint.
- `src/app/api/news/route.ts`: RSS aggregation endpoint.
- `src/app/api/calendar-events/route.ts`: ICS event aggregation endpoint.
- `public/dashboard-bg.svg`: Dashboard background image.

## 6. UX Notes
- Portrait dashboard frame centered on screen.
- Visual style: translucent cards, soft blur, readable contrast.
- Drag handle behavior: whole card draggable.
- Mobile fallback: single-column friendly scaling.

## 7. Deployment Plan (Vercel)
- Push project to GitHub repository.
- Import repository in Vercel.
- Framework preset: Next.js (auto-detected).
- Build command: `npm run build`
- Output: default Next.js output.
- Environment variables: none required for baseline version.

## 8. Runbook
- Install dependencies: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Production build check: `npm run build`

## 9. Future Extensions
- User-configurable city/location for weather.
- Additional widgets (todo list, quick memo, transit).
- Auth + cloud sync of widget layout.
