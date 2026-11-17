// Pengajuan Tidak Masuk (menu Kehadiran): batas mundur tanggal yang boleh diajukan (diatur Admin di Setup Cuti).
import { prisma } from "@/lib/prisma";

export const ABSENCE_KEY = "leave.absence";
export const DEFAULT_BACK_DAYS = 3;
export const MAX_BACK_DAYS = 31;

export async function getAbsenceBackDays() {
  const row = await prisma.appSetting.findUnique({ where: { key: ABSENCE_KEY } });
  const n = Number((row?.value as { backDays?: unknown } | null)?.backDays);
  return Number.isFinite(n) ? Math.min(MAX_BACK_DAYS, Math.max(0, Math.round(n))) : DEFAULT_BACK_DAYS;
}
