/**
 * The shop logo, inlined as JSX.
 *
 * It MUST be inlined rather than loaded through <img src="/logo-acai.svg">:
 * the outline strokes are drawn with `currentColor` so the mark can be white
 * on the purple nav and purple on light grounds. An <img> is an isolated
 * document and would render those strokes black.
 *
 * Markup ported verbatim from public/logo-acai.svg — the fill colours inside
 * are brand artwork and deliberately do NOT follow the theme. Only the
 * outline colour follows `color` from the surrounding context.
 */
export default function Logo({
  size = 32,
  className,
  title = "Açaí do Ryan",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={title}
      className={className}
      style={{ display: "block", flex: "none" }}
    >
      <g
        stroke="currentColor"
        strokeWidth={7}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* leaf */}
        <path d="M126 44c2-15 15-27 30-28 1 15-11 28-26 31z" fill="#48B93C" />

        {/* soft-serve swirl */}
        <path
          d="M58 98c-3-21 6-35 20-43 1-14 13-24 26-22 13-5 26 4 26 17 12 8 16 27 12 48z"
          fill="#A23BB4"
        />
        <path d="M112 33c1-9 9-14 16-11" strokeWidth={6} />

        {/* berries */}
        <circle cx={76} cy={70} r={11} fill="#3D1152" />
        <circle cx={97} cy={60} r={9} fill="#4E166A" />

        {/* cup */}
        <path
          d="M54 98h92l-10 74c-1 8-7 13-15 13H79c-8 0-14-5-15-13z"
          fill="#8E2F9E"
        />
        <ellipse cx={100} cy={98} rx={46} ry={10} fill="#FFFFFF" />
      </g>

      {/* unstroked detail */}
      <path
        d="M68 80c16-9 40-11 64-4"
        stroke="#D98CE8"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d="M74 60c12-8 28-9 42-3"
        stroke="#D98CE8"
        strokeWidth={4.5}
        strokeLinecap="round"
        opacity={0.45}
      />
      <path
        d="M70 128h60M73 152h54"
        stroke="#5B1A73"
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.45}
      />
      <path
        d="M80 112c-2 20-2 41-1 60"
        stroke="#FFFFFF"
        strokeWidth={7}
        strokeLinecap="round"
        opacity={0.2}
      />
      <path
        d="M70 64a4 4 0 0 1 5-2"
        stroke="#FFFFFF"
        strokeWidth={2.6}
        strokeLinecap="round"
        opacity={0.4}
        fill="none"
      />
      <path
        d="M92 55a3.4 3.4 0 0 1 4-1.6"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.35}
        fill="none"
      />
    </svg>
  );
}
