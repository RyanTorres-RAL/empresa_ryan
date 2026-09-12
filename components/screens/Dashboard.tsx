"use client";

import { useApp } from "@/lib/context";
import {
  computeFiadoPendente,
  computePaymentMethodTotals,
  computeSaldoEmCaixa,
  computeSalesTotalSince,
  computeTicketMedio,
  computeTopClients,
} from "@/lib/calc";
import { PAYMENT_LABELS, PaymentMethod, formatBRL, startOfDay } from "@/lib/types";

export default function DashboardScreen() {
  const { data } = useApp();

  const now = Date.now();
  const hoje = computeSalesTotalSince(data, startOfDay(new Date()).getTime());
  const ultimos7 = computeSalesTotalSince(data, now - 7 * 24 * 60 * 60 * 1000);
  const ultimos30 = computeSalesTotalSince(data, now - 30 * 24 * 60 * 60 * 1000);
  const ticketMedio = computeTicketMedio(data);
  const fiadoPendente = computeFiadoPendente(data);
  const saldoEmCaixa = computeSaldoEmCaixa(data);

  const paymentTotals = computePaymentMethodTotals(data);
  const paymentSum = (Object.values(paymentTotals) as number[]).reduce((s, v) => s + v, 0);
  const topClients = computeTopClients(data, 5);

  const stats = [
    { label: "Hoje", value: hoje },
    { label: "Últimos 7 dias", value: ultimos7 },
    { label: "Últimos 30 dias", value: ultimos30 },
    { label: "Ticket médio", value: ticketMedio },
    { label: "Fiado pendente", value: fiadoPendente },
    { label: "Saldo em caixa", value: saldoEmCaixa },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="subtitle">Visão geral das vendas e finanças</div>
      </div>

      <div className="grid grid-cards" style={{ marginBottom: "var(--space-6)" }}>
        {stats.map((s) => (
          <div className="card" key={s.label}>
            <span className="card-kicker">{s.label}</span>
            <span className="stat-value">{formatBRL(s.value)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <span className="card-title">Vendas por forma de pagamento</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
            {(Object.keys(paymentTotals) as PaymentMethod[]).map((key) => {
              const value = paymentTotals[key];
              const pct = paymentSum > 0 ? (value / paymentSum) * 100 : 0;
              return (
                <div key={key}>
                  <div className="card-row" style={{ marginBottom: 4 }}>
                    <span>{PAYMENT_LABELS[key]}</span>
                    <span className="muted">{formatBRL(value)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <span className="card-title">Clientes mais frequentes</span>
          {topClients.length === 0 ? (
            <div className="empty-state">Nenhum cliente ainda.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              {topClients.map((c) => (
                <div key={c.id} className="card-row">
                  <span>{c.name}</span>
                  <span className="muted">
                    {c.totalPurchases} compras · {formatBRL(c.totalSpent)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
