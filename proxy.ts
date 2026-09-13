import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js middleware. Since Next 16 the file convention for it is `proxy.ts`
 * (`middleware.ts` still works but is deprecated and logs a warning on every
 * build), so it lives here under the new name; the behaviour is the same
 * middleware that runs before every matched request.
 *
 * It keeps the Supabase session cookie fresh and bounces unauthenticated
 * visitors to /login — see lib/supabase/proxy.ts.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets.
     *
     * manifest.webmanifest is exempt on purpose: browsers fetch it before
     * anyone signs in, and a redirect to /login reads as an unparseable
     * manifest — the install offer then degrades to a plain bookmark. It
     * carries only the app name, colours and icon paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
