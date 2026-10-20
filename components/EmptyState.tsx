import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  text?: ReactNode;
  /** A button or link, e.g. <Link className="btn btn--money" href="/inventory/new">Add product</Link>. */
  action?: ReactNode;
  /** Smaller version for inside cards. */
  compact?: boolean;
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3";
};

/** Decorative open ring (empty states, login backdrop). */
export function Ring({ className = "ring" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M60 14c25 0 46 20 46 46s-21 46-46 46S14 86 14 60c0-15 7-28 18-37"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({ title, text, action, compact, as: H = "h2" }: EmptyStateProps) {
  return (
    <div className={`empty${compact ? " empty--compact" : ""}`}>
      <div className="empty__art">
        <Ring />
      </div>
      <H className="empty__title">{title}</H>
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
