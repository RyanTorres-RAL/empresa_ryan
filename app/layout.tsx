import type { Metadata, Viewport } from "next";
import { Poppins, Sora, Work_Sans } from "next/font/google";
import "./globals.css";

// Sora for headings and numbers, Work Sans for body copy. Loaded through
// next/font so the files are self-hosted (no render-blocking request to
// Google) and exposed to globals.css as CSS variables.
const sora = Sora({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-work-sans",
  display: "swap",
});

// Only the loyalty card uses this: it is the closest widely-available match to
// the rounded geometric face on the shop's printed card, so the name written
// onto the card sits in the same typographic voice as the artwork behind it.
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Açaí do Ryan — PDV & CRM",
  description: "PDV e CRM para Açaí do Ryan",
  applicationName: "Açaí do Ryan",
  // iOS before 16.4 ignores the manifest's display mode and reads these
  // instead, so both are declared. `title` is what sits under the home-screen
  // icon; without it iOS uses the full <title>, which is far too long.
  appleWebApp: {
    capable: true,
    title: "Açaí do Ryan",
    statusBarStyle: "default",
  },
  other: {
    // Next emits only the modern `mobile-web-app-capable`. iOS 16.4+ reads the
    // manifest's display mode instead, but older iPhones read this legacy name
    // and nothing else — without it they add a browser bookmark, not an app.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#3d1152",
  // The PDV is used one-handed at the register; pinch-zoom stays enabled for
  // accessibility, but the initial scale is pinned so iOS does not zoom in on
  // a focused input and leave the layout shifted.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${workSans.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
