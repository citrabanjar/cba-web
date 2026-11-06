import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { LanguageSwitcher, T } from "@/components/i18n";

export const metadata: Metadata = {
  title: "Segera Hadir — PT. Citra Banjar Abadi",
  description: "Website PT. Citra Banjar Abadi segera hadir. Fabricator, Contractor & Supplier terpercaya di Kalimantan Selatan.",
};

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <LanguageSwitcher className="absolute top-4 right-4 z-20" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-xl w-full">

        {/* Logo */}
        <div className="mb-10 bg-white rounded-2xl px-6 py-4 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="PT. Citra Banjar Abadi" className="h-10 w-auto" />
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-black text-white mb-4 tracking-tight">
          <T>Segera Hadir</T>
        </h1>
        <div className="w-16 h-1 bg-brand rounded-full mb-6" />

        <p className="text-gray-300 text-lg leading-relaxed mb-8">
          <T>Website kami sedang dalam proses pembangunan.</T><br />
          <T>Kami akan segera hadir untuk melayani Anda.</T>
        </p>

        {/* Company info */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 w-full text-left space-y-4 mb-8">
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-red-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-medium"><T>Banjarmasin, Kalimantan Selatan</T></p>
              <p className="text-gray-300 text-xs"><T>Fabricator · Contractor · Supplier</T></p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone size={18} className="text-red-300 flex-shrink-0" />
            <p className="text-white text-sm"><T>+62 xxx-xxxx-xxxx</T></p>
          </div>
          <div className="flex items-center gap-3">
            <Mail size={18} className="text-red-300 flex-shrink-0" />
            <p className="text-white text-sm"><T>info@citrabanjar.com</T></p>
          </div>
        </div>

        {/* Portal link (subtle, for internal team) */}
        <Link
          href="/portal"
          className="text-gray-400 text-xs hover:text-white transition-colors"
        >
          <T>Portal Karyawan</T>
        </Link>

      </div>
    </div>
  );
}
