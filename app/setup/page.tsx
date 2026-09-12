import { redirect } from "next/navigation";
import { hasAnyProfile } from "@/lib/server/auth";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

/**
 * First-run page. Checked server-side on EVERY request: as soon as one
 * crm_profiles row exists this page refuses and sends the visitor to /login.
 * The primeiroAcesso() action re-checks the same condition, so calling it
 * directly is equally useless once the shop is configured.
 */
export default async function SetupPage() {
  if (await hasAnyProfile()) redirect("/login");

  return <SetupForm />;
}
