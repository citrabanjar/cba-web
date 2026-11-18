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
import { workflowSteps, decideStep } from "@/lib/workflow-settings";
import { actionableApprovers, readApproval, stepCandidates, type InterviewApproval } from "@/lib/onboarding-interview";
import { approvedRun } from "@/lib/approval-hold";
import type { Prisma } from "@prisma/client";

type Result = { error?: string };

const refresh = (userId?: string) => {
  revalidatePath("/portal/profil");
  revalidatePath("/portal/persetujuan");
  revalidatePath("/portal/notifikasi");
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

  // Workflow "Perubahan Data" aktif: penyetuju mengikuti level (mis. Admin Data Karyawan lalu Kepala HRD).
  const wf = await workflowSteps("PERUBAHAN_DATA", userId);
  if (wf.error) return { error: wf.error };
  await prisma.profileChangeRequest.create({
    data: { userId, changes, family: family ?? undefined, reason: input.reason.trim() || null, ...(wf.flow ? { approval: wf.flow as unknown as Prisma.InputJsonValue } : {}) },
  });
  if (wf.flow) await notify(stepCandidates(wf.flow.steps[0]), `Pengajuan perubahan data dari ${session.user.name ?? "karyawan"}`, null, "/portal/notifikasi?modul=karyawan");
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
  if (!access) return { error: "Sesi tidak valid, silakan login ulang." };
  const req = await prisma.profileChangeRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (req.userId === access.id) return { error: "Tidak bisa menyetujui perubahan data sendiri." };
  const flow = readApproval(req.approval);
  // Tanpa Workflow: Admin Data Karyawan. Dengan Workflow: penyetuju level yang sedang berjalan.
  if (flow ? !actionableApprovers(flow).includes(access.id) : !canEditMenu(access, "karyawan")) {
    return { error: flow ? "Pengajuan ini belum sampai di level Anda, atau Anda bukan penyetujunya." : "Hanya Admin yang bisa memutus perubahan data." };
  }
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  let trail: InterviewApproval | null = null;
  if (flow) {
    const r = decideStep(flow, access.id, approve, note, access.name);
    if ("error" in r) return { error: r.error };
    trail = r.approval;
    // Masih ada level berikutnya: simpan jejak, beri tahu penyetuju berikutnya.
    if (!r.rejected && !r.done) {
      await prisma.profileChangeRequest.update({ where: { id }, data: { approval: trail as unknown as Prisma.InputJsonValue } });
      const next = trail.steps.find((s) => !s.decision);
      const who = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
      if (next) await notify(stepCandidates(next), `Pengajuan perubahan data dari ${who?.name ?? "karyawan"}`, `Disetujui ${access.name} di level sebelumnya.`, "/portal/notifikasi?modul=karyawan");
      refresh(req.userId);
      return {};
    }
  }
  if (approve) {
    // Penerapan memakai jalur edit Data Karyawan. Dengan Workflow, dijalankan atas nama penyetuju yang memegang
    // hak Edit Data Karyawan (atau Super Admin), karena penyetuju terakhir (mis. Kepala HRD) bisa saja tanpa hak itu.
    const apply = async () => {
      const changes = req.changes as ProfileChanges;
      const data = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.new]));
      if (Object.keys(data).length) await updateEmployee(req.userId, data);
      if (req.family) await saveFamily(req.userId, req.family as FamilyRow[]);
    };
    try {
      if (trail) {
        const deciders = trail.steps.map((s) => s.id);
        const editors = await prisma.user.findMany({ where: { id: { in: deciders }, isActive: true }, select: { id: true, role: true, menuAccess: true } });
        const applier = editors.find((u) => canEditMenu(u, "karyawan"))?.id
          ?? (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } }))?.id;
        if (!applier) return { error: "Tidak ada Admin Data Karyawan yang dapat menerapkan perubahan." };
        await approvedRun.run({ requesterId: applier }, apply);
      } else await apply();
    } catch (e) {
      return { error: e instanceof Error && e.message !== "Not found" ? e.message : "Data karyawan tidak bisa diubah." };
    }
  }
  await prisma.profileChangeRequest.update({
    where: { id },
    data: {
      status: approve ? "APPROVED" : "REJECTED", note: note.trim() || null, decidedBy: access.name, decidedAt: new Date(),
      ...(trail ? { approval: trail as unknown as Prisma.InputJsonValue } : {}),
    },
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
