import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COMING_SOON = process.env.COMING_SOON === "true";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const path = nextUrl.pathname;

  const isPortalPage = path.startsWith("/portal");
  const isLoginPage = path === "/portal";
  const isComingSoonPage = path === "/coming-soon";
  const isPublicAsset = path.startsWith("/_next") || path.startsWith("/api") ||
    path.includes(".") || path.startsWith("/progress");

  // Coming soon mode: redirect public homepage to /coming-soon
  if (COMING_SOON && !isPortalPage && !isComingSoonPage && !isPublicAsset && path === "/") {
    return NextResponse.redirect(new URL("/coming-soon", req.url));
  }

  // Portal auth guards
  if (isPortalPage && !isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/portal/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/portal/:path*"],
};
