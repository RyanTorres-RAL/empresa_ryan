import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasActiveProfileViaRest, hasAnyProfileViaRest } from "./profiles-probe";

/**
 * Session refresh + route protection, run by ../../proxy.ts on every request.
 *
 * Two jobs:
 *  1. Refresh the Supabase auth cookie. `createServerClient` writes the
 *     rotated tokens through `setAll`, which is why the response object has
 *     to be rebuilt there and returned untouched at the end — dropping those
 *     cookies logs people out at random.
 *  2. Send visitors where they belong: no session → /login; already signed in
 *     → out of /login; /setup only while the shop has no users at all.
 *
 * This is a convenience layer, not the security boundary. The real check is
 * the guard in lib/server/auth.ts that every Server Action calls.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without config there is nothing to verify; let the page render its own
  // "Supabase não configurado" error rather than redirect-looping.
  if (!url || !anonKey) return supabaseResponse;

  // Per-request client — never hoist this to a module-level variable.
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        // Cache-Control etc. — responses that set auth cookies must never be
        // cached by a CDN, or one person's session could be served to another.
        for (const [key, value] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and this call.
  // getUser() (not getSession()) revalidates the token with Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isSetup = pathname === "/setup";

  if (isSetup) {
    // First-run page: open only while nobody exists yet. The /setup page and
    // the primeiroAcesso() action re-check this server-side too.
    if (user) return redirectTo(request, "/");
    if (await hasAnyProfileViaRest()) return redirectTo(request, "/login");
    return supabaseResponse;
  }

  if (!user) {
    if (isLogin) return supabaseResponse;
    // Brand new install: send the owner to create his account instead of
    // showing him a login screen he cannot possibly pass.
    if (!(await hasAnyProfileViaRest())) return redirectTo(request, "/setup");
    return redirectTo(request, "/login");
  }

  if (isLogin) {
    // Signed in already — but only bounce them into the app if their profile
    // is still active, otherwise they need this page to sign in as someone
    // else (and we would bounce them back and forth forever).
    if (await hasActiveProfileViaRest(user.id)) return redirectTo(request, "/");
    return supabaseResponse;
  }

  return supabaseResponse;
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}
