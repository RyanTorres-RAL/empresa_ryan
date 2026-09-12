import { AppData } from "./types";

/**
 * Real persistence now lives in Postgres (Supabase) — see lib/server/queries.ts
 * (reads) and lib/server/actions.ts (writes, as Next.js Server Actions).
 *
 * This file only provides the empty placeholder shape used for the brief
 * moment between first render and the initial `loadAppData()` server call
 * resolving (see components/App.tsx). Nothing here touches localStorage.
 */
export function emptyAppData(): AppData {
  return {
    products: [],
    clients: [],
    sales: [],
    fiados: [],
    fiadoPayments: [],
    cashOuts: [],
  };
}
