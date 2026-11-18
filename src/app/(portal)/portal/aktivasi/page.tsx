import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher, T } from "@/components/i18n";
import AktivasiForm from "./AktivasiForm";

export const metadata: Metadata = { title: "Aktivasi Akun" };

// Halaman publik: aktivasi akun karyawan baru dan lupa password, dengan kode OTP ke email karyawan.
export default function AktivasiPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <div className="login-card w-full max-w-md">
        <span className="login-shape" aria-hidden />
        <div className="relative z-10 p-8 sm:p-10">
          <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/20">
            <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" width={190} height={28} priority />
          </span>
          <h1 className="mt-6 text-xl font-bold text-white"><T>Aktivasi Akun / Lupa Password</T></h1>
          <p className="mb-6 mt-1 text-sm text-white/65">
            <T>Masukkan Employee ID atau email Anda. Kode OTP akan dikirim ke email yang tercatat di data karyawan, lalu Anda dapat membuat password baru.</T>
          </p>
          <AktivasiForm />
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-white/60">
        <Link href="/portal" className="transition-colors hover:text-white"><T>← Kembali ke halaman masuk</T></Link>
      </p>
    </div>
  );
}
