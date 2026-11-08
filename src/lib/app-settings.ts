import { prisma } from "@/lib/prisma";
import { DEFAULT_HIDDEN_INDICATORS, INDICATOR_SETTING_KEY } from "@/lib/dashboard-indicators";

// Kartu indikator Beranda yang dimatikan Super Admin.
export async function getHiddenIndicators(): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: INDICATOR_SETTING_KEY } });
  const hidden = (row?.value as { hidden?: unknown } | null)?.hidden;
  return Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === "string") : DEFAULT_HIDDEN_INDICATORS;
}
