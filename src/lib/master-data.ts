import { prisma } from "@/lib/prisma";

export type MasterOptions = { branches: string[]; departments: string[]; positions: string[] };

// Pilihan Cabang, Departemen, dan Jabatan yang diatur super admin di menu Setup Organisasi.
export async function getMasterOptions(): Promise<MasterOptions> {
  const orderBy = { name: "asc" } as const;
  const select = { name: true } as const;
  const [branches, departments, positions] = await Promise.all([
    prisma.branch.findMany({ orderBy, select }),
    prisma.department.findMany({ orderBy, select }),
    prisma.position.findMany({ orderBy, select }),
  ]);
  const names = (rows: { name: string }[]) => rows.map((r) => r.name);
  return {
    branches: names(branches),
    departments: names(departments),
    positions: names(positions),
  };
}
