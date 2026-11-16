// Alur pengajuan pinjaman karyawan (keputusan pemilik 2026-11-16):
// 1. Atasan langsung menyetujui / menolak.
// 2. Disetujui atasan → Admin Pinjaman memeriksa dokumen fisik dan menyusun angsuran (pimpinan puncak mendapat kabar,
//    tetapi belum bisa memutus).
// 3. Admin mengirim hasil pemeriksaan → pimpinan puncak menyetujui / menolak. Disetujui = tabel angsuran dibuat (menunggu pencairan).
import type { EmployeeLoan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatRupiah } from "@/lib/utils";
import { canEditMenu } from "@/lib/roles";
import { buildSchedule, buildScheduleByAmount, isPeriod, unpaidTotal, type LoanPlan } from "@/lib/loans";

const rp = (n: number) => formatRupiah(Math.round(n));

// Atasan langsung yang aktif.
export async function activeManager(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { manager: { select: { id: true, name: true, isActive: true } } } });
  return u?.manager?.isActive && u.manager.id !== userId ? { id: u.manager.id, name: u.manager.name } : null;
}

// Pimpinan puncak pemohon: naik terus lewat atasan (yang aktif) sampai orang yang tidak punya atasan lagi.
export async function topLeaderOf(userId: string) {
  const seen = new Set([userId]);
  let cur = await activeManager(userId);
  while (cur) {
    seen.add(cur.id);
    const up = await activeManager(cur.id);
    if (!up || seen.has(up.id)) return cur;
    cur = up;
  }
  return null;
}

// Admin yang memeriksa pengajuan pinjaman: Admin dengan hak Edit menu Pinjaman.
export async function loanAdmins() {
  const list = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true, role: true, menuAccess: true } });
  return list.filter((u) => canEditMenu(u, "pinjaman")).map((u) => u.id);
}

export type PlanInput = { principal: number; tenor: number; startPeriod: string; installment?: number; mergeIds?: string[] };

// Hitung rencana angsuran (dipakai saat Admin mengirim hasil pemeriksaan dan dihitung ulang saat pimpinan menyetujui).
// Opsi gabung: sisa pinjaman berjalan (dipilih) ditambahkan ke pinjaman baru menjadi satu pinjaman.
export async function planLoan(loan: EmployeeLoan, input: PlanInput, allowOpening: boolean) {
  const cash = Math.round(Number(input.principal) || 0);
  if (cash < 1000) return { error: "Jumlah pinjaman wajib diisi." } as const;
  if (!isPeriod(input.startPeriod)) return { error: "Periode potongan pertama tidak valid." } as const;
  const mergeIds = [...new Set(input.mergeIds ?? [])];
  const running = await prisma.employeeLoan.findMany({ where: { userId: loan.userId, status: "BERJALAN" }, include: { installments: true }, orderBy: { seqNo: "asc" } });
  const olds = running.filter((o) => mergeIds.includes(o.id));
  if (olds.length !== mergeIds.length) return { error: "Pinjaman yang digabung sudah berubah (bukan lagi pinjaman berjalan milik karyawan ini). Minta Admin memeriksa ulang." } as const;
  if (olds.some((o) => o.isOpening) && !allowOpening) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." } as const;
  const moved = olds.map((o) => ({ o, rest: unpaidTotal(o.installments) }));
  const total = cash + moved.reduce((a, m) => a + m.rest, 0);
  const each = Math.round(Number(input.installment) || 0);
  let rows;
  if (each > 0) {
    if (each < 1000) return { error: "Potongan per bulan minimal Rp1.000." } as const;
    rows = buildScheduleByAmount(total, each, input.startPeriod);
  } else {
    const n = Math.round(Number(input.tenor) || 0);
    if (n < 1) return { error: "Isi potongan per bulan atau jumlah angsuran." } as const;
    rows = buildSchedule(total, n, input.startPeriod);
  }
  if (rows.length > 120) return { error: "Jumlah angsuran paling banyak 120 kali; naikkan potongan per bulan." } as const;
  // Potongan pinjaman per bulan sebelum → sesudah (angsuran pertama yang belum terpotong tiap pinjaman berjalan).
  const monthly = (o: (typeof running)[number]) => [...o.installments].filter((i) => i.status !== "LUNAS").sort((a, b) => a.period.localeCompare(b.period))[0]?.amount ?? 0;
  const before = running.reduce((a, o) => a + monthly(o), 0);
  const after = rows[0].amount + running.filter((o) => !mergeIds.includes(o.id)).reduce((a, o) => a + monthly(o), 0);
  const plan: LoanPlan = {
    principal: cash, tenor: Number(input.tenor) || rows.length, startPeriod: input.startPeriod, ...(each > 0 ? { installment: each } : {}), mergeIds,
    total, count: rows.length, first: rows[0].amount, last: rows[rows.length - 1].amount, endPeriod: rows[rows.length - 1].period,
    merged: moved.map((m) => `Pinjaman ke-${m.o.seqNo} sisa ${rp(m.rest)}`), before, after,
  };
  return { cash, moved, total, rows, plan } as const;
}

// Terapkan rencana: pinjaman lama yang digabung ditutup (DIGABUNG), pinjaman ini DISETUJUI dengan tabel angsurannya.
export async function applyPlan(loan: EmployeeLoan, p: Exclude<Awaited<ReturnType<typeof planLoan>>, { error: string }>, approvedBy: string | null, extra: object, note: string) {
  const mergeNote = p.moved.length ? `Gabungan: ${p.plan.merged.join(", ")} + dana baru ${rp(p.cash)}.` : "";
  await prisma.$transaction([
    ...p.moved.flatMap((m) => [
      prisma.loanInstallment.deleteMany({ where: { loanId: m.o.id, status: { not: "LUNAS" } } }),
      prisma.employeeLoan.update({
        where: { id: m.o.id },
        data: { status: "DIGABUNG", note: [m.o.note, `Lunas melalui penggabungan: sisa ${rp(m.rest)} dipindahkan ke Pinjaman ke-${loan.seqNo}.`].filter(Boolean).join(" ") },
      }),
    ]),
    prisma.employeeLoan.update({
      where: { id: loan.id },
      data: {
        principal: p.total, tenor: p.rows.length, startPeriod: p.plan.startPeriod, status: "DISETUJUI", stage: null,
        note: [mergeNote, note.trim()].filter(Boolean).join(" ") || null,
        originalAmount: p.moved.length ? p.cash : null, approvedBy, approvedAt: new Date(), ...extra,
      },
    }),
    prisma.loanInstallment.createMany({ data: p.rows.map((r) => ({ ...r, loanId: loan.id })) }),
  ]);
}
