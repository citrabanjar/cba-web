import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LoginForm from "./LoginForm";
import { LanguageSwitcher, T } from "@/components/i18n";

export const metadata: Metadata = { title: "Login Portal Karyawan" };

// Kartu kaca dua sisi: formulir di kiri, sambutan di kanan dengan panel kaca miring
// (desain Code XR Glassy Login v2, warna merah CBA).
export default function PortalLoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      <LanguageSwitcher className="absolute right-4 top-4" />

      <div className="login-card w-full max-w-3xl">
        <span className="login-shape" aria-hidden />
        <div className="relative z-10 grid md:grid-cols-2">
          <div className="p-8 sm:p-10">
            <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/20">
              <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" width={190} height={28} priority />
            </span>
            <p className="mb-8 mt-6 text-sm text-white/60"><T>Masuk dengan ID karyawan atau email Anda.</T></p>
            <LoginForm />
            <p className="mt-6 text-center text-xs text-white/55"><T>Lupa password?</T></p>
          </div>

          <div className="hidden flex-col justify-center p-10 md:flex">
            <h2 className="text-4xl font-extrabold uppercase leading-[1.1] tracking-tight text-white">
              <T>Selamat</T>
              <br />
              <T>Datang!</T>
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              <T>Absensi, cuti, dinas luar, slip gaji, dan PPh 21 dalam satu tempat.</T>
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Absensi GPS", "Pengajuan Cuti", "Slip Gaji", "PPh 21"].map((f) => (
                <span key={f} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/85">
                  <T>{f}</T>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-white/60">
        <Link href="/" className="transition-colors hover:text-white"><T>← Kembali ke Website</T></Link>
      </p>
    </div>
  );
}
