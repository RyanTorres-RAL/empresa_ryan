"use client";

import { useApp } from "@/lib/context";
import { Screen } from "@/lib/context";
import { Role } from "@/lib/types";

const ALL_TABS: { key: Screen; label: string; owner: boolean }[] = [
  { key: "dashboard", label: "Dashboard", owner: true },
  { key: "vendas", label: "Vendas", owner: false },
  { key: "produtos", label: "Produtos", owner: true },
  { key: "clientes", label: "Clientes", owner: false },
  { key: "fiado", label: "Fiado", owner: false },
  { key: "caixa", label: "Caixa", owner: true },
];

export default function Nav() {
  const { role, setRole, screen, setScreen, theme, toggleTheme } = useApp();
  const tabs = ALL_TABS.filter((t) => role === "dono" || !t.owner);

  return (
    <nav className="nav">
      <div className="nav-brand-block">
        <span className="nav-brand">Açaí do Ryan</span>
        <span className="nav-kicker">PDV &amp; CRM</span>
      </div>

      <div className="nav-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn ${screen === t.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setScreen(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <button className="btn btn-secondary btn-sm" onClick={toggleTheme}>
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
        <div className="nav-role-group">
          <span className="nav-role-label">Perfil:</span>
          <button
            className={`btn btn-sm ${role === "dono" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => setRole("dono" as Role)}
          >
            Dono
          </button>
          <button
            className={`btn btn-sm ${role === "funcionario" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => setRole("funcionario" as Role)}
          >
            Funcionário
          </button>
        </div>
      </div>
    </nav>
  );
}
