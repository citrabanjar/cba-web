// Pernyataan kebenaran data & persetujuan pengolahan data pribadi (UU No. 27 Tahun 2022) yang disetujui calon
// setiap kali Kirim ke HRD (termasuk kirim ulang setelah perbaikan). Dipakai di form calon dan di Cetak berkas.
export function DeclarationText({ name, idType, idNumber }: { name: string; idType: string; idNumber: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-gray-700">
      <p className="text-center text-sm font-bold uppercase tracking-wide text-gray-900">Pernyataan Kebenaran Data dan Persetujuan Pengolahan Data Pribadi</p>
      <p>
        Saya, <b>{name || "—"}</b>, pemegang <b>{idType || "KTP"} No. {idNumber || "—"}</b>, menyatakan dengan sebenar-benarnya bahwa:
      </p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li><b>Kebenaran data.</b> Seluruh data dan keterangan yang saya isi dalam formulir ini, yaitu data diri, alamat, keluarga, rekening bank, NPWP, dan BPJS, adalah benar, lengkap, dan sesuai dengan dokumen asli yang saya miliki.</li>
        <li><b>Tanggung jawab pribadi.</b> Saya bertanggung jawab penuh atas kebenaran data tersebut. Apabila di kemudian hari ditemukan data yang tidak benar, tidak lengkap, atau dipalsukan, saya bersedia menerima konsekuensi sesuai ketentuan perusahaan, termasuk pembatalan proses penerimaan atau pemutusan hubungan kerja, tanpa menuntut ganti rugi dalam bentuk apa pun kepada PT. Citra Banjar Abadi.</li>
        <li><b>Akibat kesalahan pengisian.</b> Kerugian yang timbul akibat kesalahan pengisian data oleh saya sendiri menjadi tanggung jawab saya dan tidak akan saya tuntut kepada PT. Citra Banjar Abadi. Contohnya transfer gaji ke rekening yang salah, potongan pajak atau status PTKP yang keliru, atau kepesertaan BPJS yang tidak terdaftar.</li>
        <li><b>Persetujuan pengolahan data pribadi.</b> Saya menyetujui PT. Citra Banjar Abadi mengumpulkan, menyimpan, dan mengolah data pribadi saya untuk keperluan rekrutmen, administrasi kepegawaian, penggajian, perpajakan, dan BPJS, sesuai Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.</li>
        <li><b>Kewajiban memperbarui data.</b> Saya akan memberitahukan HRD apabila ada perubahan data di kemudian hari.</li>
      </ol>
      <p>Pernyataan ini saya buat dengan sadar, tanpa paksaan dari pihak mana pun.</p>
    </div>
  );
}

export const fmtDeclared = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
