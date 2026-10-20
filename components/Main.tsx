import type { ReactNode } from "react";

export type MainProps = {
  children: ReactNode;
  /** Set when the page renders a sticky .actionbar (adds bottom room). */
  hasActionbar?: boolean;
  className?: string;
};

/** <main id="main" class="page">: the skip link's target. Render it right after <Topbar/>. */
export function Main({ children, hasActionbar, className }: MainProps) {
  const cls = ["page", hasActionbar && "page--has-actionbar", className].filter(Boolean).join(" ");
  return (
    <main id="main" className={cls} tabIndex={-1}>
      {children}
    </main>
  );
}

export default Main;
