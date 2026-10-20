"use client";

import { useEffect, useRef } from "react";

/** Toggles data-scrolled on the parent .topbar once the page scrolls. Renders an empty span. */
export function TopbarScroll() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = ref.current?.parentElement;
    if (!bar) return;
    const update = () => {
      bar.dataset.scrolled = window.scrollY > 2 ? "true" : "false";
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <span ref={ref} hidden />;
}
