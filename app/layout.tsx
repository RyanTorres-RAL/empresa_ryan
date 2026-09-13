import type { Metadata } from "next";
import { Sora, Work_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Açaí do Ryan — PDV & CRM",
  description: "PDV e CRM para Açaí do Ryan",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${workSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
