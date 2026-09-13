"use client";

import {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useState,
} from "react";
import { RevenueSeries } from "@/lib/calc";
import { formatBRL } from "@/lib/types";
import { ChartCard, ChartEmpty, ChartTable, ChartTooltip, TooltipState } from "./ChartFrame";
import {
  fontOf,
  formatTick,
  labelIndices,
  measureText,
  niceScale,
  useElementWidth,
} from "./chart-utils";

const AXIS_SIZE = 11;
/* The empty state does not need the full plot height — a 232px empty box
   reads as a broken chart rather than as "no sales". */
const EMPTY_H = 150;
const VALUE_SIZE = 12;

/**
 * Faturamento ao longo do tempo — the headline chart.
 *
 * Form: a single-series line with an area wash. Per the dataviz skill's form
 * heuristic ("trend over time -> line; area for a single series") the job here
 * is a trend, not a magnitude comparison, so this is a line rather than a
 * column chart. It also degrades better at both ends of the range: a day with
 * no sales reads as a dip to the baseline instead of a missing bar, and a long
 * range stays legible where 90 columns would not.
 *
 * One series means one hue and NO legend — the card title names what is
 * plotted, so a one-swatch legend box would only restate it.
 */
export default function RevenueTimeChart({
  series,
  periodLabel,
}: {
  series: RevenueSeries;
  periodLabel: string;
}) {
  const { ref, node, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const narrow = width > 0 && width < 420;
  const plotH = narrow ? 140 : 190;
  const padTop = 20;
  const padBottom = 22;
  const padRight = 12;
  const totalH = padTop + plotH + padBottom;

  const buckets = series.buckets;
  const n = buckets.length;
  const hasData = series.total > 0 && n > 0;

  const subtitle = `${series.unitLabel} · ${periodLabel} · valores em R$`;

  let plotBody: ReactNode = null;

  if (width > 0 && !hasData) {
    plotBody = <ChartEmpty height={EMPTY_H} />;
  } else if (width > 0) {
    const axisFont = fontOf(node, AXIS_SIZE);
    const valueFont = fontOf(node, VALUE_SIZE, 600);

    const scale = niceScale(series.max);
    const tickTexts = scale.ticks.map((t) => formatTick(t, scale.step));
    const widestTick = Math.max(...tickTexts.map((t) => measureText(t, axisFont)));
    const padLeft = Math.max(32, Math.ceil(widestTick) + 10);
    const plotW = Math.max(40, width - padLeft - padRight);

    const baseY = padTop + plotH;
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const xAt = (i: number) => (n > 1 ? padLeft + i * stepX : padLeft + plotW / 2);
    const yAt = (v: number) => padTop + plotH * (1 - v / scale.max);

    const points = buckets.map((b, i) => `${xAt(i).toFixed(2)},${yAt(b.value).toFixed(2)}`);
    const linePath = `M ${points.join(" L ")}`;
    const areaPath =
      n > 1
        ? `${linePath} L ${xAt(n - 1).toFixed(2)},${baseY} L ${xAt(0).toFixed(2)},${baseY} Z`
        : "";

    // Selective direct label: the peak only. A number on every point is chaos
    // and goes unread; "melhor dia do período" is the one the owner looks for.
    let peakIndex = 0;
    for (let i = 1; i < n; i++) if (buckets[i].value > buckets[peakIndex].value) peakIndex = i;
    const peakText = formatBRL(buckets[peakIndex].value);
    const peakW = measureText(peakText, valueFont);
    let peakAnchor: "start" | "middle" | "end" = "middle";
    let peakX = xAt(peakIndex);
    if (peakX - peakW / 2 < 2) {
      peakAnchor = "start";
      peakX = 2;
    } else if (peakX + peakW / 2 > width - 2) {
      peakAnchor = "end";
      peakX = width - 2;
    }

    const widestLabel = Math.max(...buckets.map((b) => measureText(b.label, axisFont)));
    const shown = labelIndices(n, n > 1 ? stepX : plotW, widestLabel);

    // Dots only while they stay comfortably apart; past that the line carries
    // the shape and the crosshair carries the detail.
    const showAllDots = n <= 14 && stepX >= 18;

    const activeBucket = active !== null && active >= 0 && active < n ? buckets[active] : null;
    const activeIndex = active as number;
    const tooltip: TooltipState | null = activeBucket
      ? {
          x: xAt(activeIndex),
          y: yAt(activeBucket.value),
          title: activeBucket.fullLabel,
          rows: [{ label: "Faturamento", value: formatBRL(activeBucket.value) }],
        }
      : null;

    const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      setActive(n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round((relX - padLeft) / stepX))));
    };

    const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
      const current = active ?? n - 1;
      let next: number | null = null;
      if (e.key === "ArrowRight") next = Math.min(n - 1, current + 1);
      else if (e.key === "ArrowLeft") next = Math.max(0, current - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = n - 1;
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
          aria-label={`Faturamento ${series.unitLabel}, ${periodLabel}. Use as setas para percorrer os pontos, ou abra "Ver tabela".`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <title>{`Faturamento ${series.unitLabel} — ${periodLabel}`}</title>

          {scale.ticks.map((t, i) => (
            <line
              key={`g-${t}`}
              x1={padLeft}
              x2={width - padRight}
              y1={yAt(t)}
              y2={yAt(t)}
              className={i === 0 ? "chart-axis-line" : "chart-grid-line"}
            />
          ))}

          {scale.ticks.map((t, i) => (
            <text
              key={`t-${t}`}
              x={padLeft - 8}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="chart-axis-text"
            >
              {tickTexts[i]}
            </text>
          ))}

          {areaPath ? <path d={areaPath} className="chart-area" /> : null}
          <path d={linePath} className="chart-line" />

          {showAllDots ? (
            buckets.map((b, i) => (
              <circle key={`d-${b.key}`} cx={xAt(i)} cy={yAt(b.value)} r={4} className="chart-dot" />
            ))
          ) : (
            <circle cx={xAt(n - 1)} cy={yAt(buckets[n - 1].value)} r={4} className="chart-dot" />
          )}

          {/* Crosshair — the reader aims at a date, never at a 2px line. */}
          {activeBucket ? (
            <>
              <line
                x1={xAt(activeIndex)}
                x2={xAt(activeIndex)}
                y1={padTop}
                y2={baseY}
                className="chart-crosshair"
              />
              <circle
                cx={xAt(activeIndex)}
                cy={yAt(activeBucket.value)}
                r={5.5}
                className="chart-dot chart-dot-active"
              />
            </>
          ) : null}

          <text
            x={peakX}
            y={Math.max(11, yAt(buckets[peakIndex].value) - 9)}
            textAnchor={peakAnchor}
            className="chart-value-text"
          >
            {peakText}
          </text>

          {shown.map((i) => {
            const label = buckets[i].label;
            const lw = measureText(label, axisFont);
            let anchor: "start" | "middle" | "end" = "middle";
            let lx = xAt(i);
            if (lx + lw / 2 > width) {
              anchor = "end";
              lx = width;
            } else if (lx - lw / 2 < 0) {
              anchor = "start";
              lx = 0;
            }
            return (
              <text
                key={`x-${buckets[i].key}`}
                x={lx}
                y={baseY + 15}
                textAnchor={anchor}
                className="chart-axis-text"
              >
                {label}
              </text>
            );
          })}
        </svg>
        <ChartTooltip state={tooltip} containerWidth={width} />
      </>
    );
  }

  return (
    <ChartCard title="Faturamento ao longo do tempo" subtitle={subtitle}>
      {/* One stable container across every state — remounting this div would
          orphan the ResizeObserver watching it. */}
      <div
        className="chart-plot"
        ref={ref}
        style={width === 0 ? { minHeight: totalH } : undefined}
      >
        {plotBody}
      </div>
      <ChartTable
        caption={`Faturamento ${series.unitLabel} — ${periodLabel}`}
        head={["Período", "Faturamento"]}
        rows={buckets.map((b) => [b.fullLabel, formatBRL(b.value)])}
      />
    </ChartCard>
  );
}
