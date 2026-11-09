"use server";
import { prisma } from "@/lib/prisma";
import { requireMenu, requireSuperAdmin } from "@/lib/access";
import { MENUS, isSuperAdmin } from "@/lib/roles";
import { FAMILY_RELATIONS, ID_TYPES } from "@/lib/personal-info";
import type { ImportComponent, ImportRow } from "@/lib/employee-import";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { EmploymentStatus, Prisma } from "@prisma/client";

const LIST_PATH = "/portal/admin/karyawan";

const STATUS_MAP: Record<string, EmploymentStatus> = {
  TETAP: "TETAP", KONTRAK: "KONTRAK", PROBATION: "PROBATION",
};

const TEXT_FIELDS = [
  "employeeId", "email", "phone", "position", "branch", "paymentSchedule", "spkNumber",
  "bankName", "bankAccount", "bankHolder", "idType", "ktpNumber", "address",
  "currentAddress", "birthPlace",
  "gender", "religion", "maritalStatus", "nationality", "emergencyName",
  "emergencyPhone", "emergencyRelation", "npwp", "ptkpStatus", "taxability",
  "taxStatus", "taxObjectCode", "bpjsTkNumber", "bpjsKesNumber",
] as const;
const DATE_FIELDS = ["joinDate", "contractEndDate", "spkDate", "birthDate"] as const;
const FLAG_FIELDS = ["bpjsTkActive", "bpjsKesActive", "addressSameAsId"] as const;

export type EmployeeInput = {
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  branch?: string;
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

// Cabang, Departemen, dan Jabatan harus dipilih dari daftar di Setup Organisasi.
async function assertInMaster(data: { branch?: string; departmentName?: string; position?: string }) {
  const name = (value?: string) => ({ where: { name: value?.trim() ?? "" } });
  const missing = await Promise.all([
    data.branch?.trim() ? prisma.branch.findUnique(name(data.branch)) : true,
    data.departmentName?.trim() ? prisma.department.findUnique(name(data.departmentName)) : true,
    data.position?.trim() ? prisma.position.findUnique(name(data.position)) : true,
  ]);
  if (missing.some((row) => !row)) throw new Error("Pilihan belum ada di Setup Organisasi");
}

async function findDeptId(name?: string) {
  if (!name) return undefined;
  const dept = await prisma.department.findUnique({ where: { name }, select: { id: true } });
  return dept?.id;
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
  await assertInMaster(data);
  const departmentId = await findDeptId(data.departmentName);
  await prisma.user.create({
    data: {
      employeeNo: await nextEmployeeNo(),
      employeeId: data.employeeId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      departmentId,
      branch: data.branch || null,
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
  await assertInMaster(data);

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

  if (data.idType && !ID_TYPES.includes(data.idType)) throw new Error("Jenis ID tidak dikenal");
  if (data.addressSameAsId === "true") data = { ...data, currentAddress: "" };
  // Tanggal akhir kontrak hanya berlaku untuk status Kontrak.
  if (data.employmentStatus && data.employmentStatus !== "KONTRAK") data = { ...data, contractEndDate: "" };

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
      changes.departmentId = (await findDeptId(data.departmentName.trim())) ?? null;
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

export type EmploymentEventInput = {
  type: "PERPANJANGAN" | "PEMBERHENTIAN";
  effectiveDate: string;
  contractEndDate?: string;
  spkNumber?: string;
  spkDate?: string;
  reason?: string;
};

export async function addEmploymentEvent(id: string, input: EmploymentEventInput) {
  const actor = await requireMenu("karyawan");
  const target = await prisma.user.findFirst({
    where: { id, ...editableTarget(actor.role) },
    select: {
      employmentStatus: true, contractEndDate: true, spkNumber: true, spkDate: true,
      resignDate: true, isActive: true,
    },
  });
  if (!target) throw new Error("Not found");
  if (!input.effectiveDate) throw new Error("Tanggal wajib diisi");

  const effectiveDate = new Date(input.effectiveDate);
  const changes: Prisma.UserUncheckedUpdateInput = {};
  const logs: { field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = [];
  const log = (field: string, oldValue: unknown, newValue: unknown) =>
    logs.push({ field, oldValue: logValue(oldValue), newValue: logValue(newValue), changedBy: actor.name });

  const event: Prisma.EmploymentEventUncheckedCreateWithoutUserInput = {
    type: input.type, effectiveDate, createdBy: actor.name,
  };

  if (input.type === "PERPANJANGAN") {
    if (target.employmentStatus !== "KONTRAK") throw new Error("Hanya karyawan kontrak yang bisa diperpanjang");
    const contractEndDate = toDate(input.contractEndDate);
    if (!contractEndDate || contractEndDate <= effectiveDate) throw new Error("Tanggal akhir kontrak tidak valid");
    if (target.contractEndDate && contractEndDate <= target.contractEndDate) {
      throw new Error("Tanggal akhir kontrak harus setelah kontrak lama");
    }
    const spkNumber = input.spkNumber?.trim() || null;
    const spkDate = toDate(input.spkDate);
    Object.assign(changes, { contractEndDate, spkNumber, spkDate });
    Object.assign(event, { contractEndDate, spkNumber, spkDate });
    log("contractEndDate", target.contractEndDate, contractEndDate);
    log("spkNumber", target.spkNumber, spkNumber);
    log("spkDate", target.spkDate, spkDate);
  } else if (input.type === "PEMBERHENTIAN") {
    const reason = input.reason?.trim();
    if (!reason) throw new Error("Alasan wajib diisi");
    // Status aktif hanya berubah di sini, jadi tanggalnya tidak boleh di masa depan.
    // Tujuh jam adalah selisih UTC dengan WIB, supaya tanggal hari ini tetap diterima.
    if (effectiveDate.getTime() > Date.now() + 7 * 60 * 60 * 1000) {
      throw new Error("Tanggal berhenti tidak boleh di masa depan");
    }
    const isActive = false;
    Object.assign(changes, { resignDate: effectiveDate, isActive });
    event.reason = reason;
    log("resignDate", target.resignDate, effectiveDate);
    if (isActive !== target.isActive) log("isActive", target.isActive, isActive);
  } else {
    throw new Error("Jenis tidak dikenal");
  }

  await prisma.user.update({
    where: { id },
    data: { ...changes, employmentEvents: { create: event }, changeLogs: { create: logs } },
  });
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return { success: true };
}

export type JobChangeInput = {
  type: "MUTASI" | "PROMOSI" | "DEMOSI";
  effectiveDate: string;
  note?: string;
};

// Mutasi, promosi, dan demosi mengubah Unit Perusahaan sekaligus mencatat perubahannya di Riwayat Pekerjaan.
export async function addJobChange(id: string, input: JobChangeInput, data: EmployeeUpdate) {
  const actor = await requireMenu("karyawan");
  if (!input.effectiveDate) throw new Error("Tanggal berlaku wajib diisi");
  const before = await prisma.user.findFirst({
    where: { id, ...editableTarget(actor.role) },
    select: {
      branch: true, position: true,
      department: { select: { name: true } },
      manager: { select: { employeeId: true } },
    },
  });
  if (!before) throw new Error("Not found");

  const parts = [
    { label: "Cabang", from: before.branch, to: data.branch },
    { label: "Departemen", from: before.department?.name, to: data.departmentName },
    { label: "Jabatan", from: before.position, to: data.position },
    { label: "Atasan", from: before.manager?.employeeId, to: data.managerEmployeeId },
  ].flatMap(({ label, from, to }) => {
    const oldValue = from?.trim() || "—";
    const newValue = to?.trim() || "—";
    return to === undefined || oldValue === newValue ? [] : [`${label}: ${oldValue} → ${newValue}`];
  });
  if (parts.length === 0) throw new Error("Tidak ada perubahan");

  await updateEmployee(id, data);
  const note = input.note?.trim();
  await prisma.employmentEvent.create({
    data: {
      userId: id,
      type: input.type,
      effectiveDate: new Date(input.effectiveDate),
      reason: [parts.join("; "), note].filter(Boolean).join(". "),
      createdBy: actor.name,
    },
  });
  revalidatePath(`${LIST_PATH}/${id}`);
  return { success: true };
}

const MAX_PHOTO_BYTES = 200_000;

// Pesan dikembalikan karena pesan error server action disamarkan di production.
export async function uploadEmployeePhoto(id: string, form: FormData) {
  const actor = await requireMenu("import");
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "File foto kosong." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "Ukuran foto terlalu besar." };

  const data = Buffer.from(await file.arrayBuffer());
  if (data[0] !== 0xff || data[1] !== 0xd8) return { error: "File bukan gambar JPEG." };

  const target = await prisma.user.findFirst({
    where: { id, ...editableTarget(actor.role) },
    select: { id: true },
  });
  if (!target) return { error: "Karyawan tidak bisa diubah." };

  await prisma.$transaction([
    prisma.employeePhoto.upsert({ where: { userId: id }, update: { data }, create: { userId: id, data } }),
    prisma.user.update({
      where: { id },
      data: {
        image: `/api/foto/${id}?v=${Date.now()}`,
        changeLogs: { create: { field: "photo", changedBy: actor.name } },
      },
    }),
  ]);
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
  return {};
}

export type FamilyInput = { name: string; idNumber: string; relation: string };

// Daftar keluarga disimpan sekaligus, jadi tambah, ubah, dan hapus baris cukup satu aksi.
export async function saveFamily(id: string, rows: FamilyInput[]) {
  const actor = await requireMenu("karyawan");
  const target = await prisma.user.findFirst({
    where: { id, ...editableTarget(actor.role) },
    select: { family: { orderBy: { createdAt: "asc" }, select: { name: true, idNumber: true, relation: true } } },
  });
  if (!target) throw new Error("Not found");

  const family = rows.map((r) => ({
    name: r.name.trim(), idNumber: r.idNumber.trim() || null, relation: r.relation,
  }));
  if (family.some((r) => !r.name || !FAMILY_RELATIONS.includes(r.relation))) {
    throw new Error("Nama dan jenis anggota keluarga wajib diisi");
  }

  if (JSON.stringify(family) !== JSON.stringify(target.family)) {
    await prisma.$transaction([
      prisma.familyMember.deleteMany({ where: { userId: id } }),
      prisma.familyMember.createMany({ data: family.map((r) => ({ ...r, userId: id })) }),
      prisma.employeeChangeLog.create({ data: { userId: id, field: "family", changedBy: actor.name } }),
    ]);
  }
  revalidatePath(`${LIST_PATH}/${id}`);
  return { success: true };
}

// Status aktif hanya berubah lewat Resign, dan dibuka lagi lewat Aktifkan Kembali.
export async function reactivateEmployee(id: string) {
  const actor = await requireMenu("karyawan");
  const user = await prisma.user.findFirst({
    where: { id, isActive: false, ...editableTarget(actor.role) },
    select: { resignDate: true },
  });
  if (!user) throw new Error("Not found");
  await prisma.user.update({
    where: { id },
    data: {
      isActive: true,
      resignDate: null,
      employmentEvents: {
        create: {
          type: "AKTIF_KEMBALI",
          effectiveDate: new Date(new Date().toISOString().split("T")[0]),
          reason: "Karyawan diaktifkan kembali",
          createdBy: actor.name,
        },
      },
      changeLogs: {
        create: [
          { field: "isActive", oldValue: "false", newValue: "true", changedBy: actor.name },
          { field: "resignDate", oldValue: logValue(user.resignDate), newValue: null, changedBy: actor.name },
        ],
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
      components: {
        create: data.components.map((c) => ({ type: c.type, name: c.name.trim(), amount: c.amount, code: c.code?.trim() || null })),
      },
    },
  });
  await syncAssignmentsFromSalary(userId, new Date(data.effectiveDate), data.components, actor.name ?? null);
  revalidatePath(`${LIST_PATH}/${userId}`);
  revalidatePath("/portal/admin/payroll");
  return { success: true };
}

// Penyesuaian gaji membuka/menutup tempelan komponen input tetap: komponen yang kini dipilih mulai berlaku
// per tanggal berlaku; yang ada di gaji sebelumnya tetapi tidak dipilih lagi (mis. demosi) berakhir sehari sebelumnya.
async function syncAssignmentsFromSalary(userId: string, effective: Date, components: ImportComponent[], by: string | null) {
  const day = new Date(Date.UTC(effective.getUTCFullYear(), effective.getUTCMonth(), effective.getUTCDate()));
  const dayBefore = new Date(day.getTime() - 86_400_000);
  const now = new Set(["GP", ...components.map((c) => c.code?.trim()).filter((c): c is string => !!c)]);
  const prev = await prisma.employeeSalary.findFirst({
    where: { userId, effectiveDate: { lt: day } }, orderBy: { effectiveDate: "desc" }, include: { components: { select: { code: true } } },
  });
  const before = new Set(prev?.components.map((c) => c.code).filter((c): c is string => !!c) ?? []);
  const masters = await prisma.payComponent.findMany({
    where: { code: { in: [...now, ...before] }, method: "INPUT" },
    select: { id: true, code: true, employees: { where: { userId }, select: { id: true, startDate: true, endDate: true } } },
  });
  const note = `Penyesuaian gaji ${day.toISOString().slice(0, 10)}`;
  for (const m of masters) {
    const row = m.employees[0];
    if (now.has(m.code)) {
      if (!row) await prisma.employeePayComponent.create({ data: { userId, componentId: m.id, startDate: m.code === "GP" ? null : day, note: m.code === "GP" ? null : note, createdBy: by } });
      else if (row.endDate && row.endDate < day) await prisma.employeePayComponent.update({ where: { id: row.id }, data: { startDate: day, endDate: null, note } });
    } else if (before.has(m.code) && row && (!row.endDate || row.endDate >= day)) {
      await prisma.employeePayComponent.update({ where: { id: row.id }, data: { endDate: dayBefore, note } });
    }
  }
}

const isoDate = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);

// Tempel / atur masa berlaku satu komponen untuk satu karyawan (dari profil).
export async function savePayAssignment(userId: string, componentId: string, data: { startDate: string | null; endDate: string | null; note: string }) {
  const actor = await requireMenu("gaji");
  const startDate = isoDate(data.startDate), endDate = isoDate(data.endDate);
  if (startDate && endDate && endDate < startDate) return { error: "Tanggal Sampai tidak boleh sebelum tanggal Mulai." };
  const fields = { startDate, endDate, note: data.note.trim().slice(0, 200) || null };
  await prisma.employeePayComponent.upsert({
    where: { userId_componentId: { userId, componentId } },
    update: fields, create: { userId, componentId, ...fields, createdBy: actor.name ?? null },
  });
  revalidatePath(`${LIST_PATH}/${userId}`);
  revalidatePath("/portal/admin/payroll");
  return {};
}

export async function removePayAssignment(userId: string, componentId: string) {
  await requireMenu("gaji");
  await prisma.employeePayComponent.deleteMany({ where: { userId, componentId } });
  revalidatePath(`${LIST_PATH}/${userId}`);
  revalidatePath("/portal/admin/payroll");
  return {};
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
  // Import juga mengisi daftar Setup Organisasi, supaya data awal langsung bisa dipilih.
  const uniqueNames = (values: (string | undefined)[]) => [...new Set(values.filter(Boolean) as string[])];
  await prisma.branch.createMany({
    data: uniqueNames(rows.map((r) => r.branch)).map((name) => ({ name })),
    skipDuplicates: true,
  });
  await prisma.position.createMany({
    data: uniqueNames(rows.map((r) => r.position)).map((name) => ({ name })),
    skipDuplicates: true,
  });

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
          idType: row.ktpNumber ? "KTP" : null,
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
