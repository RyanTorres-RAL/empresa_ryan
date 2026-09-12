import "server-only";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Role, SessionProfile } from "@/lib/types";

/**
 * THE authorization guard for the whole app.
 *
 * Every Server Action and every server-side data read must start with
 * `requireUser()` or `requireOwner()`. Hiding a button in the nav protects
 * nothing: a signed-in funcionário can call any exported Server Action
 * directly by crafting a request, so the check has to live here, on the
 * server, before a single row is touched.
 *
 * How a user is identified:
 *   1. `supabase.auth.getUser()` on the auth client (anon key). getUser()
 *      revalidates the JWT against Supabase on every call. `getSession()` is
 *      NOT used anywhere for authorization — it only decodes whatever the
 *      cookie claims to be, which a client can forge.
 *   2. The verified user id is then looked up in crm_profiles with the
 *      service-role client (the only key that can read that table).
 *
 * Access is refused when there is no session, no crm_profiles row, or the
 * profile is deactivated (active = false).
 */

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export const NOT_SIGNED_IN = "Sessão expirada. Entre novamente.";
export const NOT_ACTIVE = "Seu acesso foi desativado. Fale com o dono da loja.";
export const NOT_OWNER = "Apenas o dono pode fazer isso.";

/**
 * Resolves the signed-in user's profile, or null when nobody valid is signed
 * in. Use this for page-level redirects; use requireUser/requireOwner (which
 * throw) inside Server Actions.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const auth = await createAuthServerClient();

  // getUser() — not getSession() — because this decides authorization.
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();

  if (error || !user) return null;

  const supabase = getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("crm_profiles")
    .select("user_id, name, role, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) return null;
  if (profile.active === false) return null;

  return {
    userId: user.id,
    name: profile.name || user.email || "Usuário",
    email: user.email ?? "",
    role: (profile.role === "dono" ? "dono" : "funcionario") as Role,
    active: true,
  };
}

/** Any signed-in, active user (dono OR funcionário). Throws otherwise. */
export async function requireUser(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) throw new AuthorizationError(NOT_SIGNED_IN);
  return profile;
}

/** Signed-in, active AND role = 'dono'. Throws otherwise. */
export async function requireOwner(): Promise<SessionProfile> {
  const profile = await requireUser();
  if (profile.role !== "dono") throw new AuthorizationError(NOT_OWNER);
  return profile;
}

/**
 * True once at least one crm_profiles row exists. Gates the first-run /setup
 * page — once the shop has an owner, /setup must refuse forever.
 */
export async function hasAnyProfile(): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("crm_profiles").select("user_id").limit(1);

  // Fail closed: if we cannot tell, assume the shop is already set up so
  // /setup stays closed rather than letting a stranger create an owner.
  if (error) return true;
  return (data ?? []).length > 0;
}
