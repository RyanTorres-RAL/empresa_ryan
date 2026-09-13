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
export const CARD_H = 720;
/** Drawn at 2× so it stays crisp on phone screens and when zoomed. */
export const CARD_SCALE = 2;

const INK = {
  purple: "#3D1152",
  purpleDeep: "#2A0B3A",
  blob: "#5B1A73",
  blobSoft: "rgba(255, 255, 255, 0.06)",
  white: "#FFFFFF",
  whiteSoft: "rgba(255, 255, 255, 0.78)",
  whiteFaint: "rgba(255, 255, 255, 0.52)",
  mint: "#B9F5D8",
  green: "#16B978",
  greenDeep: "#0E9F66",
  leaf: "#48B93C",
  leafDark: "#2F8C2A",
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

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
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

  // organic lighter-purple blob, top-right
  ctx.save();
  ctx.fillStyle = INK.blob;
  blob(ctx, CARD_W - 110, 40, 250);
  ctx.fill();
  ctx.fillStyle = INK.blobSoft;
  blob(ctx, CARD_W - 40, 150, 170);
  ctx.fill();
  ctx.restore();

  // thin inner keyline
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, CARD_W - 48, CARD_H - 48);

  const padX = 72;

  // ---- header -------------------------------------------------------
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  setLetterSpacing(ctx, "4px");
  ctx.fillStyle = INK.mint;
  ctx.font = `600 20px ${HEADING}`;
  ctx.fillText("CARTÃO FIDELIDADE", padX, 96);
  setLetterSpacing(ctx, "0px");

  ctx.fillStyle = INK.white;
  ctx.font = `700 56px ${HEADING}`;
  ctx.fillText("Açaí do Ryan", padX, 158);

  ctx.fillStyle = INK.whiteSoft;
  ctx.font = `400 25px ${BODY}`;
  ctx.fillText("A cada 10 açaís, você ganha um de graça.", padX, 200);

  // ---- stamps: two rows of five, plus the GRÁTIS star ---------------
  const r = 40;
  const gapX = 112;
  const rowY = [306, 424];
  const startX = 128;

  for (let i = 0; i < 10; i++) {
    const row = i < 5 ? 0 : 1;
    const col = i % 5;
    const cx = startX + col * gapX;
    const cy = rowY[row];
    const earned = i < stamps;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (earned) {
      ctx.fillStyle = INK.white;
      ctx.fill();
      // little purple açaí dot inside, so a filled stamp reads as a stamp
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = INK.purple;
      ctx.fill();
    } else {
      ctx.strokeStyle = INK.whiteFaint;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }

  // the 11th slot — the free one
  const freeX = startX + 5 * gapX + 34;
  const freeY = (rowY[0] + rowY[1]) / 2;
  ctx.beginPath();
  ctx.arc(freeX, freeY, 58, 0, Math.PI * 2);
  ctx.fillStyle = complete ? INK.green : "rgba(22, 185, 120, 0.22)";
  ctx.fill();
  ctx.strokeStyle = INK.green;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = complete ? INK.white : INK.mint;
  star(ctx, freeX, freeY - 6, 30, 13);

  ctx.textAlign = "center";
  setLetterSpacing(ctx, "2px");
  ctx.fillStyle = complete ? INK.white : INK.mint;
  ctx.font = `700 20px ${HEADING}`;
  ctx.fillText("GRÁTIS", freeX, freeY + 92);
  setLetterSpacing(ctx, "0px");

  // ---- progress -----------------------------------------------------
  ctx.textAlign = "left";
  ctx.fillStyle = INK.white;
  ctx.font = `700 30px ${HEADING}`;
  ctx.fillText(complete ? "10 de 10 — açaí grátis!" : `${stamps} de 10`, padX, 540);

  ctx.fillStyle = INK.whiteSoft;
  ctx.font = `400 22px ${BODY}`;
  ctx.fillText(
    complete
      ? "Mostre este cartão na loja para retirar o seu."
      : `${10 - stamps === 1 ? "Falta 1 selo" : `Faltam ${10 - stamps} selos`} para o próximo açaí grátis.`,
    padX,
    574
  );

  // ---- bottom: logo, name line, leaves -------------------------------
  if (logo) {
    ctx.drawImage(logo, padX - 8, 600, 96, 96);
  }

  const nameX = padX + 104;
  ctx.fillStyle = INK.whiteSoft;
  ctx.font = `400 22px ${BODY}`;
  ctx.fillText("Nome:", nameX, 664);

  const nameLabelW = ctx.measureText("Nome:").width;
  ctx.fillStyle = INK.white;
  ctx.font = `600 28px ${HEADING}`;
  const nameValueX = nameX + nameLabelW + 14;
  ctx.fillText(data.name, nameValueX, 664);

  // writing line under the name, like the printed card
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nameX, 678);
  ctx.lineTo(Math.min(CARD_W - 260, nameValueX + Math.max(220, ctx.measureText(data.name).width + 40)), 678);
  ctx.stroke();

  // decorative leaves, bottom-right
  leaf(ctx, CARD_W - 196, 660, 108, -0.62, INK.leaf);
  leaf(ctx, CARD_W - 186, 668, 84, -0.1, INK.leafDark);
  ctx.strokeStyle = INK.leafDark;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CARD_W - 200, 664);
  ctx.quadraticCurveTo(CARD_W - 216, 684, CARD_W - 208, 700);
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
