import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session fresh and sends signed-out visitors to /login.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // A deploy without the Supabase settings would otherwise fail with a bare 500 on every page.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean).join(" and ");
    return new NextResponse(
      `Setup needed: ${missing} is not set.\n\nIn Vercel → Project → Settings → Environment Variables, add it for Production, ` +
        `then Deployments → ⋯ → Redeploy (the value is built into the app, so a redeploy is needed).`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // No-cache headers from Supabase so a CDN never serves one user's session to another.
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const onLogin = path.startsWith("/login") || path.startsWith("/signup");
  // The email-confirmation link arrives signed out and signs the new account in.
  const publicRoute = onLogin || path.startsWith("/auth/confirm");
  if (!user && !publicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already signed in: the login page has nothing to do, go to the register.
  if (user && onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies, or the rotated refresh token would be lost.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  // Static files and the app manifest load without a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|webp|ico|webmanifest)$).*)"],
};
