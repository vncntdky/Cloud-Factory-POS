// KPI tiles. Phone: 2×2 (hero spans both columns). ≥768: 4 columns, hero spans 2.
// More than 4 tiles (Menu): <KpiGrid scroll five>.
import Link from "next/link";
import type { ReactNode } from "react";

export type KpiGridProps = {
  children: ReactNode;
  /** Snap-scroll strip on phone (kpi-grid--scroll). */
  scroll?: boolean;
  /** Five columns from 768px (kpi-grid--5). */
  five?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function KpiGrid({ children, scroll, five, className, ...rest }: KpiGridProps) {
  const cls = ["kpi-grid", scroll && "kpi-grid--scroll", five && "kpi-grid--5", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

export type KpiProps = {
  label: string;
  /** The number. Wrap money in <Money/>; plain numbers are rendered as-is inside .kpi__value. */
  value: ReactNode;
  meta?: ReactNode;
  /** Makes the whole tile a link (a chevron shows automatically). */
  href?: string;
  /** hero = inverted "Sales today" tile; due = mint money tile; alert = red value. */
  variant?: "hero" | "due" | "alert";
  /** Span both columns (phone) / two columns (≥768). */
  wide?: boolean;
  className?: string;
};

export function Kpi({ label, value, meta, href, variant, wide, className }: KpiProps) {
  const cls = ["kpi", variant && `kpi--${variant}`, wide && "kpi--wide", className].filter(Boolean).join(" ");
  const body = (
    <>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {meta !== undefined && meta !== null && meta !== "" && <span className="kpi__meta">{meta}</span>}
    </>
  );
  return href ? (
    <Link className={cls} href={href}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
