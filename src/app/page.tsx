/**
 * Homepage PT. Citra Banjar Abadi
 * Route group (public)/page.tsx sudah digantikan oleh file ini.
 * File (public)/page.tsx harus dihapus sebelum build produksi.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Building2, Users, ClipboardList, MapPin,
  ArrowRight, CheckCircle2, Clock, Shield,
  Briefcase, HardHat, Wrench, Phone, Mail,
} from "lucide-react";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";

export const metadata: Metadata = {
  title: "PT. Citra Banjar Abadi",
  description: "Perusahaan konstruksi dan pelayanan teknik terpercaya di Kalimantan Selatan.",
};

const services = [
  {
    icon: HardHat,
    title: "Konstruksi & Sipil",
    desc: "Pembangunan gedung, infrastruktur, dan fasilitas umum dengan standar kualitas tinggi.",
  },
  {
    icon: Wrench,
    title: "Mekanikal & Elektrikal",
    desc: "Instalasi, perawatan, dan perbaikan sistem mekanikal dan elektrikal industri.",
  },
  {
    icon: Briefcase,
    title: "Jasa Teknik",
    desc: "Konsultasi teknik, desain, dan manajemen proyek untuk berbagai kebutuhan industri.",
  },
];

const stats = [
  { value: "10+", label: "Tahun Pengalaman" },
  { value: "50+", label: "Proyek Selesai" },
  { value: "100+", label: "Karyawan Aktif" },
  { value: "30+", label: "Klien Puas" },
];

const features = [
  "Tenaga ahli berpengalaman & tersertifikasi",
  "Pengerjaan tepat waktu & sesuai anggaran",
  "Standar keselamatan kerja (K3) ketat",
  "Transparansi progress proyek real-time",
  "Garansi kualitas pekerjaan",
  "Layanan purna jual & pemeliharaan",
];

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative bg-gradient-to-br from-[#1e3a5f] to-blue-800 text-white overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium mb-6">
                <MapPin size={14} className="text-amber-300" />
                Banjarmasin, Kalimantan Selatan
              </div>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
                Membangun Masa Depan<br />
                <span className="text-amber-300">Bersama Kepercayaan</span>
              </h1>
              <p className="text-blue-100 text-lg mb-8 leading-relaxed">
                PT. Citra Banjar Abadi hadir sebagai mitra konstruksi dan teknik terpercaya,
                menghadirkan solusi berkualitas tinggi untuk setiap proyek Anda.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="#kontak"
                  className="inline-flex items-center justify-center gap-2 bg-amber-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-amber-600 transition-colors"
                >
                  Hubungi Kami <ArrowRight size={18} />
                </Link>
                <Link
                  href="/progress"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors border border-white/20"
                >
                  Cek Progress Proyek
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-3xl font-bold text-[#1e3a5f]">{s.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Layanan */}
        <section id="layanan" className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="text-amber-600 font-semibold text-sm uppercase tracking-wide">Layanan Kami</span>
              <h2 className="text-3xl font-bold text-[#1e3a5f] mt-2">Solusi Teknik Terpadu</h2>
              <p className="text-gray-500 mt-3 max-w-xl mx-auto">
                Kami menyediakan layanan konstruksi dan teknik komprehensif untuk memenuhi kebutuhan proyek Anda.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {services.map((s) => (
                <div
                  key={s.title}
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
                >
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                    <s.icon size={24} className="text-[#1e3a5f]" />
                  </div>
                  <h3 className="font-bold text-[#1e3a5f] text-lg mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tentang */}
        <section id="tentang" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-amber-600 font-semibold text-sm uppercase tracking-wide">Tentang Kami</span>
                <h2 className="text-3xl font-bold text-[#1e3a5f] mt-2 mb-4">Mitra Terpercaya Sejak Bertahun-tahun</h2>
                <p className="text-gray-600 leading-relaxed mb-6">
                  PT. Citra Banjar Abadi adalah perusahaan yang bergerak di bidang konstruksi dan pelayanan teknik di
                  Kalimantan Selatan. Didukung oleh tim profesional berpengalaman, kami berkomitmen menghadirkan hasil
                  terbaik untuk setiap proyek.
                </p>
                <ul className="space-y-3">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-gray-600">
                      <CheckCircle2 size={18} className="text-green-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Building2, title: "Konstruksi", desc: "Gedung & Infrastruktur" },
                  { icon: Clock, title: "Tepat Waktu", desc: "Delivery On Schedule" },
                  { icon: Shield, title: "K3 Prioritas", desc: "Zero Accident Target" },
                  { icon: Users, title: "Tim Ahli", desc: "Tenaga Bersertifikat" },
                ].map((card) => (
                  <div key={card.title} className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-lg flex items-center justify-center mb-3">
                      <card.icon size={20} className="text-[#1e3a5f]" />
                    </div>
                    <p className="font-semibold text-[#1e3a5f] text-sm">{card.title}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Portal Karyawan CTA */}
        <section className="bg-gradient-to-r from-[#1e3a5f] to-blue-700 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold mb-3">Portal Karyawan</h2>
                <p className="text-blue-100 text-sm leading-relaxed mb-6">
                  Akses absensi GPS, pengajuan cuti, dinas luar, slip gaji, dan PPh 21 dalam satu platform.
                </p>
                <div className="flex flex-wrap gap-3">
                  {["Absensi GPS", "Pengajuan Cuti", "Slip Gaji", "PPh 21"].map((f) => (
                    <span key={f} className="text-xs bg-white/10 px-3 py-1.5 rounded-full">{f}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center md:justify-end">
                <Link
                  href="/portal"
                  className="inline-flex items-center gap-2 bg-white text-[#1e3a5f] font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition-colors"
                >
                  <Users size={18} />
                  Masuk Portal
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Kontak */}
        <section id="kontak" className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="text-amber-600 font-semibold text-sm uppercase tracking-wide">Kontak</span>
              <h2 className="text-3xl font-bold text-[#1e3a5f] mt-2">Hubungi Kami</h2>
            </div>
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="space-y-5">
                {[
                  { icon: MapPin, label: "Alamat", value: "Banjarmasin, Kalimantan Selatan" },
                  { icon: Phone, label: "Telepon", value: "+62 ..." },
                  { icon: Mail, label: "Email", value: "info@citrabanjara.co.id" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-[#1e3a5f]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#1e3a5f] text-sm">{label}</p>
                      <p className="text-gray-500 text-sm mt-1">{value}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <ClipboardList size={18} className="text-[#1e3a5f]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#1e3a5f] text-sm">Progress Proyek</p>
                    <p className="text-gray-500 text-sm mt-1">
                      <Link href="/progress" className="text-blue-600 hover:underline">
                        Cek status proyek Anda →
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
