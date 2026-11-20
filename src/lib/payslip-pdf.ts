// PDF slip gaji satu karyawan satu periode (A4). Data dari Proses Gaji yang sudah final.
// Susunan: kop (logo, nama perusahaan, judul, periode) → data karyawan → Pendapatan | Potongan (Tetap / Tidak rutin)
// → Gaji Bersih + terbilang → Benefit ditanggung perusahaan → catatan dokumen otomatis.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import type { LineItem } from "@/lib/payroll-run";

const BRAND = rgb(0.745, 0.208, 0.247);
const INK = rgb(0.13, 0.13, 0.15);
const GREY = rgb(0.45, 0.45, 0.48);
const LINE = rgb(0.85, 0.85, 0.87);
const SOFT = rgb(0.97, 0.95, 0.95);
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
// Font standar PDF hanya WinAnsi.
const safe = (s: string | null | undefined) => (s ?? "").replace(/[−–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`.trim();
  if (n < 200) return `seratus ${terbilang(n - 100)}`.trim();
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`.trim();
  if (n < 2000) return `seribu ${terbilang(n - 1000)}`.trim();
  if (n < 1e6) return `${terbilang(Math.floor(n / 1000))} ribu ${terbilang(n % 1000)}`.trim();
  if (n < 1e9) return `${terbilang(Math.floor(n / 1e6))} juta ${terbilang(n % 1e6)}`.trim();
  return `${terbilang(Math.floor(n / 1e9))} miliar ${terbilang(n % 1e9)}`.trim();
}

export type PayslipPdfData = {
  company: string;
  periodLabel: string; paidAt: string | null; // dd-mm-yyyy
  employee: { name: string; employeeId: string | null; position: string | null; department: string | null; ptkp: string | null; bank: string | null; account: string | null };
  items: LineItem[]; fixedCodes: string[]; netPay: number;
  logo?: Uint8Array | null; logoType?: "jpg" | "png";
};

export async function buildPayslipPdf(d: PayslipPdfData) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Slip Gaji ${d.employee.name} ${d.periodLabel}`);
  doc.setAuthor(d.company);
  const W = 595.28, H = 841.89, M = 40;
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = (s: string, x: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(safe(s), { x, y, size: o.size ?? 9, font: o.f ?? font, color: o.color ?? INK });
  const right = (s: string, xr: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    text(s, xr - (o.f ?? font).widthOfTextAtSize(safe(s), o.size ?? 9), y, o);
  const hline = (y: number, x1 = M, x2 = W - M, c = LINE) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color: c });
  // Potong teks panjang agar muat lebar kolom.
  const fit = (s: string, max: number, size = 9, f = font) => {
    let t = safe(s);
    while (t.length > 3 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2);
    return t === safe(s) ? t : `${t.trimEnd()}…`.replace("…", "...");
  };

  // ── Kop
  let y = H - M;
  let img: PDFImage | null = null;
  if (d.logo) { try { img = d.logoType === "png" ? await doc.embedPng(d.logo) : await doc.embedJpg(d.logo); } catch { img = null; } }
  if (img) {
    const h = 34, w = (img.width / img.height) * h;
    page.drawImage(img, { x: M, y: y - h, width: w, height: h });
  } else {
    text(d.company, M, y - 22, { size: 13, f: bold, color: BRAND });
  }
  right("SLIP GAJI", W - M, y - 14, { size: 16, f: bold, color: BRAND });
  right(d.periodLabel, W - M, y - 30, { size: 10, f: bold });
  y -= 46;
  page.drawRectangle({ x: M, y: y - 2, width: W - 2 * M, height: 2, color: BRAND });
  y -= 20;

  // ── Data karyawan (dua kolom)
  const masked = d.employee.account ? `${"*".repeat(Math.max(0, d.employee.account.length - 4))}${d.employee.account.slice(-4)}`.slice(-12) : "-";
  const left: [string, string][] = [["Nama", d.employee.name], ["ID Karyawan", d.employee.employeeId ?? "-"], ["Jabatan", d.employee.position ?? "-"]];
  const rightCol: [string, string][] = [["Departemen", d.employee.department ?? "-"], ["Status PTKP", d.employee.ptkp ?? "-"], ["Rekening", `${d.employee.bank ?? "-"} ${masked}`]];
  const half = (W - 2 * M) / 2;
  for (let i = 0; i < 3; i++) {
    text(left[i][0], M, y, { color: GREY }); text(`: ${fit(left[i][1], half - 80)}`, M + 70, y, { f: i === 0 ? bold : font });
    text(rightCol[i][0], M + half, y, { color: GREY }); text(`: ${fit(rightCol[i][1], half - 80)}`, M + half + 70, y);
    y -= 15;
  }
  if (d.paidAt) { text("Tanggal bayar", M, y, { color: GREY }); text(`: ${d.paidAt}`, M + 70, y); y -= 15; }
  y -= 8;

  // ── Pendapatan | Potongan
  const fixed = new Set(["GP", ...d.fixedCodes]);
  const earn = d.items.filter((i) => i.kind === "PENDAPATAN");
  const cut = d.items.filter((i) => i.kind === "POTONGAN");
  const benefit = d.items.filter((i) => i.kind === "BENEFIT");
  const colW = (W - 2 * M - 20) / 2;
  const drawCol = (title: string, list: LineItem[], x: number, startY: number) => {
    let yy = startY;
    page.drawRectangle({ x, y: yy - 6, width: colW, height: 18, color: SOFT });
    text(title, x + 6, yy, { f: bold, color: BRAND });
    yy -= 22;
    for (const [label, part] of [["Tetap", list.filter((i) => fixed.has(i.code))], ["Tidak rutin", list.filter((i) => !fixed.has(i.code))]] as const) {
      if (!part.length) continue;
      text(label, x + 6, yy, { size: 8, f: bold, color: GREY }); yy -= 13;
      for (const i of part) {
        text(fit(i.name, colW - 100), x + 6, yy);
        right(rp(i.amount), x + colW - 6, yy);
        yy -= 13;
      }
      yy -= 3;
    }
    if (!list.length) { text("-", x + 6, yy, { color: GREY }); yy -= 13; }
    return yy;
  };
  const top = y;
  const yL = drawCol("PENDAPATAN", earn, M, top);
  const yR = drawCol("POTONGAN", cut, M + colW + 20, top);
  y = Math.min(yL, yR) - 2;
  hline(y + 8);
  const sum = (l: LineItem[]) => l.reduce((a, i) => a + i.amount, 0);
  text("Total Pendapatan", M + 6, y - 4, { f: bold }); right(rp(sum(earn)), M + colW - 6, y - 4, { f: bold });
  text("Total Potongan", M + colW + 26, y - 4, { f: bold }); right(rp(sum(cut)), W - M - 6, y - 4, { f: bold });
  y -= 30;

  // ── Gaji bersih
  page.drawRectangle({ x: M, y: y - 30, width: W - 2 * M, height: 44, color: BRAND });
  text("GAJI BERSIH (TAKE HOME PAY)", M + 12, y - 2, { size: 9, f: bold, color: rgb(1, 1, 1) });
  right(rp(d.netPay), W - M - 12, y - 8, { size: 16, f: bold, color: rgb(1, 1, 1) });
  const words = `Terbilang: ${terbilang(d.netPay) || "nol"} rupiah`;
  text(fit(words.charAt(0).toUpperCase() + words.slice(1), W - 2 * M - 180, 8), M + 12, y - 20, { size: 8, color: rgb(1, 0.92, 0.93) });
  y -= 50;

  // ── Benefit ditanggung perusahaan
  if (benefit.length) {
    text("Benefit (ditanggung perusahaan, tidak mengurangi gaji)", M, y, { size: 8, f: bold, color: GREY });
    y -= 13;
    for (const i of benefit) { text(fit(i.name, 300, 8), M + 6, y, { size: 8, color: GREY }); right(rp(i.amount), M + 360, y, { size: 8, color: GREY }); y -= 12; }
    y -= 6;
  }

  // ── Penutup
  hline(M + 30);
  text("Dokumen ini dibuat otomatis oleh sistem dan sah tanpa tanda tangan.", M, M + 16, { size: 7.5, color: GREY });
  right(`Dicetak ${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("-")} · ${d.company}`, W - M, M + 16, { size: 7.5, color: GREY });
  return doc.save();
}
