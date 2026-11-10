import { prisma } from "@/lib/prisma";
import type { LineItem } from "@/lib/payroll-run";
import type { PayParams } from "@/lib/payroll";
import { pasal17, ptkpOf, taxYearConfig } from "@/lib/pph21";
import { getPayrollSettings, getTaxSettings } from "@/lib/payroll-settings";

// Bukti Pemotongan PPh 21 Pegawai Tetap (formulir 1721-A1 / BPA1) per tahun, disusun dari Proses Gaji
// bulanan yang sudah FINAL. Tersedia setelah proses akhir tahun selesai: Proses Gaji Desember tahun itu
// FINAL, atau (karyawan yang keluar) bulan terakhirnya sudah FINAL.
// Penghasilan dikelompokkan menurut kategori pajak komponen (PayComponent.category).

export type A1Rows = {
  r1: number; r2: number; r3: number; r4: number; r5: number; r6: number; r7: number; r8: number; // penghasilan bruto
  r9: number; r10: number; r11: number; // pengurang
  r12: number; r13: number; r14: number; r15: number; r16: number; r17: number; r18: number; r19: number; r20: number; // PPh 21
};
export type Form1721A1 = {
  year: number; number: string; monthFrom: number; monthTo: number;
  employer: { name: string; npwp: string; signerName: string; signerId: string };
  employee: { name: string; employeeId: string | null; npwp: string | null; nik: string | null; address: string | null; gender: string | null; ptkp: string; position: string | null };
  rows: A1Rows; diff: number; // diff = r20 - r19 (positif = lebih dipotong)
};

const ROW_OF: Record<string, keyof A1Rows> = {
  GAJI: "r1", TUNJANGAN_PPH: "r2", TUNJANGAN_LAIN: "r3", HONORARIUM: "r4", PREMI_ASURANSI: "r5", NATURA: "r6", BONUS_THR: "r7",
};

// Tahun yang 1721-A1-nya sudah bisa dilihat karyawan.
export async function availableYears(userId: string) {
  const [lines, user] = await Promise.all([
    prisma.payrollLine.findMany({ where: { userId, run: { status: "FINAL", frequency: "BULANAN" } }, select: { run: { select: { period: true } } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { resignDate: true } }),
  ]);
  const periods = new Set(lines.map((l) => l.run.period));
  const decFinal = new Set((await prisma.payrollRun.findMany({ where: { status: "FINAL", frequency: "BULANAN", period: { endsWith: "-12" } }, select: { period: true } })).map((r) => r.period.slice(0, 4)));
  const years = [...new Set([...periods].map((p) => p.slice(0, 4)))].filter((y) => {
    if (decFinal.has(y)) return true;
    // Keluar di tengah tahun: tersedia setelah bulan keluarnya final.
    const r = user?.resignDate;
    return !!r && String(r.getUTCFullYear()) === y && periods.has(r.toISOString().slice(0, 7));
  });
  return years.map(Number).sort((a, b) => b - a);
}

export async function build1721A1(userId: string, year: number): Promise<Form1721A1 | null> {
  if (!(await availableYears(userId)).includes(year)) return null;
  const [user, lines, components, settings, taxAll] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, employeeId: true, employeeNo: true, npwp: true, ktpNumber: true, address: true, gender: true, ptkpStatus: true, position: true } }),
    prisma.payrollLine.findMany({
      where: { userId, run: { status: "FINAL", frequency: "BULANAN", period: { startsWith: `${year}-` } } },
      select: { gross: true, pph21: true, items: true, run: { select: { period: true } } }, orderBy: { run: { period: "asc" } },
    }),
    prisma.payComponent.findMany({ select: { code: true, category: true, params: true } }),
    getPayrollSettings(),
    getTaxSettings(),
  ]);
  if (!user || !lines.length) return null;
  const cfg = taxYearConfig(taxAll, year);
  const catOf = new Map(components.map((c) => [c.code, c.category]));
  const reduces = new Set(components.filter((c) => (c.params as PayParams | null)?.reducesGross).map((c) => c.code));
  const pensionCodes = new Set(["JHTK", "JPK", ...components.filter((c) => c.category === "IURAN_PENSIUN").map((c) => c.code)]);

  const rows: A1Rows = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0, r13: 0, r14: 0, r15: 0, r16: 0, r17: 0, r18: 0, r19: 0, r20: 0 };
  for (const l of lines) {
    for (const i of l.items as LineItem[]) {
      if (i.taxable && (i.kind === "PENDAPATAN" || i.kind === "BENEFIT")) {
        const row = i.code === "TPPH" ? "r2" : ROW_OF[catOf.get(i.code) ?? ""] ?? (i.code === "GP" ? "r1" : "r3");
        rows[row] += i.amount;
      } else if (i.kind === "POTONGAN" && (catOf.get(i.code) === "GAJI" || reduces.has(i.code))) {
        rows.r1 -= i.amount; // potongan yang mengurangi bruto (mis. mangkir) mengurangi gaji
      }
      if (pensionCodes.has(i.code)) rows.r10 += i.amount;
    }
    rows.r20 += l.pph21;
  }
  // Bruto mengikuti angka PPh 21 di Proses Gaji; selisih pembulatan masuk tunjangan lainnya.
  const gross = lines.reduce((a, l) => a + l.gross, 0);
  const parts = rows.r1 + rows.r2 + rows.r3 + rows.r4 + rows.r5 + rows.r6 + rows.r7;
  rows.r3 += Math.round(gross - parts);
  rows.r8 = Math.round(gross);
  const months = lines.length;
  rows.r9 = Math.round(Math.min((rows.r8 * cfg.jobCostRate) / 100, cfg.jobCostMaxMonthly * months));
  rows.r10 = Math.round(rows.r10);
  rows.r11 = rows.r9 + rows.r10;
  rows.r12 = rows.r8 - rows.r11;
  rows.r13 = 0; // neto dari pemberi kerja sebelumnya (belum dicatat portal)
  rows.r14 = rows.r12 + rows.r13;
  rows.r15 = ptkpOf(user.ptkpStatus, cfg);
  rows.r16 = Math.max(0, Math.floor((rows.r14 - rows.r15) / 1000) * 1000);
  rows.r17 = pasal17(rows.r16, cfg);
  rows.r18 = 0; // PPh 21 dari bukti potong pemberi kerja sebelumnya
  rows.r19 = Math.max(0, rows.r17 - rows.r18);
  rows.r20 = Math.round(rows.r20);
  for (const k of Object.keys(rows) as (keyof A1Rows)[]) rows[k] = Math.round(rows[k]);

  const first = Number(lines[0].run.period.slice(5, 7));
  const last = Number(lines[lines.length - 1].run.period.slice(5, 7));
  return {
    year, monthFrom: first, monthTo: last,
    number: `1.1-${String(last).padStart(2, "0")}.${String(year).slice(2)}-${String(user.employeeNo ?? 0).padStart(7, "0")}`,
    employer: { name: settings.companyName, npwp: settings.companyNpwp, signerName: settings.signerName, signerId: settings.signerId },
    employee: { name: user.name, employeeId: user.employeeId, npwp: user.npwp, nik: user.ktpNumber, address: user.address, gender: user.gender, ptkp: user.ptkpStatus ?? "TK/0", position: user.position },
    rows, diff: rows.r20 - rows.r19,
  };
}
