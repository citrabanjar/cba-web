// Employee ID otomatis (keputusan pemilik 2026-11-20):
// - Tetap "P", Kontrak "K", Harian "H" + 3 digit nomor urut.
// - Nomor urut dipakai bersama P, K, dan H (termasuk ID hasil upload), jadi 3 digitnya tidak pernah kembar; nomor kosong diisi dulu.
// - Status berubah (mis. diangkat Kontrak → Tetap): awalan ikut status, nomor tetap (K123 → P123).
import { prisma } from "@/lib/prisma";

const PATTERN = /^[KPH](\d{3,})$/i;
export const idPrefix = (status: string | null | undefined) => (status === "TETAP" ? "P" : status === "HARIAN" ? "H" : "K");
export const isAutoId = (id: string | null | undefined) => PATTERN.test((id ?? "").trim());
export const formatId = (status: string | null | undefined, n: number) => `${idPrefix(status)}${String(n).padStart(3, "0")}`;

// Nomor berikutnya = nomor terkecil yang belum dipakai ID K### / P### / H### mana pun (nomor kosong diisi dulu;
// keputusan pemilik 2026-11-20). Nomor karyawan nonaktif / resign tetap terpakai selama datanya ada.
// Nomor yang sudah dipesan calon "Disetujui, siap didaftarkan" juga dianggap terpakai.
export async function nextEmployeeNumber(exceptCandidateId?: string) {
  const [rows, reserved] = await Promise.all([
    prisma.user.findMany({ where: { employeeId: { not: null } }, select: { employeeId: true } }),
    prisma.candidate.findMany({ where: { status: "SIAP_DAFTAR", ...(exceptCandidateId ? { id: { not: exceptCandidateId } } : {}) }, select: { job: true } }),
  ]);
  const ids = [...rows.map((r) => r.employeeId ?? ""), ...reserved.map((c) => String((c.job as { employeeId?: unknown } | null)?.employeeId ?? ""))];
  const used = new Set(ids.flatMap((id) => { const hit = PATTERN.exec(id.trim()); return hit ? [Number(hit[1])] : []; }));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export async function nextEmployeeId(status: string | null | undefined, exceptCandidateId?: string) {
  return formatId(status, await nextEmployeeNumber(exceptCandidateId));
}

// Employee ID calon: dipesan saat pemutus menyetujui (berkas kembali ke Admin), dipakai saat didaftarkan.
// ID pesanan yang masih bebas dipakai (awalan menyesuaikan status kerja); bila sudah terpakai, diambil nomor baru.
export async function candidateEmployeeId(candidateId: string, current: string | null | undefined, status: string | null | undefined) {
  const id = (current ?? "").trim();
  if (PATTERN.test(id)) {
    const want = idForStatus(id, status) ?? id.toUpperCase();
    const taken = await prisma.user.findFirst({ where: { employeeId: want }, select: { id: true } });
    if (!taken) return want;
  }
  return nextEmployeeId(status, candidateId);
}

// ID sesuai status baru dengan nomor yang sama (K123 → P123, H045 → K045). ID lain (mis. DIR03) tidak diubah → null.
export function idForStatus(id: string | null | undefined, status: string | null | undefined) {
  const hit = PATTERN.exec((id ?? "").trim());
  if (!hit) return null;
  const next = `${idPrefix(status)}${hit[1]}`;
  return next.toUpperCase() === (id ?? "").trim().toUpperCase() ? null : next;
}
