// Kategori, satuan, dan label kebijakan cuti (Setup Leave). Dipakai server dan browser.

export const LEAVE_CATEGORIES = [
  { key: "TAHUNAN", label: "Cuti Tahunan" },
  { key: "ISTIRAHAT_PANJANG", label: "Istirahat Panjang" },
  { key: "KHUSUS", label: "Cuti Khusus / Penting" },
  { key: "MELAHIRKAN", label: "Melahirkan & Keguguran" },
  { key: "SAKIT", label: "Sakit" },
  { key: "IBADAH", label: "Ibadah" },
  { key: "DINAS", label: "Dinas" },
  { key: "TANPA_UPAH", label: "Tanpa Upah" },
  { key: "LAINNYA", label: "Lainnya" },
] as const;

export const LEAVE_UNITS = [
  { key: "HARI_KERJA", label: "hari kerja" },
  { key: "HARI_KALENDER", label: "hari kalender" },
  { key: "BULAN", label: "bulan" },
] as const;

export const LEAVE_PERIODS = [
  { key: "TAHUN", label: "per tahun" },
  { key: "KEJADIAN", label: "per kejadian" },
] as const;

export const isLeaveCategory = (v: string) => LEAVE_CATEGORIES.some((c) => c.key === v);
export const isLeaveUnit = (v: string) => LEAVE_UNITS.some((u) => u.key === v);
export const isLeavePeriod = (v: string) => LEAVE_PERIODS.some((p) => p.key === v);
export const unitLabel = (v: string) => LEAVE_UNITS.find((u) => u.key === v)?.label ?? v;
export const periodLabel = (v: string) => LEAVE_PERIODS.find((p) => p.key === v)?.label ?? v;
export const categoryLabel = (v: string) => LEAVE_CATEGORIES.find((c) => c.key === v)?.label ?? v;

export type LeavePolicyInput = {
  code: string; name: string; category: string; quota: number | null; unit: string; period: string;
  minServiceMonths: number; gender: string | null; forStatus: string | null; accrualPerMonth: number; paid: boolean; payNote: string; deductsAnnual: boolean;
  needsAttachment: boolean; attachmentNote: string; carryOverDays: number; noticeDays: number;
  legalBasis: string; note: string; isActive: boolean;
};
