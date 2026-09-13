import type { MetadataRoute } from "next";

/**
 * Web App Manifest — what makes the site installable as an app rather than a
 * browser bookmark.
 *
 * Desktop Chrome will install almost any HTTPS page without one, which is why
 * it worked there already; iOS Safari will not. `display: "standalone"` is the
 * field that drops the address bar on the home-screen launch.
 *
 * background_color is the login splash's darkest stop and theme_color the nav
 * purple, so the launch screen and the status bar match the app instead of
 * flashing white.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Açaí do Ryan — PDV & CRM",
    short_name: "Açaí do Ryan",
    description: "Sistema de vendas, clientes, fiado e caixa do Açaí do Ryan.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    dir: "ltr",
    theme_color: "#3d1152",
    background_color: "#0b0510",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Same art, declared maskable: Android launchers crop icons to their own
      // shape, and the 20% padding keeps the cup inside the safe zone.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
