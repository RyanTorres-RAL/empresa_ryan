/**
 * "Is the system already set up?" probe, callable from the proxy (Next.js
 * middleware), which runs on the Edge runtime.
 *
 * It deliberately does NOT import lib/supabase/server.ts: that module imports
 * `server-only`, which resolves to a module that throws outside the
 * react-server condition — i.e. it would blow up inside the proxy. A plain
 * PostgREST fetch has no such problem and keeps the proxy bundle tiny.
 *
 * This is server-side code (proxy + Server Components only). The service-role
 * key it reads is never bundled for the browser: no "use client" module
 * imports this file.
 */
async function queryProfiles(query: string): Promise<unknown[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  try {
    const res = await fetch(`${url}/rest/v1/crm_profiles?${query}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const rows: unknown = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** True once the shop has at least one user. Gates /setup. */
export async function hasAnyProfileViaRest(): Promise<boolean> {
  const rows = await queryProfiles("select=user_id&limit=1");
  // Fail closed: if we cannot tell, assume it IS set up, so /setup stays shut
  // instead of offering a stranger the chance to create an owner account.
  if (rows === null) return true;
  return rows.length > 0;
}

/**
 * True when this Supabase user still has an ACTIVE profile.
 *
 * Used only on /login, to decide whether an existing session is worth
 * bouncing back into the app. Without this check a deactivated (or
 * profile-less) user with a still-valid Supabase cookie would ping-pong
 * forever: proxy sends /login → /, the page finds no usable profile and
 * sends / → /login.
 */
export async function hasActiveProfileViaRest(userId: string): Promise<boolean> {
  const rows = await queryProfiles(
    `select=user_id&user_id=eq.${encodeURIComponent(userId)}&active=is.true&limit=1`
  );
  // Fail "no": worst case the person just sees the login form again.
  if (rows === null) return false;
  return rows.length > 0;
}
