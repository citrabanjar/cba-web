// Data pribadi yang boleh diajukan perubahannya oleh karyawan dari Profil Saya (aman di server & browser).
// Perubahan baru berlaku setelah disetujui Admin. Gaji tidak pernah tampil di Profil Saya.

export type ProfileField = {
  key: string; label: string; group: "Data Diri" | "Tempat Tinggal" | "Rekening & Pajak";
  type?: "text" | "date" | "select" | "textarea" | "flag" | "region" | "regionName" | "postal"; options?: readonly string[];
  postalKey?: string; // type "region": kode pos (type "postal")
  nameKey?: string; // type "region": kode kelurahan/desa; nama lengkapnya di field nameKey (type "regionName")
};

export const PROFILE_FIELDS: ProfileField[] = [
  { key: "phone", label: "Phone Number", group: "Data Diri" },
  { key: "email", label: "Email", group: "Data Diri" },
  { key: "birthPlace", label: "Tempat Lahir", group: "Data Diri" },
  { key: "birthDate", label: "Tanggal Lahir", group: "Data Diri", type: "date" },
  { key: "idType", label: "Jenis ID", group: "Data Diri", type: "select", options: ["KTP", "NIK", "Paspor"] },
  { key: "ktpNumber", label: "ID Number", group: "Data Diri" },
  { key: "gender", label: "Jenis Kelamin", group: "Data Diri", type: "select", options: ["Laki-laki", "Perempuan"] },
  { key: "maritalStatus", label: "Status Perkawinan", group: "Data Diri", type: "select", options: ["Belum Menikah", "Menikah", "Cerai"] },
  { key: "religion", label: "Agama", group: "Data Diri", type: "select", options: ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"] },
  { key: "address", label: "Alamat sesuai Identitas", group: "Tempat Tinggal", type: "textarea" },
  { key: "addressRegion", label: "Wilayah sesuai Identitas", group: "Tempat Tinggal", type: "region", nameKey: "addressRegionName", postalKey: "addressPostal" },
  { key: "addressRegionName", label: "Wilayah sesuai Identitas", group: "Tempat Tinggal", type: "regionName" },
  { key: "addressPostal", label: "Kode Pos Alamat Identitas", group: "Tempat Tinggal", type: "postal" },
  { key: "addressSameAsId", label: "Alamat saat ini sama dengan alamat identitas", group: "Tempat Tinggal", type: "flag" },
  { key: "currentAddress", label: "Alamat Saat Ini", group: "Tempat Tinggal", type: "textarea" },
  { key: "currentRegion", label: "Wilayah Alamat Saat Ini", group: "Tempat Tinggal", type: "region", nameKey: "currentRegionName", postalKey: "currentPostal" },
  { key: "currentRegionName", label: "Wilayah Alamat Saat Ini", group: "Tempat Tinggal", type: "regionName" },
  { key: "currentPostal", label: "Kode Pos Alamat Saat Ini", group: "Tempat Tinggal", type: "postal" },
  { key: "bankName", label: "Nama Bank", group: "Rekening & Pajak" },
  { key: "bankAccount", label: "No Rekening", group: "Rekening & Pajak" },
  { key: "bankHolder", label: "Nama Pemilik Rekening", group: "Rekening & Pajak" },
  { key: "npwp", label: "NPWP", group: "Rekening & Pajak" },
];
export const PROFILE_KEYS = PROFILE_FIELDS.map((f) => f.key);
// Kode wilayah tidak ditampilkan di daftar perubahan; yang tampil nama lengkapnya (field regionName).
export const isRegionCode = (key: string) => PROFILE_FIELDS.find((f) => f.key === key)?.type === "region";
export const fieldLabel = (key: string) => (key === "family" ? "Keluarga" : PROFILE_FIELDS.find((f) => f.key === key)?.label ?? key);

export type FamilyRow = { name: string; idNumber: string; relation: string };
export type ProfileChanges = Record<string, { old: string; new: string }>;

// Nilai field profil sebagai teks (tanggal YYYY-MM-DD, flag "true"/"false").
export function profileValue(user: Record<string, unknown>, key: string): string {
  const v = user[key];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
export const showValue = (key: string, v: string) =>
  PROFILE_FIELDS.find((f) => f.key === key)?.type === "flag" ? (v === "true" ? "Ya" : "Tidak") : v || "—";
