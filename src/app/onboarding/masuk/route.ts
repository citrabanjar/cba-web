import { NextResponse, type NextRequest } from "next/server";
import { readLoginTicket, setCandidateSession } from "@/lib/onboarding-session";

// Tukar tiket OTP (sekali pakai, 2 menit) dengan sesi calon, lalu buka formulir.
export async function GET(req: NextRequest) {
  const id = readLoginTicket(req.nextUrl.searchParams.get("t") ?? "");
  if (!id) return NextResponse.redirect(new URL("/onboarding", req.url));
  await setCandidateSession(id);
  return NextResponse.redirect(new URL("/onboarding/form", req.url));
}
