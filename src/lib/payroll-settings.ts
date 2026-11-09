import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYROLL_SETTINGS, PAYROLL_SETTING_KEY, type PayrollSettings } from "@/lib/payroll";
import { TAX_SETTING_KEY, TER_SETTING_KEY, type TaxYearConfig, type TerVersion } from "@/lib/pph21";

// Setelan payroll yang tersimpan, dilengkapi nilai bawaan untuk isian yang belum ada.
export async function getPayrollSettings(): Promise<PayrollSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: PAYROLL_SETTING_KEY } });
  // Setelan lama bisa masih menyimpan wilayah/UMK/UMP; tidak dipakai lagi.
  const saved = Object.fromEntries(
    Object.entries((row?.value ?? {}) as Record<string, unknown>).filter(([k]) => !["region", "umk", "ump"].includes(k)),
  ) as Partial<PayrollSettings>;
  return { ...DEFAULT_PAYROLL_SETTINGS, ...saved };
}

// Pengaturan PPh 21 per tahun pajak: { "2026": {...}, "2027": {...} }.
export async function getTaxSettings(): Promise<Record<string, TaxYearConfig>> {
  const row = await prisma.appSetting.findUnique({ where: { key: TAX_SETTING_KEY } });
  return (row?.value ?? {}) as Record<string, TaxYearConfig>;
}

// Versi tarif TER PPh 21 yang tersimpan (masing-masing dengan tanggal berlaku).
export async function getTerSettings(): Promise<TerVersion[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: TER_SETTING_KEY } });
  return Array.isArray(row?.value) ? (row.value as unknown as TerVersion[]) : [];
}
