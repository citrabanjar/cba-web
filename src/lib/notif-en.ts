// Terjemahan isi notifikasi ke English saat tampilan EN. Isi notifikasi disimpan sebagai kalimat Bahasa Indonesia
// (berisi nama, tanggal, nominal), jadi diterjemahkan per pola kalimat; nama, tanggal, dan angka tetap.
// Aman dipakai di server dan browser.
import { translate } from "@/lib/i18n";

const ok = (w: string) => (w === "disetujui" ? "approved" : "rejected");

// Judul pengajuan Admin (Absensi / Cuti / Payroll / data karyawan).
const ADMIN_WORDS: [RegExp, string][] = [
  [/^Absensi: /, "Attendance: "], [/^Cuti: /, "Leave: "], [/^Pinjaman: /, "Loan: "], [/^Payroll: /, "Payroll: "],
  [/\btambah\b/, "add"], [/\bubah\b/, "edit"], [/\bhapus\b/, "delete"],
  [/\bpola kerja\b/, "work pattern"], [/\bhari libur\b/, "holiday"], [/\blokasi absen\b/, "attendance location"],
  [/\baturan kehadiran\b/, "attendance rules"], [/\bjenis cuti\b/, "leave type"],
  [/\bimport saldo awal cuti \((\d+) baris\)/, "import opening leave balance ($1 rows)"], [/\bkoreksi saldo\b/, "balance correction for"],
  [/\bPengaturan Payroll\b/, "Payroll Settings"], [/\bfinalkan gaji periode\b/, "finalize payroll for period"],
  [/\bPengaturan PPh 21 tahun\b/, "PPh 21 settings for"], [/\btarif TER berlaku\b/, "TER rates effective"],
  [/\bJadwal THR \/ Bonus\b/, "THR / Bonus schedule"], [/^Lepas komponen gaji\b/, "Remove pay component"],
  [/^Komponen gaji\b/, "Pay component"], [/\bkomponen\b/, "component"],
  [/^Perubahan data karyawan$/, "Employee data change"], [/^Penyesuaian gaji$/, "Salary adjustment"],
];
export function adminTitleEn(title: string) {
  let s = title;
  for (const [re, to] of ADMIN_WORDS) s = s.replace(re, to);
  return s;
}

const TITLES: [RegExp, (...m: string[]) => string][] = [
  [/^Pengajuan (disetujui|ditolak): (.+)$/, (_, w, t) => `Request ${ok(w)}: ${adminTitleEn(t)}`],
  [/^Data Anda diperbarui$/, () => "Your data has been updated"],
  [/^Pengajuan perubahan data (disetujui|ditolak)$/, (_, w) => `Data change request ${ok(w)}`],
  [/^Pengajuan lembur (disetujui|ditolak)$/, (_, w) => `Overtime request ${ok(w)}`],
  [/^Pengajuan pinjaman (disetujui|ditolak)$/, (_, w) => `Loan request ${ok(w)}`],
  [/^Pengajuan pinjaman baru$/, () => "New loan request"],
  [/^Pengajuan pinjaman disetujui atasan$/, () => "Loan request approved by supervisor"],
  [/^Pengajuan pinjaman perlu diperiksa$/, () => "Loan request needs review"],
  [/^Pengajuan pinjaman dalam pemeriksaan Admin$/, () => "Loan request under Admin review"],
  [/^Pengajuan pinjaman menunggu keputusan Anda$/, () => "Loan request awaiting your decision"],
  [/^Pengajuan pinjaman sudah diperiksa Admin$/, () => "Loan request reviewed by Admin"],
  [/^Pengajuan pinjaman (disetujui|ditolak) pimpinan$/, (_, w) => `Loan request ${ok(w)} by top management`],
  [/^Pinjaman sudah dicairkan$/, () => "Loan disbursed"],
  [/^Pengajuan (.+) (disetujui|ditolak)$/, (_, n, w) => `${translate("en", n)} request ${ok(w)}`],
  [/^Dinas luar (.+) (disetujui|ditolak)$/, (_, d, w) => `Business trip to ${d} ${ok(w)}`],
  [/^Surat Perintah Lembur (\S+)$/, (_, n) => `Overtime Order ${n}`],
  [/^Lembur (\S*) dibatalkan$/, (_, n) => `Overtime ${n} cancelled`],
  [/^Revisi jam lembur (disetujui|ditolak)$/, (_, w) => `Overtime hours revision ${ok(w)}`],
  [/^Tukar shift ditolak rekan$/, () => "Shift swap rejected by colleague"],
  [/^Tukar shift (disetujui|ditolak)$/, (_, w) => `Shift swap ${ok(w)}`],
];

const BODY: [RegExp, string][] = [
  [/Disetujui oleh /g, "Approved by "], [/Ditolak oleh /g, "Rejected by "], [/\bDisetujui\./g, "Approved."], [/\bDitolak\./g, "Rejected."],
  [/Diubah oleh ([^,]+), disetujui /g, "Changed by $1, approved by "],
  [/ kali angsuran mulai /g, " installments starting "], [/Menunggu pencairan\./g, "Awaiting disbursement."],
  [/\bdicairkan /g, "disbursed on "], [/Angsuran mulai dipotong dari gaji\./g, "Installments will be deducted from salary."],
  [/Pilih Bersedia atau Tidak bersedia\./g, "Choose Willing or Not willing."],
  [/lembur tetap dihitung sampai /g, "overtime still counted until "], [/lembur dihitung sampai /g, "overtime counted until "],
  [/Shift sudah ditukar\./g, "Shifts have been swapped."],
  [/ kali angsuran\. Menunggu persetujuan Anda\./g, " installments. Awaiting your approval."],
  [/Siapkan dokumen fisik untuk diperiksa Admin\./g, "Prepare the physical documents for Admin review."],
  [/Menunggu keputusan pimpinan\./g, "Awaiting top management decision."],
  [/Keputusan dapat diberikan setelah Admin selesai memeriksa\./g, "A decision can be made once Admin has finished the review."],
  [/Silakan cairkan lalu tandai Dicairkan\./g, "Please disburse it, then mark it as Disbursed."],
];
const MONTHS: Record<string, string> = { Mei: "May", Agu: "Aug", Okt: "Oct", Des: "Dec" };
const dates = (s: string) => s.replace(/\b(\d{1,2})-(Mei|Agu|Okt|Des)-(\d{4})\b/g, (_, d, m, y) => `${d}-${MONTHS[m]}-${y}`);

export function notifTitleEn(title: string) {
  for (const [re, f] of TITLES) {
    const m = re.exec(title);
    if (m) return dates(f(...m));
  }
  return dates(translate("en", title));
}

export function notifBodyEn(body: string) {
  let s = body;
  for (const [re, to] of BODY) s = s.replace(re, to);
  // "Data Anda diperbarui": "...approved by X. Status PTKP: K/2 → TK/0; Kode Objek Pajak: — → 21-100-01"
  s = s.replace(/(^|\. |; )([^:;.]+): ([^;]*→)/g, (_, lead, label, rest) => `${lead}${translate("en", label)}: ${rest}`);
  return dates(s);
}
