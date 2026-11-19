export const ID_TYPES = ["KTP", "NIK", "Paspor"];
export const FAMILY_RELATIONS = ["Suami", "Istri", "Anak", "Orang Tua"];

// Pilihan baku data pribadi (sama dengan template import), supaya tidak ada tulisan yang berbeda-beda.
export const PERSONAL_CHOICES = {
  gender: ["Laki-laki", "Perempuan"],
  maritalStatus: ["Belum Menikah", "Menikah", "Cerai"],
  religion: ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"],
} as const;
export type PersonalChoiceField = keyof typeof PERSONAL_CHOICES;
const CHOICE_ALIASES: Record<PersonalChoiceField, Record<string, string>> = {
  gender: { "laki-laki": "Laki-laki", "laki laki": "Laki-laki", laki: "Laki-laki", male: "Laki-laki", pria: "Laki-laki", l: "Laki-laki", lk: "Laki-laki",
    perempuan: "Perempuan", female: "Perempuan", wanita: "Perempuan", p: "Perempuan", pr: "Perempuan" },
  maritalStatus: { "belum menikah": "Belum Menikah", "belum kawin": "Belum Menikah", single: "Belum Menikah", lajang: "Belum Menikah",
    menikah: "Menikah", kawin: "Menikah", married: "Menikah", cerai: "Cerai", divorced: "Cerai", "cerai hidup": "Cerai", "cerai mati": "Cerai", widowed: "Cerai" },
  religion: { islam: "Islam", moslem: "Islam", muslim: "Islam", kristen: "Kristen", protestan: "Kristen", christian: "Kristen", katolik: "Katolik", katholik: "Katolik", catholic: "Katolik",
    hindu: "Hindu", buddha: "Buddha", budha: "Buddha", buddhist: "Buddha", konghucu: "Konghucu", khonghucu: "Konghucu", confucian: "Konghucu" },
};
// Data lama (mis. "Male", "Married") disamakan ke pilihan baku; yang tidak dikenali dibiarkan apa adanya.
export function normalizeChoice(field: PersonalChoiceField, value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return CHOICE_ALIASES[field][text.toLowerCase()] ?? text;
}

// Saran saja: bank di luar daftar tetap bisa diketik sendiri.
export const BANK_OPTIONS = [
  "Mandiri", "BCA", "BNI", "BRI", "BSI", "BTN", "CIMB Niaga", "Danamon", "Permata",
  "OCBC", "Panin", "Maybank", "UOB", "BTPN", "Mega", "Muamalat", "Bank Jago", "SeaBank",
  "Bank DKI", "BJB", "Bank Jateng", "Bank Jatim", "Bank Kalsel",
].map((value) => ({ value, label: "" }));

// Catatan perubahan yang tampil di tab Personal Info.
export const PERSONAL_LOG_LABELS: Record<string, string> = {
  name: "Nama Lengkap",
  phone: "Phone Number",
  email: "Email",
  birthPlace: "Tempat Lahir",
  birthDate: "Tanggal Lahir",
  idType: "Jenis ID",
  ktpNumber: "ID Number",
  gender: "Jenis Kelamin",
  maritalStatus: "Status Perkawinan",
  religion: "Agama",
  address: "Alamat sesuai Identitas",
  currentAddress: "Alamat Saat Ini",
  addressSameAsId: "Alamat Saat Ini",
  family: "Keluarga",
  photo: "Foto",
  bankName: "Nama Bank",
  bankAccount: "No Rekening",
  bankHolder: "Nama Pemilik Rekening",
};

// Catatan perubahan yang tampil di tab Pekerjaan.
export const WORK_LOG_LABELS: Record<string, string> = {
  employeeId: "Employee ID",
  joinDate: "Tanggal Masuk",
  employmentStatus: "Status",
  contractEndDate: "Tanggal Akhir Kontrak",
  spkNumber: "No SPK",
  spkDate: "Tanggal SPK",
  resignDate: "Tanggal Berhenti",
  isActive: "Status Aktif",
  branch: "Cabang",
  department: "Departemen",
  position: "Jabatan",
  manager: "Atasan Langsung",
};

// Status PTKP baku (pilihan di form). K/I/x (penghasilan istri digabung) hanya diterima dari import.
export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;
export const PTKP_VALID: string[] = [...PTKP_STATUSES, "K/I/0", "K/I/1", "K/I/2", "K/I/3"];
// Status Pajak dan Kode Objek Pajak PPh 21 yang dipakai CBA (pilihan baku, bukan ketikan bebas).
export const TAX_STATUSES = ["Pegawai Tetap", "Pegawai Tidak Tetap"] as const;
// Kode Objek Pajak PPh 21 (PER-11/PJ/2025) yang dipakai perusahaan (keputusan pemilik 2026-11-19):
// 21-100-01 pegawai tetap; 21-100-35 pegawai tidak tetap bulanan; 21-100-24 / 21-100-30 harian / mingguan
// (bruto sampai / di atas Rp 2.500.000 per hari, otomatis untuk payroll mingguan, lib/tax-object). Pilihan tampil kode dan keterangan singkat.
export const TAX_OBJECT_CODES = [
  { value: "21-100-01", label: "21-100-01 - Pegawai Tetap" },
  { value: "21-100-35", label: "21-100-35 - Pegawai Tidak Tetap dibayar Bulanan" },
  { value: "21-100-24", label: "21-100-24 - Pegawai Harian, Bruto <= 2.500.000 / hari" },
  { value: "21-100-30", label: "21-100-30 - Pegawai Harian, Bruto > 2.500.000 / hari" },
] as const;

// Judul kolom yang dipakai di form Edit profil karyawan (bukan nama kolom database).
const EXTRA_LABELS: Record<string, string> = {
  nationality: "Kewarganegaraan", emergencyName: "Nama Kontak Darurat", emergencyPhone: "No. HP Kontak Darurat", emergencyRelation: "Hubungan Kontak Darurat",
  npwp: "NPWP", ptkpStatus: "Status PTKP", taxability: "Metode Pajak (Taxability)", taxStatus: "Status Pajak", taxObjectCode: "Kode Objek Pajak",
  bpjsTkNumber: "No BPJS Ketenagakerjaan", bpjsTkActive: "Status BPJS Ketenagakerjaan", bpjsKesNumber: "No BPJS Kesehatan", bpjsKesActive: "Status BPJS Kesehatan",
  paymentSchedule: "Jadwal Gajian", addressRegion: "Wilayah sesuai Identitas", addressRegionName: "Wilayah sesuai Identitas", addressPostal: "Kode Pos sesuai Identitas",
  currentRegion: "Wilayah Alamat Saat Ini", currentRegionName: "Wilayah Alamat Saat Ini", currentPostal: "Kode Pos Alamat Saat Ini",
  departmentName: "Departemen", managerRef: "Atasan Langsung", password: "Password",
};
// Judul kolom perubahan data (kartu persetujuan & notifikasi ke karyawan).
export const EDIT_FIELD_LABELS: Record<string, string> = { ...EXTRA_LABELS, ...PERSONAL_LOG_LABELS, ...WORK_LOG_LABELS };
