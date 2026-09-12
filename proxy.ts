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
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
