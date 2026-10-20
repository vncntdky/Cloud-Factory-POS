// 404 for unknown routes and for notFound() from sale / product pages (bad or deleted ids,
// or a past day's sale that Staff can't see).
import Link from "next/link";
import { Ring } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <main className="login" id="main">
      <Ring className="login__ring" />
      <div className="login__card">
        <div className="login__brand">
          <span className="logo logo--lg" aria-hidden="true">
            V
          </span>
          <h1 className="t-display">Not found</h1>
          <p className="eyebrow">Vape POS</p>
        </div>
        <p>That page or record doesn&apos;t exist, or your account can&apos;t see it.</p>
        <div className="stack stack-2">
          <Link className="btn btn--primary btn--block" href="/">
            Back to Sell
          </Link>
          <Link className="btn btn--ghost btn--block" href="/sales">
            Sales
          </Link>
        </div>
      </div>
    </main>
  );
}
