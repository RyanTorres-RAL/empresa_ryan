/* eslint-disable @next/next/no-img-element */

/**
 * The shop's real logo, supplied by the owner and prepared into three
 * variants (see public/):
 *
 *   full  — full colour with the dark wordmark. Light grounds only.
 *   light — same artwork, wordmark recoloured white, for the purple panels
 *           where the dark wordmark would disappear.
 *   mark  — the cup alone, carrying a thin white outline. The cup is dark
 *           purple, so on the dark purple nav it needs that outline to read at
 *           30–40px; a white box behind it was explicitly not wanted.
 *
 * The white background of the supplied file was removed by flood-filling from
 * the edges inwards, so the white rim *inside* the cup survived.
 *
 * Sized by height: the artwork is taller than it is wide, so a single square
 * `size` would distort it.
 */

const SOURCES = {
  full: { src: "/logo.png", ratio: 205 / 420 },
  light: { src: "/logo-branca.png", ratio: 205 / 420 },
  mark: { src: "/logo-marca.png", ratio: 164 / 240 },
} as const;

export type LogoVariant = keyof typeof SOURCES;

export default function Logo({
  variant = "mark",
  height = 34,
  className,
  title = "Açaí do Ryan",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
  title?: string;
}) {
  const { src, ratio } = SOURCES[variant];
  return (
    <img
      src={src}
      alt={title}
      width={Math.round(height * ratio)}
      height={height}
      className={className}
      style={{ height, width: "auto", display: "block", flex: "none" }}
    />
  );
}
