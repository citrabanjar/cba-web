// Bukti potong PPh 21 dari pemberi kerja sebelumnya (karyawan pindahan di tahun pajak yang sama).
// Neto per bukti potong: isian neto bila ada; bila kosong = bruto − biaya jabatan (5%, maks per bulan sesuai
// pengaturan tahun itu × jumlah bulan masa). Total neto & PPh dipakai di hitung ulang masa pajak terakhir dan 1721-A1.
import { prisma } from "@/lib/prisma";
import type { TaxYearConfig } from "@/lib/pph21";

export type PriorSlip = {
  id: string; userId: string; year: number; employerName: string; employerNpwp: string | null; slipNumber: string; kind: string;
  monthFrom: number; monthTo: number; gross: number; net: number | null; pph21: number; note: string | null;
};

export function slipNet(s: { gross: number; net: number | null; monthFrom: number; monthTo: number }, cfg: TaxYearConfig) {
  if (s.net !== null && s.net !== undefined) return s.net;
  const months = Math.max(1, s.monthTo - s.monthFrom + 1);
  return Math.round(s.gross - Math.min((s.gross * cfg.jobCostRate) / 100, cfg.jobCostMaxMonthly * months));
}

export async function priorSlips(userIds: string[] | null, year: number) {
  return prisma.priorTaxSlip.findMany({
    where: { year, ...(userIds ? { userId: { in: userIds } } : {}) },
    orderBy: [{ monthFrom: "asc" }, { createdAt: "asc" }],
  });
}

// Total neto & PPh pemotongan sebelumnya per karyawan.
export function priorTotals(slips: { userId: string; gross: number; net: number | null; monthFrom: number; monthTo: number; pph21: number }[], cfg: TaxYearConfig) {
  const out = new Map<string, { net: number; pph21: number }>();
  for (const s of slips) {
    const t = out.get(s.userId) ?? { net: 0, pph21: 0 };
    t.net += slipNet(s, cfg); t.pph21 += s.pph21;
    out.set(s.userId, t);
  }
  return out;
}
