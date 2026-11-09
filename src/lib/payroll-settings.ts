import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYROLL_SETTINGS, PAYROLL_SETTING_KEY, type PayrollSettings } from "@/lib/payroll";

// Setelan payroll yang tersimpan, dilengkapi nilai bawaan untuk isian yang belum ada.
export async function getPayrollSettings(): Promise<PayrollSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: PAYROLL_SETTING_KEY } });
  const saved = (row?.value ?? {}) as Partial<PayrollSettings>;
  return { ...DEFAULT_PAYROLL_SETTINGS, ...saved };
}
