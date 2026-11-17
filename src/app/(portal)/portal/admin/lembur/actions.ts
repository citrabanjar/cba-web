"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMenu } from "@/lib/access";
import { nextSplNumber, splEnabled } from "@/lib/overtime";
import { cancelSplOvertime, checkSpl, orgChart, rupiah, type SplRowCheck, type SplRowInput } from "@/lib/spl";
import { notify } from "@/lib/notify";
import { verifyOvertime } from "@/lib/overtime-check";
import { formatDate } from "@/lib/utils";

type Result = { error?: string };
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Membuat / membatalkan SPL: hak edit Lembur. Keputusan revisi jam lembur: hak edit Gaji & Payroll.
const requireSpl = () => requireMenu("spl");

function refresh() {
  for (const p of ["/portal/admin/lembur", "/portal/admin/payroll", "/portal/lembur", "/portal/dashboard", "/portal/profil"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

export type SplInput = { date: string; rows: SplRowInput[] };

// Pratinjau SPL di form: hari kerja / libur, jam efektif, istirahat, estimasi, dan masalah tiap baris.
export async function previewSpl(input: SplInput) {
  const admin = await requireSpl();
  const r = await checkSpl(admin.id, input.date, input.rows, false);
  return { error: r.error, rows: r.rows };
}

// Admin Lembur membuat SPL untuk beberapa karyawan pada satu tanggal; tiap karyawan punya jam & uraian sendiri.
// Karyawan menjawab Bersedia / Tidak bersedia; atasan mendapat info (atasan di atas atasan langsung + estimasi).
export async function createSpl(input: SplInput): Promise<Result & { number?: string; rows?: SplRowCheck[] }> {
  const admin = await requireSpl();
  if (!(await splEnabled())) return { error: "Fitur Surat Perintah Lembur belum dinyalakan Super Admin." };
  if (!input.rows.length) return { error: "Tambahkan minimal satu karyawan." };
  const r = await checkSpl(admin.id, input.date, input.rows, true);
  if (r.error) return { error: r.error, rows: r.rows };
  if (r.rows.some((x) => x.problem)) return { error: "Periksa baris yang ditandai merah.", rows: r.rows };
  const date = r.date!;
  const rows = r.rows;
  const number = await nextSplNumber(date);
  const first = rows[0];
  await prisma.overtimeOrder.create({
    data: {
      number, date, startTime: first.startTime, endTime: first.endTime, breakStart: null, breakEnd: null, note: null, createdBy: admin.name,
      items: { create: rows.map((x) => ({ userId: x.userId, date, startTime: x.startTime, endTime: x.endTime, breakStart: null, breakEnd: null, reason: x.reason, status: "MENUNGGU_KARYAWAN", createdBy: admin.name })) },
    },
  });
  const day = formatDate(date);
  for (const x of rows) {
    await notify(x.userId, `Surat Perintah Lembur ${number}`, `${day} · ${x.startTime}–${x.endTime} (${num(x.hours)} jam): ${x.reason}. Pilih Bersedia atau Tidak bersedia.`, "/portal/lembur");
  }
  // Info atasan: atasan langsung tanpa estimasi; atasan di atasnya sampai pimpinan puncak dengan estimasi & bisa membatalkan.
  const org = await orgChart();
  const direct = new Map<string, SplRowCheck[]>(), upper = new Map<string, SplRowCheck[]>();
  for (const x of rows) {
    org.chain(x.userId).forEach((m, i) => {
      if (m === admin.id) return;
      const map = i === 0 ? direct : upper;
      map.set(m, [...(map.get(m) ?? []), x]);
    });
  }
  const list = (xs: SplRowCheck[]) => xs.map((x) => `${x.name} ${x.startTime}–${x.endTime}`).join(", ");
  for (const [m, xs] of direct) {
    await notify(m, `Info: Surat Perintah Lembur ${number}`, `${day} · ${xs.length} karyawan langsung Anda: ${list(xs)}. Dibuat ${admin.name}.`, "/portal/lembur?tim=1");
  }
  for (const [m, xs] of upper) {
    const total = xs.reduce((a, x) => a + (x.estimate ?? 0), 0);
    await notify(m, `Info: Surat Perintah Lembur ${number}`, `${day} · ${xs.length} karyawan di bawah Anda: ${list(xs)}. Estimasi upah lembur ${rupiah(total)}. Dibuat ${admin.name}. Buka untuk membatalkan bila perlu.`, "/portal/lembur?tim=1");
  }
  refresh();
  return { number };
}

// Batalkan lembur satu karyawan dari SPL (belum absen pulang). Alasan wajib; karyawan & atasan diberi tahu.
export async function cancelSplItem(id: string, reason: string): Promise<Result> {
  const admin = await requireSpl();
  const r = await cancelSplOvertime(id, { id: admin.id, name: admin.name }, reason);
  if (!r.error) refresh();
  return r;
}

// Admin Payroll memutus revisi jam lembur (check-out melewati jam akhir SPL).
export async function decideRevision(id: string, approve: boolean, note: string): Promise<Result> {
  const admin = await requireMenu("gaji");
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.revisionStatus !== "MENUNGGU") return { error: "Revisi tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  await prisma.overtime.update({
    where: { id },
    data: { revisionStatus: approve ? "DISETUJUI" : "DITOLAK", revisionBy: admin.name, revisionAt: new Date(), note: note.trim() || o.note },
  });
  await notify(o.userId, `Revisi jam lembur ${approve ? "disetujui" : "ditolak"}`,
    `${formatDate(o.date)} · ${approve ? `lembur dihitung sampai ${o.revisionEnd}` : `lembur tetap dihitung sampai ${o.endTime}`}${!approve && note.trim() ? `: ${note.trim()}` : ""}.`, "/portal/lembur");
  refresh();
  return {};
}

// Laporan cek fisik untuk karyawan tanpa atasan aktif: diputus Admin Lembur.
export async function verifyByAdmin(id: string, benar: boolean, note: string): Promise<Result> {
  const admin = await requireSpl();
  const r = await verifyOvertime(id, { id: admin.id, name: admin.name, canAdmin: true }, benar, note);
  if (!r.error) refresh();
  return r;
}
