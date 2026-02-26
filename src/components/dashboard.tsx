"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertOverlay } from "./alert-overlay";
import { useScrollVisibility } from "@/hooks/use-scroll-visibility";
import { CalendarWidget } from "./widgets/calendar-widget";
import { ClockWidget } from "./widgets/clock-widget";
import { NewsWidget } from "./widgets/news-widget";
import { WeatherWidget } from "./widgets/weather-widget";
import { useRef } from "react";

type WidgetId = "clock" | "weather" | "news" | "calendar";

const DEFAULT_ORDER: WidgetId[] = ["clock", "weather", "news", "calendar"];
const STORAGE_KEY = "infoboard-layout-v1";

const widgetFrameClass: Record<WidgetId, string> = {
  clock: "col-span-1 row-span-1 min-h-[220px] w-full min-w-0 min-[480px]:col-span-1 min-[480px]:row-span-1",
  weather: "col-span-1 row-span-1 min-h-[220px] w-full min-w-0 min-[480px]:col-span-1 min-[480px]:row-span-1",
  news: "col-span-1 row-span-1 min-h-[252px] w-full min-w-0 min-[480px]:col-span-2 min-[480px]:row-span-1",
  calendar: "col-span-1 row-span-1 w-full min-w-0 min-[480px]:col-span-2 min-[480px]:row-span-1",
};

function SortableCard({ id }: { id: WidgetId }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const content = useMemo(() => {
    if (id === "clock") return <ClockWidget />;
    if (id === "weather") return <WeatherWidget />;
    if (id === "news") return <NewsWidget />;
    return <CalendarWidget />;
  }, [id]);

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`${widgetFrameClass[id]} touch-none rounded-md`}
      {...attributes}
      {...listeners}
    >
      {content}
    </section>
  );
}

export function Dashboard() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<WidgetId[]>(() => {
    if (typeof window === "undefined") return DEFAULT_ORDER;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_ORDER;

    try {
      const parsed = JSON.parse(stored) as WidgetId[];
      return DEFAULT_ORDER.every((id) => parsed.includes(id)) ? parsed : DEFAULT_ORDER;
    } catch {
      return DEFAULT_ORDER;
    }
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  useScrollVisibility(gridRef);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((current) => {
      const oldIndex = current.indexOf(active.id as WidgetId);
      const newIndex = current.indexOf(over.id as WidgetId);
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  return (
    <main className="mm-shell relative mx-auto flex h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-lg p-4 md:p-8">
      <AlertOverlay />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            className="smart-scroll grid flex-1 grid-cols-1 gap-4 overflow-y-auto pb-2 min-[480px]:grid-cols-2 min-[480px]:gap-7"
          >
            {order.map((id) => (
              <SortableCard key={id} id={id} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </main>
  );
}
