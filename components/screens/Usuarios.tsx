"use client";

import { useEffect, useState, useTransition } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import { ManagedUser, ROLE_LABELS, Role, UsersResult } from "@/lib/types";
import {
  criarUsuario,
  definirUsuarioAtivo,
  definirUsuarioPerfil,
  listarUsuarios,
} from "@/lib/server/user-actions";

/**
 * Owner-only screen. The nav hides it from funcionários, and every action it
 * calls starts with requireOwner() on the server, so hiding it is only about
 * tidiness — not about security.
 */
export default function UsuariosScreen() {
  const { profile, confirm, alert } = useApp();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [pending, startTransition] = useTransition();

  function applyUsers(result: UsersResult): boolean {
    if (result.ok) {
      setUsers(result.users);
      return true;
    }
    alert(result.error);
    return false;
  }

  async function run(action: () => Promise<UsersResult>): Promise<boolean> {
    try {
      return applyUsers(await action());
    } catch {
      alert("Você não tem permissão para fazer isso, ou a sua sessão expirou.");
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listarUsuarios();
        if (!cancelled) applyUsers(result);
      } catch {
        if (!cancelled) alert("Não foi possível carregar os usuários.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleActive(user: ManagedUser) {
    if (user.userId === profile.userId && user.active) {
      alert("Você não pode desativar o seu próprio acesso.");
      return;
    }

    const message = user.active
      ? `Desativar o acesso de ${user.name}? A pessoa não vai mais conseguir entrar no sistema.`
      : `Reativar o acesso de ${user.name}?`;

    confirm(message, () => {
      startTransition(async () => {
        await run(() => definirUsuarioAtivo(user.userId, !user.active));
      });
    });
  }

  function handleChangeRole(user: ManagedUser, role: Role) {
    if (role === user.role) return;

    if (user.userId === profile.userId && role !== "dono") {
      alert("Você não pode rebaixar o seu próprio perfil.");
      return;
    }

    confirm(`Mudar o perfil de ${user.name} para ${ROLE_LABELS[role]}?`, () => {
      startTransition(async () => {
        await run(() => definirUsuarioPerfil(user.userId, role));
      });
    });
  }

  return (
    <div className="page">
      <div className="page-title-row page-header">
        <div>
          <h1>Usuários</h1>
          <span className="subtitle muted">
            Quem pode entrar no sistema. O Dono vê tudo; o Funcionário vê apenas
            Vendas, Clientes e Fiado.
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + Novo usuário
        </button>
      </div>

      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && users.length === 0 && (
        <div className="empty-state">Nenhum usuário cadastrado.</div>
      )}

      {!loading && users.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>
                    {u.name}
                    {u.userId === profile.userId && (
                      <span className="tag tag-accent" style={{ marginLeft: 6 }}>
                        você
                      </span>
                    )}
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <select
                      className="input"
                      style={{ minWidth: 130 }}
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => handleChangeRole(u, e.target.value as Role)}
                    >
                      <option value="dono">Dono</option>
                      <option value="funcionario">Funcionário</option>
                    </select>
                  </td>
                  <td>
                    <span className={`tag ${u.active ? "tag-outline" : "tag-neutral"}`}>
                      {u.active ? "Ativo" : "Desativado"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.active ? "btn-danger" : "btn-secondary"}`}
                      disabled={pending}
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.active ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewUserDialog
          onClose={() => setShowNew(false)}
          onCreate={async (input) => run(() => criarUsuario(input))}
        />
      )}
    </div>
  );
}

function NewUserDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; email: string; password: string; role: Role }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("funcionario");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const ok = await onCreate({ name, email, password, role });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog onClose={onClose} title="Novo usuário" size="sm">
      <div className="field">
        <label>Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>E-mail</label>
        <input
          className="input"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pessoa@exemplo.com"
        />
      </div>
      <div className="field">
        <label>Senha (mínimo 6 caracteres)</label>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Perfil</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="funcionario">Funcionário</option>
          <option value="dono">Dono</option>
        </select>
      </div>

      <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
        Anote a senha e entregue para a pessoa. Ela já pode entrar na hora, sem
        confirmar e-mail.
      </p>

      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Criando…" : "Criar usuário"}
        </button>
      </div>
    </Dialog>
  );
}
