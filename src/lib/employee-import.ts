import * as XLSX from "xlsx";

// Format file data karyawan. Kolom mengikuti kesepakatan (dasar KantorKu), dan file
// ekspor KantorKu asli juga bisa langsung dibaca lewat nama kolom alternatifnya.

export type ImportComponent = { type: "TUNJANGAN" | "POTONGAN"; name: string; amount: number };

export type ImportRow = {
  employeeId: string;
  name: string;
  email?: string;
  managerRef?: string;
  branch?: string;
  departmentName?: string;
  position?: string;
  employmentStatus?: string;
  joinDate?: string;
  contractEndDate?: string;
  resignDate?: string;
  isActive: boolean;
  basicSalary?: number;
  components: ImportComponent[];
  paymentSchedule?: string;
  bpjsTkNumber?: string;
  bpjsTkActive: boolean;
  bpjsTkBase?: number;
  bpjsKesNumber?: string;
  bpjsKesActive: boolean;
  bpjsKesBase?: number;
  npwp?: string;
  ptkpStatus?: string;
  taxability?: string;
  taxStatus?: string;
  taxObjectCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  phone?: string;
  ktpNumber?: string;
  address?: string;
  birthPlace?: string;
  birthDate?: string;
  gender?: string;
  religion?: string;
  maritalStatus?: string;
  nationality?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
};

type Field = Exclude<keyof ImportRow, "components">;

// Nama pertama adalah nama kolom di template portal.
const COLUMNS: { field: Field; names: string[]; example: string }[] = [
  { field: "employeeId", names: ["ID Karyawan", "Employee ID"], example: "K001" },
  { field: "name", names: ["Nama Lengkap", "Full Name"], example: "Ahmad Subarjo" },
  { field: "email", names: ["Email", "Company Email"], example: "ahmad@email.com" },
  { field: "managerRef", names: ["ID Atasan Langsung", "ID Atasan", "Direct Manager ID"], example: "" },
  { field: "branch", names: ["Cabang", "Branch"], example: "KANTOR PUSAT" },
  { field: "departmentName", names: ["Departemen", "Department"], example: "Teknik" },
  { field: "position", names: ["Jabatan", "Position"], example: "Fabricator" },
  { field: "employmentStatus", names: ["Status Kerja", "Employment Status"], example: "KONTRAK" },
  { field: "joinDate", names: ["Tanggal Masuk", "Start Date"], example: "2024-01-15" },
  { field: "contractEndDate", names: ["Tanggal Akhir Kontrak", "End Date"], example: "2026-12-31" },
  { field: "resignDate", names: ["Tanggal Resign", "Resign Date"], example: "" },
  { field: "isActive", names: ["Status Aktif", "Follow Company General Policy"], example: "Aktif" },
  { field: "basicSalary", names: ["Gaji Pokok", "Basic Salary"], example: "5000000" },
  { field: "paymentSchedule", names: ["Jadwal Bayar", "Payment Schedule"], example: "Monthly" },
  { field: "bpjsTkNumber", names: ["No BPJS Ketenagakerjaan", "BPJS Ketenagakerjaan Number"], example: "" },
  { field: "bpjsTkActive", names: ["Status BPJS Ketenagakerjaan", "BPJS Ketenagakerjaan"], example: "Ikut" },
  { field: "bpjsTkBase", names: ["Dasar Upah BPJS Ketenagakerjaan", "BPJS Ketenagakerjaan Multiplier"], example: "5000000" },
  { field: "bpjsKesNumber", names: ["No BPJS Kesehatan", "No. BPJS Kesehatan"], example: "" },
  { field: "bpjsKesActive", names: ["Status BPJS Kesehatan", "BPJS Kesehatan"], example: "Tidak Ikut" },
  { field: "bpjsKesBase", names: ["Dasar Upah BPJS Kesehatan", "BPJS Kesehatan Multiplier"], example: "" },
  { field: "npwp", names: ["NPWP"], example: "" },
  { field: "ptkpStatus", names: ["Status PTKP", "PTKP Status"], example: "TK/0" },
  { field: "taxability", names: ["Taxability"], example: "Gross" },
  { field: "taxStatus", names: ["Status Pajak", "Employee Tax Status"], example: "Pegawai Tetap" },
  { field: "taxObjectCode", names: ["Kode Objek Pajak"], example: "21-100-01" },
  { field: "bankName", names: ["Nama Bank", "Bank Name"], example: "Mandiri" },
  { field: "bankAccount", names: ["No Rekening", "Bank Account Number"], example: "" },
  { field: "bankHolder", names: ["Nama Pemilik Rekening", "Bank Account Holder"], example: "Ahmad Subarjo" },
  { field: "phone", names: ["No HP", "Mobile Phone (WhatsApp)"], example: "081234567890" },
  { field: "ktpNumber", names: ["No KTP", "ID Number"], example: "" },
  { field: "address", names: ["Alamat KTP", "Residential Address"], example: "" },
  { field: "birthPlace", names: ["Tempat Lahir", "Birth Place"], example: "" },
  { field: "birthDate", names: ["Tanggal Lahir", "Birth Date"], example: "" },
  { field: "gender", names: ["Jenis Kelamin", "Gender"], example: "Male" },
  { field: "religion", names: ["Agama", "Religion"], example: "" },
  { field: "maritalStatus", names: ["Status Nikah", "Marital Status"], example: "Single" },
  { field: "nationality", names: ["Kewarganegaraan", "Nationality"], example: "Indonesia" },
  { field: "emergencyName", names: ["Nama Kontak Darurat", "Emergency Contact Name"], example: "" },
  { field: "emergencyPhone", names: ["No Kontak Darurat", "Emergency Contact Number"], example: "" },
  { field: "emergencyRelation", names: ["Hubungan Kontak Darurat", "Relationship with Emergency Contact"], example: "" },
];

const DATE_FIELDS: Field[] = ["joinDate", "contractEndDate", "resignDate", "birthDate"];
const NUMBER_FIELDS: Field[] = ["basicSalary", "bpjsTkBase", "bpjsKesBase"];
const FLAG_FIELDS: Field[] = ["isActive", "bpjsTkActive", "bpjsKesActive"];

// Pasangan nama + nominal selalu berurutan, dan KantorKu memakai nama "Amount 1" dua
// kali, jadi nominalnya dibaca dari kolom tepat di sebelah kanan.
const COMPONENT_HEADER: { pattern: RegExp; type: ImportComponent["type"] }[] = [
  { pattern: /^(tunjangan|additional benefit) \d+$/i, type: "TUNJANGAN" },
  { pattern: /^(potongan|additional deduction) \d+$/i, type: "POTONGAN" },
];

const clean = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => clean(v).toLowerCase().replace(/\s+/g, " ");

function toDate(v: unknown): string | undefined {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return undefined;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return clean(v).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  const text = clean(v).replace(/[^\d.-]/g, "");
  return text ? Number(text) : undefined;
}

function toFlag(v: unknown): boolean {
  return ["active", "aktif", "ikut", "ya", "true"].includes(key(v));
}

function toStatus(v: unknown): string {
  const s = key(v);
  if (s === "permanent" || s === "tetap") return "TETAP";
  if (s === "probation") return "PROBATION";
  return "KONTRAK";
}

function toBank(v: unknown): string {
  const s = clean(v).replace(/^bank_/i, "").replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function toNationality(v: unknown): string {
  return key(v).startsWith("indonesia") ? "Indonesia" : clean(v);
}

export function templateHeaders(): string[] {
  const headers = COLUMNS.map((c) => c.names[0]);
  headers.splice(headers.indexOf("Gaji Pokok") + 1, 0,
    "Tunjangan 1", "Nominal Tunjangan 1", "Tunjangan 2", "Nominal Tunjangan 2",
    "Potongan 1", "Nominal Potongan 1");
  return headers;
}

export function downloadTemplate() {
  const headers = templateHeaders();
  const example = headers.map((h) => COLUMNS.find((c) => c.names[0] === h)?.example ?? "");
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Karyawan");
  XLSX.writeFile(wb, "template_karyawan.xlsx");
}

export type ParsedFile = { sheet: string; rows: ImportRow[]; errors: string[]; unknown: string[] };

export function parseEmployeeFile(buffer: ArrayBuffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "array" });

  // File bisa berisi beberapa sheet, jadi pilih sheet yang kolomnya paling banyak dikenali.
  let best: { sheet: string; headerRow: number; score: number; table: unknown[][] } | null = null;
  const known = new Set(COLUMNS.flatMap((c) => c.names.map(key)));
  for (const sheet of workbook.SheetNames) {
    const table = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], {
      header: 1, raw: true, defval: "",
    });
    for (let i = 0; i < Math.min(5, table.length); i++) {
      const cells = table[i].map(key);
      if (!cells.some((c) => c === "id karyawan" || c === "employee id")) continue;
      const salary = cells.some((c) => c === "gaji pokok" || c === "basic salary") ? 100 : 0;
      const score = cells.filter((c) => known.has(c)).length + salary;
      if (!best || score > best.score) best = { sheet, headerRow: i, score, table };
    }
  }

  if (!best) {
    return { sheet: "", rows: [], errors: ["Kolom ID Karyawan tidak ditemukan di file ini."], unknown: [] };
  }

  const header = best.table[best.headerRow].map(clean);
  const index = new Map<Field, number>();
  for (const col of COLUMNS) {
    const names = col.names.map(key);
    const at = header.findIndex((h) => names.includes(key(h)));
    if (at >= 0) index.set(col.field, at);
  }

  const components = header.flatMap((h, at) => {
    const match = COMPONENT_HEADER.find((c) => c.pattern.test(h));
    return match ? [{ at, type: match.type }] : [];
  });

  const used = new Set([...index.values(), ...components.flatMap((c) => [c.at, c.at + 1])]);
  const unknown = header.filter((h, at) => h && !used.has(at));

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  best.table.slice(best.headerRow + 1).forEach((cells, offset) => {
    if (!cells.some((c) => clean(c))) return;
    const line = best.headerRow + offset + 2;
    const row: Record<string, unknown> = { components: [] as ImportComponent[] };

    for (const [field, at] of index) {
      const value = cells[at];
      if (DATE_FIELDS.includes(field)) row[field] = toDate(value);
      else if (NUMBER_FIELDS.includes(field)) row[field] = toNumber(value);
      else if (FLAG_FIELDS.includes(field)) row[field] = toFlag(value);
      else if (field === "employmentStatus") row[field] = toStatus(value);
      else if (field === "bankName") row[field] = toBank(value) || undefined;
      else if (field === "nationality") row[field] = toNationality(value) || undefined;
      else row[field] = clean(value) || undefined;
    }

    for (const c of components) {
      const name = clean(cells[c.at]);
      const amount = toNumber(cells[c.at + 1]);
      if (name && amount) (row.components as ImportComponent[]).push({ type: c.type, name, amount });
    }

    const parsed = { isActive: true, bpjsTkActive: false, bpjsKesActive: false, ...row } as ImportRow;
    if (!parsed.employeeId || !parsed.name) {
      errors.push(`Baris ${line}: ID Karyawan dan Nama wajib diisi.`);
    } else if (seen.has(parsed.employeeId)) {
      errors.push(`Baris ${line}: ID ${parsed.employeeId} ganda di file.`);
    } else {
      seen.add(parsed.employeeId);
      rows.push(parsed);
    }
  });

  return { sheet: best.sheet, rows, errors, unknown };
}
