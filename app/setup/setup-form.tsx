"use client";

import { useState, useTransition } from "react";
import { primeiroAcesso } from "@/lib/server/auth-actions";
import Logo from "@/components/Logo";

export default function SetupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As duas senhas não são iguais.");
      return;
    }

    startTransition(async () => {
      try {
        // On success this redirects into the app already signed in.
        const result = await primeiroAcesso(name, email, password);
        if (!result.ok) setError(result.error);
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err) throw err;
        setError("Não foi possível criar a conta agora. Tente de novo.");
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

          <h1 className="auth-form-title">Primeiro acesso</h1>
          <p className="auth-intro">
            Ninguém foi cadastrado ainda. Crie aqui a conta do dono da loja — ela
            terá acesso a tudo, inclusive ao cadastro dos funcionários. Esta
            página fecha sozinha depois disso.
          </p>

          <div className="field">
            <label htmlFor="setup-name">Seu nome</label>
            <input
              id="setup-name"
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Ryan"
            />
          </div>

          <div className="field">
            <label htmlFor="setup-email">E-mail</label>
            <input
              id="setup-email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>

          <div className="field">
            <label htmlFor="setup-password">Senha (mínimo 6 caracteres)</label>
            <input
              id="setup-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="setup-password-2">Repita a senha</label>
            <input
              id="setup-password-2"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={pending}>
            {pending ? "Criando…" : "Criar conta do dono"}
          </button>
        </form>
      </div>
    </div>
  );
}
