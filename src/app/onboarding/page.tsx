export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/components/i18n";
import { getCandidateSession } from "@/lib/onboarding-session";
import { prisma } from "@/lib/prisma";
import OtpLogin from "./OtpLogin";

// Masuk calon karyawan: email + nomor HP yang didaftarkan HRD, lalu kode OTP.
export default async function OnboardingLoginPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  // Lanjut ke formulir hanya bila sesi menunjuk calon yang masih ada dan (bila link berisi email) calon yang sama.
  // Sesi lama milik calon yang sudah dihapus / calon lain diabaikan, supaya tidak terjadi redirect berulang.
  const sessionId = await getCandidateSession();
  if (sessionId) {
    const c = await prisma.candidate.findUnique({ where: { id: sessionId }, select: { email: true } });
    const sameEmail = typeof email !== "string" || !email.trim() || c?.email === email.trim().toLowerCase();
    if (c && sameEmail) redirect("/onboarding/form");
  }
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      {/* Kartu login (email + HP) lalu kartu OTP beranimasi; keduanya di dalam OtpLogin. */}
      <OtpLogin initialEmail={typeof email === "string" ? email.slice(0, 200) : ""} />
    </div>
  );
}
