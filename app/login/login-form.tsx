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
      <div className="auth-shell">
        <div className="auth-brand-inner">
          {/* The artwork carries the wordmark, so the shop name is not set in
              type again beneath it. */}
          <span className="auth-brand-logo">
            <Logo variant="light" height={150} />
          </span>
          <span className="auth-kicker">PDV &amp; CRM</span>
          <p className="auth-tagline">Sistema de vendas</p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>

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
