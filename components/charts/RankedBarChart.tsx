"use client";

import { KeyboardEvent as ReactKeyboardEvent, ReactNode, useState } from "react";
import {
  ChartCard,
  ChartEmpty,
  ChartTable,
  ChartTooltip,
  TooltipRow,
  TooltipState,
} from "./ChartFrame";
import {
  fontOf,
  horizontalBarPath,
  measureText,
  truncateLabel,
  useElementWidth,
} from "./chart-utils";

export interface RankedRow {
  key: string;
  /** Short label for the gutter — truncated if it still does not fit. */
  label: string;
  /** Full name, for the tooltip and the table view. */
  fullLabel: string;
  value: number;
  /** Pre-formatted value drawn at the bar tip. */
  valueText: string;
  tooltip: TooltipRow[];
}

/* Matches RevenueTimeChart so the three empty states line up. */
const EMPTY_H = 150;
const LABEL_SIZE = 12;
const VALUE_SIZE = 12;

/**
 * A ranked horizontal bar chart, used for both "vendas por forma de
 * pagamento" and "produtos que mais faturam".
 *
 * Colour: ONE hue for every bar, not one per category. Payment methods and
 * product names are *nominal* categories carrying a single measure, so by the
 * dataviz skill's colour formula they are one series. Giving each bar its own
 * hue would spend the identity channel re-encoding what bar length already
 * shows — `anti-patterns.md`, "A value-ramp on nominal categories" — and every
 * row is already named in the gutter, so colour has no work left to do.
 *
 * Horizontal rather than a pie: the categories have long Portuguese names and
 * several values sit close together, which is exactly where angles stop being
 * comparable and a shared left baseline starts working.
 */
export default function RankedBarChart({
  title,
  subtitle,
  rows,
  tableCaption,
  tableHead,
  tableRows,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  rows: RankedRow[];
  tableCaption: string;
  tableHead: string[];
  tableRows: string[][];
  emptyText?: string;
}) {
  const { ref, node, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const narrow = width > 0 && width < 420;
  const rowH = narrow ? 30 : 34;
  const barH = 14;
  const padY = 6;
  const count = rows.length;
  const totalH = Math.max(rowH, count * rowH) + padY * 2;

  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0);
  const hasData = count > 0 && max > 0;

  let plotBody: ReactNode = null;

  if (width > 0 && !hasData) {
    plotBody = <ChartEmpty height={EMPTY_H} text={emptyText} />;
  } else if (width > 0) {
    const labelFont = fontOf(node, LABEL_SIZE);
    const valueFont = fontOf(node, VALUE_SIZE, 600);

    const gutterCap = Math.min(150, Math.max(58, width * 0.4));
    const widestLabel = Math.max(...rows.map((r) => measureText(r.label, labelFont)));
    const gutter = Math.min(widestLabel + 12, gutterCap);
    const labelMax = gutter - 12;

    const widestValue = Math.max(...rows.map((r) => measureText(r.valueText, valueFont)));
    const valueW = widestValue + 10;
    const barMax = Math.max(24, width - gutter - valueW - 2);

    const barWidthOf = (v: number) => (v > 0 ? Math.max(2, (v / max) * barMax) : 0);

    const activeRow = active !== null && active >= 0 && active < count ? rows[active] : null;
    const tooltip: TooltipState | null = activeRow
      ? {
          // Anchor past the bar's own value label, vertically on the middle of
          // the hovered row, so the box never covers the figure it explains
          // nor the rows either side of it.
          x: Math.min(gutter + barWidthOf(activeRow.value) + valueW, width - 8),
          y: padY + (active as number) * rowH + rowH / 2,
          title: activeRow.fullLabel,
          rows: activeRow.tooltip,
          placement: "row",
          fallbackX: gutter + 8,
        }
      : null;

    const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
      const current = active ?? -1;
      let next: number | null = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(count - 1, current + 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(0, current - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = count - 1;
      else if (e.key === "Escape") next = null;
      else return;
      e.preventDefault();
      setActive(next);
    };

    plotBody = (
      <>
        <svg
          className="chart-svg"
          width={width}
          height={totalH}
          viewBox={`0 0 ${width} ${totalH}`}
          role="img"
          tabIndex={0}
          aria-label={`${title}. Use as setas para percorrer as barras, ou abra "Ver tabela".`}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(0)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <title>{tableCaption}</title>

          {/* The baseline every bar grows from. */}
          <line
            x1={gutter}
            x2={gutter}
            y1={padY}
            y2={padY + count * rowH}
            className="chart-axis-line"
          />

          {rows.map((row, i) => {
            const top = padY + i * rowH;
            const mid = top + rowH / 2;
            const barW = barWidthOf(row.value);
            const isActive = active === i;
            return (
              <g key={row.key}>
                {isActive ? (
                  <rect
                    x={0}
                    y={top + 1}
                    width={width}
                    height={rowH - 2}
                    rx={6}
                    className="chart-row-hover"
                  />
                ) : null}

                <text
                  x={gutter - 8}
                  y={mid}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="chart-cat-text"
                >
                  {truncateLabel(row.label, labelMax, labelFont)}
                </text>

                {barW > 0 ? (
                  <path
                    d={horizontalBarPath(gutter, mid - barH / 2, barW, barH)}
                    className={isActive ? "chart-bar chart-bar-active" : "chart-bar"}
                  />
                ) : null}

                <text
                  x={gutter + barW + 6}
                  y={mid}
                  dominantBaseline="middle"
                  className="chart-value-text"
                >
                  {row.valueText}
                </text>

                {/* Hit target is the whole row, never just the 14px bar. */}
                <rect
                  x={0}
                  y={top}
                  width={width}
                  height={rowH}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={() => setActive(i)}
                />
              </g>
            );
          })}
        </svg>
        <ChartTooltip state={tooltip} containerWidth={width} />
      </>
    );
  }

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {/* One stable container across every state — see RevenueTimeChart. */}
      <div
        className="chart-plot"
        ref={ref}
        style={width === 0 ? { minHeight: totalH } : undefined}
      >
        {plotBody}
      </div>
      <ChartTable caption={tableCaption} head={tableHead} rows={tableRows} />
    </ChartCard>
  );
}
