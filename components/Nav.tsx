"use client";

import { useTransition } from "react";
import { useApp } from "@/lib/context";
import { Screen } from "@/lib/context";
import { ROLE_LABELS } from "@/lib/types";
import { sair } from "@/lib/server/auth-actions";
import Logo from "./Logo";

/**
 * `owner: true` tabs are only rendered for a dono — but that is cosmetic
 * only. What actually protects those screens is requireOwner() inside every
 * Server Action they call (lib/server/actions.ts, lib/server/user-actions.ts).
 */
const ALL_TABS: { key: Screen; label: string; owner: boolean }[] = [
  { key: "dashboard", label: "Dashboard", owner: true },
  { key: "vendas", label: "Vendas", owner: false },
  { key: "produtos", label: "Produtos", owner: true },
  { key: "clientes", label: "Clientes", owner: false },
  { key: "fiado", label: "Fiado", owner: false },
  { key: "caixa", label: "Caixa", owner: true },
  { key: "usuarios", label: "Usuários", owner: true },
];

export default function Nav() {
  const { profile, screen, setScreen, theme, toggleTheme } = useApp();
  const [pending, startTransition] = useTransition();
  const tabs = ALL_TABS.filter((t) => profile.role === "dono" || !t.owner);

  function handleSignOut() {
    startTransition(async () => {
      await sair();
    });
  }

  return (
    <nav className="nav">
      <div className="nav-brand-block">
        {/* Inlined SVG so the outlines pick up `color` — white here. */}
        <span className="nav-brand-logo">
          <Logo size={34} />
        </span>
        <span className="nav-brand-text">
          <span className="nav-brand">Açaí do Ryan</span>
          <span className="nav-kicker">PDV &amp; CRM</span>
        </span>
      </div>

      <div className="nav-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn ${screen === t.key ? "nav-tab-active" : ""}`}
            onClick={() => setScreen(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <button className="btn btn-sm nav-action" onClick={toggleTheme}>
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
        <div className="nav-user">
          <span className="nav-user-name">{profile.name}</span>
          <span className="nav-role-label">{ROLE_LABELS[profile.role]}</span>
        </div>
        <button className="btn btn-sm nav-action" onClick={handleSignOut} disabled={pending}>
          {pending ? "Saindo…" : "Sair"}
        </button>
      </div>
    </nav>
  );
}
