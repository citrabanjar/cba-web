"use server";
import { prisma } from "@/lib/prisma";
import { requireMenu, requireSuperAdmin } from "@/lib/access";
import { MENUS, isSuperAdmin } from "@/lib/roles";
import type { ImportComponent, ImportRow } from "@/lib/employee-import";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { EmploymentStatus, Prisma } from "@prisma/client";

const LIST_PATH = "/portal/admin/karyawan";

const STATUS_MAP: Record<string, EmploymentStatus> = {
  TETAP: "TETAP", KONTRAK: "KONTRAK", PROBATION: "PROBATION",
};

const TEXT_FIELDS = [
  "employeeId", "email", "phone", "position", "branch", "paymentSchedule",
  "bankName", "bankAccount", "bankHolder", "ktpNumber", "address", "birthPlace",
  "gender", "religion", "maritalStatus", "nationality", "emergencyName",
  "emergencyPhone", "emergencyRelation", "npwp", "ptkpStatus", "taxability",
  "taxStatus", "taxObjectCode", "bpjsTkNumber", "bpjsKesNumber",
] as const;
const DATE_FIELDS = ["joinDate", "contractEndDate", "resignDate", "birthDate"] as const;
const FLAG_FIELDS = ["bpjsTkActive", "bpjsKesActive"] as const;

export type EmployeeInput = {
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  departmentName?: string;
  position?: string;
  employmentStatus?: string;
  joinDate?: string;
  password?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
};

export type EmployeeUpdate = Record<string, string | undefined>;

async function upsertDept(name?: string) {
  if (!name) return undefined;
  const dept = await prisma.department.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return dept.id;
}

async function nextEmployeeNo(): Promise<number> {
  const top = await prisma.user.aggregate({ _max: { employeeNo: true } });
  return (top._max.employeeNo ?? 0) + 1;
}

const toDate = (value?: string) => (value ? new Date(value) : null);

function logValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value);
}

export async function createEmployee(data: EmployeeInput) {
  await requireMenu("karyawan");
  const departmentId = await upsertDept(data.departmentName);
  await prisma.user.create({
    data: {
      employeeNo: await nextEmployeeNo(),
      employeeId: data.employeeId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      departmentId,
      position: data.position || null,
      employmentStatus: STATUS_MAP[data.employmentStatus?.toUpperCase() ?? ""] ?? "KONTRAK",
      joinDate: toDate(data.joinDate),
      passwordHash: data.password ? await bcrypt.hash(data.password, 12) : null,
      bankName: data.bankName || null,
      bankAccount: data.bankAccount || null,
      bankHolder: data.bankHolder || null,
    },
  });
  revalidatePath(LIST_PATH);
  return { success: true };
}

// Selain super admin, hanya akun karyawan biasa yang boleh diubah. Aturan ini mencegah
// admin mengambil alih akun admin lain lewat ganti password atau email.
function editableTarget(actorRole: string) {
  return isSuperAdmin(actorRole)
    ? { role: { not: "SUPER_ADMIN" as const } }
    : { role: "KARYAWAN" as const };
}

async function findManagerId(employeeId: string): Promise<string | null> {
  const value = employeeId.trim();
  if (!value) return null;
  const manager = await prisma.user.findFirst({
    where: { employeeId: value, role: { not: "SUPER_ADMIN" } },
    select: { id: true },
  });
  if (!manager) throw new Error("ID atasan tidak ditemukan");
  return manager.id;
}

// Mencegah rantai atasan berputar, misalnya A atasan B sekaligus B atasan A.
async function wouldLoop(id: string, managerId: string | null): Promise<boolean> {
  const seen = new Set<string>();
  let cursor = managerId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === id) return true;
    seen.add(cursor);
    const next: { managerId: string | null } | null = await prisma.user.findUnique({
      where: { id: cursor },
      select: { managerId: true },
    });
    cursor = next?.managerId ?? null;
  }
  return false;
}

export async function updateEmployee(id: string, data: EmployeeUpdate) {
  const actor = await requireMenu("karyawan");
  const current = await prisma.user.findFirst({
    where: { id, ...editableTarget(actor.role) },
    include: { department: { select: { name: true } } },
  });
  if (!current) throw new Error("Not found");

  const changes: Prisma.UserUncheckedUpdateInput = {};
  const logs: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const record = current as unknown as Record<string, unknown>;

  const track = (field: string, oldValue: unknown, newValue: unknown) => {
    const before = logValue(oldValue);
    const after = logValue(newValue);
    if (before === after) return false;
    logs.push({ field, oldValue: before, newValue: after });
    return true;
  };

  if (data.name !== undefined) {
    if (!data.name.trim()) throw new Error("Nama wajib diisi");
    if (track("name", current.name, data.name.trim())) changes.name = data.name.trim();
  }
  for (const field of TEXT_FIELDS) {
    if (data[field] === undefined) continue;
    const value = data[field]?.trim() || null;
    if (field === "employeeId" && !value) throw new Error("ID Karyawan wajib diisi");
    if (track(field, record[field], value)) (changes as Record<string, unknown>)[field] = value;
  }
  for (const field of DATE_FIELDS) {
    if (data[field] === undefined) continue;
    const value = toDate(data[field]);
    if (track(field, record[field], value)) changes[field] = value;
  }
  for (const field of FLAG_FIELDS) {
    if (data[field] === undefined) continue;
    const value = data[field] === "true";
    if (track(field, record[field], value)) changes[field] = value;
  }
  if (data.employmentStatus !== undefined) {
    const value = STATUS_MAP[data.employmentStatus.toUpperCase()];
    if (value && track("employmentStatus", current.employmentStatus, value)) {
      changes.employmentStatus = value;
    }
  }
  if (data.departmentName !== undefined) {
    if (track("department", current.department?.name, data.departmentName.trim())) {
      changes.departmentId = (await upsertDept(data.departmentName.trim())) ?? null;
    }
  }
  if (data.managerEmployeeId !== undefined) {
    const managerId = await findManagerId(data.managerEmployeeId);
    if (await wouldLoop(id, managerId)) throw new Error("Atasan tidak boleh berputar");
    if (track("manager", current.managerId, managerId)) changes.managerId = managerId;
  }
  if (data.password) {
    changes.passwordHash = await bcrypt.hash(data.password, 12);
    logs.push({ field: "password", oldValue: null, newValue: null });
  }

  await prisma.user.update({
    where: { id },
    data: {
      ...changes,
      changeLogs: { create: logs.map((log) => ({ ...log, changedBy: actor.name })) },
    },
  });
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return { success: true };
}

export async function toggleEmployeeActive(id: string) {
  const actor = await requireMenu("karyawan");
  const user = await prisma.user.findFirst({
    where: { id, ...editableTarget(actor.role) },
    select: { isActive: true },
  });
  if (!user) throw new Error("Not found");
  await prisma.user.update({
    where: { id },
    data: {
      isActive: !user.isActive,
      changeLogs: {
        create: {
          field: "isActive",
          oldValue: String(user.isActive),
          newValue: String(!user.isActive),
          changedBy: actor.name,
        },
      },
    },
  });
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return { success: true };
}

export async function addSalaryAdjustment(
  userId: string,
  data: {
    effectiveDate: string;
    basicSalary: number;
    bpjsTkBase?: number;
    bpjsKesBase?: number;
    note?: string;
    components: ImportComponent[];
  },
) {
  const actor = await requireMenu("gaji");
  if (!data.effectiveDate || !(data.basicSalary > 0)) {
    throw new Error("Tanggal berlaku dan gaji pokok wajib diisi");
  }
  await prisma.employeeSalary.create({
    data: {
      userId,
      effectiveDate: new Date(data.effectiveDate),
      basicSalary: data.basicSalary,
      bpjsTkBase: data.bpjsTkBase ?? null,
      bpjsKesBase: data.bpjsKesBase ?? null,
      note: data.note?.trim() || null,
      createdBy: actor.name,
      components: { create: data.components },
    },
  });
  revalidatePath(`${LIST_PATH}/${userId}`);
  return { success: true };
}

export async function setEmployeeAccess(id: string, role: string, menuAccess: string[]) {
  const actor = await requireSuperAdmin();
  if (role !== "KARYAWAN" && role !== "ADMIN") throw new Error("Role tidak dikenal");
  const allowed = new Set<string>(MENUS.map((m) => m.key));
  const menus = role === "ADMIN" ? menuAccess.filter((m) => allowed.has(m)) : [];

  const target = await prisma.user.findFirst({
    where: { id, role: { not: "SUPER_ADMIN" } },
    select: { role: true, menuAccess: true },
  });
  if (!target) throw new Error("Not found");

  await prisma.user.update({
    where: { id },
    data: {
      role,
      menuAccess: menus,
      changeLogs: {
        create: {
          field: "access",
          oldValue: `${target.role}: ${target.menuAccess.join(", ")}`,
          newValue: `${role}: ${menus.join(", ")}`,
          changedBy: actor.name,
        },
      },
    },
  });
  revalidatePath(`${LIST_PATH}/${id}`);
  return { success: true };
}

export type ImportResult = {
  employeeId: string;
  status: "ok" | "skip";
  reason?: string;
  warning?: string;
};

export async function importEmployees(rows: ImportRow[]) {
  const actor = await requireMenu("import");

  const deptNames = [...new Set(rows.map((r) => r.departmentName).filter(Boolean) as string[])];
  const deptMap = new Map<string, string>();
  for (const name of deptNames) {
    const dept = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
    deptMap.set(name, dept.id);
  }

  // No. Urut mengikuti tanggal masuk: karyawan terlama dapat nomor terkecil.
  const ordered = [...rows].sort((a, b) =>
    (a.joinDate ?? "9999").localeCompare(b.joinDate ?? "9999") ||
    a.employeeId.localeCompare(b.employeeId));

  let nextNo = await nextEmployeeNo();
  const results: ImportResult[] = [];
  const created: { id: string; row: ImportRow }[] = [];

  for (const row of ordered) {
    const existing = await prisma.user.findUnique({ where: { employeeId: row.employeeId } });
    if (existing) {
      results.push({ employeeId: row.employeeId, status: "skip", reason: "ID sudah ada" });
      continue;
    }
    try {
      const user = await prisma.user.create({
        data: {
          employeeNo: nextNo,
          employeeId: row.employeeId,
          name: row.name,
          email: row.email || null,
          phone: row.phone,
          branch: row.branch,
          departmentId: row.departmentName ? deptMap.get(row.departmentName) : undefined,
          position: row.position,
          employmentStatus: STATUS_MAP[row.employmentStatus ?? ""] ?? "KONTRAK",
          joinDate: toDate(row.joinDate),
          contractEndDate: toDate(row.contractEndDate),
          resignDate: toDate(row.resignDate),
          isActive: row.isActive,
          paymentSchedule: row.paymentSchedule,
          bpjsTkNumber: row.bpjsTkNumber,
          bpjsTkActive: row.bpjsTkActive,
          bpjsKesNumber: row.bpjsKesNumber,
          bpjsKesActive: row.bpjsKesActive,
          npwp: row.npwp,
          ptkpStatus: row.ptkpStatus,
          taxability: row.taxability,
          taxStatus: row.taxStatus,
          taxObjectCode: row.taxObjectCode,
          bankName: row.bankName,
          bankAccount: row.bankAccount,
          bankHolder: row.bankHolder,
          ktpNumber: row.ktpNumber,
          address: row.address,
          birthPlace: row.birthPlace,
          birthDate: toDate(row.birthDate),
          gender: row.gender,
          religion: row.religion,
          maritalStatus: row.maritalStatus,
          nationality: row.nationality,
          emergencyName: row.emergencyName,
          emergencyPhone: row.emergencyPhone,
          emergencyRelation: row.emergencyRelation,
          salaries: row.basicSalary
            ? {
                create: {
                  // Gaji awal berlaku sejak tanggal masuk.
                  effectiveDate: toDate(row.joinDate) ?? new Date(new Date().toISOString().split("T")[0]),
                  basicSalary: row.basicSalary,
                  bpjsTkBase: row.bpjsTkBase,
                  bpjsKesBase: row.bpjsKesBase,
                  note: "Gaji awal dari import",
                  createdBy: actor.name,
                  components: { create: row.components },
                },
              }
            : undefined,
        },
      });
      nextNo += 1;
      created.push({ id: user.id, row });
      results.push({ employeeId: row.employeeId, status: "ok" });
    } catch {
      results.push({
        employeeId: row.employeeId,
        status: "skip",
        reason: "Email atau No KTP sudah dipakai karyawan lain",
      });
    }
  }

  // Atasan dihubungkan setelah semua karyawan masuk, supaya urutan baris di file tidak berpengaruh.
  for (const { id, row } of created) {
    if (!row.managerRef) continue;
    const manager = await prisma.user.findFirst({
      where: { employeeId: row.managerRef, role: { not: "SUPER_ADMIN" } },
      select: { id: true },
    });
    const result = results.find((r) => r.employeeId === row.employeeId);
    if (!manager) {
      if (result) result.warning = `ID atasan ${row.managerRef} tidak ditemukan`;
    } else if (await wouldLoop(id, manager.id)) {
      if (result) result.warning = `Atasan ${row.managerRef} membuat rantai berputar`;
    } else {
      await prisma.user.update({ where: { id }, data: { managerId: manager.id } });
    }
  }

  revalidatePath(LIST_PATH);
  return { results };
}
