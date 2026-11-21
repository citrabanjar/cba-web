// Ringkasan perubahan untuk approver (pengajuan Admin): hanya isian yang berbeda. Aman dipakai di server.
import type { HoldDetail } from "@/lib/approval-hold";

export const holdFmt = (v: unknown) =>
  v === null || v === undefined || v === "" ? null
    : v instanceof Date ? v.toISOString().slice(0, 10)
    : typeof v === "boolean" ? (v ? "Ya" : "Tidak")
    // Daftar jam (mis. istirahat shift) → "18:00–19:00, ...".
    : Array.isArray(v) && v.every((x) => x && typeof x === "object" && "start" in x && "end" in x)
      ? (v.length ? v.map((x) => `${x.start}–${x.end}`).join(", ") : null)
    : typeof v === "object" ? JSON.stringify(v) : String(v);

export function holdDiff(labels: Record<string, string>, before: Record<string, unknown> | null, after: Record<string, unknown>): HoldDetail[] {
  return Object.entries(labels).flatMap(([k, label]) => {
    const o = holdFmt(before?.[k]), n = holdFmt(after[k]);
    return o === n ? [] : [{ field: label, oldValue: o, newValue: n }];
  });
}
