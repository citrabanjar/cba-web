"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { assessRecent } from "@/lib/attendance-assess";
import { SIM_SETTING_KEY, deleteSimulated, simulateRange } from "@/lib/attendance-sim";
import { simulateRequests } from "@/lib/request-sim";

// Absen uji (masa testing), khusus Super Admin.
async function requireSuper() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) throw new Error("Hanya Super Admin.");
  return session.user;
}

export async function setSimEnabled(enabled: boolean): Promise<{ error?: string }> {
  const user = await requireSuper();
  await prisma.appSetting.upsert({
    where: { key: SIM_SETTING_KEY },
    update: { value: { enabled }, updatedBy: user.name ?? null },
    create: { key: SIM_SETTING_KEY, value: { enabled }, updatedBy: user.name ?? null },
  });
  revalidatePath("/portal/admin/settings");
  return {};
}

// Isi absen uji untuk rentang tanggal (dari – sampai, paling lambat hari ini; hari ini sesuai jam sekarang),
// lalu nilai ulang kehadiran (alpha otomatis).
export async function runSimNow(fromDate: string, toDate: string, requests = 0): Promise<{ error?: string; created?: number; overtime?: number; requests?: Record<string, number>; requestTotal?: number }> {
  await requireSuper();
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!ok(fromDate) || !ok(toDate)) throw new Error("Pilih tanggal awal dan akhir.");
  const from = new Date(`${fromDate}T00:00:00Z`), to = new Date(`${toDate}T00:00:00Z`);
  if (to < from) throw new Error("Tanggal akhir tidak boleh sebelum tanggal awal.");
  if ((to.getTime() - from.getTime()) / 86_400_000 + 1 > 31) throw new Error("Paling banyak 31 hari sekali isi.");
  const r = await simulateRange(from, to);
  await assessRecent(true).catch(() => null);
  // Pengajuan uji menunggu persetujuan (tanggal ke depan), lewat jalur pengajuan asli.
  const q = requests > 0 ? await simulateRequests(Math.min(20, requests)) : null;
  revalidatePath("/portal", "layout");
  return { created: r.created, overtime: r.overtime, requests: q?.created, requestTotal: q?.total };
}

export async function clearSim(): Promise<{ error?: string; deleted?: number }> {
  await requireSuper();
  const deleted = await deleteSimulated();
  await assessRecent(true).catch(() => null);
  revalidatePath("/portal", "layout");
  return { deleted };
}
