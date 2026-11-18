"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMenuApply } from "@/lib/access";
import { notifyDue } from "@/lib/announcement";

export type AnnouncementInput = { title: string; body: string; pinned: boolean; startDate: string; endDate: string };
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

// Simpan pengumuman (baru bila id kosong). Kewenangan Pengaturan (edit).
export async function saveAnnouncement(id: string | null, input: AnnouncementInput): Promise<{ error?: string; id?: string }> {
  const user = await requireMenuApply("pengaturan");
  const title = input.title.trim(), body = input.body.trim();
  if (!title) return { error: "Judul pengumuman wajib diisi." };
  if (!body) return { error: "Isi pengumuman wajib diisi." };
  if (!isDate(input.startDate)) return { error: "Tanggal mulai tayang wajib diisi." };
  if (input.endDate && !isDate(input.endDate)) return { error: "Tanggal selesai tayang tidak valid." };
  if (input.endDate && input.endDate < input.startDate) return { error: "Tanggal selesai tayang tidak boleh sebelum tanggal mulai." };
  const data = {
    title: title.slice(0, 200), body, pinned: input.pinned,
    startDate: new Date(`${input.startDate}T00:00:00Z`), endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
  };
  const row = id
    ? await prisma.announcement.update({ where: { id }, data })
    : await prisma.announcement.create({ data: { ...data, createdBy: user.name ?? null } });
  await notifyDue();
  revalidatePath("/portal/admin/pengumuman");
  revalidatePath("/portal/dashboard");
  return { id: row.id };
}

export async function deleteAnnouncement(id: string): Promise<{ error?: string }> {
  await requireMenuApply("pengaturan");
  await prisma.announcement.delete({ where: { id } }).catch(() => null);
  revalidatePath("/portal/admin/pengumuman");
  revalidatePath("/portal/dashboard");
  return {};
}
