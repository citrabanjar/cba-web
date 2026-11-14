// Tahan perubahan Admin untuk approval (aturan "Approval perubahan data" di Peran Admin).
// Aksi yang mengubah data memanggil holdForApproval(...) sesudah validasi. Bila peran Admin wajib approval,
// aksi TIDAK dijalankan: dicatat sebagai pengajuan (tabel EmployeeEditRequest, data.__kind) ke SATU approver di bagan:
//   - perubahan data seorang karyawan → atasan dari bagan karyawan itu;
//   - perubahan pengaturan / parameter → atasan dari bagan Admin yang mengajukan.
// Level 1 = atasan langsung, Level 2 = atasan dari atasan langsung (bila bagan tidak setinggi itu, atasan tertinggi yang ada).
// Setelah disetujui, aksi yang sama dijalankan atas nama Admin pengaju (runApproved → getAccess membaca pengaju).
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roleApprovalLevels } from "@/lib/admin-roles";
import { sendEditRequestEmail } from "@/lib/mailer";

// Sedang menjalankan pengajuan yang sudah disetujui: pemeriksaan hak & approval memakai Admin pengaju.
export const approvedRun = new AsyncLocalStorage<{ requesterId: string }>();

export type HoldDetail = { field: string; oldValue: string | null; newValue: string | null };
export type HoldResult = { proposed: string } | { error: string } | null;

// Atasan-atasan di bagan, naik satu per satu (tidak aktif / dikecualikan dilewati), maksimal `levels`.
export async function bossChain(userId: string, levels: number, skip: Set<string>) {
  const out: { id: string; name: string }[] = [];
  const seen = new Set<string>([userId]);
  let cur = await prisma.user.findUnique({ where: { id: userId }, select: { managerId: true } });
  for (let i = 0; i < 20 && out.length < levels && cur?.managerId && !seen.has(cur.managerId); i++) {
    seen.add(cur.managerId);
    const boss = await prisma.user.findUnique({ where: { id: cur.managerId }, select: { id: true, name: true, isActive: true, managerId: true } });
    if (!boss) break;
    if (boss.isActive && !skip.has(boss.id)) out.push({ id: boss.id, name: boss.name });
    cur = boss;
  }
  return out;
}

// Email ke approver yang mendapat giliran.
export async function notifyApprover(approverId: string, requester: string, subject: string) {
  const boss = await prisma.user.findUnique({ where: { id: approverId }, select: { name: true, email: true } });
  if (!boss?.email) return;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : (process.env.NEXTAUTH_URL ?? "https://www.citrabanjar.com");
  await sendEditRequestEmail(boss.email, boss.name, requester, subject, `${base.replace(/\/$/, "")}/portal/persetujuan`);
}

export async function holdForApproval(o: { kind: string; args: unknown[]; title: string; details: HoldDetail[]; targetUserId?: string }): Promise<HoldResult> {
  if (approvedRun.getStore()) return null; // sedang menjalankan pengajuan yang sudah disetujui
  const { getAccess } = await import("@/lib/access");
  const access = await getAccess();
  if (!access || access.role !== "ADMIN") return null;
  const levels = await roleApprovalLevels(access.id);
  if (levels < 1) return null;
  const ups = await bossChain(o.targetUserId ?? access.id, levels, new Set([access.id]));
  const boss = ups[ups.length - 1];
  if (!boss) return { error: o.targetUserId ? "Karyawan ini belum punya atasan aktif di bagan (selain Anda), jadi perubahan belum bisa diajukan." : "Atasan Anda belum diatur di bagan, jadi perubahan belum bisa diajukan untuk approval. Hubungi Super Admin." };
  const steps = [{ id: boss.id, name: boss.name, level: ups.length, decision: "", at: "", note: "" }];
  await prisma.employeeEditRequest.create({
    data: {
      userId: o.targetUserId ?? access.id, requesterId: access.id, requesterName: access.name ?? "", approverId: boss.id, approverName: boss.name,
      data: { __kind: o.kind, __args: o.args, __title: o.title, __target: o.targetUserId ?? null, __approval: steps } as Prisma.InputJsonValue,
      summary: o.details as Prisma.InputJsonValue,
    },
  });
  await notifyApprover(boss.id, access.name ?? "Admin", o.title);
  revalidatePath("/portal/persetujuan");
  return { proposed: boss.name };
}

// Aksi yang bisa ditahan; dijalankan ulang setelah disetujui (impor dinamis supaya tidak berputar).
type Fn = (...a: never[]) => Promise<unknown>;
const REGISTRY: Record<string, () => Promise<Fn>> = {
  "gaji.savePayComponent": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).savePayComponent as Fn,
  "gaji.setComponentAssignments": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).setComponentAssignments as Fn,
  "gaji.deletePayComponent": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).deletePayComponent as Fn,
  "gaji.savePayrollSettings": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).savePayrollSettings as Fn,
  "gaji.finalizePayroll": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).finalizePayroll as Fn,
  "gaji.saveTaxYear": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).saveTaxYear as Fn,
  "gaji.saveTerVersion": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).saveTerVersion as Fn,
  "gaji.deleteTerVersion": async () => (await import("@/app/(portal)/portal/admin/payroll/actions")).deleteTerVersion as Fn,
  "gaji.addSalaryAdjustment": async () => (await import("@/app/(portal)/portal/admin/karyawan/actions")).addSalaryAdjustment as Fn,
  "gaji.savePayAssignment": async () => (await import("@/app/(portal)/portal/admin/karyawan/actions")).savePayAssignment as Fn,
  "gaji.removePayAssignment": async () => (await import("@/app/(portal)/portal/admin/karyawan/actions")).removePayAssignment as Fn,
};

// Jalankan pengajuan yang sudah disetujui atas nama Admin pengaju. Kembalian error = gagal diterapkan.
export async function runApproved(requesterId: string, kind: string, args: unknown[]): Promise<{ error?: string }> {
  const load = REGISTRY[kind];
  if (!load) return { error: "Jenis pengajuan tidak dikenal." };
  const fn = await load();
  try {
    const r = (await approvedRun.run({ requesterId }, () => (fn as (...a: unknown[]) => Promise<unknown>)(...args))) as { error?: string } | undefined;
    return r?.error ? { error: r.error } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal menerapkan perubahan." };
  }
}

export const holdKinds = Object.keys(REGISTRY);
