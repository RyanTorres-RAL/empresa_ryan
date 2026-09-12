"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireOwner } from "./auth";
import { ManagedUser, Role, UsersResult } from "@/lib/types";

/**
 * Owner-only user management ("Usuários" screen).
 *
 * MANDATORY: every exported action in this file starts with `await
 * requireOwner()` as its first statement. Nothing here may be reachable by a
 * funcionário, who could otherwise create themselves a dono account.
 *
 * Accounts live in Supabase Auth (auth.users, via the admin API) and their
 * name/role/active flag in crm_profiles. The two are always written together.
 */

const MIN_PASSWORD = 6;

function isRole(value: string): value is Role {
  return value === "dono" || value === "funcionario";
}

/** Reads crm_profiles and pairs each row with its Supabase Auth e-mail. */
async function listUsersInternal(): Promise<UsersResult> {
  const supabase = getSupabaseServerClient();

  const [{ data: profiles, error: profilesError }, { data: authList, error: authError }] =
    await Promise.all([
      supabase
        .from("crm_profiles")
        .select("user_id, name, role, active, created_at")
        .order("created_at", { ascending: true }),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (profilesError) return { ok: false, error: profilesError.message };
  if (authError) return { ok: false, error: authError.message };

  const emailById = new Map<string, string>();
  for (const user of authList?.users ?? []) {
    emailById.set(user.id, user.email ?? "");
  }

  const users: ManagedUser[] = (profiles ?? []).map((row) => ({
    userId: row.user_id,
    name: row.name ?? "",
    email: emailById.get(row.user_id) ?? "",
    role: row.role === "dono" ? "dono" : "funcionario",
    active: row.active !== false,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }));

  return { ok: true, users };
}

/** Lists everyone who can sign in. */
export async function listarUsuarios(): Promise<UsersResult> {
  await requireOwner();
  return listUsersInternal();
}

export interface CriarUsuarioInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

/** Creates a login + its crm_profiles row. */
export async function criarUsuario(input: CriarUsuarioInput): Promise<UsersResult> {
  await requireOwner();

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) return { ok: false, error: "Digite o nome da pessoa." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Digite um e-mail válido." };
  if (input.password.length < MIN_PASSWORD) {
    return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` };
  }
  if (!isRole(input.role)) return { ok: false, error: "Escolha um perfil válido." };

  const supabase = getSupabaseServerClient();

  // email_confirm: true → the person can log in right away, no e-mail needed.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "";
    if (/already been registered|already exists/i.test(message)) {
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }
    return { ok: false, error: message || "Não foi possível criar o usuário." };
  }

  const { error: profileError } = await supabase.from("crm_profiles").insert({
    user_id: created.user.id,
    name,
    role: input.role,
    active: true,
  });

  if (profileError) {
    // Roll back the login so we never leave an account nobody can manage.
    await supabase.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileError.message };
  }

  return listUsersInternal();
}

/**
 * Activates / deactivates someone. A deactivated profile is refused by
 * requireUser(), so they lose access everywhere immediately.
 */
export async function definirUsuarioAtivo(userId: string, active: boolean): Promise<UsersResult> {
  const me = await requireOwner();

  // Guard rail: an owner locking themselves out could leave the shop with no
  // way back into its own system.
  if (userId === me.userId && !active) {
    return { ok: false, error: "Você não pode desativar o seu próprio acesso." };
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("crm_profiles").update({ active }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  return listUsersInternal();
}

/** Changes someone's role between Dono and Funcionário. */
export async function definirUsuarioPerfil(userId: string, role: Role): Promise<UsersResult> {
  const me = await requireOwner();

  if (!isRole(role)) return { ok: false, error: "Escolha um perfil válido." };

  // Same guard rail: no self-demotion.
  if (userId === me.userId && role !== "dono") {
    return { ok: false, error: "Você não pode rebaixar o seu próprio perfil." };
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("crm_profiles").update({ role }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  return listUsersInternal();
}
