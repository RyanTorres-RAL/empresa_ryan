"use client";

import { ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * The furniture every chart on the Dashboard shares: the card, the empty
 * state, the hover tooltip and the table view.
 *
 * The table view is not decoration — it is how a value stays reachable
 * without hovering (and the only way to read one on a touch screen where
 * there is no hover at all).
 */

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <h2 className="card-title chart-title">{title}</h2>
        {subtitle ? <p className="chart-sub">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ChartEmpty({ height, text }: { height: number; text?: string }) {
  return (
    <div className="chart-empty" style={{ minHeight: height }}>
      <span>{text ?? "Nenhuma venda no período"}</span>
    </div>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
}

export interface TooltipState {
  /** Anchor point in container coordinates. */
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
}

/**
 * Positioned inside the chart's `position: relative` container. The tooltip
 * measures itself so it can be clamped to the container instead of hanging
 * off the edge of a 380px screen.
 */
export function ChartTooltip({
  state,
  containerWidth,
}: {
  state: TooltipState | null;
  containerWidth: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [state]);

  if (!state) return null;

  const half = size.w / 2;
  const left =
    containerWidth > size.w
      ? Math.min(Math.max(state.x, half + 4), containerWidth - half - 4)
      : state.x;
  // Flip below the anchor when there is no room above it.
  const above = state.y - size.h - 12 >= 0;
  const top = above ? state.y - 12 : state.y + 12;

  return (
    <div
      ref={ref}
      className="chart-tooltip"
      role="status"
      aria-live="polite"
      style={{
        left,
        top,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
      }}
    >
      <span className="chart-tooltip-title">{state.title}</span>
      {state.rows.map((r) => (
        <span className="chart-tooltip-row" key={r.label}>
          <span className="chart-tooltip-key" aria-hidden="true" />
          <span className="chart-tooltip-value">{r.value}</span>
          <span className="chart-tooltip-label">{r.label}</span>
        </span>
      ))}
    </div>
  );
}

export function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: string[][];
}) {
  if (rows.length === 0) return null;
  return (
    <details className="chart-table">
      <summary>Ver tabela</summary>
      <div className="table-wrap chart-table-wrap">
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} className={i === 0 ? undefined : "num-cell"}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={ci === 0 ? undefined : "num-cell"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
