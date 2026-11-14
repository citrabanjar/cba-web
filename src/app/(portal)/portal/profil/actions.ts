"use server";

import bcrypt from "bcryptjs";
import { decisionText, notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { canEditMenu } from "@/lib/roles";
import { FAMILY_RELATIONS } from "@/lib/personal-info";
import { PROFILE_FIELDS, PROFILE_KEYS, profileValue, type FamilyRow, type ProfileChanges } from "@/lib/profile-change";
import { saveFamily, updateEmployee } from "../admin/karyawan/actions";

type Result = { error?: string };

const refresh = (userId?: string) => {
  revalidatePath("/portal/profil");
  revalidatePath("/portal/persetujuan");
  revalidatePath("/portal/dashboard");
  if (userId) revalidatePath(`/portal/admin/karyawan/${userId}`);
};
const cleanFamily = (rows: FamilyRow[]) =>
  rows.map((r) => ({ name: r.name.trim(), idNumber: r.idNumber.trim(), relation: r.relation })).filter((r) => r.name);

// Karyawan mengajukan perubahan data pribadi. Hanya field yang benar-benar berubah yang disimpan.
export async function submitProfileChange(input: { values: Record<string, string>; family: FamilyRow[] | null; reason: string }): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const userId = session.user.id;
  if (await prisma.profileChangeRequest.findFirst({ where: { userId, status: "PENDING" } })) {
    return { error: "Masih ada pengajuan perubahan yang menunggu persetujuan Admin." };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, true])), family: { orderBy: { createdAt: "asc" }, select: { name: true, idNumber: true, relation: true } } },
  });
  if (!user) return { error: "Data tidak ditemukan." };
  const record = user as unknown as Record<string, unknown>;

  const changes: ProfileChanges = {};
  for (const f of PROFILE_FIELDS) {
    if (!(f.key in input.values)) continue;
    const typed = (input.values[f.key] ?? "").trim();
    const next = f.key === "birthPlace" ? typed.toUpperCase() : typed; // tempat lahir selalu huruf kapital
    const old = profileValue(record, f.key);
    if (f.options && next && !f.options.includes(next)) return { error: `Pilihan ${f.label} tidak dikenal.` };
    if (f.type === "postal" && next && !/^\d{5}$/.test(next)) return { error: `${f.label} harus 5 angka.` };
    if (next !== old) changes[f.key] = { old, new: next };
  }
  let family: FamilyRow[] | null = null;
  if (input.family) {
    const rows = cleanFamily(input.family);
    if (rows.some((r) => !FAMILY_RELATIONS.includes(r.relation))) return { error: "Jenis anggota keluarga wajib dipilih." };
    const current = user.family.map((r) => ({ name: r.name, idNumber: r.idNumber ?? "", relation: r.relation }));
    if (JSON.stringify(rows) !== JSON.stringify(current)) family = rows;
  }
  if (!Object.keys(changes).length && !family) return { error: "Belum ada data yang diubah." };

  await prisma.profileChangeRequest.create({
    data: { userId, changes, family: family ?? undefined, reason: input.reason.trim() || null },
  });
  refresh();
  return {};
}

export async function cancelProfileChange(id: string): Promise<Result> {
  const session = await auth();
  const req = await prisma.profileChangeRequest.findUnique({ where: { id } });
  if (!req || req.userId !== session?.user?.id || req.status !== "PENDING") return { error: "Pengajuan tidak ditemukan." };
  await prisma.profileChangeRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  refresh();
  return {};
}

// Admin (akses menu Data Karyawan) menyetujui atau menolak. Saat disetujui, data diterapkan lewat
// jalur edit Data Karyawan biasa, jadi tercatat di riwayat perubahan profil.
export async function decideProfileChange(id: string, approve: boolean, note: string): Promise<Result> {
  const access = await getAccess();
  if (!access || !canEditMenu(access, "karyawan")) return { error: "Hanya Admin yang bisa memutus perubahan data." };
  const req = await prisma.profileChangeRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (req.userId === access.id) return { error: "Tidak bisa menyetujui perubahan data sendiri." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  if (approve) {
    try {
      const changes = req.changes as ProfileChanges;
      const data = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.new]));
      if (Object.keys(data).length) await updateEmployee(req.userId, data);
      if (req.family) await saveFamily(req.userId, req.family as FamilyRow[]);
    } catch (e) {
      return { error: e instanceof Error && e.message !== "Not found" ? e.message : "Data karyawan tidak bisa diubah." };
    }
  }
  await prisma.profileChangeRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", note: note.trim() || null, decidedBy: access.name, decidedAt: new Date() },
  });
  await notify(req.userId, `Pengajuan perubahan data ${approve ? "disetujui" : "ditolak"}`, decisionText(approve, access.name, note), "/portal/profil?tab=akun");
  refresh(req.userId);
  return {};
}

// Ganti password sendiri (karyawan).
export async function changeMyPassword(current: string, next: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) return { error: "Password saat ini salah." };
  if (next.length < 8) return { error: "Password baru minimal 8 karakter." };
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await bcrypt.hash(next, 12), changeLogs: { create: { field: "password", changedBy: "Karyawan sendiri" } } },
  });
  return {};
}
