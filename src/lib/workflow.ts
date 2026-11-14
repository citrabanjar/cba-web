// Menu Workflow (Admin): approval custom per modul yang menggantikan (bypass) atasan langsung di profil karyawan.
// Super Admin hanya menyalakan fitur Workflow di Pengaturan → Fitur; Level 1..3 per modul juga diatur Super Admin di menu Workflow.
// Setiap level bisa disetujui oleh: karyawan tertentu, pemegang jabatan tertentu, atau pemegang hak akses tertentu.
// Modul tidak aktif → aturan default (atasan langsung). Aman dipakai di server dan browser.
import { MENUS } from "@/lib/roles";

export const WORKFLOW_KEY = "workflow";
export const MAX_LEVELS = 3;

export const WORKFLOW_MODULES = [
  // Pra-Karyawan tidak lagi di sini: pewawancara & approver diatur Admin di menu Pra-Karyawan → Alur.
  { key: "CUTI", label: "Cuti", desc: "Pengajuan cuti dan izin karyawan." },
  { key: "DINAS", label: "Dinas Luar", desc: "Pengajuan dinas luar karyawan." },
  { key: "LEMBUR", label: "Lembur", desc: "Pengajuan lembur (modul Lembur menyusul).", soon: true },
  { key: "TUKAR_SHIFT", label: "Tukar Shift", desc: "Pengajuan tukar shift antarkaryawan (menyusul).", soon: true },
  { key: "PERUBAHAN_DATA", label: "Perubahan Data", desc: "Perubahan data pribadi dari Profil Saya (menyusul).", soon: true },
] as const;
export type WorkflowKey = (typeof WORKFLOW_MODULES)[number]["key"];

// Jenis approver per level.
export type LevelType = "EMPLOYEE" | "POSITION" | "ROLE";
export const LEVEL_TYPES: { value: LevelType; label: string }[] = [
  { value: "POSITION", label: "Berdasarkan jabatan" },
  { value: "ROLE", label: "Berdasarkan hak akses" },
  { value: "EMPLOYEE", label: "Karyawan tertentu" },
];
// Hak akses: Super Admin, semua Admin, atau Admin dengan akses menu tertentu.
export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Semua Admin" },
  ...MENUS.map((m) => ({ value: `ADMIN:${m.key}`, label: `Admin ${m.label}` })),
];
export const roleOptionLabel = (v: string) => ROLE_OPTIONS.find((r) => r.value === v)?.label ?? v;
// Peran Admin buatan Super Admin (Pengaturan → Peran Admin) juga bisa jadi penyetuju: nilai "PERAN:<id>".
export const ROLE_GROUP_PREFIX = "PERAN:";

export type WorkflowLevel = { type: LevelType; value: string; label: string };
export type WorkflowModule = { enabled: boolean; levels: WorkflowLevel[] };
export type WorkflowSettings = Record<WorkflowKey, WorkflowModule>;

// Level "jabatan" = atasan di bagan organisasi: ke-1 atasan langsung, ke-2 atasan dari atasan, dst.
export const chainTitle = (n: number) => (n === 1 ? "Atasan langsung" : n === 2 ? "Atasan dari atasan" : `Atasan tingkat ${n}`);
export const CHAIN_VALUE = "ATASAN";

// Nama yang tampil di jejak approval.
export const levelTitle = (l: WorkflowLevel) =>
  l.type === "POSITION" ? "Atasan (bagan organisasi)" : l.type === "ROLE" ? (l.value.startsWith(ROLE_GROUP_PREFIX) ? l.label || "Peran Admin" : roleOptionLabel(l.value)) : l.label || l.value;

// Fitur Workflow aktif atau tidak (Pengaturan → Fitur). Nonaktif = semua approval ke atasan langsung, menu Workflow disembunyikan.
export const WORKFLOW_FEATURE_KEY = "feature-workflow";
export const readWorkflowFeature = (raw: unknown) => (raw as { enabled?: unknown } | null)?.enabled !== false;

const str = (v: unknown) => (typeof v === "string" ? v : "");

function readLevel(raw: Record<string, unknown>): WorkflowLevel | null {
  // Format lama: { id, name } = karyawan tertentu.
  if (!raw.type && str(raw.id)) return { type: "EMPLOYEE", value: str(raw.id), label: str(raw.name) };
  const type = raw.type === "POSITION" || raw.type === "ROLE" || raw.type === "EMPLOYEE" ? raw.type : null;
  const value = type === "POSITION" ? CHAIN_VALUE : str(raw.value).trim(); // jabatan tidak perlu nilai: mengikuti bagan organisasi
  if (!type || !value) return null;
  if (type === "ROLE" && !value.startsWith(ROLE_GROUP_PREFIX) && !ROLE_OPTIONS.some((r) => r.value === value)) return null;
  return { type, value, label: str(raw.label) };
}

export function normalizeWorkflow(raw: unknown): WorkflowSettings {
  const v = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as WorkflowSettings;
  for (const m of WORKFLOW_MODULES) {
    const r = v[m.key] ?? {};
    const seen = new Set<string>();
    const levels = Array.isArray(r.levels)
      ? (r.levels as Record<string, unknown>[]).map((x) => readLevel(x ?? {})).filter((l): l is WorkflowLevel => {
          if (!l) return false;
          if (l.type === "POSITION") return true; // boleh lebih dari satu: tiap level naik satu tingkat
          const k = `${l.type}:${l.value.toLowerCase()}`;
          return !seen.has(k) && !!seen.add(k);
        })
      : [];
    out[m.key] = { enabled: r.enabled === true && !("soon" in m), levels: levels.slice(0, MAX_LEVELS) };
  }
  return out;
}
