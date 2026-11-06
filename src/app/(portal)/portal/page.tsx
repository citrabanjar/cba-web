import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LoginForm from "./LoginForm";
import { LanguageSwitcher, T } from "@/components/i18n";

export const metadata: Metadata = { title: "Login Portal Karyawan" };

export default function PortalLoginPage() {
  return (
    <div className="relative min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <LanguageSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-gray-200 border-t-4 border-t-brand shadow-sm p-8">
          <div className="flex flex-col items-center mb-8">
            <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" width={280} height={41} priority className="mb-4" />
            <h1 className="font-bold text-ink text-lg text-center"><T>Portal Karyawan</T></h1>
          </div>

          <LoginForm />

          <p className="text-center text-xs text-gray-400 mt-6">
            <T>Lupa password? Hubungi HRD</T>
          </p>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          <Link href="/" className="hover:text-brand transition-colors"><T>← Kembali ke Website</T></Link>
        </p>
      </div>
    </div>
  );
}
