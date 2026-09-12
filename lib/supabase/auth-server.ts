import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase AUTH client (publishable/anon key), for Server Components, Server
 * Actions and Route Handlers.
 *
 * This client exists only to sign in, sign out and read the current session.
 * The anon key is public by design and, because every crm_* table has RLS
 * enabled with zero policies, it cannot read or write any business data —
 * that stays exclusively with the service-role client in ./server.ts.
 *
 * Keep the two apart:
 *   - ./auth-server.ts (this file) → who is the user?
 *   - ./server.ts (service role)   → the actual data.
 */

export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase Auth não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local (veja .env.local.example)."
    );
  }

  return { url, anonKey };
}

/**
 * A new client per request — never cache this in a module-level variable, the
 * cookie store it closes over belongs to one single request.
 */
export async function createAuthServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: the proxy (proxy.ts) refreshes the session cookie
          // on every request, so the refreshed token is never lost.
        }
      },
    },
  });
}
