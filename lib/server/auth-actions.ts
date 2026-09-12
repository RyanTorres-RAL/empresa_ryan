"use server";

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { hasAnyProfile } from "./auth";
import { SimpleResult } from "@/lib/types";

/**
 * Sign-in / sign-out / first-run setup.
 *
 * These are the ONLY Server Actions in the app that are reachable without
 * being signed in — that is their whole job. Every other action must start
 * with requireUser() or requireOwner() (see lib/server/auth.ts).
 *
 * Each one still enforces its own precondition:
 *   - entrar():      credentials are verified by Supabase Auth, then the
 *                    crm_profiles row must exist and be active.
 *   - primeiroAcesso(): refuses as soon as any profile exists.
 */

const MIN_PASSWORD = 6;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string): string | null {
  if (!email.trim()) return "Digite o seu e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Digite um e-mail válido.";
  if (!password) return "Digite a sua senha.";
  return null;
}

/** Signs the user in and sends them to the app. */
export async function entrar(email: string, password: string): Promise<SimpleResult> {
  const validation = validateCredentials(email, password);
  if (validation) return { ok: false, error: validation };

  const auth = await createAuthServerClient();
  const { data, error } = await auth.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (error || !data.user) {
    // Deliberately vague: never reveal whether the e-mail exists.
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  // Signed in with Supabase, but access to THIS app also requires an active
  // crm_profiles row. A deactivated person gets signed straight back out.
  const supabase = getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("crm_profiles")
    .select("user_id, active")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError) {
    await auth.auth.signOut();
    return { ok: false, error: "Não foi possível verificar o seu acesso. Tente de novo." };
  }

  if (!profile) {
    await auth.auth.signOut();
    return { ok: false, error: "Este usuário não tem acesso ao sistema. Fale com o dono da loja." };
  }

  if (profile.active === false) {
    await auth.auth.signOut();
    return { ok: false, error: "Seu acesso foi desativado. Fale com o dono da loja." };
  }

  redirect("/");
}

/** Clears the session and returns to the login page. */
export async function sair(): Promise<void> {
  const auth = await createAuthServerClient();
  await auth.auth.signOut();
  redirect("/login");
}

/**
 * First-run setup: creates the very first user as "dono".
 *
 * Only works while crm_profiles is empty — checked here on the server, not
 * just in the UI, so hitting the action directly cannot create a second
 * owner once the shop is configured.
 */
export async function primeiroAcesso(
  name: string,
  email: string,
  password: string
): Promise<SimpleResult> {
  if (await hasAnyProfile()) {
    return { ok: false, error: "O sistema já foi configurado. Faça login normalmente." };
  }

  if (!name.trim()) return { ok: false, error: "Digite o seu nome." };
  const validation = validateCredentials(email, password);
  if (validation) return { ok: false, error: validation };
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` };
  }

  const supabase = getSupabaseServerClient();

  // email_confirm: true → no confirmation e-mail, the owner can use it now.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: normalizeEmail(email),
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? "Não foi possível criar o usuário." };
  }

  const { error: profileError } = await supabase.from("crm_profiles").insert({
    user_id: created.user.id,
    name: name.trim(),
    role: "dono",
    active: true,
  });

  if (profileError) {
    // Roll back so /setup stays usable instead of leaving an orphan login.
    await supabase.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileError.message };
  }

  const auth = await createAuthServerClient();
  const { error: signInError } = await auth.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (signInError) {
    // The account exists and works — just ask them to log in normally.
    return { ok: false, error: "Conta criada! Agora entre com o seu e-mail e senha." };
  }

  redirect("/");
}
