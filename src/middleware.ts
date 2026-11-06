import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/roles";

// Halaman pribadi karyawan. SUPER_ADMIN bukan karyawan, jadi tidak punya data di sini.
const EMPLOYEE_ONLY = ["/portal/absensi", "/portal/cuti", "/portal/dinas", "/portal/payslip", "/portal/pph21"];

const COMING_SOON = process.env.COMING_SOON === "true";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const path = nextUrl.pathname;

  // Use actual request host from headers (not nextUrl which is affected by NEXTAUTH_URL)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] || "https";
  const origin = `${proto}://${host}`;

  const isPortalPage = path.startsWith("/portal");
  const isLoginPage = path === "/portal";
  const isComingSoonPage = path === "/coming-soon";
  const isPublicAsset =
    path.startsWith("/_next") || path.startsWith("/api") ||
    path.includes(".") || path.startsWith("/progress");

  if (COMING_SOON && !isPortalPage && !isComingSoonPage && !isPublicAsset && path === "/") {
    return NextResponse.redirect(`${origin}/coming-soon`);
  }

  if (isPortalPage && !isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(`${origin}/portal`);
  }
  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(`${origin}/portal/dashboard`);
  }
  if (
    isSuperAdmin(session?.user?.role) &&
    EMPLOYEE_ONLY.some((p) => path === p || path.startsWith(p + "/"))
  ) {
    return NextResponse.redirect(`${origin}/portal/dashboard`);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/", "/portal/:path*"],
};
