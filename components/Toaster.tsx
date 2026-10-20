"use client";

// Toasts for quick confirmations (sale done, stock saved). The shell renders one
// <Toaster/>; any client component calls toast("Sale #7 · ₱350") or
// toast({ text, actionLabel: "Undo", onAction }).
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";

export type ToastOptions = {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
  /** ms before auto-dismiss (paused on hover/focus). Default 5000. */
  duration?: number;
};

type ToastItem = ToastOptions & { id: number };

const EVENT = "vp:toast";
let seq = 0;

/** Show a toast. Safe to call from any client component or event handler. */
export function toast(input: string | ToastOptions) {
  if (typeof window === "undefined") return;
  const detail: ToastOptions = typeof input === "string" ? { text: input } : input;
  window.dispatchEvent(new CustomEvent<ToastOptions>(EVENT, { detail }));
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(item.duration ?? 5000);
  const started = useRef(0);

  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const t = window.setTimeout(() => onClose(item.id), left.current);
    return () => {
      window.clearTimeout(t);
      left.current -= Date.now() - started.current;
    };
  }, [paused, item.id, onClose]);

  return (
    <div
      className="toast"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={item.icon ?? "check"} />
      <span className="toast__text">{item.text}</span>
      {item.actionLabel && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            item.onAction?.();
            onClose(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [aboveBar, setAboveBar] = useState(false);

  const close = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastOptions>).detail;
      // Sit above a sticky action bar when the page has one.
      setAboveBar(!!document.querySelector(".actionbar"));
      setItems((xs) => [...xs.slice(-2), { ...detail, id: ++seq }]);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className={`toast-region${aboveBar ? " toast-region--above-bar" : ""}`} aria-live="polite">
      {items.map((t) => (
        <ToastView key={t.id} item={t} onClose={close} />
      ))}
    </div>
  );
}

export default Toaster;
