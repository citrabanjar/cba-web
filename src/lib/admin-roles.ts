// Peran Admin (Super Admin → Pengaturan → Peran Admin & Anggota Admin).
// Satu peran = nama + kewenangan menu (mis. "Admin Absen": Absensi & Cuti). Anggota peran otomatis menjadi ADMIN
// dan hak menunya = gabungan semua peran yang ia ikuti. Karyawan yang tidak ikut peran mana pun kembali menjadi karyawan biasa.
// Peran juga bisa dipilih sebagai penyetuju (approve/reject) di menu Workflow: nilai level "PERAN:<id>".
import { prisma } from "@/lib/prisma";
import { MENUS } from "@/lib/roles";

export const ADMIN_ROLES_KEY = "admin-roles";
export type AdminRole = { id: string; name: string; desc: string; menus: string[]; members: string[] };

const known = new Set<string>(MENUS.map((m) => m.key));
const str = (v: unknown) => (typeof v === "string" ? v : "");

function read(raw: unknown): AdminRole[] | null {
  const list = (raw as { roles?: unknown } | null)?.roles;
  if (!Array.isArray(list)) return null;
  return list.map((r: Record<string, unknown>) => ({
    id: str(r.id), name: str(r.name).trim(), desc: str(r.desc).trim(),
    menus: Array.isArray(r.menus) ? [...new Set(r.menus.map(str).filter((m) => known.has(m)))] : [],
    members: Array.isArray(r.members) ? [...new Set(r.members.map(str).filter(Boolean))] : [],
  })).filter((r) => r.id && r.name);
}

// Peran tersimpan. Pertama kali dibuka: Admin lama dikelompokkan menurut hak menunya supaya tidak ada yang kehilangan akses.
export async function getAdminRoles(): Promise<AdminRole[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: ADMIN_ROLES_KEY } });
  const saved = read(row?.value);
  if (saved) return saved;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, menuAccess: true } });
  const groups = new Map<string, string[]>();
  for (const a of admins) {
    const k = [...a.menuAccess].filter((m) => known.has(m)).sort().join(",");
    groups.set(k, [...(groups.get(k) ?? []), a.id]);
  }
  return [...groups.entries()].map(([k, members], i) => ({
    id: `lama-${i + 1}`,
    name: `Admin ${i + 1}`,
    desc: "Dibuat otomatis dari hak akses Admin sebelumnya.",
    menus: k ? k.split(",") : [],
    members,
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
