// Pengaturan AI pemeriksa sistem (aman dipakai di server dan browser). Disimpan di AppSetting "ai.checker".

export const AI_SETTING_KEY = "ai.checker";
export const AI_MODEL = "claude-opus-5-5";
export const AI_MODEL_LABEL = "Claude Opus 5.5";

// Pilihan jadwal pemeriksaan (hari).
export const AI_INTERVALS = [
  { days: 1, label: "Tiap hari" },
  { days: 2, label: "2 hari sekali" },
  { days: 3, label: "3 hari sekali" },
  { days: 7, label: "Seminggu sekali" },
] as const;

export type AiSettings = {
  enabled: boolean; // pemeriksaan terjadwal menyala
  intervalDays: number;
  includeSalary: boolean; // angka gaji ikut dikirim (tetap tanpa nama, KTP, rekening, alamat)
};
export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: false, intervalDays: 2, includeSalary: true };

export function normalizeAiSettings(raw: unknown): AiSettings {
  const v = (raw ?? {}) as Partial<AiSettings>;
  const days = AI_INTERVALS.some((i) => i.days === v.intervalDays) ? (v.intervalDays as number) : DEFAULT_AI_SETTINGS.intervalDays;
  return {
    enabled: v.enabled === true,
    intervalDays: days,
    includeSalary: v.includeSalary !== false,
  };
}

export const AI_AREAS: Record<string, string> = {
  PAYROLL: "Payroll",
  PAJAK_BPJS: "Pajak & BPJS",
  DATA: "Kualitas data",
  PRIORITAS: "Prioritas",
};
export const AI_SEVERITY: Record<string, { label: string; tone: string }> = {
  TINGGI: { label: "Tinggi", tone: "bg-rose-100 text-rose-700" },
  SEDANG: { label: "Sedang", tone: "bg-amber-100 text-amber-700" },
  RENDAH: { label: "Rendah", tone: "bg-sky-100 text-sky-700" },
};

// Perkiraan biaya (Message Batches = diskon 50%): Opus 5.5 $4 / $20 per 1 juta token → batch $2 / $10;
// token cache dibaca $0,20 → batch $0,10.
export const USD_TO_IDR = 16500;
export function estimateCostUsd(r: { inputTokens: number; outputTokens: number; cacheReadTokens: number }) {
  return (r.inputTokens * 2 + r.outputTokens * 10 + r.cacheReadTokens * 0.1) / 1_000_000;
}
