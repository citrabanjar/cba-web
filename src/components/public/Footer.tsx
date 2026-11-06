import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-bold text-lg mb-3">PT. Citra Banjar Abadi</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Perusahaan terpercaya dalam bidang konstruksi dan pelayanan teknik di Kalimantan Selatan.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-semibold mb-3 text-gray-300">Tautan</h4>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><Link href="/#tentang" className="hover:text-white transition-colors">Tentang Kami</Link></li>
              <li><Link href="/#layanan" className="hover:text-white transition-colors">Layanan</Link></li>
              <li><Link href="/portal" className="hover:text-white transition-colors">Portal Karyawan</Link></li>
              <li><Link href="/progress" className="hover:text-white transition-colors">Progress Pelanggan</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-3 text-gray-300">Kontak</h4>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-gray-300" />
                <span>Banjarmasin, Kalimantan Selatan</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-gray-300" />
                <span>+62 ...</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={15} className="shrink-0 text-gray-300" />
                <span>info@citrabanjara.co.id</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/15 mt-10 pt-6 text-center text-xs text-gray-400">
          © 2026 PT. Citra Banjar Abadi. Hak cipta dilindungi.
        </div>
      </div>
    </footer>
  );
}
