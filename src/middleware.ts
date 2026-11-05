import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COMING_SOON = process.env.COMING_SOON === "true";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPortalPage = pathname.startsWith("/portal");
  const isLoginPage = pathname === "/portal";
  const isComingSoonPage = pathname === "/coming-soon";
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname.startsWith("/progress");

  if (COMING_SOON && !isPortalPage && !isComingSoonPage && !isPublicAsset && pathname === "/") {
    return NextResponse.redirect(new URL("/coming-soon", req.url));
  }

  if (isPortalPage) {
    const token = await getToken({ req });
    const isLoggedIn = !!token;

    if (!isLoginPage && !isLoggedIn) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
    if (isLoginPage && isLoggedIn) {
      return NextResponse.redirect(new URL("/portal/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/portal/:path*"],
};
