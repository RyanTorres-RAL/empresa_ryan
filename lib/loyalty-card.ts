/**
 * Loyalty card — drawing and sharing.
 *
 * Pure presentation: it reads a client's name and stamp count and produces a
 * PNG. No business logic lives here — the stamp count is whatever the server
 * already computed (client.fidelityStamps % 10).
 *
 * The colours below are BRAND ARTWORK. They are intentionally hardcoded and
 * do NOT follow the light/dark theme: the card has to look the same on the
 * printed version, in the app, and in a WhatsApp thread.
 */

import { slugify } from "@/lib/types";

export const CARD_W = 1080;
/** 1.74:1 — the proportions of the shop's printed card. */
export const CARD_H = 620;
/** Drawn at 2× so it stays crisp on phone screens and when zoomed. */
export const CARD_SCALE = 2;

/**
 * Sampled from the owner's own printed card (his Canva layout): deep
 * indigo-purple ground, one vivid violet blob, white stamp circles, a gold
 * star for the free one, bright green leaves. No mint/teal anywhere — that
 * was a drift away from his brand.
 */
const INK = {
  purple: "#3E0F66",
  purpleDeep: "#320B54",
  blob: "#5B21D6",
  blobSoft: "rgba(255, 255, 255, 0.07)",
  white: "#FFFFFF",
  whiteSoft: "rgba(255, 255, 255, 0.80)",
  whiteFaint: "rgba(255, 255, 255, 0.55)",
  goldTop: "#A86FA8",
  goldMid: "#E0A44A",
  goldLow: "#FFD24A",
  leaf: "#2FB81F",
  leafDark: "#1F8F14",
} as const;

const HEADING = '"Sora", "Work Sans", system-ui, -apple-system, sans-serif';
const BODY = '"Work Sans", system-ui, -apple-system, sans-serif';

export interface LoyaltyCardData {
  name: string;
  /** 0–10: stamps on the current card. */
  stamps: number;
}

/* ------------------------------------------------------------------ logo */

/**
 * The mark from public/logo-acai.svg with the `currentColor` outlines pinned
 * to white, so it can be rasterised onto the purple card. Kept as a string
 * because a canvas cannot read a React component; it is the same geometry as
 * components/Logo.tsx.
 */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" fill="none">
<g stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
<path d="M126 44c2-15 15-27 30-28 1 15-11 28-26 31z" fill="#48B93C"/>
<path d="M58 98c-3-21 6-35 20-43 1-14 13-24 26-22 13-5 26 4 26 17 12 8 16 27 12 48z" fill="#A23BB4"/>
<path d="M112 33c1-9 9-14 16-11" stroke-width="6"/>
<circle cx="76" cy="70" r="11" fill="#3D1152"/>
<circle cx="97" cy="60" r="9" fill="#4E166A"/>
<path d="M54 98h92l-10 74c-1 8-7 13-15 13H79c-8 0-14-5-15-13z" fill="#8E2F9E"/>
<ellipse cx="100" cy="98" rx="46" ry="10" fill="#FFFFFF"/>
</g>
<path d="M68 80c16-9 40-11 64-4" stroke="#D98CE8" stroke-width="5" stroke-linecap="round" opacity=".55"/>
<path d="M74 60c12-8 28-9 42-3" stroke="#D98CE8" stroke-width="4.5" stroke-linecap="round" opacity=".45"/>
<path d="M70 128h60M73 152h54" stroke="#5B1A73" stroke-width="6" stroke-linecap="round" opacity=".45"/>
<path d="M80 112c-2 20-2 41-1 60" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity=".2"/>
</svg>`;

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // card still renders without the mark
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
  });
}

/** Best-effort: make sure the webfonts are usable before measuring text. */
async function ensureFonts(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.all([
      fonts.load(`700 54px "Sora"`),
      fonts.load(`600 26px "Sora"`),
      fonts.load(`400 24px "Work Sans"`),
    ]);
    await fonts.ready;
  } catch {
    // Fallback stacks are good enough; never block the download on this.
  }
}

/* ----------------------------------------------------------------- shapes */

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.bezierCurveTo(cx + r * 0.95, cy - r * 1.05, cx + r * 1.15, cy + r * 0.35, cx + r * 0.5, cy + r * 0.8);
  ctx.bezierCurveTo(cx - r * 0.15, cy + r * 1.25, cx - r * 1.1, cy + r * 0.7, cx - r * 0.95, cy - r * 0.1);
  ctx.bezierCurveTo(cx - r * 0.85, cy - r * 0.85, cx - r * 0.5, cy - r * 1.05, cx, cy - r);
  ctx.closePath();
}

/** Traces a five-pointed star. Caller fills it — some are gradient-filled. */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The printed card's star: mauve at the tip grading down to gold. */
function goldStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  const g = ctx.createLinearGradient(cx, cy - outer, cx, cy + outer);
  g.addColorStop(0, INK.goldTop);
  g.addColorStop(0.55, INK.goldMid);
  g.addColorStop(1, INK.goldLow);
  starPath(ctx, cx, cy, outer, outer * 0.44);
  ctx.fillStyle = g;
  ctx.fill();
}

/** One leaf pointing up-right from (x, y). */
function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.35, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.35, len * 0.42, 0, 0);
  ctx.closePath();
  ctx.fill();
  // midrib
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(len * 0.06, 0);
  ctx.lineTo(len * 0.92, 0);
  ctx.stroke();
  ctx.restore();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  // Chrome/Safari 17+. Silently ignored elsewhere.
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = value;
  } catch {
    /* not supported */
  }
}

/* ---------------------------------------------------------------- drawing */

/**
 * Draws the card into `canvas`, sizing it to CARD_W × CARD_H at CARD_SCALE.
 * Exported so a preview and the download share exactly one implementation.
 */
export async function drawLoyaltyCard(
  canvas: HTMLCanvasElement,
  data: LoyaltyCardData
): Promise<void> {
  const stamps = Math.max(0, Math.min(10, Math.floor(data.stamps)));
  const complete = stamps >= 10;

  canvas.width = CARD_W * CARD_SCALE;
  canvas.height = CARD_H * CARD_SCALE;
  canvas.style.width = "100%";

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  await ensureFonts();
  const logo = await loadLogo();

  ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  // ---- ground -------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, INK.purple);
  bg.addColorStop(1, INK.purpleDeep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // vivid violet blobs bleeding off two corners, as on the printed card
  ctx.save();
  ctx.fillStyle = INK.blob;
  blob(ctx, CARD_W - 60, 10, 240);
  ctx.fill();
  blob(ctx, 10, CARD_H - 10, 150);
  ctx.fill();
  ctx.fillStyle = INK.blobSoft;
  blob(ctx, CARD_W - 150, 120, 150);
  ctx.fill();
  ctx.restore();

  const padX = 76;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // ---- brand lockup, top-left ----------------------------------------
  if (logo) ctx.drawImage(logo, padX - 14, 26, 84, 84);

  const wordX = padX + 68;
  setLetterSpacing(ctx, "1px");
  ctx.fillStyle = INK.white;
  ctx.font = `700 32px ${HEADING}`;
  ctx.fillText("AÇAÍ", wordX, 72);
  ctx.font = `700 19px ${HEADING}`;
  ctx.fillText("DO RYAN", wordX, 98);
  setLetterSpacing(ctx, "0px");

  // ---- stamps: two rows of five, then the GRÁTIS star ---------------
  const r = 40;
  const gapX = 110;
  const rowY = [196, 304];
  const startX = 102;

  for (let i = 0; i < 10; i++) {
    const cx = startX + (i % 5) * gapX;
    const cy = rowY[i < 5 ? 0 : 1];

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (i < stamps) {
      ctx.fillStyle = INK.white;
      ctx.fill();
      goldStar(ctx, cx, cy + 1, r * 0.62);
    } else {
      // Still a circle, as on the printed card — just waiting to be filled.
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.fill();
      ctx.strokeStyle = INK.whiteFaint;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const freeX = startX + 5 * gapX + 52;
  const freeY = (rowY[0] + rowY[1]) / 2;

  ctx.textAlign = "center";
  setLetterSpacing(ctx, "3px");
  ctx.fillStyle = INK.white;
  ctx.font = `700 26px ${HEADING}`;
  ctx.fillText("GRÁTIS", freeX, freeY - 76);
  setLetterSpacing(ctx, "0px");

  ctx.beginPath();
  ctx.arc(freeX, freeY, 58, 0, Math.PI * 2);
  ctx.fillStyle = INK.white;
  ctx.fill();
  if (!complete) {
    ctx.globalAlpha = 0.45; // dimmed until it's actually been earned
  }
  goldStar(ctx, freeX, freeY + 2, 40);
  ctx.globalAlpha = 1;

  // ---- tagline + progress -------------------------------------------
  ctx.textAlign = "left";
  ctx.fillStyle = INK.white;
  ctx.font = `400 27px ${BODY}`;
  ctx.fillText("A cada 10 açaís, você ganha um de graça.", padX, 396);

  ctx.font = `700 30px ${HEADING}`;
  ctx.fillStyle = complete ? INK.goldLow : INK.white;
  ctx.fillText(complete ? "Cartão completo!" : `${stamps} de 10 selos`, padX, 446);

  ctx.fillStyle = INK.whiteSoft;
  ctx.font = `400 23px ${BODY}`;
  if (complete) {
    ctx.fillText("O próximo açaí é por nossa conta.", padX, 480);
  } else {
    const left = 10 - stamps;
    ctx.fillText(
      `${left === 1 ? "Falta 1 selo" : `Faltam ${left} selos`} para o açaí grátis.`,
      padX,
      480
    );
  }

  // ---- name line ------------------------------------------------------
  const nameY = 552;
  ctx.fillStyle = INK.whiteSoft;
  ctx.font = `400 24px ${BODY}`;
  ctx.fillText("Nome:", padX, nameY);
  const labelW = ctx.measureText("Nome:").width;

  ctx.fillStyle = INK.white;
  ctx.font = `600 30px ${HEADING}`;
  const nameX = padX + labelW + 16;
  ctx.fillText(data.name, nameX, nameY);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, nameY + 16);
  ctx.lineTo(Math.min(CARD_W - 300, nameX + Math.max(240, ctx.measureText(data.name).width + 40)), nameY + 16);
  ctx.stroke();

  // ---- leaves, bottom-right -------------------------------------------
  leaf(ctx, CARD_W - 210, CARD_H - 66, 116, -0.72, INK.leaf);
  leaf(ctx, CARD_W - 196, CARD_H - 54, 96, -0.2, INK.leafDark);
  leaf(ctx, CARD_W - 214, CARD_H - 60, 78, -1.25, INK.leaf);
  ctx.strokeStyle = INK.leafDark;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CARD_W - 214, CARD_H - 60);
  ctx.quadraticCurveTo(CARD_W - 232, CARD_H - 36, CARD_W - 224, CARD_H - 14);
  ctx.stroke();
}

/** Renders the card off-screen and returns it as a PNG blob. */
export async function renderLoyaltyCardBlob(data: LoyaltyCardData): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  await drawLoyaltyCard(canvas, data);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/* ---------------------------------------------------------------- sharing */

export function loyaltyFileName(name: string): string {
  return `cartao-fidelidade-${slugify(name)}.png`;
}

/** pt-BR message that travels with the image. Singular/plural handled. */
export function loyaltyMessage(name: string, stamps: number): string {
  const s = Math.max(0, Math.min(10, Math.floor(stamps)));
  const first = name.trim().split(/\s+/)[0] || name.trim();

  if (s >= 10) {
    return `Oi, ${first}! 💜 Seu cartão fidelidade do Açaí do Ryan está completo: 10 de 10 selos! O próximo açaí é por nossa conta — é só mostrar essa imagem na loja.`;
  }
  const missing = 10 - s;
  const missingText = missing === 1 ? "falta 1 selo" : `faltam ${missing} selos`;
  if (s === 0) {
    return `Oi, ${first}! 💜 Esse é o seu cartão fidelidade do Açaí do Ryan. A cada 10 açaís você ganha um de graça — ${missingText} para o seu!`;
  }
  return `Oi, ${first}! 💜 Esse é o seu cartão fidelidade do Açaí do Ryan. Você já tem ${s} de 10 selos — ${missingText} para ganhar um açaí grátis!`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ShareOutcome =
  /** The OS share sheet took the image (phones — this is the WhatsApp path). */
  | { kind: "shared" }
  /** The user dismissed the share sheet. Not an error; say nothing. */
  | { kind: "cancelled" }
  /** No file sharing here: PNG downloaded and wa.me opened in a new tab. */
  | { kind: "fallback"; waUrl: string; popupBlocked: boolean }
  | { kind: "error"; message: string };

/**
 * Must be called straight from a click handler: navigator.share() requires a
 * user gesture, and the fallback's window.open() would otherwise be blocked.
 * Also requires HTTPS, which production is.
 */
export async function shareLoyaltyCard(data: LoyaltyCardData): Promise<ShareOutcome> {
  const message = loyaltyMessage(data.name, data.stamps);
  const fileName = loyaltyFileName(data.name);

  let blob: Blob | null = null;
  try {
    blob = await renderLoyaltyCardBlob(data);
  } catch {
    blob = null;
  }
  if (!blob) {
    return { kind: "error", message: "Não foi possível gerar a imagem do cartão." };
  }

  const file = new File([blob], fileName, { type: "image/png" });

  // Phones (Chrome Android / iOS Safari): hand the image to the share sheet,
  // which lists WhatsApp directly.
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message });
      return { kind: "shared" };
    } catch (err) {
      // The user closing the sheet throws AbortError — that is not a failure.
      if (err && typeof err === "object" && (err as Error).name === "AbortError") {
        return { kind: "cancelled" };
      }
      // Anything else: fall through to the download + wa.me route below.
    }
  }

  // Desktop / Firefox: no file sharing. Download the PNG and open WhatsApp
  // Web with the text ready, then tell the user to attach the image.
  downloadBlob(blob, fileName);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const win = window.open(waUrl, "_blank", "noopener,noreferrer");
  return { kind: "fallback", waUrl, popupBlocked: !win };
}
