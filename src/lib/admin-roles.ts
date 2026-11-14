// Peran Admin (Super Admin → Pengaturan → Peran Admin & Anggota Admin).
// Satu peran = nama + kewenangan menu (mis. "Admin Absen": Absensi & Cuti). Anggota peran otomatis menjadi ADMIN
// dan hak menunya = gabungan semua peran yang ia ikuti. Karyawan yang tidak ikut peran mana pun kembali menjadi karyawan biasa.
// Peran juga bisa dipilih sebagai penyetuju (approve/reject) di menu Workflow: nilai level "PERAN:<id>".
import { prisma } from "@/lib/prisma";
import { MENUS, menuEntry, menuLevelOf, type MenuLevel } from "@/lib/roles";

export const ADMIN_ROLES_KEY = "admin-roles";
// approvalLevels (per peran): 0 = tanpa approval; 1 = atasan langsung; 2 = atasan dari atasan langsung (dari bagan karyawan
// yang datanya diubah). Saat ini berlaku untuk Edit Data Karyawan: peran dengan approval menyimpan "karyawan:ajukan".
export type AdminRole = { id: string; name: string; desc: string; menus: string[]; members: string[]; approvalLevels: number };
export const MAX_APPROVAL_LEVELS = 2;
// Samakan isian Data Karyawan dengan aturan approval peran: Edit + approval = "karyawan:ajukan", tanpa approval = "karyawan".
const withApproval = (menus: string[], levels: number) => menus.map((k) =>
  levels > 0 && k === "karyawan" ? menuEntry("karyawan", "propose") : levels === 0 && k === menuEntry("karyawan", "propose") ? "karyawan" : k);

// Isian menus: "karyawan" = edit, "karyawan:lihat" = lihat saja (hanya tingkat yang tersedia untuk menu itu).
const known = new Set<string>(MENUS.flatMap((m) => (m.levels as readonly MenuLevel[]).map((l) => menuEntry(m.key, l))));
// Satu entri per menu; bila ada edit dan lihat sekaligus, edit yang dipakai.
// Menu yang hanya punya satu tingkat (Company: lihat, Import: edit) disesuaikan ke tingkat itu.
const tidy = (list: string[]) => MENUS.flatMap((m) => {
  const level = menuLevelOf(list, m.key);
  if (!level) return [];
  if (known.has(menuEntry(m.key, level))) return [menuEntry(m.key, level)];
  // Tingkat tidak tersedia untuk menu itu: turun ke tingkat yang lebih rendah yang tersedia.
  if (level !== "view" && known.has(menuEntry(m.key, "view"))) return [menuEntry(m.key, "view")];
  return [];
});
const str = (v: unknown) => (typeof v === "string" ? v : "");

function read(raw: unknown): AdminRole[] | null {
  const list = (raw as { roles?: unknown } | null)?.roles;
  if (!Array.isArray(list)) return null;
  return list.map((r: Record<string, unknown>) => {
    const menus = Array.isArray(r.menus) ? tidy(r.menus.map(str)) : [];
    // Data lama: approval hanya dari isian "karyawan:ajukan".
    const raw = r.approvalLevels === undefined ? (menus.includes(menuEntry("karyawan", "propose")) ? 1 : 0) : Number(r.approvalLevels);
    const approvalLevels = Math.min(MAX_APPROVAL_LEVELS, Math.max(0, Math.round(raw) || 0));
    return {
      id: str(r.id), name: str(r.name).trim(), desc: str(r.desc).trim(),
      menus: withApproval(menus, approvalLevels),
      members: Array.isArray(r.members) ? [...new Set(r.members.map(str).filter(Boolean))] : [],
      approvalLevels,
    };
  }).filter((r) => r.id && r.name);
}

// Peran tersimpan. Pertama kali dibuka: Admin lama dikelompokkan menurut hak menunya supaya tidak ada yang kehilangan akses.
export async function getAdminRoles(): Promise<AdminRole[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: ADMIN_ROLES_KEY } });
  const saved = read(row?.value);
  if (saved) return saved;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, menuAccess: true } });
  const groups = new Map<string, string[]>();
  for (const a of admins) {
    const k = tidy(a.menuAccess).sort().join(",");
    groups.set(k, [...(groups.get(k) ?? []), a.id]);
  }
  return [...groups.entries()].map(([k, members], i) => ({
    id: `lama-${i + 1}`,
    name: `Admin ${i + 1}`,
    desc: "Dibuat otomatis dari hak akses Admin sebelumnya.",
    menus: k ? k.split(",") : [],
    members,
    approvalLevels: k.split(",").includes(menuEntry("karyawan", "propose")) ? 1 : 0,
  }));
}

// Simpan semua peran lalu samakan role & menuAccess setiap karyawan dengan peran yang ia ikuti.
export async function saveAdminRoles(roles: AdminRole[], by: string | null) {
  const clean = read({ roles }) ?? [];
  await prisma.appSetting.upsert({
    where: { key: ADMIN_ROLES_KEY },
    update: { value: { roles: clean }, updatedBy: by },
    create: { key: ADMIN_ROLES_KEY, value: { roles: clean }, updatedBy: by },
  });

  const want = new Map<string, Set<string>>();
  for (const r of clean) for (const id of r.members) {
    const s = want.get(id) ?? new Set<string>();
    r.menus.forEach((m) => s.add(m));
    want.set(id, s);
  }
  // Gabungan beberapa peran: edit menang atas lihat.
  for (const [id, set] of want) want.set(id, new Set(tidy([...set])));
  const users = await prisma.user.findMany({
    where: { OR: [{ role: "ADMIN" }, { id: { in: [...want.keys()] } }], NOT: { role: "SUPER_ADMIN" } },
    select: { id: true, role: true, menuAccess: true },
  });
  for (const u of users) {
    const menus = [...(want.get(u.id) ?? [])].sort();
    const role = want.has(u.id) ? "ADMIN" : "KARYAWAN";
    if (u.role === role && [...u.menuAccess].sort().join() === menus.join()) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: {
        role, menuAccess: menus,
        changeLogs: { create: { field: "access", oldValue: `${u.role}: ${u.menuAccess.join(", ")}`, newValue: `${role}: ${menus.join(", ")}`, changedBy: by ?? "Super Admin" } },
      },
    });
  }
}

// Anggota aktif sebuah peran (untuk approver Workflow).
export async function roleMembers(roleId: string) {
  const role = (await getAdminRoles()).find((r) => r.id === roleId);
  if (!role?.members.length) return [];
  return prisma.user.findMany({ where: { id: { in: role.members }, isActive: true }, select: { id: true, name: true } });
}

// Jumlah level approval untuk Admin ini (hak Ajukan): terbesar dari peran yang memberi hak Ajukan Data Karyawan.
export async function approvalLevelsFor(userId: string) {
  const roles = (await getAdminRoles()).filter((r) => r.members.includes(userId) && menuLevelOf(r.menus, "karyawan") === "propose");
  return roles.length ? Math.max(1, ...roles.map((r) => r.approvalLevels)) : 1;
}
