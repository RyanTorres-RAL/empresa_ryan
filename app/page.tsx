import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/server/auth";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * The app itself. Resolving the profile here (server-side) is what decides
 * which screens exist for this person — the browser is told the role, it
 * never picks one. Every action behind those screens is guarded again on the
 * server (lib/server/auth.ts).
 */
export default async function Page() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  return <AppShell profile={profile} />;
}
