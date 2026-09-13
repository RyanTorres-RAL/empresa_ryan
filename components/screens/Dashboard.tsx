"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context";
import {
  CustomPeriodInput,
  PeriodPresetId,
  addDays,
  buildPeriodRange,
  computeFiadoPendente,
  computePaymentMethodTotalsInRange,
  computePeriodStats,
  computeRevenueSeries,
  computeSaldoEmCaixa,
  computeTopClientsInRange,
  computeTopProductsInRange,
} from "@/lib/calc";
import {
  PAYMENT_LABELS,
  PAYMENT_SHORT,
  PaymentMethod,
  formatBRL,
  formatNumberBR,
  formatPercentBR,
  startOfDay,
} from "@/lib/types";
import PeriodFilter from "@/components/charts/PeriodFilter";
import RankedBarChart, { RankedRow } from "@/components/charts/RankedBarChart";
import RevenueTimeChart from "@/components/charts/RevenueTimeChart";

const TOP_PRODUCTS = 6;
const TOP_CLIENTS = 8;

function toInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function DashboardScreen() {
  const { data } = useApp();

  const [preset, setPreset] = useState<PeriodPresetId>("30d");
  const [custom, setCustom] = useState<CustomPeriodInput>(() => {
    const today = startOfDay(new Date());
    return { from: toInputValue(addDays(today, -29)), to: toInputValue(today) };
  });

  const range = useMemo(() => buildPeriodRange(preset, custom), [preset, custom]);

  const stats = useMemo(() => computePeriodStats(data, range), [data, range]);
  const series = useMemo(() => computeRevenueSeries(data, range), [data, range]);
  const payments = useMemo(
    () => computePaymentMethodTotalsInRange(data, range),
    [data, range],
  );
  const products = useMemo(
    () => computeTopProductsInRange(data, range, TOP_PRODUCTS),
    [data, range],
  );
  const clients = useMemo(
    () => computeTopClientsInRange(data, range, TOP_CLIENTS),
    [data, range],
  );

  // Two of the six tiles are snapshots, not period sums: what the shop is owed
  // right now and what is in the till right now. Their sub-label says so, so
  // they are never read as "in the selected period".
  const fiadoPendente = computeFiadoPendente(data);
  const saldoEmCaixa = computeSaldoEmCaixa(data);

  const tiles = [
    { label: "Faturamento", value: formatBRL(stats.faturamento), sub: range.label },
    { label: "Vendas", value: formatNumberBR(stats.vendas), sub: range.label },
    { label: "Ticket médio", value: formatBRL(stats.ticketMedio), sub: range.label },
    { label: "Entradas em caixa", value: formatBRL(stats.entradas), sub: range.label },
    { label: "Fiado pendente", value: formatBRL(fiadoPendente), sub: "em aberto hoje" },
    { label: "Saldo em caixa", value: formatBRL(saldoEmCaixa), sub: "acumulado" },
  ];

  const paymentSum = (Object.values(payments) as number[]).reduce((s, v) => s + v, 0);
  const paymentOrder = (Object.keys(payments) as PaymentMethod[]).sort(
    (a, b) => payments[b] - payments[a],
  );

  const paymentRows: RankedRow[] = paymentOrder.map((key) => ({
    key,
    label: PAYMENT_SHORT[key],
    fullLabel: PAYMENT_LABELS[key],
    value: payments[key],
    valueText: formatBRL(payments[key]),
    tooltip: [
      { label: "no período", value: formatBRL(payments[key]) },
      {
        label: "do total recebido",
        value: formatPercentBR(paymentSum > 0 ? payments[key] / paymentSum : 0),
      },
    ],
  }));

  const paymentTable = paymentOrder.map((key) => [
    PAYMENT_LABELS[key],
    formatBRL(payments[key]),
    formatPercentBR(paymentSum > 0 ? payments[key] / paymentSum : 0),
  ]);

  const productRows: RankedRow[] = products.rows.map((p) => ({
    key: p.key,
    label: p.name,
    fullLabel: p.name,
    value: p.revenue,
    valueText: formatBRL(p.revenue),
    tooltip: [
      { label: "faturamento", value: formatBRL(p.revenue) },
      {
        label: p.quantity === 1 ? "unidade vendida" : "unidades vendidas",
        value: formatNumberBR(p.quantity),
      },
    ],
  }));

  const productTable = products.rows.map((p) => [
    p.name,
    formatBRL(p.revenue),
    formatNumberBR(p.quantity),
  ]);
  if (products.outrosRevenue > 0) {
    const rest = products.distinct - products.rows.length;
    productTable.push([
      `Outros (${rest} ${rest === 1 ? "produto" : "produtos"})`,
      formatBRL(products.outrosRevenue),
      "—",
    ]);
  }

  const productSubtitle =
    products.distinct > products.rows.length
      ? `Top ${products.rows.length} de ${products.distinct} produtos · ${range.label}`
      : `${products.distinct} ${products.distinct === 1 ? "produto" : "produtos"} · ${range.label}`;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="subtitle">Visão geral das vendas e finanças</div>
      </div>

      <PeriodFilter
        preset={preset}
        onPresetChange={setPreset}
        custom={custom}
        onCustomChange={setCustom}
        rangeLabel={range.label}
      />

      <div className="grid grid-stats" style={{ marginBottom: "var(--space-6)" }}>
        {tiles.map((t) => (
          <div className="card stat-tile" key={t.label}>
            <span className="card-kicker">{t.label}</span>
            <span className="stat-value">{t.value}</span>
            <span className="stat-sub">{t.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <RevenueTimeChart series={series} periodLabel={range.label} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "var(--space-4)" }}>
        <RankedBarChart
          title="Vendas por forma de pagamento"
          subtitle={`${range.label} · valores em R$`}
          rows={paymentRows}
          tableCaption={`Vendas por forma de pagamento — ${range.label}`}
          tableHead={["Forma de pagamento", "Valor", "Participação"]}
          tableRows={paymentTable}
        />

        <RankedBarChart
          title="Produtos que mais faturam"
          subtitle={productSubtitle}
          rows={productRows}
          tableCaption={`Produtos que mais faturam — ${range.label}`}
          tableHead={["Produto", "Faturamento", "Unidades"]}
          tableRows={productTable}
          emptyText="Nenhum produto vendido no período"
        />
      </div>

      <section className="card">
        <div className="chart-head">
          <h2 className="card-title chart-title">Clientes que mais compraram</h2>
          <p className="chart-sub">{range.label}</p>
        </div>
        {clients.length === 0 ? (
          <div className="chart-empty" style={{ minHeight: 96 }}>
            <span>Nenhuma venda no período</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="num-cell">Compras</th>
                  <th className="num-cell">Total</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.key}>
                    <td>{c.name}</td>
                    <td className="num-cell">{formatNumberBR(c.sales)}</td>
                    <td className="num-cell">{formatBRL(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
