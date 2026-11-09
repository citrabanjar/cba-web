// Agent HRD (berbasis aturan): pengaturan pengecekan dan pengingat SOP. Aman dipakai di server dan browser.
// Disimpan di AppSetting "agent.settings".

export const AGENT_SETTING_KEY = "agent.settings";

// Pengecekan monitoring yang bisa dinyalakan/dimatikan Super Admin.
export const MONITOR_CHECKS = [
  { key: "shift-soon", group: "Harian", title: "Shift hari ini & besok belum diisi" },
  { key: "attendance", group: "Harian", title: "Karyawan terjadwal belum check-in" },
  { key: "incomplete", group: "Harian", title: "Absen tidak lengkap (30 hari)" },
  { key: "leave", group: "Harian", title: "Pengajuan cuti menunggu" },
  { key: "trip", group: "Harian", title: "Pengajuan dinas menunggu" },
  { key: "loan", group: "Harian", title: "Pengajuan pinjaman menunggu" },
  { key: "loan-disburse", group: "Harian", title: "Pinjaman menunggu pencairan" },
  { key: "leave-appointed", group: "Harian", title: "Cuti karyawan yang baru diangkat tetap" },
  { key: "shift-month", group: "Bulanan", title: "Shift bulan ini belum lengkap" },
  { key: "shift-next", group: "Bulanan", title: "Shift bulan depan belum disiapkan" },
  { key: "contract", group: "Bulanan", title: "Kontrak akan berakhir" },
  { key: "holiday", group: "Bulanan", title: "Kalender libur tahun depan" },
  { key: "pay-basic", group: "Payroll & Pajak", title: "Karyawan aktif tanpa gaji pokok" },
  { key: "pay-pph", group: "Payroll & Pajak", title: "Karyawan belum ditempel komponen PPh 21" },
  { key: "pay-run", group: "Payroll & Pajak", title: "Proses Gaji menjelang tanggal gajian" },
  { key: "pay-tax-year", group: "Payroll & Pajak", title: "PTKP / tarif PPh 21 tahun depan belum disimpan" },
  { key: "pay-loan-contract", group: "Payroll & Pajak", title: "Angsuran pinjaman melewati akhir kontrak" },
  { key: "data", group: "Data Karyawan", title: "Kelengkapan data karyawan" },
  { key: "emp-no-pay", group: "Data Karyawan", title: "Karyawan belum ditempel komponen payroll" },
  { key: "emp-no-shift", group: "Data Karyawan", title: "Karyawan belum punya jadwal kerja / shift" },
  { key: "onb-review", group: "Harian", title: "Calon karyawan menunggu pemeriksaan HRD" },
  { key: "onb-approval", group: "Harian", title: "Calon karyawan menunggu approval" },
] as const;

// Pengingat SOP buatan Super Admin. MONTHLY: setiap tanggal `day`; YEARLY: setiap `day` bulan `month`;
// ONCE: sekali pada `date`. Muncul `leadDays` hari sebelumnya sampai ditandai selesai.
export type SopReminder = {
  id: string; title: string; note: string; freq: "MONTHLY" | "YEARLY" | "ONCE";
  day: number; month: number; date: string; leadDays: number;
};

export type AgentSettings = {
  enabled: string[]; // kunci pengecekan yang dinyalakan Super Admin (bawaan: tidak ada)
  contractDays: number; // kontrak berakhir dalam N hari dianggap perlu tindak lanjut
  payrollRemindDays: number; // ingatkan Proses Gaji N hari sebelum tanggal gajian
  reminders: SopReminder[];
  done: Record<string, string>; // id pengingat → tanggal kejadian yang sudah ditandai selesai
  setupDone: boolean; // panduan Setup Awal disembunyikan
};
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: [], contractDays: 30, payrollRemindDays: 5, reminders: [], done: {}, setupDone: false,
};

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Tanggal kejadian pengingat pada bulan (MONTHLY) atau tahun (YEARLY) dari tanggal acuan (YYYY-MM-DD).
export function reminderOccurrence(r: SopReminder, ref: string): string | null {
  const [y, m] = ref.split("-").map(Number);
  const at = (yy: number, mm: number, dd: number) => `${yy}-${pad(mm)}-${pad(Math.min(Math.max(1, dd), lastDay(yy, mm)))}`;
  if (r.freq === "ONCE") return /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  if (r.freq === "MONTHLY") return at(y, m, r.day);
  return at(y, r.month || 1, r.day);
}

const DAY = 86_400_000;
export type DueReminder = SopReminder & { occurrence: string; daysLeft: number };
export function dueReminders(s: AgentSettings, today: string): DueReminder[] {
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const out: DueReminder[] = [];
  for (const r of s.reminders) {
    // Bulanan: kejadian bulan lalu yang belum selesai tetap tampil, lalu kejadian bulan ini.
    const occs: string[] = [];
    const cur = reminderOccurrence(r, today);
    if (r.freq === "MONTHLY") {
      const [yy, mm] = today.split("-").map(Number);
      const prev = reminderOccurrence(r, new Date(Date.UTC(yy, mm - 2, 1)).toISOString().slice(0, 10));
      if (prev) occs.push(prev);
    }
    if (r.freq === "YEARLY") {
      const prevYear = reminderOccurrence(r, `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`);
      if (prevYear) occs.push(prevYear);
    }
    if (cur) occs.push(cur);
    for (const occ of occs) {
      if (s.done[r.id] && s.done[r.id] >= occ) continue;
      const daysLeft = Math.round((new Date(`${occ}T00:00:00Z`).getTime() - t) / DAY);
      // Tampil mulai leadDays sebelum tanggalnya; yang lewat tetap tampil sampai selesai (maks 45 hari).
      if (daysLeft <= r.leadDays && daysLeft >= -45) { out.push({ ...r, occurrence: occ, daysLeft }); break; }
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function normalizeAgentSettings(raw: unknown): AgentSettings {
  const v = (raw ?? {}) as Partial<AgentSettings>;
  // Isian lama "disabled" (semua menyala kecuali yang dimatikan) tidak dipakai lagi: bawaannya semua mati.
  const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
  return {
    enabled: Array.isArray(v.enabled) ? v.enabled.filter((x) => typeof x === "string") : [],
    contractDays: num(v.contractDays, DEFAULT_AGENT_SETTINGS.contractDays),
    payrollRemindDays: num(v.payrollRemindDays, DEFAULT_AGENT_SETTINGS.payrollRemindDays),
    reminders: Array.isArray(v.reminders) ? v.reminders : [],
    done: v.done && typeof v.done === "object" ? v.done : {},
    setupDone: v.setupDone === true,
  };
}
