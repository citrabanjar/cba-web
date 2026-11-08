import { prisma } from "@/lib/prisma";

// Batas penyimpanan paket Neon Free = 1 GB per project (halaman Billing Neon).
// Bisa diubah lewat variabel NEON_STORAGE_LIMIT_MB kalau paketnya dinaikkan.
const LIMIT_MB = Number(process.env.NEON_STORAGE_LIMIT_MB) || 1024;

export type StorageInfo = { usedMb: number; limitMb: number };

// Ukuran database yang sedang dipakai, dibaca langsung dari Postgres.
export async function getDatabaseStorage(): Promise<StorageInfo | null> {
  try {
    const rows = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    const bytes = Number(rows[0]?.size ?? 0);
    return { usedMb: Math.round((bytes / 1024 / 1024) * 10) / 10, limitMb: LIMIT_MB };
  } catch {
    return null;
  }
}
