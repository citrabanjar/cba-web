export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import type { FamilyRow, ProfileChanges } from "@/lib/profile-change";
import { isApprover } from "@/lib/approval";
import { moduleOf, NOTIF_MODULES, type NotifModule } from "@/lib/notif-modules";
import { loadApprovals } from "../persetujuan/panel";
import NotifikasiClient, { type PendingCard } from "./NotifikasiClient";

export const metadata: Metadata = { title: "Notifikasi" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Modul pengajuan Admin menurut jenisnya (gaji.* → Payroll, absensi.* → Kehadiran, cuti.* → Cuti, lainnya → Data Karyawan).
const editModule = (kind?: string): NotifModule =>
  kind?.startsWith("gaji.") ? "payroll" : kind?.startsWith("absensi.") ? "kehadiran" : kind?.startsWith("cuti.") ? "cuti" : kind?.startsWith("pinjaman.") ? "pinjaman" : "karyawan";

// Halaman Notifikasi (dibuka dari lonceng): modul bersusun di kiri, riwayat lengkap modul terpilih di kanan.
// Pengajuan yang menunggu keputusan saya (atasan langsung / approver) tampil di modulnya dengan tombol Setujui / Tolak,
// beserta riwayat persetujuan 60 hari terakhir di modul yang sama.
export default async function NotifikasiPage({ searchParams }: { searchParams: Promise<{ modul?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  const approver = { id: access.id, role: access.role, menuAccess: access.menuAccess };
  const [rows, canApprove, partnerSwaps, myEdits, myProfileReqs] = await Promise.all([
    prisma.notification.findMany({ where: { userId: access.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    isApprover(approver),
    // Tukar shift yang menunggu jawaban saya sebagai rekan.
    prisma.shiftSwapRequest.findMany({
      where: { partnerId: access.id, status: "MENUNGGU_REKAN" }, orderBy: { date: "asc" },
      include: { requester: { select: { name: true, employeeId: true } } },
    }),
    // Pengajuan perubahan data yang saya ajukan (Admin wajib approval): ikut tampil supaya bisa dipantau.
    prisma.employeeEditRequest.count({ where: { requesterId: access.id } }),
    // Pengajuan perubahan data diri saya yang masih menunggu (dibatalkan dari sini).
    prisma.profileChangeRequest.findMany({ where: { userId: access.id, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
  ]);
  const data = canApprove || myEdits > 0 ? await loadApprovals(approver) : null;

  // Notifikasi yang perlu dijawab langsung di sini: Surat Perintah Lembur (Bersedia / Tidak bersedia).
  const splNo = (title: string) => /^Surat Perintah Lembur (\S+)$/.exec(title)?.[1] ?? null;
  const numbers = [...new Set(rows.map((n) => splNo(n.title)).filter((x): x is string => !!x))];
  const spls = numbers.length
    ? await prisma.overtime.findMany({ where: { userId: access.id, order: { number: { in: numbers } } }, select: { id: true, status: true, order: { select: { number: true } } } })
    : [];
  const splBy = new Map(spls.map((o) => [o.order?.number ?? "", { kind: "spl" as const, id: o.id, status: o.status }]));
  const items = rows.map((n) => ({
    id: n.id, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString(), module: moduleOf(n.href, n.title),
    action: splBy.get(splNo(n.title) ?? "") ?? null,
  }));

  // Pengajuan menunggu keputusan saya, dikelompokkan ke modulnya.
  const pending: PendingCard[] = [
    ...partnerSwaps.map((s) => ({
      module: "kehadiran" as NotifModule, key: `partner-${s.id}`,
      card: { type: "partner" as const, id: s.id, date: ymd(s.date), requester: `${s.requester.name}${s.requester.employeeId ? ` (${s.requester.employeeId})` : ""}`, requesterShift: s.requesterShift, partnerShift: s.partnerShift, reason: s.reason },
    })),
    ...(data?.items ?? []).filter((i) => i.status === "PENDING" && i.mine).map((i) => ({
      module: (i.kind === "CUTI" ? "cuti" : i.kind === "DINAS" ? "dinas" : "lembur") as NotifModule, key: `${i.kind}-${i.id}`, card: { type: "item" as const, item: i },
    })),
    ...(data?.swaps ?? []).filter((s) => s.mine).map((s) => ({ module: "kehadiran" as NotifModule, key: `swap-${s.id}`, card: { type: "swap" as const, s } })),
    ...(data?.edits ?? []).filter((e) => e.mine).map((e) => ({
      module: editModule(e.kind), key: `edit-${e.id}`, card: { type: "edit" as const, item: e },
    })),
    ...(data?.profiles ?? []).filter((p) => p.status === "PENDING").map((p) => ({ module: "karyawan" as NotifModule, key: `profile-${p.id}`, card: { type: "profile" as const, item: p } })),
    ...(data?.interviews ?? []).filter((i) => i.mine).map((i) => ({ module: "prakaryawan" as NotifModule, key: `iv-${i.id}`, card: { type: "interview" as const, item: i } })),
    ...(data?.loans ?? []).filter((l) => l.mine).map((l) => ({ module: "pinjaman" as NotifModule, key: `loan-${l.id}`, card: { type: "loan" as const, item: l } })),
  ];
  // Perubahan data yang masih menunggu keputusan orang lain (dipantau Super Admin & Admin Data Karyawan).
  const watching: PendingCard[] = [
    ...myProfileReqs.map((r) => ({
      module: "profil" as NotifModule, key: `my-profile-${r.id}`,
      card: { type: "myprofile" as const, item: {
        id: r.id, status: r.status, changes: r.changes as ProfileChanges, family: (r.family as FamilyRow[] | null) ?? null, reason: r.reason,
        note: r.note, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      } },
    })),
    ...(data?.edits ?? []).filter((e) => e.status === "PENDING" && !e.mine).map((e) => ({
      module: editModule(e.kind), key: `w-edit-${e.id}`, card: { type: "edit" as const, item: e },
    })),
    // Pinjaman yang masih berproses (mis. pimpinan puncak memantau selama pemeriksaan Admin).
    ...(data?.loans ?? []).filter((l) => l.status === "PENDING" && !l.mine).map((l) => ({ module: "pinjaman" as NotifModule, key: `w-loan-${l.id}`, card: { type: "loan" as const, item: l } })),
  ];
  // Riwayat persetujuan (sudah diputus / bukan giliran saya), 60 hari terakhir.
  const history: PendingCard[] = [
    ...(data?.items ?? []).filter((i) => !(i.status === "PENDING" && i.mine))
      .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)).map((i) => ({
        module: (i.kind === "CUTI" ? "cuti" : i.kind === "DINAS" ? "dinas" : "lembur") as NotifModule, key: `h-${i.kind}-${i.id}`, at: i.decidedAt ?? i.createdAt, card: { type: "item" as const, item: i },
      })),
    ...(data?.swaps ?? []).filter((s) => !s.mine).map((s) => ({ module: "kehadiran" as NotifModule, key: `h-swap-${s.id}`, at: `${s.date}T00:00:00.000Z`, card: { type: "swap" as const, s } })),
    ...(data?.edits ?? []).filter((e) => !e.mine && e.status !== "PENDING").map((e) => ({
      module: editModule(e.kind), key: `h-edit-${e.id}`, at: e.decidedAt ?? e.createdAt, card: { type: "edit" as const, item: e },
    })),
    ...(data?.profiles ?? []).filter((p) => p.status !== "PENDING").map((p) => ({ module: "karyawan" as NotifModule, key: `h-profile-${p.id}`, at: p.decidedAt ?? p.createdAt, card: { type: "profile" as const, item: p } })),
    ...(data?.interviews ?? []).filter((i) => !i.mine).map((i) => ({ module: "prakaryawan" as NotifModule, key: `h-iv-${i.id}`, card: { type: "interview" as const, item: i } })),
    ...(data?.loans ?? []).filter((l) => l.status !== "PENDING").map((l) => ({ module: "pinjaman" as NotifModule, key: `h-loan-${l.id}`, at: l.decidedAt ?? l.createdAt, card: { type: "loan" as const, item: l } })),
  ];

  // Modul utama selalu tampil; Data Diri, Payroll & Benefit, Data Karyawan, Lainnya hanya bila ada isinya.
  const modules = NOTIF_MODULES
    .map((m) => ({
      key: m.key, label: m.label, total: items.filter((i) => i.module === m.key).length,
      unread: items.filter((i) => i.module === m.key && !i.read).length, waiting: pending.filter((p) => p.module === m.key).length,
      watching: watching.filter((p) => p.module === m.key).length,
      done: history.filter((p) => p.module === m.key).length,
    }))
    .filter((m) => !["profil", "payroll", "karyawan", "prakaryawan", "lainnya"].includes(m.key) || m.total > 0 || m.waiting > 0 || m.watching > 0 || m.done > 0);

  const { modul } = await searchParams;
  // Urutan pilihan awal: modul yang diminta → modul dengan pengajuan menunggu → belum dibaca.
  const pick = modules.find((m) => m.key === modul)?.key
    ?? modules.find((m) => m.waiting > 0)?.key
    ?? modules.find((m) => m.watching > 0)?.key
    ?? modules.find((m) => m.unread > 0)?.key
    ?? items.find((i) => modules.some((m) => m.key === i.module))?.module
    ?? modules[0].key;

  return (
    <NotifikasiClient modules={modules} items={items} pending={pending} watching={watching} history={history} selected={pick} master={data?.master ?? null} />
  );
}
