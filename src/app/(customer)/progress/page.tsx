import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

export const metadata: Metadata = { title: "Cek Progress Proyek" };

export default function CustomerProgressPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="relative w-56 h-8 mx-auto mb-4">
            <Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" fill className="object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Cek Progress Proyek</h1>
          <p className="text-sm text-gray-500 mt-2">
            Masukkan kode proyek Anda untuk melihat status terkini
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Kode Proyek</label>
              <input
                type="text"
                placeholder="Contoh: CBA-2026-001"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink/30 focus:border-ink uppercase"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-ink text-white font-semibold py-2.5 rounded-xl hover:bg-brand transition-colors flex items-center justify-center gap-2"
            >
              <Search size={16} />
              Cek Status
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-100 rounded-xl text-xs text-gray-700">
            <p className="font-medium mb-1">Belum punya kode proyek?</p>
            <p>Kode proyek dikirimkan ke email Anda setelah kontrak ditandatangani. Hubungi kami untuk bantuan.</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          <Link href="/" className="hover:text-ink transition-colors">← Kembali ke Website</Link>
        </p>
      </div>
    </div>
  );
}
