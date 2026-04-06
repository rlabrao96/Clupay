import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/", "/login", "/register", "/callback", "/invite"];

export async function proxy(request: NextRequest) {
  const { user, response } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return response;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based routing is handled by AuthGuard in each layout
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
