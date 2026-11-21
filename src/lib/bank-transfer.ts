// File transfer gaji untuk diunggah ke internet banking perusahaan.
// Template pertama: Bank Mandiri KOPRA "Payroll by File Upload — Multi Service" (TXT, pemisah ";", 46 kolom per baris).
//   Header : P;yyyyMMdd;rekening debit;jumlah record;total
//   Detail : rekening tujuan;nama;alamat1;alamat2;alamat3;IDR;nominal;keterangan;referensi;layanan;kode bank;nama bank;…
// Rekening Mandiri → IBU (In-House). Bank lain → BAU (BI FAST ke nomor rekening) dengan kode BIC dari daftar KOPRA.

export const TRANSFER_TEMPLATES = [{ key: "KOPRA_MANDIRI", label: "Kopra Bank Mandiri" }] as const;
export type TransferTemplate = (typeof TRANSFER_TEMPLATES)[number]["key"];
export const TRANSFER_SETTING_KEY = "payroll.transfer"; // { debitAccount } terakhir dipakai

// Kode bank (BIC) dari sheet "List of Bank Codes" template KOPRA. Kunci = nama bank yang sudah dinormalkan.
const BANK_CODES: [RegExp, string, string][] = [
  [/^(bca|central asia)$/, "CENAIDJA", "Bank Central Asia"],
  [/^bca syariah$/, "SYCAIDJ1", "BCA Syariah"],
  [/^(bni|negara indonesia)$/, "BNINIDJA", "Bank Negara Indonesia"],
  [/^(bri|rakyat indonesia)$/, "BRINIDJA", "Bank Rakyat Indonesia"],
  [/^(bsi|syariah indonesia)$/, "BSMDIDJA", "Bank Syariah Indonesia"],
  [/^(btn|tabungan negara)$/, "BTANIDJA", "Bank Tabungan Negara"],
  [/^btn syariah$/, "SYBTIDJ1", "BTN Syariah"],
  [/^cimb( niaga)?$/, "BNIAIDJA", "CIMB Niaga"],
  [/^cimb niaga syariah$/, "SYNAIDJ1", "CIMB Niaga Syariah"],
  [/^danamon$/, "BDINIDJA", "Bank Danamon"],
  [/^permata$/, "BBBAIDJA", "Bank Permata"],
  [/^(ocbc|ocbc nisp|nisp)$/, "NISPIDJA", "OCBC NISP"],
  [/^panin$/, "PINBIDJA", "Panin Bank"],
  [/^maybank( indonesia)?$/, "IBBKIDJA", "Maybank Indonesia"],
  [/^uob( indonesia)?$/, "BBIJIDJA", "UOB Indonesia"],
  [/^(btpn|jenius)$/, "SUNIIDJA", "BTPN"],
  [/^btpn syariah$/, "PUBAIDJ1", "BTPN Syariah"],
  [/^mega$/, "MEGAIDJA", "Bank Mega"],
  [/^muamalat( indonesia)?$/, "MUABIDJA", "Bank Muamalat Indonesia"],
  [/^jago$/, "JAGBIDJA", "Bank Jago"],
  [/^seabank( indonesia)?$/, "SSPIIDJA", "Bank Seabank Indonesia"],
  [/^(dki|dki jakarta)$/, "BDKIIDJ1", "Bank DKI"],
  [/^(bjb|jabar|jabar banten|bpd jabar dan banten)$/, "PDJBIDJA", "Bank BJB"],
  [/^jateng$/, "PDJGIDJ1", "Bank Jateng"],
  [/^jatim$/, "PDJTIDJ1", "Bank Jatim"],
  [/^kalsel$/, "PDKSIDJ1", "Bank Kalsel"],
  [/^kalsel syariah$/, "SYKSIDJ1", "Bank Kalsel Syariah"],
];

const normBank = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z ]/g, " ")
  .replace(/\b(pt|tbk|bank|bpd)\b/g, " ").replace(/\s+/g, " ").trim();

// "MANDIRI" = in-house; { code, name } = bank lain; null = belum dikenal.
export function bankRoute(bankName: string | null | undefined): "MANDIRI" | { code: string; name: string } | null {
  const n = normBank(bankName ?? "");
  if (!n) return null;
  if (n === "mandiri" || n === "mandiri persero" || n === "livin" || n === "livin mandiri") return "MANDIRI";
  const hit = BANK_CODES.find(([re]) => re.test(n));
  return hit ? { code: hit[1], name: hit[2] } : null;
}

// remark: keterangan per baris (mis. pinjaman); kosong = keterangan file.
export type TransferRow = { name: string; employeeId: string | null; bankName: string | null; account: string | null; holder: string | null; email: string | null; amount: number; remark?: string };
// cash: nama karyawan berpembayaran Cash yang dilewati (dibayar Admin secara manual).
export type TransferResult = { content: string; count: number; total: number; skipped: number; other: number; cash: string[] } | { errors: string[] };

const clean = (s: string, max: number) => s.replace(/[;\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

// date = yyyy-mm-dd (tanggal transfer); remark = keterangan transaksi (mis. "Gaji November 2026"); code = kode referensi (GAJI / PINJ).
export function buildKopra(rows: TransferRow[], opts: { date: string; debitAccount: string; remark: string; code?: string }): TransferResult {
  const debit = opts.debitAccount.replace(/\D/g, "");
  const errors: string[] = [];
  if (!/^\d{10,40}$/.test(debit)) errors.push("Rekening debit perusahaan tidak valid.");
  const [y, m, d] = opts.date.split("-");
  const ref = `${d}/${m}/${opts.code ?? "GAJI"}/${y}`; // maks 19 karakter
  const remark = clean(opts.remark, 140);
  const lines: string[] = [];
  let total = 0, skipped = 0, other = 0;
  const cash: string[] = [];
  for (const r of rows) {
    const amount = Math.round(r.amount);
    if (amount <= 0) { skipped++; continue; }
    const who = `${r.name}${r.employeeId ? ` (${r.employeeId})` : ""}`;
    if ((r.bankName ?? "").trim().toLowerCase() === "cash") { cash.push(who); continue; }
    const acc = (r.account ?? "").replace(/[\s.-]/g, "");
    if (!acc) { errors.push(`${who}: nomor rekening kosong.`); continue; }
    if (!/^\d{5,35}$/.test(acc)) { errors.push(`${who}: nomor rekening hanya boleh angka.`); continue; }
    const route = bankRoute(r.bankName);
    if (!route) { errors.push(`${who}: bank "${r.bankName ?? "-"}" belum dikenal.`); continue; }
    const email = r.email && EMAIL.test(r.email) ? r.email : "";
    const f: string[] = Array(46).fill("");
    f[0] = acc; f[1] = clean(r.holder || r.name, 70); f[5] = "IDR"; f[6] = String(amount); f[7] = r.remark ? clean(r.remark, 140) : remark; f[8] = ref;
    if (route === "MANDIRI") f[9] = "IBU";
    else { f[9] = "BAU"; f[10] = route.code; f[11] = route.name; other++; }
    f[16] = email ? "Y" : "N"; f[17] = email;
    lines.push(f.join(";"));
    total += amount;
  }
  if (!errors.length && !lines.length) errors.push(cash.length ? "Semua penerima di daftar ini dibayar Cash; tidak ada yang perlu ditransfer." : "Tidak ada gaji yang perlu ditransfer di periode ini.");
  if (errors.length) return { errors };
  const header = ["P", `${y}${m}${d}`, debit, String(lines.length), String(total)].join(";");
  return { content: [header, ...lines].join("\r\n"), count: lines.length, total, skipped, other, cash };
}
