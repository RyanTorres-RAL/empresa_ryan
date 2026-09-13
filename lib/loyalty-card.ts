/**
 * Loyalty card — drawing and sharing.
 *
 * The card is NOT redrawn from scratch. `public/cartao-base.png` is the shop's
 * own printed artwork, exported from the owner's Canva file, and it is used as
 * the base layer exactly as designed. This module only composites the parts
 * that vary per customer on top of it: a gold star in each earned circle, the
 * customer's name on the "Nome:" rule, and the progress count.
 *
 * Every coordinate below is in the base image's own pixel space (1050 × 600)
 * and was measured off that image, not guessed.
 */

import { slugify } from "@/lib/types";

/** The base artwork's intrinsic size. */
export const CARD_W = 1050;
export const CARD_H = 600;
/** Drawn at 2× so it stays crisp on phone screens and when zoomed. */
export const CARD_SCALE = 2;

const BASE_SRC = "/cartao-base.png";

/** Measured centres of the ten stamp circles (radius ≈ 50). */
const STAMPS: ReadonlyArray<readonly [number, number]> = [
  [127, 160], [277, 160], [428, 160], [578, 158], [730, 162],
  [126, 300], [276, 300], [428, 300], [578, 298], [730, 302],
];
/** The GRÁTIS badge, for the progress line that sits under it. */
const BADGE = { x: 881, y: 246, r: 65 } as const;
/** The "Nome:" label's measured box, so the value lands on its rule. */
const NAME_LABEL = { right: 244, baseline: 473 } as const;

/** Sampled straight off the star in the artwork, so ours matches it. */
const STAR_TOP = "#8E468E";
const STAR_MID = "#C08A64";
const STAR_LOW = "#EFC048";
const INK_WHITE = "#FFFFFF";

const CARD_FONT = '"Poppins", "Work Sans", system-ui, -apple-system, sans-serif';

export interface LoyaltyCardData {
  name: string;
  /** 0–10: stamps on the current card. */
  stamps: number;
}

/* ------------------------------------------------------------------ assets */

let basePromise: Promise<HTMLImageElement | null> | null = null;

/** Cached: the same artwork backs every card, and it is ~90 KB. */
function loadBase(): Promise<HTMLImageElement | null> {
  if (!basePromise) {
    basePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = BASE_SRC;
    });
  }
  return basePromise;
}

/** Best-effort: the name is measured, so the face must be resolved first. */
async function ensureFonts(): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.all([fonts.load('500 34px "Poppins"'), fonts.load('600 24px "Poppins"')]);
    await fonts.ready;
  } catch {
    // Fallback stack is close enough; never block the card on a font.
  }
}

/* ------------------------------------------------------------------ shapes */

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

/**
 * A stamp star: the artwork's own mauve→gold ramp, lifted off the white disc
 * with a soft shadow and finished with a warm rim so it reads as an object
 * rather than a flat silhouette.
 */
function goldStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  ctx.save();

  ctx.shadowColor = "rgba(61, 9, 79, 0.38)";
  ctx.shadowBlur = outer * 0.34;
  ctx.shadowOffsetY = outer * 0.11;

  const g = ctx.createLinearGradient(cx - outer * 0.35, cy - outer, cx + outer * 0.35, cy + outer);
  g.addColorStop(0, STAR_TOP);
  g.addColorStop(0.55, STAR_MID);
  g.addColorStop(1, STAR_LOW);

  starPath(ctx, cx, cy, outer, outer * 0.45);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, outer * 0.05);
  ctx.strokeStyle = "rgba(122, 60, 26, 0.35)";
  ctx.stroke();

  // a highlight along the upper-left facet
  ctx.beginPath();
  ctx.moveTo(cx - outer * 0.1, cy - outer * 0.86);
  ctx.lineTo(cx - outer * 0.26, cy - outer * 0.22);
  ctx.lineTo(cx - outer * 0.02, cy - outer * 0.3);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
  ctx.fill();

  ctx.restore();
}

/* ---------------------------------------------------------------- drawing */

/**
 * Draws the card into `canvas` at CARD_SCALE. Exported so the in-app preview
 * and the shared PNG are produced by one code path — the preview IS the file.
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
  const base = await loadBase();

  ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  if (base) {
    ctx.drawImage(base, 0, 0, CARD_W, CARD_H);
  } else {
    // The artwork failed to load; a flat brand ground beats a blank card.
    ctx.fillStyle = "#3D094F";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // ---- a gold star in every earned circle ----------------------------
  for (let i = 0; i < stamps; i++) {
    const [cx, cy] = STAMPS[i];
    goldStar(ctx, cx, cy, 34);
  }

  ctx.textBaseline = "alphabetic";

  // ---- the customer's name, on the printed rule ----------------------
  ctx.textAlign = "left";
  ctx.fillStyle = INK_WHITE;
  ctx.font = `500 34px ${CARD_FONT}`;
  const nameX = NAME_LABEL.right + 22;
  const maxNameW = 700 - nameX;
  let name = data.name.trim();
  if (ctx.measureText(name).width > maxNameW) {
    // Long names: fall back to the first two words, then ellipsis.
    const parts = name.split(/\s+/);
    name = parts.slice(0, 2).join(" ");
    while (name.length > 3 && ctx.measureText(`${name}…`).width > maxNameW) {
      name = name.slice(0, -1);
    }
    if (ctx.measureText(name).width > maxNameW) name = `${name}…`;
  }
  ctx.fillText(name, nameX, NAME_LABEL.baseline);

  // ---- progress, tucked under the GRÁTIS badge ------------------------
  ctx.textAlign = "center";
  ctx.font = `600 24px ${CARD_FONT}`;
  ctx.fillStyle = complete ? STAR_LOW : "rgba(255, 255, 255, 0.92)";
  ctx.fillText(complete ? "Completo!" : `${stamps} de 10`, BADGE.x, BADGE.y + BADGE.r + 34);
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

/**
 * The message that travels with the image on WhatsApp.
 *
 * WhatsApp renders *asterisks* as bold, so the note is laid out like a little
 * card of its own rather than one long line, with a star bar that mirrors the
 * image. The tone changes with how far along the customer is — a finished card
 * gets congratulated, an empty one gets welcomed.
 */
export function loyaltyMessage(name: string, stamps: number): string {
  const s = Math.max(0, Math.min(10, Math.floor(stamps)));
  const first = name.trim().split(/\s+/)[0] || name.trim();
  const bar = "⭐".repeat(s) + "🤍".repeat(10 - s);
  const missing = 10 - s;
  const selos = missing === 1 ? "1 selo" : `${missing} selos`;

  if (s >= 10) {
    return [
      `🎉 *Parabéns, ${first}!* 🎉`,
      "",
      bar,
      "*10 de 10 selos — cartão completo!*",
      "",
      `O seu próximo açaí é *por nossa conta*. 💜`,
      "É só mostrar esta imagem na hora do pedido.",
      "",
      "Obrigado por ser nosso cliente! 🫐",
      "_Açaí do Ryan_",
    ].join("\n");
  }

  if (s === 0) {
    return [
      `Oi, ${first}! 💜`,
      "",
      "Este é o seu *cartão fidelidade* do Açaí do Ryan.",
      "",
      bar,
      "*0 de 10 selos*",
      "",
      "A cada *10 açaís*, o próximo é *grátis*. 🫐",
      "Sua primeira estrela te espera!",
      "",
      "_Açaí do Ryan_",
    ].join("\n");
  }

  if (s >= 8) {
    return [
      `Oi, ${first}! 💜`,
      "",
      bar,
      `*${s} de 10 selos*`,
      "",
      `Tá quase! Falta${missing === 1 ? "" : "m"} só *${selos}* para o seu açaí *grátis*. 🎉`,
      "",
      "_Açaí do Ryan_",
    ].join("\n");
  }

  if (s >= 5) {
    return [
      `Oi, ${first}! 💜`,
      "",
      bar,
      `*${s} de 10 selos*`,
      "",
      `Já passou da metade! Falta${missing === 1 ? "" : "m"} *${selos}* para o açaí *grátis*. 🫐`,
      "",
      "_Açaí do Ryan_",
    ].join("\n");
  }

  return [
    `Oi, ${first}! 💜`,
    "",
    "Olha como está o seu *cartão fidelidade*:",
    "",
    bar,
    `*${s} de 10 selos*`,
    "",
    `Falta${missing === 1 ? "" : "m"} *${selos}* para você ganhar um açaí *grátis*. 🫐`,
    "",
    "_Açaí do Ryan_",
  ].join("\n");
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
