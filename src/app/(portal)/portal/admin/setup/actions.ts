"use server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/access";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

export type MasterKind = "branch" | "department" | "position";

const table = (kind: MasterKind) =>
  ({ branch: prisma.branch, department: prisma.department, position: prisma.position })[kind] as
    typeof prisma.branch;

function usersOf(kind: MasterKind, name: string): Prisma.UserWhereInput {
  if (kind === "department") return { department: { name } };
  return { [kind]: name };
}

function refresh() {
  revalidatePath("/portal/admin/setup");
  revalidatePath("/portal/admin/karyawan", "layout");
}

// Hasil dikembalikan sebagai pesan karena pesan error server action disamarkan di production.
export async function saveMasterItem(kind: MasterKind, id: string | null, value: string) {
  await requireSuperAdmin();
  const name = value.trim();
  if (!name) return { error: "Nama wajib diisi." };

  const taken = await table(kind).findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (taken) return { error: "Nama sudah dipakai." };

  if (!id) {
    await table(kind).create({ data: { name } });
  } else {
    const current = await table(kind).findUnique({ where: { id }, select: { name: true } });
    if (!current) return { error: "Data tidak ditemukan." };
    // Karyawan menyimpan nama cabang dan jabatan, jadi ikut diganti saat namanya berubah.
    await prisma.$transaction([
      table(kind).update({ where: { id }, data: { name } }),
      ...(kind === "department"
        ? []
        : [prisma.user.updateMany({ where: usersOf(kind, current.name), data: { [kind]: name } })]),
    ]);
  }
  refresh();
  return {};
}

export async function deleteMasterItem(kind: MasterKind, id: string) {
  await requireSuperAdmin();
  const current = await table(kind).findUnique({ where: { id }, select: { name: true } });
  if (!current) return { error: "Data tidak ditemukan." };
  if (await prisma.user.count({ where: usersOf(kind, current.name) })) {
    return { error: "Masih dipakai karyawan, jadi belum bisa dihapus." };
  }
  await table(kind).delete({ where: { id } });
  refresh();
  return {};
}

// Upload template Parameter Organisasi: nama baru ditambahkan; yang sudah ada (tanpa beda huruf besar/kecil) dilewati.
export async function importOrgParameters(data: Record<MasterKind, string[]>) {
  await requireSuperAdmin();
  const result: Record<MasterKind, { added: number; skipped: number }> = {
    branch: { added: 0, skipped: 0 }, department: { added: 0, skipped: 0 }, position: { added: 0, skipped: 0 },
  };
  for (const kind of ["branch", "department", "position"] as MasterKind[]) {
    const existing = new Set((await table(kind).findMany({ select: { name: true } })).map((x) => x.name.toLowerCase()));
    const seen = new Set<string>();
    const fresh: string[] = [];
    for (const raw of data[kind] ?? []) {
      const name = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
      if (!name) continue;
      const key = name.toLowerCase();
      if (existing.has(key) || seen.has(key)) { result[kind].skipped++; continue; }
      seen.add(key);
      fresh.push(name);
    }
    if (fresh.length) await table(kind).createMany({ data: fresh.map((name) => ({ name })), skipDuplicates: true });
    result[kind].added = fresh.length;
  }
  refresh();
  return { result };
}
