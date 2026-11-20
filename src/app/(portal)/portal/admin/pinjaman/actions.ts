"use server";

import { revalidatePath } from "next/cache";
import { notify } from "@/lib/notify";
import { formatRupiah } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { canEditMenu, isSuperAdmin } from "@/lib/roles";
import { buildSchedule, buildScheduleByAmount, isPeriod, readLoanFlow } from "@/lib/loans";
import { planLoan, topLeaderOf, type PlanInput } from "@/lib/loan-flow";
import { routeTo } from "@/lib/delegation";
import { nextLoanNo } from "@/lib/loan-view";
import { holdForApproval } from "@/lib/approval-hold";
import { TRANSFER_SETTING_KEY, TRANSFER_TEMPLATES, buildKopra } from "@/lib/bank-transfer";

const PATH = "/portal/admin/pinjaman";
// proposed = perubahan ditahan untuk approval (aturan Peran Admin): berisi nama approver.
type Result = { error?: string; proposed?: string };
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const loanLabel = (l: { seqNo?: number | null; principal: number; user?: { name: string } | null }) =>
  `${l.user?.name ?? ""} · pinjaman${l.seqNo ? ` #${l.seqNo}` : ""} ${rp(l.principal)}`;

// Pinjaman dikelola Admin dan Super Admin; upload saldo awal migrasi hanya Super Admin.
async function requireAdmin() {
  const access = await getAccess();
  if (!access || !canEditMenu(access, "pinjaman")) throw new Error("Anda hanya punya hak lihat di menu ini.");
  return access;
}
const refresh = (userId?: string) => {
  revalidatePath(PATH);
  revalidatePath("/portal/pinjaman");
  revalidatePath("/portal/dashboard");
  if (userId) revalidatePath(`/portal/admin/karyawan/${userId}`);
};
const terms = (principal: number, tenor: number, startPeriod: string) => {
  const p = Math.round(Number(principal) || 0), n = Math.round(Number(tenor) || 0);
  if (p < 1000) return { error: "Jumlah pinjaman wajib diisi." } as const;
  if (n < 1 || n > 120) return { error: "Jumlah angsuran 1-120 kali." } as const;
  if (!isPeriod(startPeriod)) return { error: "Periode potongan pertama tidak valid." } as const;
  return { p, n } as const;
};

// Pemeriksaan Admin: setelah dokumen fisik dicek, Admin menyusun angsuran (jumlah, tenor, periode mulai boleh disesuaikan,
// boleh digabung dengan pinjaman berjalan) lalu mengirimnya ke pimpinan puncak. Keputusan setuju / tolak ada di pimpinan puncak.
export async function submitLoanReview(id: string, input: PlanInput & { note: string }): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!loan || loan.status !== "PENDING" || (loan.stage && loan.stage !== "ADMIN")) return { error: "Pengajuan ini tidak sedang dalam pemeriksaan Admin." };
  // Menggabungkan saldo awal migrasi lewat pengajuan karyawan (hitung ulang angsuran) boleh oleh Admin;
  // mengubah / membatalkan saldo awal secara langsung tetap khusus Super Admin.
  const p = await planLoan(loan, input, true);
  if ("error" in p) return { error: p.error };
  const flow = readLoanFlow(loan.flow);
  // Workflow: hanya pemeriksa dokumen yang ditetapkan (level Pemeriksa dokumen) yang boleh memeriksa.
  if (flow.checkIds?.length && !flow.checkIds.includes(access.id) && !isSuperAdmin(access.role)) {
    return { error: `Pemeriksa dokumen pengajuan ini adalah ${flow.checkName ?? "pemeriksa pada Workflow"}.` };
  }
  // Pengajuan lama (sebelum alur baru) belum punya pimpinan puncak.
  const top = flow.topId ? { id: flow.topId, name: flow.topName ?? "" } : await topLeaderOf(loan.userId);
  if (!top) return { error: "Pimpinan puncak karyawan ini tidak ditemukan. Lengkapi atasan langsung di data karyawan." };
  // Pemutus yang sedang cuti dengan delegasi → keputusan dialihkan ke delegasinya.
  const tops = flow.topIds?.length ? flow.topIds : [top.id];
  const routed = await Promise.all(tops.map(async (tid) => {
    const u = await prisma.user.findUnique({ where: { id: tid }, select: { name: true } });
    return routeTo({ id: tid, name: u?.name ?? top.name }, loan.userId);
  }));
  const topIds = [...new Set(routed.map((r) => r.id))];
  const topName = routed.length === 1 ? (routed[0].from ? `${flow.topName ?? routed[0].from} · delegasi: ${routed[0].name}` : flow.topName ?? routed[0].name) : flow.topName ?? top.name;
  await prisma.employeeLoan.update({
    where: { id },
    data: {
      stage: "PIMPINAN",
      flow: { ...flow, topId: topIds[0], topIds, topName, who: [...new Set([...(flow.who ?? []), ...topIds])], adminId: access.id, adminName: access.name ?? "Admin", adminAt: new Date().toISOString(), adminNote: input.note.trim(), plan: p.plan },
    },
  });
  await notify(loan.userId, "Pengajuan pinjaman sudah diperiksa Admin", `${formatRupiah(loan.principal)} · Menunggu keputusan pimpinan.`, "/portal/pinjaman");
  refresh(loan.userId);
  revalidatePath("/portal/notifikasi");
  return {};
}

// Tandai uang pinjaman sudah diberikan ke karyawan (manual). Sejak itu angsuran ikut dipotong di Proses Gaji.
export async function markDisbursed(id: string, date: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "DISETUJUI") return { error: "Hanya pinjaman yang sudah disetujui yang bisa dicairkan." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Tanggal pencairan wajib diisi." };
  await prisma.employeeLoan.update({
    where: { id }, data: { status: "BERJALAN", disbursedAt: new Date(`${date}T00:00:00Z`), disbursedBy: access.name ?? null },
  });
  await notify(loan.userId, "Pinjaman sudah dicairkan", `${formatRupiah(loan.principal)} · dicairkan ${date.split("-").reverse().join("-")}. Angsuran mulai dipotong dari gaji.`, "/portal/pinjaman");
  refresh(loan.userId);
  return {};
}

// Simpan ulang angsuran yang belum terpotong. Angsuran yang sudah terpotong lewat Proses Gaji tidak bisa diubah;
// total sisa angsuran harus sama dengan sisa pinjaman.
export async function saveSchedule(loanId: string, rows: { period: string; amount: number }[]): Promise<Result> {
  await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId }, include: { installments: true, user: { select: { name: true } } } });
  if (!loan || !["DISETUJUI", "BERJALAN"].includes(loan.status)) return { error: "Hanya pinjaman disetujui atau berjalan yang bisa diubah." };
  const paid = loan.installments.filter((i) => i.status === "LUNAS");
  const remaining = loan.principal - paid.reduce((a, i) => a + i.amount, 0);
  const clean = rows.map((r) => ({ period: r.period, amount: Math.round(Number(r.amount) || 0) })).filter((r) => r.amount > 0);
  if (clean.some((r) => !isPeriod(r.period))) return { error: "Periode angsuran tidak valid." };
  const total = clean.reduce((a, r) => a + r.amount, 0);
  if (Math.round(total) !== Math.round(remaining)) {
    return { error: `Total angsuran (Rp ${total.toLocaleString("id-ID")}) harus sama dengan sisa pinjaman (Rp ${Math.round(remaining).toLocaleString("id-ID")}).` };
  }
  const sorted = [...clean].sort((a, b) => a.period.localeCompare(b.period));
  const unpaid = loan.installments.filter((i) => i.status !== "LUNAS").sort((a, b) => a.period.localeCompare(b.period));
  const sched = (list: { period: string; amount: number }[]) => list.map((r) => `${r.period} ${rp(r.amount)}`).join(", ") || "-";
  const held = await holdForApproval({
    kind: "pinjaman.saveSchedule", args: [loanId, rows], targetUserId: loan.userId, title: `Pinjaman: ubah angsuran ${loanLabel(loan)}`,
    details: [{ field: "Sisa angsuran", oldValue: sched(unpaid), newValue: sched(sorted) }],
  });
  if (held) return held;
  const lastSeq = paid.reduce((m, i) => Math.max(m, i.seq), 0);
  await prisma.$transaction([
    prisma.loanInstallment.deleteMany({ where: { loanId, status: { not: "LUNAS" } } }),
    prisma.loanInstallment.createMany({ data: sorted.map((r, i) => ({ loanId, seq: lastSeq + i + 1, period: r.period, amount: r.amount })) }),
    prisma.employeeLoan.update({ where: { id: loanId }, data: { tenor: paid.length + sorted.length, ...(sorted.length ? {} : { status: "LUNAS" }) } }),
  ]);
  refresh(loan.userId);
  return {};
}

// Batalkan pinjaman yang belum ada angsuran terpotong. Saldo awal migrasi hanya bisa dibatalkan Super Admin.
export async function cancelLoan(id: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { installments: true, user: { select: { name: true } } } });
  if (!loan || !["DISETUJUI", "BERJALAN"].includes(loan.status)) return { error: "Pinjaman tidak bisa dibatalkan." };
  if (loan.isOpening && !isSuperAdmin(access.role)) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." };
  if (loan.installments.some((i) => i.status === "LUNAS")) return { error: "Sudah ada angsuran terpotong; ubah sisa angsuran saja." };
  const held = await holdForApproval({
    kind: "pinjaman.cancelLoan", args: [id], targetUserId: loan.userId, title: `Pinjaman: batalkan ${loanLabel(loan)}`,
    details: [{ field: "Status pinjaman", oldValue: loan.status === "BERJALAN" ? "Berjalan" : "Disetujui", newValue: "Batal" }],
  });
  if (held) return held;
  await prisma.employeeLoan.update({ where: { id }, data: { status: "BATAL" } });
  refresh(loan.userId);
  return {};
}

// Hapus permanen pinjaman yang dibatalkan atau ditolak (tidak pernah ada angsuran terpotong).
// Saldo awal migrasi hanya bisa dihapus Super Admin.
export async function deleteLoan(id: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { installments: true, user: { select: { name: true } } } });
  if (!loan || !["BATAL", "DITOLAK"].includes(loan.status)) return { error: "Hanya pinjaman yang dibatalkan atau ditolak yang bisa dihapus." };
  if (loan.isOpening && !isSuperAdmin(access.role)) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." };
  if (loan.installments.some((i) => i.status === "LUNAS")) return { error: "Pinjaman ini punya angsuran terpotong, tidak bisa dihapus." };
  // Menghapus pengajuan ditolak / dibatalkan hanya merapikan daftar (tidak ada uang atau angsuran): langsung, tanpa approval.
  await prisma.employeeLoan.delete({ where: { id } });
  refresh(loan.userId);
  return {};
}

// Upload saldo awal migrasi (Super Admin): sisa pinjaman dan sisa angsuran per karyawan dari aplikasi lama.
// Langsung berjalan karena uangnya sudah dicairkan di aplikasi lama.
export type OpeningRow = { employeeId: string; remaining: number; tenor: number; installment?: number | null; startPeriod: string; original: number | null; note: string };
export async function importOpeningLoans(rows: OpeningRow[]): Promise<Result & { count?: number; errors?: string[] }> {
  const access = await requireAdmin();
  const users = await prisma.user.findMany({ where: { employeeId: { in: rows.map((r) => r.employeeId.trim()) } }, select: { id: true, employeeId: true } });
  const byId = new Map(users.map((u) => [u.employeeId!.toLowerCase(), u.id]));
  const errors: string[] = [];
  const ready: { userId: string; p: number; schedule: ReturnType<typeof buildSchedule>; r: OpeningRow }[] = [];
  rows.forEach((r, i) => {
    const userId = byId.get(r.employeeId.trim().toLowerCase());
    const each = Math.round(Number(r.installment) || 0);
    const p = Math.round(Number(r.remaining) || 0);
    // Angsuran per bulan tetap (seperti aplikasi lama): jumlah angsuran mengikuti, sisanya di angsuran terakhir.
    const tm = each > 0 ? terms(p, Math.ceil(p / each - 1e-9), r.startPeriod) : terms(r.remaining, r.tenor, r.startPeriod);
    if (!userId) errors.push(`Baris ${i + 2}: Employee ID ${r.employeeId} tidak ditemukan`);
    else if (each > 0 && each < 1000) errors.push(`Baris ${i + 2}: Angsuran per bulan minimal 1.000`);
    else if ("error" in tm) errors.push(`Baris ${i + 2}: ${tm.error}`);
    else ready.push({ userId, p: tm.p, r, schedule: each > 0 ? buildScheduleByAmount(tm.p, each, r.startPeriod) : buildSchedule(tm.p, tm.n, r.startPeriod) });
  });
  if (errors.length) return { error: "Ada baris yang belum benar; tidak ada yang disimpan.", errors };
  const held = await holdForApproval({
    kind: "pinjaman.importOpeningLoans", args: [rows], title: `Pinjaman: upload saldo awal pinjaman (${ready.length} pinjaman)`,
    details: [
      { field: "Saldo awal pinjaman", oldValue: null, newValue: `${ready.length} pinjaman, ${new Set(ready.map((x) => x.userId)).size} karyawan` },
      { field: "Total sisa pinjaman", oldValue: null, newValue: rp(ready.reduce((a, x) => a + x.p, 0)) },
    ],
  });
  if (held) return held;
  for (const x of ready) {
    await prisma.employeeLoan.create({
      data: {
        userId: x.userId, seqNo: await nextLoanNo(x.userId), principal: x.p, tenor: x.schedule.length, startPeriod: x.r.startPeriod,
        purpose: x.r.note.trim() || "Saldo awal migrasi", status: "BERJALAN", isOpening: true,
        originalAmount: Number(x.r.original) > 0 ? Number(x.r.original) : null,
        createdBy: access.name ?? null, approvedBy: access.name ?? null, approvedAt: new Date(),
        installments: { create: x.schedule },
      },
    });
  }
  refresh();
  return { count: ready.length };
}

// ---- Pencairan lewat file transfer bank (SOP pemilik 2026-11-20) ----
// 1. Admin memilih beberapa pinjaman "Menunggu pencairan" → file transfer (template bank) → status Proses transfer,
//    tanggal transfer dicatat sebagai tanggal cair, karyawan menerima notifikasi dengan tombol Sudah terima.
// 2. Karyawan klik Sudah terima → pinjaman Berjalan (angsuran dipotong). Proses Gaji tertahan selama angsurannya jatuh tempo.
// 3. Kendala konfirmasi diambil alih Super Admin (cek transaksi di bank): konfirmasi paksa, atau batalkan transfer
//    (kembali ke Menunggu pencairan). Selebihnya SOP manual, tidak diotomasi.
export async function buildLoanTransferFile(ids: string[], input: { template: string; date: string; debitAccount: string }):
  Promise<{ error?: string; fileName?: string; content?: string; count?: number; total?: number; other?: number; cash?: string[] }> {
  const access = await requireAdmin();
  if (!TRANSFER_TEMPLATES.some((t) => t.key === input.template)) return { error: "Template transfer tidak dikenal." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Isi tanggal transfer." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  if (input.date < today) return { error: "Tanggal transfer tidak boleh sebelum hari ini." };
  let loans = await prisma.employeeLoan.findMany({
    where: { id: { in: ids }, status: "DISETUJUI" },
    include: { user: { select: { name: true, employeeId: true, bankName: true, bankAccount: true, bankHolder: true, email: true } } },
  });
  if (!loans.length) return { error: "Pilih pinjaman yang menunggu pencairan." };
  // Karyawan Cash dilewati: tetap Menunggu pencairan, dicairkan tunai lewat Tandai Dicairkan.
  const cashLoans = loans.filter((l) => (l.user.bankName ?? "").trim().toLowerCase() === "cash");
  const cash = cashLoans.map((l) => `${l.user.name}${l.user.employeeId ? ` (${l.user.employeeId})` : ""}`);
  loans = loans.filter((l) => !cashLoans.includes(l));
  if (!loans.length) return { error: "Semua pinjaman yang dipilih milik karyawan Cash; cairkan tunai lewat Tandai Dicairkan." };
  const rows = loans.map((l) => ({
    name: l.user.name, employeeId: l.user.employeeId, bankName: l.user.bankName, account: l.user.bankAccount, holder: l.user.bankHolder,
    email: l.user.email, amount: l.principal, remark: `Pinjaman${l.seqNo ? ` ke-${l.seqNo}` : ""} ${l.user.name}`,
  }));
  const r = buildKopra(rows, { date: input.date, debitAccount: input.debitAccount, remark: "Pinjaman karyawan", code: "PINJ" });
  if ("errors" in r) return { error: r.errors.slice(0, 15).join("\n") + (r.errors.length > 15 ? `\n… dan ${r.errors.length - 15} lainnya.` : "") };
  const debit = input.debitAccount.replace(/\D/g, "");
  const day = new Date(`${input.date}T00:00:00Z`);
  await prisma.$transaction([
    prisma.employeeLoan.updateMany({ where: { id: { in: loans.map((l) => l.id) }, status: "DISETUJUI" }, data: { status: "TRANSFER", disbursedAt: day, disbursedBy: access.name ?? null } }),
    prisma.appSetting.upsert({
      where: { key: TRANSFER_SETTING_KEY },
      create: { key: TRANSFER_SETTING_KEY, value: { debitAccount: debit }, updatedBy: access.name ?? null },
      update: { value: { debitAccount: debit }, updatedBy: access.name ?? null },
    }),
  ]);
  const dmy = input.date.split("-").reverse().join("-");
  for (const l of loans) {
    await notify(l.userId, "Dana pinjaman ditransfer",
      `${formatRupiah(l.principal)} · ditransfer ${dmy} ke rekening ${l.user.bankName ?? ""}. Sebelum konfirmasi, pastikan dana pinjaman Anda sudah terima.`,
      `/portal/pinjaman?terima=${l.id}`);
  }
  for (const l of loans) refresh(l.userId);
  return { fileName: `KOPRA Pinjaman - ${input.date.replace(/-/g, "")}.txt`, content: r.content, count: r.count, total: r.total, other: r.other, cash };
}

// Karyawan (atau Super Admin, konfirmasi paksa) mengonfirmasi dana pinjaman sudah diterima → pinjaman Berjalan.
export async function confirmLoanReceived(id: string): Promise<Result> {
  const access = await getAccess();
  if (!access) return { error: "Silakan masuk kembali." };
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "TRANSFER") return { error: "Pinjaman ini tidak sedang menunggu konfirmasi." };
  const self = loan.userId === access.id;
  if (!self && !isSuperAdmin(access.role)) return { error: "Konfirmasi paksa hanya bisa dilakukan Super Admin." };
  const flow = readLoanFlow(loan.flow);
  await prisma.employeeLoan.update({
    where: { id },
    data: { status: "BERJALAN", flow: { ...flow, received: { at: new Date().toISOString(), by: access.name ?? "", self } } as never },
  });
  if (!self) await notify(loan.userId, "Pinjaman aktif", `${formatRupiah(loan.principal)} · penerimaan dana dikonfirmasi ${access.name ?? "Super Admin"}. Angsuran mulai dipotong dari gaji.`, "/portal/pinjaman");
  refresh(loan.userId);
  revalidatePath("/portal/notifikasi");
  return {};
}

// Transfer gagal / batal di bank → kembali ke Menunggu pencairan (tanggal cair dihapus).
export async function cancelLoanTransfer(id: string): Promise<Result> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Membatalkan transfer hanya bisa dilakukan Super Admin." };
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "TRANSFER") return { error: "Pinjaman ini tidak sedang dalam proses transfer." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "DISETUJUI", disbursedAt: null, disbursedBy: null } });
  await notify(loan.userId, "Transfer pinjaman dibatalkan", `${formatRupiah(loan.principal)} · transfer dibatalkan dan akan dijadwalkan ulang.`, "/portal/pinjaman");
  refresh(loan.userId);
  revalidatePath("/portal/notifikasi");
  return {};
}

export async function getLoanTransferDebit(): Promise<string> {
  await requireAdmin();
  const row = await prisma.appSetting.findUnique({ where: { key: TRANSFER_SETTING_KEY } });
  return String((row?.value as { debitAccount?: unknown } | null)?.debitAccount ?? "");
}
