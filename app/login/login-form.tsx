"use client";

import { useState, useTransition } from "react";
import { entrar } from "@/lib/server/auth-actions";
import Logo from "@/components/Logo";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        // On success this redirects, so nothing after it runs.
        const result = await entrar(email, password);
        if (!result.ok) setError(result.error);
      } catch (err) {
        // next/navigation's redirect() throws by design — let it through.
        if (err && typeof err === "object" && "digest" in err) throw err;
        setError("Não foi possível entrar agora. Tente de novo.");
      }
    });
  }

  return (
    <div className="auth-page">
      <aside className="auth-brand-panel">
        <div className="auth-brand-inner">
          <span className="auth-brand-logo">
            <Logo size={76} />
          </span>
          <span className="auth-kicker">PDV &amp; CRM</span>
          <span className="auth-brand">Açaí do Ryan</span>
          <p className="auth-tagline">Sistema de vendas e controle de fiado</p>
        </div>
      </aside>

      <div className="auth-form-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-mobile-brand">
            <Logo size={40} />
            <span className="nav-brand-text">
              <span className="auth-brand">Açaí do Ryan</span>
              <span className="auth-kicker">PDV &amp; CRM</span>
            </span>
          </div>

          <h1 className="auth-form-title">Entrar</h1>
          <p className="auth-intro">
            Use o e-mail e a senha que o dono da loja cadastrou para você.
          </p>

          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
