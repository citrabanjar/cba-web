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

// Komponen sistem PPh 21 harus selalu ada: tidak bisa dibuat dari form Tambah Komponen, dan bisa ikut
// terhapus saat database dikosongkan. Dipanggil saat halaman Payroll dibuka; aman dipanggil berulang.
export async function ensureSystemComponents() {
  const exists = await prisma.payComponent.findFirst({ where: { method: "PPH21" }, select: { id: true } });
  if (exists) return;
  const taken = await prisma.payComponent.findUnique({ where: { code: "PPH21" }, select: { id: true } });
  try {
    await prisma.payComponent.create({
      data: {
        code: taken ? "PPH21S" : "PPH21", name: "PPh Pasal 21", kind: "POTONGAN", category: "PPH21", method: "PPH21", taxable: false,
        legalBasis: "PP 58/2023 dan PMK 168/2023 (Tarif Efektif Rata-rata); PTKP PMK 101/2016",
        note: "Januari-November memakai tarif efektif (TER) sesuai PTKP; masa pajak terakhir dihitung ulang setahun dengan tarif Pasal 17 dan biaya jabatan 5% (maks. Rp6 juta setahun).",
        isActive: true, sortOrder: 999, updatedBy: "Sistem",
      },
    });
  } catch {
    // Dibuat bersamaan oleh permintaan lain; abaikan.
  }
}
