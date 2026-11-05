import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Login Portal Karyawan" };

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-16 h-16 mb-3">
              <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" fill className="object-contain" />
            </div>
            <h1 className="font-bold text-[#1e3a5f] text-lg text-center">Portal Karyawan</h1>
            <p className="text-xs text-gray-400 mt-1">PT. Citra Banjar Abadi</p>
          </div>

          <LoginForm />

          <p className="text-center text-xs text-gray-400 mt-6">
            Lupa password? Hubungi HRD
          </p>
        </div>

        <p className="text-center text-xs text-blue-200 mt-4">
          <Link href="/" className="hover:text-white transition-colors">← Kembali ke Website</Link>
        </p>
      </div>
    </div>
  );
}
