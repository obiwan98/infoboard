"use client";

import { RefObject, useEffect } from "react";

export function useScrollVisibility<T extends HTMLElement>(
  ref: RefObject<T | null>,
  idleMs = 800,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let timer: number | null = null;

    const showScrollbar = () => {
      element.classList.add("scroll-active");
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        element.classList.remove("scroll-active");
      }, idleMs);
    };

    element.addEventListener("scroll", showScrollbar, { passive: true });
    element.addEventListener("wheel", showScrollbar, { passive: true });
    element.addEventListener("touchmove", showScrollbar, { passive: true });

    return () => {
      element.removeEventListener("scroll", showScrollbar);
      element.removeEventListener("wheel", showScrollbar);
      element.removeEventListener("touchmove", showScrollbar);
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [idleMs, ref]);
}
