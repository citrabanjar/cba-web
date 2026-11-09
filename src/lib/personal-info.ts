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
