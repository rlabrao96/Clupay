import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/", "/login", "/register", "/callback", "/invite"];

export async function middleware(request: NextRequest) {
  const { user, response, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    if (!path.startsWith("/register")) {
      return NextResponse.redirect(new URL("/register/complete", request.url));
    }
    return response;
  }

  const role = profile.role;

  if (path.startsWith("/admin") && role !== "super_admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/club") && role !== "club_admin" && role !== "super_admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/app") && role !== "parent") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
