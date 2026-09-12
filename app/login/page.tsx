import { redirect } from "next/navigation";
import { getSessionProfile, hasAnyProfile } from "@/lib/server/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Straight to the app.
  const profile = await getSessionProfile();
  if (profile) redirect("/");

  // Brand new install: there is no account to log into yet.
  if (!(await hasAnyProfile())) redirect("/setup");

  return <LoginForm />;
}
