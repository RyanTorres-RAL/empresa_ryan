"use client";

import { useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import {
  computeEntradasPorDia,
  computeEntradasSaidas30,
  computeSaldoEmCaixa,
} from "@/lib/calc";
import { CashOut, formatBRL, formatDateBR } from "@/lib/types";

function toInputDate(dateBR: string): string {
  // dd/mm/yyyy -> yyyy-mm-dd
  const [dd, mm, yyyy] = dateBR.split("/");
  if (!dd || !mm || !yyyy) return "";
  return `${yyyy}-${mm}-${dd}`;
}

function fromInputDate(value: string): string {
  // yyyy-mm-dd -> dd/mm/yyyy
  const [yyyy, mm, dd] = value.split("-");
  if (!yyyy || !mm || !dd) return formatDateBR(new Date());
  return `${dd}/${mm}/${yyyy}`;
}

export default function CaixaScreen() {
  const { data, deleteCashOut, confirm } = useApp();
  const [dialogCashOut, setDialogCashOut] = useState<CashOut | "new" | null>(null);

  const saldo = computeSaldoEmCaixa(data);
  const { entradas, saidas } = computeEntradasSaidas30(data);
  const entradasPorDia = computeEntradasPorDia(data);

  return (
    <div className="page">
      <div className="page-title-row page-header">
        <h1>Caixa</h1>
        <button className="btn btn-primary" onClick={() => setDialogCashOut("new")}>
          + Registrar saída
        </button>
      </div>

      <div className="grid grid-cards" style={{ marginBottom: "var(--space-6)" }}>
        <div className="card">
          <span className="card-kicker">Saldo em caixa</span>
          <span className="stat-value">{formatBRL(saldo)}</span>
        </div>
        <div className="card">
          <span className="card-kicker">Entradas (30 dias)</span>
          <span className="stat-value">{formatBRL(entradas)}</span>
        </div>
        <div className="card">
          <span className="card-kicker">Saídas (30 dias)</span>
          <span className="stat-value">{formatBRL(saidas)}</span>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <span className="card-title">Entradas por dia</span>
          {entradasPorDia.length === 0 ? (
            <div className="empty-state">Nenhuma entrada registrada.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              {entradasPorDia.map((e) => (
                <div className="card-row" key={e.date}>
                  <span>{e.date}</span>
                  <span className="muted">{formatBRL(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <span className="card-title">Saídas</span>
          {data.cashOuts.length === 0 ? (
            <div className="empty-state">Nenhuma saída registrada.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              {[...data.cashOuts]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((c) => (
                  <div className="card" key={c.id}>
                    <div className="card-row">
                      <span className="muted" style={{ fontSize: 12 }}>
                        {c.date}
                      </span>
                      <span>{formatBRL(c.amount)}</span>
                    </div>
                    <span>{c.description}</span>
                    <div className="card-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => setDialogCashOut(c)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          confirm("Excluir esta saída?", () => deleteCashOut(c.id))
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {dialogCashOut && (
        <CashOutDialog
          cashOut={dialogCashOut === "new" ? null : dialogCashOut}
          onClose={() => setDialogCashOut(null)}
        />
      )}
    </div>
  );
}

function CashOutDialog({ cashOut, onClose }: { cashOut: CashOut | null; onClose: () => void }) {
  const { saveCashOut } = useApp();
  const [amount, setAmount] = useState(String(cashOut?.amount ?? ""));
  const [description, setDescription] = useState(cashOut?.description ?? "");
  const [date, setDate] = useState(cashOut ? toInputDate(cashOut.date) : toInputDate(formatDateBR(new Date())));

  function handleSave() {
    const ok = saveCashOut({
      id: cashOut?.id,
      amount: Number(amount) || 0,
      description,
      date: fromInputDate(date),
      createdAt: cashOut?.createdAt ?? Date.now(),
    });
    if (ok) onClose();
  }

  return (
    <Dialog onClose={onClose} title={cashOut ? "Editar saída" : "Registrar saída"} size="sm">
      <div className="field">
        <label>Valor</label>
        <input className="input" type="number" step={0.5} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Descrição</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label>Data</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          Salvar
        </button>
      </div>
    </Dialog>
  );
}
