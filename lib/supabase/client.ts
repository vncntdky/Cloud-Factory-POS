import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Call before subscribing to Realtime. On a fresh page load the socket otherwise joins before the
 * session is read from cookies, i.e. as anonymous, and RLS then hides every row from it.
 */
export async function realtimeAuth(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
}
