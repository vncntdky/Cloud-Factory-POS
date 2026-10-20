"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/Icon";
import { Ring } from "@/components/EmptyState";

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first: tap the link we sent you, then sign in.";
  if (/fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection.";
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(friendlyAuthError(error.message));
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login" id="main">
      <Ring className="login__ring" />
      <form className="login__card" onSubmit={onSubmit}>
        <div className="login__brand">
          <span className="logo logo--lg" aria-hidden="true">
            V
          </span>
          <h1 className="t-display">Vape POS</h1>
          <p className="eyebrow">Staff sign in</p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            enterKeyHint="next"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            enterKeyHint="go"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
          {error && (
            <p className="field__error" id="login-error" role="alert">
              <Icon name="alert" />
              {error}
            </p>
          )}
        </div>

        <button
          className="btn btn--primary btn--lg btn--block"
          type="submit"
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="t-sm" style={{ textAlign: "center" }}>
          New here? <Link href="/signup">Create a staff account</Link>
        </p>
        <p className="login__foot">For adults 18+ only</p>
      </form>
    </main>
  );
}
