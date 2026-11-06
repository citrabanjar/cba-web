"use server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { UserRole, EmploymentStatus } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !canManage(session.user.role)) throw new Error("Unauthorized");
}

const ROLE_MAP: Record<string, UserRole> = {
  KARYAWAN: "KARYAWAN", ADMIN: "ADMIN", HRD: "HRD", MANAGER: "MANAGER",
};
const STATUS_MAP: Record<string, EmploymentStatus> = {
  TETAP: "TETAP", KONTRAK: "KONTRAK", PROBATION: "PROBATION",
};

export type EmployeeInput = {
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  departmentName?: string;
  position?: string;
  employmentStatus?: string;
  role?: string;
  joinDate?: string;
  password: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
};

async function upsertDept(name?: string) {
  if (!name) return undefined;
  const dept = await prisma.department.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return dept.id;
}

export async function createEmployee(data: EmployeeInput) {
  await requireAdmin();
  const departmentId = await upsertDept(data.departmentName);
  const passwordHash = await bcrypt.hash(data.password, 12);
  await prisma.user.create({
    data: {
      employeeId: data.employeeId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      departmentId,
      position: data.position || null,
      employmentStatus: STATUS_MAP[data.employmentStatus?.toUpperCase() ?? ""] ?? "KONTRAK",
      role: ROLE_MAP[data.role?.toUpperCase() ?? ""] ?? "KARYAWAN",
      joinDate: data.joinDate ? new Date(data.joinDate) : null,
      passwordHash,
      bankName: data.bankName || null,
      bankAccount: data.bankAccount || null,
      bankHolder: data.bankHolder || null,
    },
  });
  revalidatePath("/portal/admin/karyawan");
  return { success: true };
}

export async function updateEmployee(id: string, data: Partial<Omit<EmployeeInput, "password"> & { password?: string }>) {
  await requireAdmin();
  const departmentId = data.departmentName === "" ? null : await upsertDept(data.departmentName);
  const extra = data.password ? { passwordHash: await bcrypt.hash(data.password, 12) } : {};
  // Akun SUPER_ADMIN tidak boleh diubah lewat modul karyawan.
  await prisma.user.update({
    where: { id, role: { not: "SUPER_ADMIN" } },
    data: {
      name: data.name,
      // Email unik: string kosong harus jadi null supaya tidak bentrok antar karyawan.
      email: data.email === undefined ? undefined : data.email || null,
      phone: data.phone ?? undefined,
      departmentId,
      position: data.position ?? undefined,
      employmentStatus: data.employmentStatus
        ? (STATUS_MAP[data.employmentStatus.toUpperCase()] ?? undefined)
        : undefined,
      role: data.role ? (ROLE_MAP[data.role.toUpperCase()] ?? undefined) : undefined,
      joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
      bankName: data.bankName ?? undefined,
      bankAccount: data.bankAccount ?? undefined,
      bankHolder: data.bankHolder ?? undefined,
      ...extra,
    },
  });
  revalidatePath("/portal/admin/karyawan");
  revalidatePath(`/portal/admin/karyawan/${id}`);
  return { success: true };
}

export async function toggleEmployeeActive(id: string) {
  await requireAdmin();
  const user = await prisma.user.findFirst({
    where: { id, role: { not: "SUPER_ADMIN" } },
    select: { isActive: true },
  });
  if (!user) throw new Error("Not found");
  await prisma.user.update({ where: { id }, data: { isActive: !user.isActive } });
  revalidatePath("/portal/admin/karyawan");
  revalidatePath(`/portal/admin/karyawan/${id}`);
  return { success: true };
}

export async function bulkCreateEmployees(rows: EmployeeInput[]) {
  await requireAdmin();

  // Collect unique department names and upsert them
  const deptNames = [...new Set(rows.map(r => r.departmentName).filter(Boolean) as string[])];
  const deptMap = new Map<string, string>();
  for (const name of deptNames) {
    const dept = await prisma.department.upsert({
      where: { name }, update: {}, create: { name },
    });
    deptMap.set(name, dept.id);
  }

  const results: { employeeId: string; status: "ok" | "skip"; reason?: string }[] = [];

  for (const row of rows) {
    try {
      const existing = await prisma.user.findUnique({ where: { employeeId: row.employeeId } });
      if (existing) {
        results.push({ employeeId: row.employeeId, status: "skip", reason: "NIK sudah ada" });
        continue;
      }
      const passwordHash = await bcrypt.hash(row.password || "CBA@2025", 12);
      await prisma.user.create({
        data: {
          employeeId: row.employeeId,
          name: row.name,
          email: row.email || null,
          phone: row.phone || null,
          departmentId: row.departmentName ? deptMap.get(row.departmentName) : undefined,
          position: row.position || null,
          employmentStatus: STATUS_MAP[row.employmentStatus?.toUpperCase() ?? ""] ?? "KONTRAK",
          role: ROLE_MAP[row.role?.toUpperCase() ?? ""] ?? "KARYAWAN",
          joinDate: row.joinDate ? new Date(row.joinDate) : null,
          passwordHash,
          bankName: row.bankName || null,
          bankAccount: row.bankAccount || null,
          bankHolder: row.bankHolder || null,
        },
      });
      results.push({ employeeId: row.employeeId, status: "ok" });
    } catch (e) {
      results.push({ employeeId: row.employeeId, status: "skip", reason: String(e) });
    }
  }

  revalidatePath("/portal/admin/karyawan");
  return { results };
}
