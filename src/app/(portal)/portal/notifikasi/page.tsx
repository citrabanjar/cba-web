export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isApprover, pendingApprovals } from "@/lib/approval";
import { moduleOf, NOTIF_MODULES, type NotifModule } from "@/lib/notif-modules";
import NotifikasiClient from "./NotifikasiClient";

export const metadata: Metadata = { title: "Notifikasi" };

// Halaman Notifikasi (dibuka dari lonceng): modul bersusun di kiri, riwayat lengkap modul terpilih di kanan.
export default async function NotifikasiPage({ searchParams }: { searchParams: Promise<{ modul?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  const approver = { id: access.id, role: access.role, menuAccess: access.menuAccess };
  const [rows, approvals] = await Promise.all([
    prisma.notification.findMany({ where: { userId: access.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    isApprover(approver).then((ok) => (ok ? pendingApprovals(approver) : null)),
  ]);
  const items = rows.map((n) => ({
    id: n.id, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString(), module: moduleOf(n.href),
  }));
  // Modul utama selalu tampil; Data Diri & Lainnya hanya bila ada isinya.
  const modules = NOTIF_MODULES
    .map((m) => ({ key: m.key, label: m.label, total: items.filter((i) => i.module === m.key).length, unread: items.filter((i) => i.module === m.key && !i.read).length }))
    .filter((m) => !["profil", "lainnya"].includes(m.key) || m.total > 0);

  const { modul } = await searchParams;
  const pick = modules.find((m) => m.key === modul)?.key
    ?? modules.find((m) => m.unread > 0)?.key
    ?? items.find((i) => modules.some((m) => m.key === i.module))?.module
    ?? modules[0].key;

  return <NotifikasiClient modules={modules} items={items} selected={pick as NotifModule} approvals={approvals} />;
}
