"use client";

import { useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import { Fiado, PAYMENT_LABELS, PaymentMethod, formatBRL } from "@/lib/types";

const PAYMENT_OPTIONS_NO_FIADO: PaymentMethod[] = ["dinheiro", "pix", "debito", "credito", "va"];

export default function FiadoScreen() {
  const { data, registerFiadoPayment } = useApp();
  const [payingFiado, setPayingFiado] = useState<Fiado | null>(null);

  const pending = data.fiados.filter((f) => !f.paid);
  const totalPendente = pending.reduce((s, f) => s + Math.max(0, f.amount - f.amountPaid), 0);

  return (
    <div className="page">
      <div className="page-title-row page-header">
        <h1>Fiado</h1>
        <span className="muted">Total pendente: {formatBRL(totalPendente)}</span>
      </div>

      {pending.length === 0 ? (
        <div className="empty-state">Nenhum fiado pendente.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((f) => (
                <tr key={f.id}>
                  <td>{f.clientName}</td>
                  <td>{formatBRL(Math.max(0, f.amount - f.amountPaid))}</td>
                  <td>{new Date(f.dueDate).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => setPayingFiado(f)}>
                      Registrar pagamento
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payingFiado && (
        <PaymentDialog
          fiado={payingFiado}
          onClose={() => setPayingFiado(null)}
          onSubmit={(amount, method) => {
            if (registerFiadoPayment(payingFiado.id, amount, method)) setPayingFiado(null);
          }}
        />
      )}
    </div>
  );
}

function PaymentDialog({
  fiado,
  onClose,
  onSubmit,
}: {
  fiado: Fiado;
  onClose: () => void;
  onSubmit: (amount: number, method: PaymentMethod) => void;
}) {
  const remaining = Math.max(0, fiado.amount - fiado.amountPaid);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");

  return (
    <Dialog onClose={onClose} title="Registrar pagamento" size="sm">
      <div className="field">
        <label>Valor pago</label>
        <input className="input" type="number" step={0.5} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Forma de pagamento</label>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_OPTIONS_NO_FIADO.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={() => onSubmit(Number(amount), method)}>
          Confirmar
        </button>
      </div>
    </Dialog>
  );
}
