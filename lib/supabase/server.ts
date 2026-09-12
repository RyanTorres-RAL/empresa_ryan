import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client, authenticated with the service_role key.
 *
 * This bypasses Row Level Security, which is intentional: the crm_* tables
 * have RLS enabled with zero policies, so only the service role can read or
 * write them. Because of that, this module (and the service role key) must
 * NEVER be imported from a "use client" component or otherwise reach the
 * browser bundle — the `server-only` import above makes any accidental
 * client-side import fail at build time.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local (veja .env.local.example)."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
