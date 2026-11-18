// PDF formulir 1721-A1 (Bukti Pemotongan PPh Pasal 21 bagi Pegawai Tetap) dari data portal, ukuran A4.
// Susunan baris mengikuti formulir 1721-A1; bukti potong resmi tetap diterbitkan lewat Coretax DJP.
// Dokumen tahun yang belum selesai (Desember / bulan keluar belum final) diberi tanda air "SEMENTARA".
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { A1Rows, Form1721A1 } from "@/lib/form1721a1";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const rp = (n: number) => Math.round(n).toLocaleString("id-ID");
const BRAND = rgb(0.745, 0.208, 0.247);
const INK = rgb(0.13, 0.13, 0.15);
const GREY = rgb(0.45, 0.45, 0.48);
const LINE = rgb(0.8, 0.8, 0.82);

const ROWS: { title: string; rows: [keyof A1Rows, string, boolean?][] }[] = [
  { title: "PENGHASILAN BRUTO", rows: [
    ["r1", "Gaji / pensiun atau THT/JHT"],
    ["r2", "Tunjangan PPh"],
    ["r3", "Tunjangan lainnya, uang lembur, dan sebagainya"],
    ["r4", "Honorarium dan imbalan lain sejenisnya"],
    ["r5", "Premi asuransi yang dibayar pemberi kerja"],
    ["r6", "Penerimaan dalam bentuk natura dan kenikmatan lainnya yang dikenakan PPh 21"],
    ["r7", "Tantiem, bonus, gratifikasi, jasa produksi, dan THR"],
    ["r8", "Jumlah penghasilan bruto (1 s.d. 7)", true],
  ] },
  { title: "PENGURANGAN", rows: [
    ["r9", "Biaya jabatan / biaya pensiun"],
    ["r10", "Iuran terkait pensiun atau hari tua (JHT/JP karyawan)"],
    ["r11", "Jumlah pengurangan (9 s.d. 10)", true],
  ] },
  { title: "PENGHITUNGAN PPh PASAL 21", rows: [
    ["r12", "Jumlah penghasilan neto (8 - 11)"],
    ["r13", "Penghasilan neto masa pajak sebelumnya"],
    ["r14", "Jumlah penghasilan neto untuk penghitungan PPh 21 setahun / disetahunkan"],
    ["r15", "Penghasilan tidak kena pajak (PTKP)"],
    ["r16", "Penghasilan kena pajak setahun / disetahunkan"],
    ["r17", "PPh 21 atas penghasilan kena pajak setahun / disetahunkan"],
    ["r18", "PPh 21 yang telah dipotong masa pajak sebelumnya"],
    ["r19", "PPh 21 terutang", true],
    ["r20", "PPh 21 yang telah dipotong dan dilunasi", true],
  ] },
];

// Teks hanya karakter yang didukung font standar (WinAnsi).
const safe = (s: string | null | undefined) => (s ?? "").replace(/[−–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

export async function build1721A1Pdf(f: Form1721A1) {
  const doc = await PDFDocument.create();
  doc.setTitle(`1721-A1 ${f.employee.name} ${f.year}`);
  doc.setAuthor(f.employer.name);
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, M = 36;
  let y = 841.89 - M;

  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(safe(s), { x, y: yy, size: o.size ?? 8.5, font: o.f ?? font, color: o.color ?? INK });
  const right = (s: string, xr: number, yy: number, o: { size?: number; f?: PDFFont } = {}) => {
    const sz = o.size ?? 8.5, fo = o.f ?? font;
    text(s, xr - fo.widthOfTextAtSize(safe(s), sz), yy, o);
  };
  const center = (s: string, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const sz = o.size ?? 8.5, fo = o.f ?? font;
    text(s, (W - fo.widthOfTextAtSize(safe(s), sz)) / 2, yy, o);
  };
  const hline = (yy: number, thick = 0.6, color = LINE) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: thick, color });
  const box = (x: number, yy: number, w: number, h: number) => page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: INK, borderWidth: 0.8 });

  // Kepala formulir
  box(M, y - 58, W - 2 * M, 58);
  text("FORMULIR 1721-A1", M + 8, y - 14, { f: bold, size: 9 });
  text("Lembar ke-1 untuk Penerima Penghasilan", M + 8, y - 25, { size: 7, color: GREY });
  center("BUKTI PEMOTONGAN PAJAK PENGHASILAN PASAL 21", y - 16, { f: bold, size: 10.5 });
  center("BAGI PEGAWAI TETAP ATAU PENERIMA PENSIUN ATAU THT/JHT BERKALA", y - 29, { f: bold, size: 9 });
  center(`NOMOR: ${f.number}    TAHUN PAJAK: ${f.year}    MASA PEROLEHAN: ${MONTHS[f.monthFrom - 1]} - ${MONTHS[f.monthTo - 1]}`, y - 46, { size: 8 });
  y -= 72;

  // Identitas pemotong
  text("NPWP PEMOTONG", M, y, { f: bold, size: 8 }); text(`: ${f.employer.npwp || "-"}`, M + 120, y);
  y -= 12;
  text("NAMA PEMOTONG", M, y, { f: bold, size: 8 }); text(`: ${f.employer.name || "-"}`, M + 120, y);
  y -= 16;

  const section = (title: string) => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: rgb(0.94, 0.94, 0.95) });
    text(title, M + 6, y, { f: bold, size: 8.5, color: BRAND });
    y -= 17;
  };

  // A. Identitas penerima penghasilan
  section("A. IDENTITAS PENERIMA PENGHASILAN YANG DIPOTONG");
  const ident: [string, string | null | undefined][] = [
    ["1. NPWP", f.employee.npwp], ["2. NIK / No. Paspor", f.employee.nik], ["3. Nama", f.employee.name],
    ["4. Alamat", f.employee.address], ["5. Jenis Kelamin", f.employee.gender], ["6. Status PTKP", f.employee.ptkp],
    ["7. Nama Jabatan", f.employee.position], ["8. ID Karyawan", f.employee.employeeId],
  ];
  for (const [label, val] of ident) {
    text(label, M + 6, y); text(`: ${val || "-"}`, M + 130, y);
    y -= 12;
  }
  y -= 4;

  // B. Rincian penghasilan dan penghitungan PPh 21
  section("B. RINCIAN PENGHASILAN DAN PENGHITUNGAN PPh PASAL 21");
  text("Kode Objek Pajak: 21-100-01 (Pegawai Tetap)", M + 6, y, { size: 7.5, color: GREY });
  right("JUMLAH (Rp)", W - M - 6, y, { f: bold, size: 7.5 });
  y -= 12;
  let no = 0;
  for (const s of ROWS) {
    text(s.title, M + 6, y, { f: bold, size: 7.5, color: GREY });
    y -= 11;
    for (const [k, label, total] of s.rows) {
      no++;
      if (total) page.drawRectangle({ x: M, y: y - 3, width: W - 2 * M, height: 12, color: rgb(0.97, 0.97, 0.98) });
      right(`${no}.`, M + 22, y);
      text(label, M + 28, y, total ? { f: bold } : {});
      right(rp(f.rows[k]), W - M - 6, y, total ? { f: bold } : {});
      y -= 12;
      hline(y + 8, 0.4);
    }
    y -= 3;
  }
  if (f.diff !== 0) {
    text(`${f.diff > 0 ? "PPh 21 lebih dipotong" : "PPh 21 kurang dipotong"}: Rp ${rp(Math.abs(f.diff))}`, M + 6, y, { f: bold, size: 8 });
    y -= 14;
  }
  if (f.prior.length) {
    text("Nomor bukti pemotongan sebelumnya (pemberi kerja sebelumnya):", M + 6, y, { size: 7.5, color: GREY });
    y -= 11;
    for (const p of f.prior) {
      text(`- ${p.slipNumber} (${p.kind}) · ${p.employerName}${p.employerNpwp ? ` · NPWP ${p.employerNpwp}` : ""} · ${MONTHS[p.monthFrom - 1]}${p.monthTo !== p.monthFrom ? ` - ${MONTHS[p.monthTo - 1]}` : ""}`, M + 12, y, { size: 7.5 });
      y -= 10;
    }
    y -= 4;
  }

  // C. Identitas pemotong / penandatangan
  section("C. IDENTITAS PEMOTONG");
  text("1. NPWP / NIK Penandatangan", M + 6, y); text(`: ${f.employer.signerId || "-"}`, M + 150, y);
  y -= 12;
  text("2. Nama Penandatangan", M + 6, y); text(`: ${f.employer.signerName || "-"}`, M + 150, y);
  y -= 12;
  text("3. Tanggal & Tanda Tangan", M + 6, y); text(": ", M + 150, y);
  page.drawRectangle({ x: W - M - 170, y: y - 46, width: 164, height: 56, borderColor: LINE, borderWidth: 0.6 });
  y -= 60;
  hline(y, 0.5);
  y -= 11;
  text("Dokumen ini disusun dari data Proses Gaji portal. Bukti pemotongan resmi diterbitkan melalui sistem Coretax DJP.", M, y, { size: 7, color: GREY });

  // Tanda air untuk tahun yang belum selesai.
  if (!f.final) watermark(page, bold);
  return doc.save();
}

function watermark(page: PDFPage, bold: PDFFont) {
  page.drawText("SEMENTARA", { x: 120, y: 300, size: 92, font: bold, color: rgb(0.85, 0.2, 0.25), opacity: 0.12, rotate: degrees(35) });
  page.drawText("Belum akhir tahun pajak - bukan bukti potong final", { x: 36, y: 20, size: 8, font: bold, color: rgb(0.75, 0.2, 0.25) });
}
