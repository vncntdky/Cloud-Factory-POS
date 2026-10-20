"use client";

// Staff create their own account here. New accounts can't see anything until the owner turns
// them on and picks their role in Settings → Staff (profiles.active defaults to false and every
// table's row-level security requires an active account).
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/Icon";
import { Ring } from "@/components/EmptyState";

function friendlySignupError(message: string) {
  if (/already registered|already exists/i.test(message)) return "That email already has an account. Sign in instead.";
  if (/password/i.test(message)) return "Use a password of at least 8 characters.";
  if (/rate limit|too many/i.test(message)) return "Too many tries. Wait a few minutes and try again.";
  if (/signups not allowed|disabled/i.test(message)) return "Sign-ups are turned off. Ask the owner to add you.";
  if (/fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection.";
  return message;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Add your name so the owner knows who you are.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim().slice(0, 80) },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (error) {
      setError(friendlySignupError(error.message));
      setBusy(false);
      return;
    }
    if (data.session) {
      // Email confirmation is off: already signed in; the app shows "waiting for the owner".
      router.replace("/");
      router.refresh();
      return;
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="login" id="main">
      <Ring className="login__ring" />
      <form className="login__card" onSubmit={onSubmit} noValidate>
        <div className="login__brand">
          <span className="logo logo--lg" aria-hidden="true">
            V
          </span>
          <h1 className="t-display">Vape POS</h1>
          <p className="eyebrow">Create a staff account</p>
        </div>

        {sent ? (
          <div className="notice notice--success" role="status">
            <Icon name="check" />
            <div>
              <p className="notice__title">Check your email.</p>
              <p>
                Tap the link we sent to {email.trim()}. Then tell the owner you signed up so they can turn your account
                on.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="t-sm muted">
              After you sign up, the owner turns your account on and picks your role. Until then you won&apos;t see the
              register or any sales. The very first account becomes the owner.
            </p>
            <div className="field">
              <label className="field__label" htmlFor="su-name">
                Your name
              </label>
              <input
                id="su-name"
                className="input"
                autoComplete="name"
                enterKeyHint="next"
                maxLength={80}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="su-email">
                Email
              </label>
              <input
                id="su-email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="off"
                enterKeyHint="next"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="su-password">
                Password
              </label>
              <input
                id="su-password"
                className="input"
                type="password"
                autoComplete="new-password"
                enterKeyHint="go"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={error ? "su-error su-pw-h" : "su-pw-h"}
                aria-invalid={error ? true : undefined}
              />
              <p className="field__hint" id="su-pw-h">
                At least 8 characters.
              </p>
              {error && (
                <p className="field__error" id="su-error" role="alert">
                  <Icon name="alert" />
                  {error}
                </p>
              )}
            </div>
            <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy} aria-busy={busy || undefined}>
              {busy ? "Creating account…" : "Create account"}
            </button>
          </>
        )}
        <p className="t-sm" style={{ textAlign: "center" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
