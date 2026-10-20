// Page top bar. Sticky 56px on phone/tablet; a static display-size page header on desktop.
// Each staff page renders <Topbar …/> followed by <Main>…</Main> (components/Main.tsx).
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { TopbarScroll } from "@/components/TopbarScroll";

export type TopbarProps = {
  title: ReactNode;
  /** Small uppercase line above the title (desktop only), e.g. "SAT · 17 OCT". */
  eyebrow?: ReactNode;
  /** Adds a back chevron (topbar--back). */
  backHref?: string;
  /** aria-label for the back link, e.g. "Back to inventory". Default "Back". */
  backLabel?: string;
  /** Right-hand buttons: icon-btn / text-btn / small btn. */
  actions?: ReactNode;
  /** Hide the title on phone (the page shows its own heading). */
  hideTitleOnPhone?: boolean;
};

export function Topbar({ title, eyebrow, backHref, backLabel, actions, hideTitleOnPhone }: TopbarProps) {
  return (
    <header className={`topbar${backHref ? " topbar--back" : ""}`} data-scrolled="false">
      {eyebrow && <span className="eyebrow topbar__eyebrow">{eyebrow}</span>}
      {backHref && (
        <Link className="icon-btn" href={backHref} aria-label={backLabel ?? "Back"}>
          <Icon name="chevron-left" />
        </Link>
      )}
      <h1 className={`topbar__title${hideTitleOnPhone ? " topbar__title--phone-hidden" : ""}`}>{title}</h1>
      {actions && <div className="topbar__actions">{actions}</div>}
      <TopbarScroll />
    </header>
  );
}

export default Topbar;
