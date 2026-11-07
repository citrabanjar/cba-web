/**
 * Homepage PT. Citra Banjar Abadi.
 * Tampilan mengikuti desain Code XR: navbar kaca melayang, kartu layanan bertumpuk,
 * dan formulir kontak beranimasi, dengan warna merah CBA.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Building2, CheckCircle2, ClipboardList, Clock, Mail, MapPin, Shield, Users,
} from "lucide-react";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";
import ServiceStack from "@/components/public/ServiceStack";
import ContactCard from "@/components/public/ContactCard";
import Reveal from "@/components/public/Reveal";
import { T } from "@/components/i18n";
import { COMPANY_ADDRESS, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "PT. Citra Banjar Abadi",
  description: "Perusahaan konstruksi dan pelayanan teknik terpercaya di Kalimantan Selatan.",
};

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

const pillars = [
  { icon: Building2, title: "Konstruksi", desc: "Gedung & Infrastruktur" },
  { icon: Clock, title: "Tepat Waktu", desc: "Delivery On Schedule" },
  { icon: Shield, title: "K3 Prioritas", desc: "Zero Accident Target" },
  { icon: Users, title: "Tim Ahli", desc: "Tenaga Bersertifikat" },
];

function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div>
      <span className="site-eyebrow"><T>{eyebrow}</T></span>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"><T>{title}</T></h2>
      {desc && <p className="mt-3 max-w-xl text-white/65"><T>{desc}</T></p>}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="site-bg min-h-screen">
      <Navbar />
      <main>
        {/* Hero */}
        <section id="beranda" className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-32 top-24 h-[28rem] w-[28rem] rounded-full bg-brand/30 blur-[120px]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-36 sm:px-6 md:pt-44 lg:grid-cols-[1.15fr_1fr] lg:px-8">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-md">
                <MapPin size={14} className="text-[#ffb3b8]" />
                <T>Banjarmasin, Kalimantan Selatan</T>
              </span>
              <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                <T>Membangun Masa Depan</T>
                <br />
                <span className="bg-gradient-to-r from-[#ff9aa1] to-[#ffd3c2] bg-clip-text text-transparent">
                  <T>Bersama Kepercayaan</T>
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
                <T>PT. Citra Banjar Abadi hadir sebagai mitra konstruksi dan teknik terpercaya,
                menghadirkan solusi berkualitas tinggi untuk setiap proyek Anda.</T>
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/#kontak" className="site-btn-red site-btn-lg justify-center">
                  <T>Hubungi Kami</T> <ArrowRight size={18} />
                </Link>
                <Link href="/progress" className="site-btn-glass site-btn-lg justify-center">
                  <T>Cek Progress Proyek</T>
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="grid grid-cols-2 gap-4">
                {stats.map((s, i) => (
                  <div
                    key={s.label}
                    className={`site-glass p-6 ${i % 2 === 1 ? "translate-y-6" : ""}`}
                  >
                    <p className="text-4xl font-bold tracking-tight">{s.value}</p>
                    <p className="mt-1 text-sm text-white/60"><T>{s.label}</T></p>
                    <div className="mt-5 h-1 w-12 rounded-full bg-gradient-to-r from-brand to-[#ff9aa1]" />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Layanan */}
        <section id="layanan" className="scroll-mt-24 py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <Reveal>
              <SectionTitle
                eyebrow="Layanan Kami"
                title="Solusi Teknik Terpadu"
                desc="Kami menyediakan layanan konstruksi dan teknik komprehensif untuk memenuhi kebutuhan proyek Anda."
              />
              <ul className="mt-8 space-y-3">
                {["Konstruksi & Sipil", "Mekanikal & Elektrikal", "Jasa Teknik"].map((s, i) => (
                  <li key={s} className="site-glass flex items-center gap-4 px-5 py-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-sm font-bold">
                      0{i + 1}
                    </span>
                    <span className="font-semibold"><T>{s}</T></span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1} className="flex justify-center">
              <ServiceStack />
            </Reveal>
          </div>
        </section>

        {/* Tentang */}
        <section id="tentang" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="site-glass grid gap-12 p-8 sm:p-12 lg:grid-cols-2">
              <Reveal>
                <SectionTitle eyebrow="Tentang Kami" title="Mitra Terpercaya Sejak Bertahun-tahun" />
                <p className="mt-5 leading-relaxed text-white/70">
                  <T>PT. Citra Banjar Abadi adalah perusahaan yang bergerak di bidang konstruksi dan pelayanan teknik di
                  Kalimantan Selatan. Didukung oleh tim profesional berpengalaman, kami berkomitmen menghadirkan hasil
                  terbaik untuk setiap proyek.</T>
                </p>
                <ul className="mt-6 space-y-3">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-white/80">
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
                      <T>{f}</T>
                    </li>
                  ))}
                </ul>
              </Reveal>
              <div className="grid grid-cols-2 gap-4 self-center">
                {pillars.map((p, i) => (
                  <Reveal key={p.title} delay={i * 0.08}>
                    <div className="h-full rounded-2xl bg-white p-5 text-gray-900 shadow-[0_20px_40px_-20px_rgb(10_0_3/0.6)]">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#e86a72] text-white shadow-md shadow-brand/30">
                        <p.icon size={21} />
                      </div>
                      <p className="mt-4 font-bold"><T>{p.title}</T></p>
                      <p className="mt-0.5 text-xs text-gray-500"><T>{p.desc}</T></p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Portal Karyawan */}
        <section className="py-12">
          <Reveal className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-brand to-[#7a2129] p-8 sm:p-12">
              <span className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
              <span className="absolute -bottom-28 right-40 h-60 w-60 rounded-full bg-white/5" />
              <div className="relative grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl"><T>Portal Karyawan</T></h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">
                    <T>Akses absensi GPS, pengajuan cuti, dinas luar, slip gaji, dan PPh 21 dalam satu platform.</T>
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {["Absensi GPS", "Pengajuan Cuti", "Slip Gaji", "PPh 21"].map((f) => (
                      <span key={f} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs"><T>{f}</T></span>
                    ))}
                  </div>
                </div>
                <div className="flex md:justify-end">
                  <Link
                    href="/portal"
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 font-bold text-brand shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
                  >
                    <Users size={18} />
                    <T>Masuk Portal</T>
                    <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Kontak */}
        <section id="kontak" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mb-10 text-center">
              <span className="site-eyebrow"><T>Kontak</T></span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"><T>Hubungi Kami</T></h2>
            </Reveal>
            <Reveal delay={0.1}>
              <ContactCard />
            </Reveal>
            <div className="mx-auto mt-6 grid max-w-4xl gap-4 sm:grid-cols-3">
              {[
                { icon: MapPin, label: "Alamat", value: COMPANY_ADDRESS, href: undefined },
                { icon: Mail, label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
                { icon: ClipboardList, label: "Progress Proyek", value: "Cek status proyek Anda →", href: "/progress" },
              ].map(({ icon: Icon, label, value, href }) => {
                const body = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Icon size={18} className="text-[#ffb3b8]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-white/50"><T>{label}</T></span>
                      <span className="block truncate text-sm font-medium"><T>{value}</T></span>
                    </span>
                  </>
                );
                return href ? (
                  <Link key={label} href={href} className="site-glass flex items-center gap-3 p-4 transition-colors hover:bg-white/10">
                    {body}
                  </Link>
                ) : (
                  <div key={label} className="site-glass flex items-center gap-3 p-4">{body}</div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
