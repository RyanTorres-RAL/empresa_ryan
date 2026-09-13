"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shared plumbing for the hand-rolled SVG charts on the Dashboard.
 *
 * There is deliberately no charting library here: three charts do not justify
 * the bundle, and a library would fight the token system anyway (every colour
 * on these charts has to come from a CSS custom property so it flips with the
 * theme).
 */

/* ------------------------------ measurement ------------------------------ */

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  return measureCtx ?? null;
}

const measureCache = new Map<string, number>();

/**
 * Real text width, so a gutter label is truncated where it actually stops
 * fitting rather than at a guessed character count. Cached because the bar
 * charts re-measure the same handful of strings on every hover.
 */
export function measureText(text: string, font: string): number {
  const cacheKey = `${font}|${text}`;
  const hit = measureCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const ctx = getMeasureCtx();
  // No canvas (SSR / very old browser): fall back to an average-width guess.
  // The charts only render once a measured width exists, so this is a safety
  // net rather than a code path the app normally takes.
  const width = ctx
    ? ((ctx.font = font), ctx.measureText(text).width)
    : text.length * 0.55 * (parseFloat(font) || 12);
  measureCache.set(cacheKey, width);
  return width;
}

/** Build a canvas `font` string from an element's own computed typeface. */
export function fontOf(el: Element | null, sizePx: number, weight = 400): string {
  const family =
    el && typeof getComputedStyle === "function"
      ? getComputedStyle(el).fontFamily
      : "system-ui, sans-serif";
  return `${weight} ${sizePx}px ${family || "system-ui, sans-serif"}`;
}

/** Trim to fit, appending an ellipsis. Never returns a string wider than max. */
export function truncateToWidth(text: string, maxWidth: number, font: string): string {
  if (maxWidth <= 0) return "";
  if (measureText(text, font) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureText(`${text.slice(0, mid)}…`, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? "…" : `${text.slice(0, lo).trimEnd()}…`;
}

/**
 * Truncate a category label while keeping any trailing size/variant token.
 *
 * Real product names here look like "Açaí Artesanal Copo Pronto (300ml)" and
 * "Açaí Artesanal Copo Pronto (500ml)". Plain end-truncation turns BOTH into
 * "Açaí Artesanal Co…" — two different bars carrying the same label, which is
 * worse than no label at all. When a name ends in a parenthetical or a size
 * (300ml, 1L, 500g) that suffix is the distinguishing part, so it is kept and
 * the middle is dropped instead. Names without such a suffix truncate the
 * ordinary way, because "Barca de açaí…a dois" reads worse than
 * "Barca de açaí para…".
 */
export function truncateLabel(text: string, maxWidth: number, font: string): string {
  if (maxWidth <= 0) return "";
  if (measureText(text, font) <= maxWidth) return text;

  const suffix = /(\([^)]{1,14}\)|\b\d+[.,]?\d*\s?(?:ml|ML|l|L|g|kg|un)\b)\s*$/.exec(text);
  if (!suffix) return truncateToWidth(text, maxWidth, font);

  const tail = suffix[1].trim();
  const body = text.slice(0, suffix.index).trimEnd();
  const reserved = measureText(`…${tail}`, font);
  if (reserved >= maxWidth || !body) return truncateToWidth(text, maxWidth, font);

  const head = truncateToWidth(body, maxWidth - reserved, font).replace(/…$/, "").trimEnd();
  if (!head) return truncateToWidth(text, maxWidth, font);
  return `${head}…${tail}`;
}

/* -------------------------------- sizing --------------------------------- */

export interface MeasuredBox<T extends HTMLElement> {
  /** Callback ref — attach this to the element whose width you need. */
  ref: (node: T | null) => void;
  /** The live node, for reading its computed font. Null before mount. */
  node: T | null;
  /** Measured content width in CSS px. 0 until the element is in the DOM. */
  width: number;
}

/**
 * Measured content width of a container, so a chart can lay itself out in real
 * pixels (crisp text, honest truncation) instead of scaling a fixed viewBox.
 *
 * This is a CALLBACK ref, not `useRef` + `useEffect([])`. If the observed
 * element is ever replaced — React remounts a node whenever its parent's
 * children change shape — a once-only effect keeps observing the detached old
 * node, which then reports width 0 forever and leaves the chart permanently
 * blank. A callback ref re-attaches the observer to whatever node is current.
 */
export function useElementWidth<T extends HTMLElement>(): MeasuredBox<T> {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((next: T | null) => {
    setNode(next);
    setWidth(next ? next.clientWidth : 0);
  }, []);

  useEffect(() => {
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { ref, node, width };
}

/* -------------------------------- scales --------------------------------- */

export interface NiceScale {
  max: number;
  step: number;
  ticks: number[];
}

/**
 * Round the y-axis up to a clean number so ticks read 0 / 250 / 500 rather
 * than 0 / 233 / 466. Always includes zero: revenue is meaningless off a zero
 * baseline. Steps are held to 1 / 2 / 5 × a power of ten so that any scale
 * above a few reais produces whole-number ticks.
 */
export function niceScale(rawMax: number, targetTicks = 4): NiceScale {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return { max: 1, step: 1, ticks: [0, 1] };
  const rough = rawMax / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const stepMultiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = stepMultiple * magnitude;
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return { max, step, ticks };
}

/** Axis tick text: whole reais normally, decimals only on a tiny scale. */
export function formatTick(value: number, step: number): string {
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Which x-axis labels to draw. Rather than rotating labels (unreadable on a
 * phone) or letting them overlap, only every Nth tick is drawn — N chosen from
 * the real rendered width of the widest label.
 */
export function labelIndices(
  count: number,
  slotWidth: number,
  widestLabel: number,
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const stride = Math.max(1, Math.ceil((widestLabel + 10) / Math.max(1, slotWidth)));
  const out: number[] = [];
  for (let i = 0; i < count; i += stride) out.push(i);
  const last = count - 1;
  // The final bucket is the one the reader looks for; add it when there is
  // room, and replace the previous tick when there is not.
  if (out[out.length - 1] !== last) {
    if (last - out[out.length - 1] >= stride) out.push(last);
    else out[out.length - 1] = last;
  }
  return out;
}

/** Rounded on the value end, square on the baseline (see marks-and-anatomy). */
export function horizontalBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const w = Math.max(width, 0);
  const r = Math.min(4, w / 2, height / 2);
  if (w <= 0) return "";
  return [
    `M ${x} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + height}`,
    `H ${x}`,
    "Z",
  ].join(" ");
}
