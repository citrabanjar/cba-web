import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";
import { T } from "@/components/i18n";

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-bold text-lg mb-3"><T>PT. Citra Banjar Abadi</T></h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              <T>Perusahaan terpercaya dalam bidang konstruksi dan pelayanan teknik di Kalimantan Selatan.</T>
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-semibold mb-3 text-gray-300"><T>Tautan</T></h4>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><Link href="/#tentang" className="hover:text-white transition-colors"><T>Tentang Kami</T></Link></li>
              <li><Link href="/#layanan" className="hover:text-white transition-colors"><T>Layanan</T></Link></li>
              <li><Link href="/portal" className="hover:text-white transition-colors"><T>Portal Karyawan</T></Link></li>
              <li><Link href="/progress" className="hover:text-white transition-colors"><T>Progress Pelanggan</T></Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-3 text-gray-300"><T>Kontak</T></h4>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-gray-300" />
                <span><T>Banjarmasin, Kalimantan Selatan</T></span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-gray-300" />
                <span>+62 ...</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={15} className="shrink-0 text-gray-300" />
                <span><T>info@citrabanjara.co.id</T></span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/15 mt-10 pt-6 text-center text-xs text-gray-400">
          <T>© 2026 PT. Citra Banjar Abadi. Hak cipta dilindungi.</T>
        </div>
      </div>
    </footer>
  );
}
