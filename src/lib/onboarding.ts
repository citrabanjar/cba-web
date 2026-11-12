// Onboarding calon karyawan: status, isian calon, isian HRD, dan pengecekan kelengkapan.
// Aman dipakai di server dan browser.

export const CANDIDATE_STATUS: Record<string, { label: string; tone: string }> = {
  WAWANCARA: { label: "Tahap wawancara", tone: "bg-sky-50 text-sky-700" },
  APPROVAL_WAWANCARA: { label: "Menunggu approval wawancara", tone: "bg-indigo-50 text-indigo-700" },
  DIUNDANG: { label: "Diundang", tone: "bg-gray-100 text-gray-600" },
  DIKIRIM: { label: "Menunggu pemeriksaan HRD", tone: "bg-amber-50 text-amber-700" },
  DIKEMBALIKAN: { label: "Dikembalikan ke calon", tone: "bg-rose-50 text-rose-700" },
  MENUNGGU_APPROVAL: { label: "Menunggu approval", tone: "bg-violet-50 text-violet-700" },
  SIAP_DAFTAR: { label: "Disetujui, siap didaftarkan", tone: "bg-teal-50 text-teal-700" },
  DISETUJUI: { label: "Disetujui", tone: "bg-emerald-50 text-emerald-700" },
  DITOLAK: { label: "Ditolak", tone: "bg-gray-100 text-gray-500" },
};
export const CANDIDATE_GROUPS = [
  { key: "proses", label: "Dalam proses", statuses: ["WAWANCARA", "APPROVAL_WAWANCARA", "DIUNDANG", "DIKIRIM", "DIKEMBALIKAN", "MENUNGGU_APPROVAL", "SIAP_DAFTAR"] },
  { key: "selesai", label: "Selesai", statuses: ["DISETUJUI", "DITOLAK"] },
] as const;
// Calon boleh mengubah isiannya selama belum dikirim atau saat dikembalikan HRD.
export const candidateCanEdit = (status: string) => status === "DIUNDANG" || status === "DIKEMBALIKAN";

export const PTKP_OPTIONS = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];

export type FamilyRow = { name: string; idNumber: string; relation: string };
export type CandidateData = {
  name: string; phone: string;
  birthPlace: string; birthDate: string; idType: string; ktpNumber: string;
  gender: string; maritalStatus: string; religion: string;
  address: string; addressSameAsId: boolean; currentAddress: string;
  addressRegion: string; addressRegionName: string; currentRegion: string; currentRegionName: string; // wilayah Kemendagri
  addressPostal: string; currentPostal: string; // kode pos 5 angka
  family: FamilyRow[];
  bankName: string; bankAccount: string; bankHolder: string;
  npwp: string; ptkpStatus: string; bpjsTkNumber: string; bpjsKesNumber: string;
};
export type CandidateJob = {
  employeeId: string; branch: string; departmentName: string; position: string;
  employmentStatus: string; joinDate: string; contractEndDate: string;
};

export function emptyData(name = "", phone = ""): CandidateData {
  return {
    name, phone, birthPlace: "", birthDate: "", idType: "KTP", ktpNumber: "", gender: "", maritalStatus: "", religion: "",
    address: "", addressSameAsId: true, currentAddress: "", family: [],
    addressRegion: "", addressRegionName: "", currentRegion: "", currentRegionName: "", addressPostal: "", currentPostal: "",
    bankName: "", bankAccount: "", bankHolder: "", npwp: "", ptkpStatus: "", bpjsTkNumber: "", bpjsKesNumber: "",
  };
}
export const emptyJob = (): CandidateJob => ({
  employeeId: "", branch: "", departmentName: "", position: "", employmentStatus: "KONTRAK", joinDate: "", contractEndDate: "",
});

const str = (v: unknown) => (typeof v === "string" ? v : "");
// Isian tersimpan (JSON) dibaca ulang dengan aman.
export function readData(raw: unknown, name = "", phone = ""): CandidateData {
  const v = (raw ?? {}) as Record<string, unknown>;
  const base = emptyData(name, phone);
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base) as (keyof CandidateData)[]) {
    if (k === "family" || k === "addressSameAsId") continue;
    if (typeof v[k] === "string") out[k] = v[k];
  }
  out.addressSameAsId = v.addressSameAsId === undefined ? true : v.addressSameAsId === true;
  out.family = Array.isArray(v.family)
    ? (v.family as Record<string, unknown>[]).map((f) => ({ name: str(f?.name).toUpperCase(), idNumber: str(f?.idNumber), relation: str(f?.relation) })).filter((f) => f.name || f.idNumber)
    : [];
  // Nama dan teks bebas disimpan HURUF KAPITAL.
  for (const k of ["name", "birthPlace", "address", "currentAddress", "bankHolder"] as const) out[k] = String(out[k] ?? "").toUpperCase();
  return out as CandidateData;
}
export function readJob(raw: unknown): CandidateJob {
  const v = (raw ?? {}) as Record<string, unknown>;
  const base = emptyJob();
  for (const k of Object.keys(base) as (keyof CandidateJob)[]) if (typeof v[k] === "string") base[k] = v[k] as string;
  return base;
}

// Isian wajib calon; dikembalikan daftar yang masih kosong / salah.
export function missingData(d: CandidateData): string[] {
  const miss: string[] = [];
  const need: [keyof CandidateData, string][] = [
    ["name", "Nama lengkap"], ["phone", "No. HP (WhatsApp)"], ["birthPlace", "Tempat lahir"], ["birthDate", "Tanggal lahir"],
    ["ktpNumber", "No. identitas"], ["gender", "Jenis kelamin"], ["maritalStatus", "Status perkawinan"], ["religion", "Agama"],
    ["address", "Alamat sesuai identitas"], ["bankName", "Nama bank"], ["bankAccount", "No. rekening"], ["bankHolder", "Nama pemilik rekening"],
    ["ptkpStatus", "Status PTKP"],
  ];
  for (const [k, label] of need) if (!String(d[k] ?? "").trim()) miss.push(label);
  if (!d.addressSameAsId && !d.currentAddress.trim()) miss.push("Alamat saat ini");
  if (!d.addressRegion) miss.push("Kelurahan/desa alamat identitas");
  if (!d.addressSameAsId && !d.currentRegion) miss.push("Kelurahan/desa alamat saat ini");
  if (!/^\d{5}$/.test(d.addressPostal)) miss.push("Kode pos alamat identitas (5 angka)");
  if (!d.addressSameAsId && !/^\d{5}$/.test(d.currentPostal)) miss.push("Kode pos alamat saat ini (5 angka)");
  if (d.idType === "KTP" && d.ktpNumber && d.ktpNumber.replace(/\D/g, "").length !== 16) miss.push("No. KTP harus 16 digit");
  if (d.npwp && ![15, 16].includes(d.npwp.replace(/\D/g, "").length)) miss.push("NPWP harus 15 atau 16 digit");
  return miss;
}
export function missingJob(j: CandidateJob): string[] {
  const miss: string[] = [];
  if (!j.employeeId.trim()) miss.push("Employee ID");
  if (!j.departmentName.trim()) miss.push("Departemen");
  if (!j.position.trim()) miss.push("Jabatan");
  if (!j.joinDate) miss.push("Tanggal masuk");
  if (j.employmentStatus === "KONTRAK" && !j.contractEndDate) miss.push("Tanggal akhir kontrak");
  return miss;
}
