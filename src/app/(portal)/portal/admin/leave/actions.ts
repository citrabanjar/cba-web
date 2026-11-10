"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { LEAVE_BALANCE_KEY } from "@/lib/leave-balance";
import { isLeaveCategory, isLeavePeriod, isLeaveUnit, type LeavePolicyInput } from "@/lib/leave";

const PATH = "/portal/admin/leave";
type Result = { error?: string };

async function requireAdmin() {
  const access = await getAccess();
  if (!access || !hasMenu(access, "karyawan")) throw new Error("Unauthorized");
  return access;
}

const int = (v: unknown, min = 0, max = 9999) => Math.max(min, Math.min(max, Math.trunc(Number(v) || 0)));
const text = (v: string | null | undefined) => (v ?? "").trim() || null;

export async function saveLeavePolicy(id: string | null, input: LeavePolicyInput): Promise<Result> {
  const access = await requireAdmin();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) return { error: "Kode 1-8 huruf/angka, tanpa spasi." };
  if (!name) return { error: "Nama wajib diisi." };
  if (!isLeaveCategory(input.category)) return { error: "Kategori tidak valid." };
  if (!isLeaveUnit(input.unit) || !isLeavePeriod(input.period)) return { error: "Satuan tidak valid." };
  const expiry = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(input.carryOverExpiry ?? "") ? input.carryOverExpiry : null;
  if (input.carryOverExpires && !expiry) return { error: "Tanggal batas sisa bawaan belum diisi." };
  const clash = await prisma.leavePolicy.findFirst({ where: { code, NOT: id ? { id } : undefined }, select: { id: true } });
  if (clash) return { error: "Kode sudah dipakai jenis cuti lain." };

  const data = {
    code, name, category: input.category,
    quota: input.quota === null || Number.isNaN(input.quota) ? null : int(input.quota, 0, 999),
    unit: input.unit, period: input.period,
    minServiceMonths: int(input.minServiceMonths, 0, 600),
    gender: input.gender === "P" || input.gender === "L" ? input.gender : null,
    forStatus: input.forStatus === "TETAP" || input.forStatus === "KONTRAK" ? input.forStatus : null,
    accrualPerMonth: Math.max(0, Math.min(31, Math.round((Number(input.accrualPerMonth) || 0) * 100) / 100)),
    paid: !!input.paid, payNote: text(input.payNote), deductsAnnual: !!input.deductsAnnual,
    needsAttachment: !!input.needsAttachment, attachmentNote: text(input.attachmentNote),
    carryOverDays: int(input.carryOverDays, 0, 365), noticeDays: int(input.noticeDays, 0, 365),
    renewal: input.renewal === "JANUARI" ? "JANUARI" : "ULANG_TAHUN_KERJA",
    carryOverExpires: !!input.carryOverExpires && !!expiry, carryOverExpiry: input.carryOverExpires ? expiry : null,
    allowHalfDay: !!input.allowHalfDay,
    legalBasis: text(input.legalBasis), note: text(input.note), isActive: !!input.isActive,
    updatedBy: access.name ?? null,
  };
  if (id) await prisma.leavePolicy.update({ where: { id }, data });
  else {
    const last = await prisma.leavePolicy.aggregate({ _max: { sortOrder: true } });
    await prisma.leavePolicy.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath(PATH);
  return {};
}

// Saklar "Saldo cuti aktif" (Super Admin). Saat diaktifkan, saldo tampil ke karyawan dan admin.
export async function setLeaveBalanceActive(active: boolean): Promise<Result> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Super Admin yang bisa mengubah saklar saldo cuti." };
  const value = { active, activatedAt: active ? new Date().toISOString() : null, by: access.name ?? null };
  await prisma.appSetting.upsert({
    where: { key: LEAVE_BALANCE_KEY }, update: { value, updatedBy: access.name ?? null }, create: { key: LEAVE_BALANCE_KEY, value, updatedBy: access.name ?? null },
  });
  revalidatePath(PATH);
  revalidatePath("/portal/cuti");
  revalidatePath("/portal/admin/karyawan", "layout");
  return {};
}

export async function deleteLeavePolicy(id: string): Promise<Result> {
  await requireAdmin();
  await prisma.leavePolicy.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

export type BalanceImportRow = { employeeId: string; code: string; days: number; date: string; note: string; line?: number };

// Import saldo cuti dari aplikasi lama. Satu baris = saldo satu jenis cuti per tanggal tertentu.
// SALDO_AWAL lama untuk karyawan + jenis cuti yang sama diganti.
export async function importLeaveBalances(rows: BalanceImportRow[]): Promise<{ error?: string; saved?: number; errors?: string[] }> {
  const access = await requireAdmin();
  if (rows.length === 0) return { error: "File tidak berisi data." };
  if (rows.length > 5000) return { error: "Baris terlalu banyak sekaligus." };
  const [users, policies] = await Promise.all([
    prisma.user.findMany({ where: { employeeId: { not: null } }, select: { id: true, employeeId: true } }),
    prisma.leavePolicy.findMany({ select: { id: true, code: true } }),
  ]);
  const userBy = new Map(users.map((u) => [u.employeeId!.toLowerCase(), u.id]));
  const policyBy = new Map(policies.map((p) => [p.code.toUpperCase(), p.id]));
  const errors: string[] = [];
  const valid: { userId: string; policyId: string; date: Date; days: number; note: string | null }[] = [];
  rows.forEach((r, i) => {
    const line = `Baris ${r.line ?? i + 2}`;
    const userId = userBy.get(r.employeeId.trim().toLowerCase());
    const policyId = policyBy.get(r.code.trim().toUpperCase());
    if (!userId) return errors.push(`${line}: Employee ID ${r.employeeId} tidak ditemukan`);
    if (!policyId) return errors.push(`${line}: Kode cuti ${r.code} tidak ada di Setup Leave`);
    if (!Number.isFinite(r.days) || r.days < -365 || r.days > 365) return errors.push(`${line}: saldo tidak valid`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return errors.push(`${line}: tanggal harus YYYY-MM-DD`);
    valid.push({ userId, policyId, date: new Date(`${r.date}T00:00:00Z`), days: Math.round(r.days * 100) / 100, note: r.note.trim() || null });
  });
  if (valid.length === 0) return { error: "Tidak ada baris yang valid.", errors };
  await prisma.$transaction([
    ...valid.map((v) => prisma.leaveBalanceEntry.deleteMany({ where: { userId: v.userId, policyId: v.policyId, kind: "SALDO_AWAL" } })),
    ...valid.map((v) => prisma.leaveBalanceEntry.create({ data: { ...v, kind: "SALDO_AWAL", createdBy: access.name ?? null } })),
  ]);
  revalidatePath(PATH);
  return { saved: valid.length, errors };
}

// Koreksi manual saldo (+/-), mis. kompensasi atau salah hitung.
export async function adjustLeaveBalance(userId: string, policyId: string, days: number, note: string): Promise<Result> {
  const access = await requireAdmin();
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 365) return { error: "Jumlah hari tidak valid." };
  if (!note.trim()) return { error: "Alasan koreksi wajib diisi." };
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  await prisma.leaveBalanceEntry.create({
    data: { userId, policyId, date: new Date(`${text}T00:00:00Z`), days: Math.round(days * 100) / 100, kind: "PENYESUAIAN", note: note.trim(), createdBy: access.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}
