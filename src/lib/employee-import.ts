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
type Kind = "text" | "digits" | "date" | "money" | "email" | "phone";

type Column = {
  field: Field;
  names: string[]; // nama pertama adalah nama kolom di template portal
  kind?: Kind;
  required?: boolean;
  choices?: Record<string, string>; // isian (huruf kecil) -> nilai yang disimpan
  shown?: string; // pilihan yang ditampilkan di Petunjuk
  note?: string;
  example?: string;
};

const FLAG = { aktif: "true", active: "true", nonaktif: "false", inactive: "false", resign: "false" };
const BPJS = { ikut: "true", active: "true", "tidak ikut": "false", inactive: "false" };
const PTKP = Object.fromEntries(
  ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3", "K/I/0", "K/I/1", "K/I/2", "K/I/3"]
    .map((v) => [v.toLowerCase(), v]),
);

const COLUMNS: Column[] = [
  { field: "employeeId", names: ["ID Karyawan", "Employee ID"], required: true, example: "K001", note: "Tidak boleh sama dengan karyawan lain. ID yang sudah ada di portal akan dilewati." },
  { field: "name", names: ["Nama Lengkap", "Full Name"], required: true, example: "Ahmad Subarjo" },
  { field: "email", names: ["Email", "Company Email"], kind: "email", required: true, example: "ahmad@email.com", note: "Tidak boleh sama dengan karyawan lain. Dipakai untuk login." },
  { field: "managerRef", names: ["ID Atasan Langsung", "ID Atasan", "Direct Manager ID"], example: "K000", note: "Isi ID Karyawan atasan langsung, bukan nama. Kosongkan untuk pimpinan tertinggi." },
  { field: "branch", names: ["Cabang", "Branch"], example: "KANTOR PUSAT" },
  { field: "departmentName", names: ["Departemen", "Department"], example: "ENGINEERING DEPARTEMENT", note: "Departemen baru dibuat otomatis, jadi tulis persis sama untuk satu departemen." },
  { field: "position", names: ["Jabatan", "Position"], example: "SUPERVISOR" },
  { field: "employmentStatus", names: ["Status Kerja", "Employment Status"], required: true, choices: { tetap: "TETAP", permanent: "TETAP", kontrak: "KONTRAK", contract: "KONTRAK", probation: "PROBATION" }, shown: "TETAP, KONTRAK, PROBATION", example: "KONTRAK" },
  { field: "joinDate", names: ["Tanggal Masuk", "Start Date"], kind: "date", required: true, example: "15-Jan-2024", note: "Menentukan No. Urut dan tanggal berlaku gaji awal." },
  { field: "contractEndDate", names: ["Tanggal Akhir Kontrak", "End Date"], kind: "date", example: "31-Des-2026", note: "Isi untuk karyawan KONTRAK." },
  { field: "resignDate", names: ["Tanggal Resign", "Resign Date"], kind: "date", example: "30-Jun-2026" },
  { field: "isActive", names: ["Status Aktif", "Follow Company General Policy"], choices: FLAG, shown: "Aktif, Nonaktif", example: "Aktif", note: "Kalau kosong dianggap Aktif. Karyawan Nonaktif tidak bisa login." },
  { field: "basicSalary", names: ["Gaji Pokok", "Basic Salary"], kind: "money", required: true, example: "5000000", note: "Angka saja, tanpa Rp dan tanpa titik." },
  { field: "paymentSchedule", names: ["Jadwal Bayar", "Payment Schedule"], choices: { bulanan: "Bulanan", monthly: "Bulanan", mingguan: "Mingguan", weekly: "Mingguan" }, shown: "Bulanan, Mingguan", example: "Bulanan" },
  { field: "bpjsTkNumber", names: ["No BPJS Ketenagakerjaan", "BPJS Ketenagakerjaan Number"], kind: "digits", example: "12345678901" },
  { field: "bpjsTkActive", names: ["Status BPJS Ketenagakerjaan", "BPJS Ketenagakerjaan"], choices: BPJS, shown: "Ikut, Tidak Ikut", example: "Ikut", note: "Kalau kosong dianggap Tidak Ikut." },
  { field: "bpjsTkBase", names: ["Dasar Upah BPJS Ketenagakerjaan", "BPJS Ketenagakerjaan Multiplier"], kind: "money", example: "5000000", note: "Angka saja." },
  { field: "bpjsKesNumber", names: ["No BPJS Kesehatan", "No. BPJS Kesehatan"], kind: "digits", example: "0001234567890" },
  { field: "bpjsKesActive", names: ["Status BPJS Kesehatan", "BPJS Kesehatan"], choices: BPJS, shown: "Ikut, Tidak Ikut", example: "Tidak Ikut", note: "Kalau kosong dianggap Tidak Ikut." },
  { field: "bpjsKesBase", names: ["Dasar Upah BPJS Kesehatan", "BPJS Kesehatan Multiplier"], kind: "money", example: "5000000", note: "Angka saja." },
  { field: "npwp", names: ["NPWP"], kind: "digits", example: "3201010101010001", note: "15 atau 16 digit. Tulis sebagai teks." },
  { field: "ptkpStatus", names: ["Status PTKP", "PTKP Status"], choices: PTKP, shown: "TK/0 sampai TK/3, K/0 sampai K/3, K/I/0 sampai K/I/3", example: "K/1" },
  { field: "taxability", names: ["Taxability"], choices: { gross: "Gross", "gross up": "Gross Up", net: "Net" }, shown: "Gross, Gross Up, Net", example: "Gross" },
  { field: "taxStatus", names: ["Status Pajak", "Employee Tax Status"], choices: { "pegawai tetap": "Pegawai Tetap", "pegawai tidak tetap": "Pegawai Tidak Tetap" }, shown: "Pegawai Tetap, Pegawai Tidak Tetap", example: "Pegawai Tetap" },
  { field: "taxObjectCode", names: ["Kode Objek Pajak"], example: "21-100-01" },
  { field: "bankName", names: ["Nama Bank", "Bank Name"], example: "Mandiri" },
  { field: "bankAccount", names: ["No Rekening", "Bank Account Number"], kind: "digits", example: "1234567890123", note: "Angka saja. Tulis sebagai teks." },
  { field: "bankHolder", names: ["Nama Pemilik Rekening", "Bank Account Holder"], example: "Ahmad Subarjo" },
  { field: "phone", names: ["No HP", "Mobile Phone (WhatsApp)"], kind: "phone", example: "081234567890", note: "Boleh diawali 08 atau 62. Tulis sebagai teks." },
  { field: "ktpNumber", names: ["No KTP", "ID Number"], kind: "digits", example: "3201010101010001", note: "16 digit. Tidak boleh sama dengan karyawan lain. Tulis sebagai teks." },
  { field: "address", names: ["Alamat KTP", "Residential Address"], example: "Jl. Contoh No. 1, Banjarmasin" },
  { field: "birthPlace", names: ["Tempat Lahir", "Birth Place"], example: "Banjarmasin" },
  { field: "birthDate", names: ["Tanggal Lahir", "Birth Date"], kind: "date", example: "20-Mei-1990" },
  { field: "gender", names: ["Jenis Kelamin", "Gender"], choices: { "laki-laki": "Laki-laki", male: "Laki-laki", perempuan: "Perempuan", female: "Perempuan" }, shown: "Laki-laki, Perempuan", example: "Laki-laki" },
  { field: "religion", names: ["Agama", "Religion"], choices: { islam: "Islam", kristen: "Kristen", katolik: "Katolik", hindu: "Hindu", buddha: "Buddha", konghucu: "Konghucu" }, shown: "Islam, Kristen, Katolik, Hindu, Buddha, Konghucu", example: "Islam" },
  { field: "maritalStatus", names: ["Status Nikah", "Marital Status"], choices: { menikah: "Menikah", married: "Menikah", "belum menikah": "Belum Menikah", single: "Belum Menikah", cerai: "Cerai", divorced: "Cerai" }, shown: "Belum Menikah, Menikah, Cerai", example: "Menikah" },
  { field: "nationality", names: ["Kewarganegaraan", "Nationality"], example: "Indonesia" },
  { field: "emergencyName", names: ["Nama Kontak Darurat", "Emergency Contact Name"], example: "Siti Aminah" },
  { field: "emergencyPhone", names: ["No Kontak Darurat", "Emergency Contact Number"], kind: "phone", example: "081234567891", note: "Tulis sebagai teks." },
  { field: "emergencyRelation", names: ["Hubungan Kontak Darurat", "Relationship with Emergency Contact"], example: "Istri" },
];

const SALARY_COLUMNS = [
  { name: "Tunjangan 1", format: "Teks", note: "Nama tunjangan, misalnya Tunjangan Jabatan.", example: "Tunjangan Jabatan" },
  { name: "Nominal Tunjangan 1", format: "Angka", note: "Angka saja. Harus tepat di sebelah kanan kolom namanya.", example: "500000" },
  { name: "Tunjangan 2", format: "Teks", note: "Sama seperti Tunjangan 1.", example: "" },
  { name: "Nominal Tunjangan 2", format: "Angka", note: "Angka saja.", example: "" },
  { name: "Potongan 1", format: "Teks", note: "Nama potongan tetap di luar pajak dan BPJS.", example: "" },
  { name: "Nominal Potongan 1", format: "Angka", note: "Angka saja.", example: "" },
];

const FORMAT_LABEL: Record<Kind, string> = {
  text: "Teks", digits: "Teks angka", date: "Tanggal DD-MMM-YYYY", money: "Angka", email: "Email", phone: "Teks angka",
};

// Pasangan nama + nominal selalu berurutan, dan KantorKu memakai nama "Amount 1" dua
// kali, jadi nominalnya dibaca dari kolom tepat di sebelah kanan.
const COMPONENT_HEADER: { pattern: RegExp; type: ImportComponent["type"] }[] = [
  { pattern: /^(tunjangan|additional benefit) \d+$/i, type: "TUNJANGAN" },
  { pattern: /^(potongan|additional deduction) \d+$/i, type: "POTONGAN" },
];

const clean = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => clean(v).toLowerCase().replace(/\s+/g, " ");

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, ags: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

function toDate(v: unknown): string | undefined {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return undefined;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const text = clean(v);
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;

  // DD-MMM-YYYY atau DD-MM-YYYY, bulannya boleh singkatan Indonesia atau Inggris.
  const parts = text.match(/^(\d{1,2})[-/ ]([a-z]{3,}|\d{1,2})[-/ ](\d{4})$/i);
  if (!parts) return undefined;
  const month = /^\d+$/.test(parts[2]) ? Number(parts[2]) : MONTH_NAMES[parts[2].slice(0, 3).toLowerCase()];
  const day = Number(parts[1]);
  const date = new Date(Date.UTC(Number(parts[3]), (month ?? 0) - 1, day));
  if (!month || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().split("T")[0];
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  const text = clean(v);
  if (!text) return undefined;
  return /^[\d.,\s]+$/.test(text) ? Number(text.replace(/\D/g, "")) : NaN;
}

function toBank(v: unknown): string | undefined {
  const s = clean(v).replace(/^bank_/i, "").replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined;
}

function toNationality(v: unknown): string | undefined {
  return key(v).startsWith("indonesia") ? "Indonesia" : clean(v) || undefined;
}

export function templateHeaders(): string[] {
  const headers = COLUMNS.map((c) => c.names[0]);
  headers.splice(headers.indexOf("Gaji Pokok") + 1, 0, ...SALARY_COLUMNS.map((c) => c.name));
  return headers;
}

function instructionRows(): string[][] {
  const rows = templateHeaders().map((name) => {
    const salary = SALARY_COLUMNS.find((c) => c.name === name);
    if (salary) return [name, "Tidak", salary.format, "", salary.example, salary.note];
    const col = COLUMNS.find((c) => c.names[0] === name)!;
    return [
      name,
      col.required ? "Ya" : "Tidak",
      col.choices ? "Pilih salah satu" : FORMAT_LABEL[col.kind ?? "text"],
      col.shown ?? "",
      col.example ?? "",
      col.note ?? "",
    ];
  });
  return [
    ["Petunjuk Pengisian Data Karyawan"],
    ["1. Isi data di sheet Karyawan, mulai baris 2. Jangan ubah nama kolom di baris 1."],
    ["2. No. Urut dibuat otomatis oleh portal, jadi tidak ada di file ini."],
    ["3. Tanggal ditulis dengan format DD-MMM-YYYY, misalnya 15-Jan-2024. Format DD-MM-YYYY juga diterima."],
    ["4. Kolom Pilih salah satu harus diisi persis seperti Pilihan Nilai."],
    ["5. No KTP, NPWP, No Rekening, dan No HP sudah diatur sebagai teks. Saat menempel dari file lain, pakai Paste Values supaya angkanya tidak berubah."],
    ["6. Baris yang salah ditampilkan saat import dan tidak ikut masuk. Baris lain tetap bisa diimport."],
    [],
    ["Kolom", "Wajib", "Format", "Pilihan Nilai", "Contoh", "Catatan"],
    ...rows,
  ];
}

export function buildTemplate(): XLSX.WorkBook {
  const headers = templateHeaders();
  const data = XLSX.utils.aoa_to_sheet([headers]);

  // Kolom teks diformat lebih dulu supaya Excel tidak mengubah angka panjang atau tanggal.
  const TEMPLATE_ROWS = 300;
  headers.forEach((name, c) => {
    const col = COLUMNS.find((x) => x.names[0] === name);
    const asText = col?.kind === "digits" || col?.kind === "phone" || col?.kind === "date" || col?.field === "employeeId";
    if (asText) {
      for (let r = 1; r <= TEMPLATE_ROWS; r++) {
        data[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: "", z: "@" };
      }
    }
    const help = col?.shown ?? col?.note ?? (col?.kind === "date" ? "DD-MMM-YYYY" : "");
    const cell = data[XLSX.utils.encode_cell({ r: 0, c })];
    if (help) cell.c = [{ a: "Petunjuk", t: col?.shown ? `Pilih: ${help}` : help, hidden: true }];
  });
  data["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: TEMPLATE_ROWS, c: headers.length - 1 } });
  data["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));

  const guide = XLSX.utils.aoa_to_sheet(instructionRows());
  guide["!cols"] = [{ wch: 34 }, { wch: 7 }, { wch: 20 }, { wch: 44 }, { wch: 26 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, data, "Karyawan");
  XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
  return wb;
}

export function downloadTemplate() {
  XLSX.writeFile(buildTemplate(), "template_karyawan.xlsx");
}

export type ParsedFile = { sheet: string; rows: ImportRow[]; errors: string[]; unknown: string[] };

// Mengembalikan pesan kesalahan, atau null kalau isiannya benar.
function readCell(col: Column, value: unknown, row: Record<string, unknown>): string | null {
  const label = col.names[0];
  const text = clean(value);

  if (!text) {
    if (col.required) return `${label} wajib diisi`;
    return null;
  }

  if (col.choices) {
    const chosen = col.choices[key(value)];
    if (!chosen) return `${label} "${text}" tidak dikenal, pilihannya ${col.shown}`;
    row[col.field] = chosen === "true" ? true : chosen === "false" ? false : chosen;
    return null;
  }

  // Sel berisi angka berarti Excel sudah membuang nol di depan atau membulatkan digitnya.
  if (typeof value === "number" && (col.kind === "digits" || col.kind === "phone") && text.length > 15) {
    return `${label} berubah oleh Excel, format kolomnya harus Teks`;
  }

  switch (col.kind) {
    case "date": {
      const date = toDate(value);
      if (!date) return `${label} "${text}" harus berformat DD-MMM-YYYY`;
      row[col.field] = date;
      return null;
    }
    case "money": {
      const amount = toNumber(value);
      if (amount === undefined || Number.isNaN(amount)) return `${label} "${text}" harus berupa angka`;
      row[col.field] = amount;
      return null;
    }
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `${label} "${text}" bukan email yang benar`;
      break;
    case "digits": {
      const digits = text.replace(/\D/g, "");
      if (!digits) return `${label} harus berisi angka`;
      if (col.field === "ktpNumber" && digits.length !== 16) return `${label} harus 16 digit`;
      if (col.field === "npwp" && digits.length !== 15 && digits.length !== 16) return `NPWP harus 15 atau 16 digit`;
      break;
    }
    case "phone": {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) return `${label} harus 9 sampai 15 digit`;
      row[col.field] = typeof value === "number" && !text.startsWith("62") ? `0${text}` : text;
      return null;
    }
  }

  if (col.field === "bankName") row[col.field] = toBank(value);
  else if (col.field === "nationality") row[col.field] = toNationality(value);
  else row[col.field] = text;
  return null;
}

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

  const found = best;
  const header = found.table[found.headerRow].map(clean);
  const index = new Map<Field, number>();
  for (const col of COLUMNS) {
    const names = col.names.map(key);
    const at = header.findIndex((h) => names.includes(key(h)));
    if (at >= 0) index.set(col.field, at);
  }

  const missing = COLUMNS.filter((c) => c.required && !index.has(c.field)).map((c) => c.names[0]);
  if (missing.length > 0) {
    return { sheet: found.sheet, rows: [], errors: [`Kolom wajib tidak ditemukan: ${missing.join(", ")}.`], unknown: [] };
  }

  const components = header.flatMap((h, at) => {
    const match = COMPONENT_HEADER.find((c) => c.pattern.test(h));
    return match ? [{ at, type: match.type }] : [];
  });

  const used = new Set([...index.values(), ...components.flatMap((c) => [c.at, c.at + 1])]);
  const unknown = header.filter((h, at) => h && !used.has(at));

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const seen = { id: new Set<string>(), email: new Set<string>(), ktp: new Set<string>() };

  found.table.slice(found.headerRow + 1).forEach((cells, offset) => {
    if (!cells.some((c) => clean(c))) return;
    const line = found.headerRow + offset + 2;
    const row: Record<string, unknown> = {
      components: [] as ImportComponent[], isActive: true, bpjsTkActive: false, bpjsKesActive: false,
    };
    const problems: string[] = [];

    for (const col of COLUMNS) {
      const at = index.get(col.field);
      const problem = at === undefined ? null : readCell(col, cells[at], row);
      if (problem) problems.push(problem);
    }

    for (const c of components) {
      const name = clean(cells[c.at]);
      const amount = toNumber(cells[c.at + 1]);
      if (!name) continue;
      if (Number.isNaN(amount)) problems.push(`Nominal ${name} harus berupa angka`);
      else if (amount) (row.components as ImportComponent[]).push({ type: c.type, name, amount });
    }

    const parsed = row as unknown as ImportRow;
    const email = parsed.email?.toLowerCase();
    if (parsed.employeeId && seen.id.has(parsed.employeeId)) problems.push(`ID ${parsed.employeeId} ganda di file`);
    if (email && seen.email.has(email)) problems.push(`Email ${parsed.email} ganda di file`);
    if (parsed.ktpNumber && seen.ktp.has(parsed.ktpNumber)) problems.push("No KTP ganda di file");

    if (problems.length > 0) {
      errors.push(`Baris ${line}: ${problems.join("; ")}.`);
      return;
    }
    seen.id.add(parsed.employeeId);
    if (email) seen.email.add(email);
    if (parsed.ktpNumber) seen.ktp.add(parsed.ktpNumber);
    rows.push(parsed);
  });

  return { sheet: found.sheet, rows, errors, unknown };
}
