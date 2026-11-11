export const dynamic = "force-dynamic";

import Image from "next/image";
import { redirect } from "next/navigation";
import { LanguageSwitcher, T } from "@/components/i18n";
import { getCandidateSession } from "@/lib/onboarding-session";
import OtpLogin from "./OtpLogin";

// Masuk calon karyawan: email + nomor HP yang didaftarkan HRD, lalu kode OTP.
export default async function OnboardingLoginPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (await getCandidateSession()) redirect("/onboarding/form");
  const { email } = await searchParams;
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <div className="login-card w-full max-w-md">
        <span className="login-shape" aria-hidden />
        <div className="relative z-10 p-8 sm:p-10">
          <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/20">
            <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" width={190} height={28} priority />
          </span>
          <h1 className="mt-6 text-xl font-bold text-white"><T>Data Calon Karyawan</T></h1>
          <p className="mb-6 mt-1 text-sm text-white/65"><T>Masuk dengan email dan nomor HP yang Anda berikan ke HRD. Kami akan mengirim kode OTP.</T></p>
          <OtpLogin initialEmail={typeof email === "string" ? email.slice(0, 200) : ""} />
        </div>
      </div>
    </div>
  );
}
