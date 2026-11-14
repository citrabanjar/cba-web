// Kabar ke lonceng notifikasi karyawan (mis. pengajuan disetujui / ditolak).
// Gagal mencatat kabar tidak boleh menggagalkan keputusan yang sudah tersimpan.
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export async function notify(userIds: string | (string | null | undefined)[], title: string, body?: string | null, href?: string | null) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter((x): x is string => !!x))];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body: body || null, href: href || null })) });
  } catch {
    // diabaikan
  }
}

// "16-Nov-2026" atau "16-Nov-2026 – 19-Nov-2026".
export const dateRange = (a: Date, b: Date) => `${formatDate(a)}${a.getTime() === b.getTime() ? "" : ` – ${formatDate(b)}`}`;

// Kalimat keputusan: "disetujui oleh X" / "ditolak oleh X: alasan".
export const decisionText = (approve: boolean, by: string | null | undefined, note?: string | null) =>
  `${approve ? "Disetujui" : "Ditolak"}${by ? ` oleh ${by}` : ""}${!approve && note?.trim() ? `: ${note.trim()}` : ""}.`;
