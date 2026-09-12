"use client";

import dynamic from "next/dynamic";
import { SessionProfile } from "@/lib/types";

// Kept client-only (ssr: false) exactly as before: the app reads the theme
// from localStorage on mount and would otherwise hydrate mismatched.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function AppShell({ profile }: { profile: SessionProfile }) {
  return <App profile={profile} />;
}
