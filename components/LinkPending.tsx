"use client";

// Inside a <Link>: lights up the moment it's tapped and stays on until the page arrives, so a
// tap always answers at once even when the server is far away.
import { useLinkStatus } from "next/link";

export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span className={`link-pending${pending ? " is-pending" : ""}`} aria-hidden="true" />;
}
