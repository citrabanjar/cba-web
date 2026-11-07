import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { T } from "@/components/i18n";
import { CONTACT_EMAIL } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-black/20 text-white backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <span className="inline-flex rounded-xl bg-white px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="PT. Citra Banjar Abadi" className="h-7 w-auto" />
            </span>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
              <T>Perusahaan terpercaya dalam bidang konstruksi dan pelayanan teknik di Kalimantan Selatan.</T>
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/45"><T>Tautan</T></h4>
            <ul className="space-y-2 text-sm text-white/75">
              <li><Link href="/#layanan" className="hover:text-white"><T>Layanan</T></Link></li>
              <li><Link href="/#tentang" className="hover:text-white"><T>Tentang Kami</T></Link></li>
              <li><Link href="/portal" className="hover:text-white"><T>Portal Karyawan</T></Link></li>
              <li><Link href="/progress" className="hover:text-white"><T>Progress Pelanggan</T></Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/45"><T>Kontak</T></h4>
            <ul className="space-y-3 text-sm text-white/75">
              <li className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-[#ffb3b8]" />
                <span><T>Banjarmasin, Kalimantan Selatan</T></span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail size={15} className="shrink-0 text-[#ffb3b8]" />
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">{CONTACT_EMAIL}</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-white/40">
          <T>© 2026 PT. Citra Banjar Abadi. Hak cipta dilindungi.</T>
        </div>
      </div>
    </footer>
  );
}
