"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const EVENT = "vp:theme";
const META = { light: "#F2F2F7", dark: "#0E0D14" };

function apply(t: ThemeChoice) {
  const root = document.documentElement;
  try {
    if (t === "system") {
      document.cookie = "vp-theme=; path=/; max-age=0; samesite=lax";
      delete root.dataset.theme;
    } else {
      document.cookie = `vp-theme=${t}; path=/; max-age=31536000; samesite=lax`;
      root.dataset.theme = t;
    }
  } catch {
    /* cookies blocked: the choice still applies to this page */
  }
  // Keep the browser chrome colour in step with a forced theme.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media") ?? "";
    if (t === "system") m.content = media.includes("dark") ? META.dark : META.light;
    else m.content = META[t];
  });
}

export type ThemeToggleProps = {
  /** Server-read vp-theme cookie value; anything else means "system". */
  initial?: string | null;
  /** segmented--sm (sidebar). Default true. */
  small?: boolean;
  className?: string;
};

/** Segmented System / Light / Dark (radiogroup with roving tabindex). */
export function ThemeToggle({ initial, small = true, className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeChoice>(initial === "light" || initial === "dark" ? initial : "system");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  function choose(t: ThemeChoice) {
    setTheme(t);
    apply(t);
    window.dispatchEvent(new CustomEvent<ThemeChoice>(EVENT, { detail: t }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % OPTIONS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = OPTIONS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    choose(OPTIONS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      className={["segmented", small && "segmented--sm", className].filter(Boolean).join(" ")}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className="segmented__option"
          role="radio"
          aria-checked={theme === o.value}
          tabIndex={theme === o.value ? 0 : -1}
          onClick={() => choose(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default ThemeToggle;
