/**
 * Brazilian WhatsApp numbers — normalising, formatting and linking.
 *
 * STORAGE SHAPE: digits only, country code included — "5562995757130".
 * That is exactly what wa.me wants in its path, so the loyalty-card link is
 * built by concatenation with no parsing at the call site, and two people who
 * typed the same number two different ways ("62 99575-7130", "+55 62
 * 99575-7130") end up as the same string.
 *
 * The number is always OPTIONAL: a walk-up customer who will not give one must
 * never be blocked, so an empty value is a valid, silent success everywhere.
 */

export type WhatsappResult = { ok: true; digits: string } | { ok: false; error: string };

/**
 * Shown when the field holds something that is not a phone number. It names
 * the shape wanted and repeats that blank is allowed, because the most likely
 * reader is the owner at the counter with a customer waiting.
 */
export const WHATSAPP_ERROR =
  "WhatsApp inválido. Digite o número com DDD, assim: (62) 99575-7130. Ou deixe em branco.";

/**
 * Accepts what a person actually types and returns storable digits.
 *
 *   "62995757130"        -> "5562995757130"   (DDD + celular, sem país)
 *   "(62) 99575-7130"    -> "5562995757130"   (pontuação ignorada)
 *   "5562995757130"      -> "5562995757130"   (já tem o país, mantém)
 *   "+55 62 99575-7130"  -> "5562995757130"   (idem)
 *   "995757130"          -> erro (faltou o DDD)
 *   ""                   -> "" (sem erro)
 */
export function normalizeWhatsapp(raw: string): WhatsappResult {
  const digits = (raw ?? "").replace(/\D/g, "");

  // Blank is a valid answer, not a mistake.
  if (digits === "") return { ok: true, digits: "" };

  // Already carries the country code: 55 + 10-digit landline or 11-digit mobile.
  // Checked first, and only at these two lengths, so that an 11-digit number in
  // DDD 55 (Santa Maria/RS) still falls through to the branch below and gets
  // its country code — "55987654321" is a local number, not a prefixed one.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return { ok: true, digits };
  }

  // DDD + number, no country code — the common case at the counter.
  if (digits.length === 10 || digits.length === 11) {
    return { ok: true, digits: `55${digits}` };
  }

  return { ok: false, error: WHATSAPP_ERROR };
}

/**
 * Back to something a human reads: "5562995757130" -> "(62) 99575-7130".
 *
 * Anything of an unexpected length is returned as its plain digits rather than
 * forced into a mask — showing the real stored value beats inventing brackets
 * around the wrong groups.
 */
export function formatWhatsappBR(stored: string): string {
  const digits = (stored ?? "").replace(/\D/g, "");
  if (!digits) return "";

  const local =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return digits;
}

/**
 * A wa.me link with the message pre-filled.
 *
 * With digits it opens that person's chat directly; without them it opens
 * WhatsApp's contact picker, which is the old behaviour and the only thing
 * possible when the customer never gave a number.
 */
export function whatsappLink(digits: string, text: string): string {
  const clean = (digits ?? "").replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
