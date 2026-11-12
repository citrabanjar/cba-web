"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { AI_SETTING_KEY, normalizeAiSettings, type AiSettings } from "@/lib/ai-checker-settings";
import { collectRuns, startRun } from "@/lib/ai-checker";

type Result = { error?: string; info?: string };

// Setup detail fitur dikerjakan Admin; Super Admin hanya menyalakan fitur (Pengaturan → Fitur).
async function requireAdminOnly() {
  const session = await auth();
  if (!session?.user || !isManagement(session.user.role) || isSuperAdmin(session.user.role)) throw new Error("Unauthorized");
  return session.user;
}
async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isManagement(session.user.role)) throw new Error("Unauthorized");
  return session.user;
}
const refresh = () => { revalidatePath("/portal/admin/settings"); revalidatePath("/portal/dashboard"); };

export async function saveAiSettings(input: AiSettings): Promise<Result> {
  const user = await requireAdminOnly();
  const value = normalizeAiSettings(input);
  await prisma.appSetting.upsert({
    where: { key: AI_SETTING_KEY },
    update: { value, updatedBy: user.name ?? null }, create: { key: AI_SETTING_KEY, value, updatedBy: user.name ?? null },
  });
  refresh();
  return {};
}

export async function runAiNow(): Promise<Result> {
  const user = await requireAdminOnly();
  const res = await startRun("MANUAL", user.name ?? null);
  refresh();
  return res.error ? { error: res.error } : { info: "Pemeriksaan dikirim. Hasilnya biasanya siap dalam 1 jam; klik Ambil hasil." };
}

export async function collectAiNow(): Promise<Result> {
  await requireAdminOnly();
  const { collected } = await collectRuns();
  refresh();
  return { info: collected ? "Hasil pemeriksaan sudah masuk ke Task Admin." : "Belum ada hasil yang siap. Coba lagi beberapa saat lagi." };
}

// ─── Buku catatan AI ───────────────────────────────────────────────────────

export async function saveAiNote(input: { id?: string; title: string; content: string }): Promise<Result> {
  const user = await requireAdminOnly();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return { error: "Judul dan isi SOP wajib diisi." };
  if (input.id) await prisma.aiNote.update({ where: { id: input.id }, data: { title, content } });
  else await prisma.aiNote.create({ data: { kind: "SOP", title, content, status: "AKTIF", source: "SUPER_ADMIN", createdBy: user.name ?? null } });
  refresh();
  return {};
}

export async function decideAiRule(id: string, approve: boolean): Promise<Result> {
  const user = await requireAdminOnly();
  await prisma.aiNote.update({ where: { id }, data: { status: approve ? "AKTIF" : "DITOLAK", approvedBy: user.name ?? null, approvedAt: new Date() } });
  refresh();
  return {};
}

export async function deleteAiNote(id: string): Promise<Result> {
  await requireAdminOnly();
  const note = await prisma.aiNote.findUnique({ where: { id } });
  if (!note) return {};
  await prisma.aiNote.delete({ where: { id } });
  // Catatan "Bukan masalah" dihapus → temuannya boleh dilaporkan lagi.
  if (note.kind === "BUKAN_MASALAH") {
    const fp = note.content.match(/\[(.+?)\]$/)?.[1];
    if (fp) await prisma.aiFinding.updateMany({ where: { fingerprint: fp, status: "BUKAN_MASALAH" }, data: { status: "SELESAI" } });
  }
  refresh();
  return {};
}

// ─── Temuan di Task Admin (Admin & Super Admin) ────────────────────────────

export async function resolveAiFinding(id: string, notIssue: boolean, reason: string): Promise<Result> {
  const user = await requireAdmin();
  const f = await prisma.aiFinding.findUnique({ where: { id } });
  if (!f || f.status !== "BARU") return {};
  if (notIssue && !reason.trim()) return { error: "Tulis alasannya supaya AI bisa belajar." };
  await prisma.aiFinding.update({
    where: { id },
    data: { status: notIssue ? "BUKAN_MASALAH" : "SELESAI", reason: reason.trim() || null, resolvedBy: user.name ?? null, resolvedAt: new Date() },
  });
  if (notIssue) {
    await prisma.aiNote.create({
      data: {
        kind: "BUKAN_MASALAH", title: f.title, status: "AKTIF", source: "ADMIN", createdBy: user.name ?? null,
        content: `${f.employeeIds.length ? `Karyawan: ${f.employeeIds.join(", ")}. ` : ""}Alasan admin: ${reason.trim()} [${f.fingerprint}]`,
      },
    });
  }
  refresh();
  return {};
}
