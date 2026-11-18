// Pengumuman perusahaan (Beranda karyawan). Tayang bila startDate <= hari ini (WIB) dan endDate kosong / >= hari ini.
// Notifikasi lonceng dikirim sekali ke semua karyawan aktif saat pengumuman mulai tayang.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

export type AnnouncementView = { id: string; title: string; body: string; pinned: boolean; startDate: string; endDate: string | null; createdBy: string | null };

export const todayWibDate = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
const view = (a: { id: string; title: string; body: string; pinned: boolean; startDate: Date; endDate: Date | null; createdBy: string | null }): AnnouncementView => ({
  id: a.id, title: a.title, body: a.body, pinned: a.pinned, startDate: a.startDate.toISOString().slice(0, 10),
  endDate: a.endDate ? a.endDate.toISOString().slice(0, 10) : null, createdBy: a.createdBy,
});

// Pengumuman yang sedang tayang: disematkan dulu, lalu yang terbaru.
export async function activeAnnouncements(limit = 20): Promise<AnnouncementView[]> {
  const today = todayWibDate();
  await notifyDue(today);
  const rows = await prisma.announcement.findMany({
    where: { startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    orderBy: [{ pinned: "desc" }, { startDate: "desc" }, { createdAt: "desc" }], take: limit,
  });
  return rows.map(view);
}

export async function allAnnouncements(): Promise<AnnouncementView[]> {
  const rows = await prisma.announcement.findMany({ orderBy: [{ startDate: "desc" }, { createdAt: "desc" }] });
  return rows.map(view);
}

// Kirim notifikasi untuk pengumuman yang sudah mulai tayang tetapi belum diumumkan (termasuk yang dijadwalkan).
export async function notifyDue(today = todayWibDate()) {
  const due = await prisma.announcement.findMany({
    where: { notified: false, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    select: { id: true, title: true },
  });
  if (!due.length) return;
  // Tandai dulu supaya dua permintaan bersamaan tidak mengirim dua kali.
  const claimed = await prisma.announcement.updateMany({ where: { id: { in: due.map((d) => d.id) }, notified: false }, data: { notified: true } });
  if (!claimed.count) return;
  const people = await prisma.user.findMany({ where: { isActive: true, role: { not: "SUPER_ADMIN" } }, select: { id: true } });
  for (const a of due) await notify(people.map((p) => p.id), `Pengumuman: ${a.title}`, null, `/portal/dashboard?pengumuman=${a.id}`);
}
