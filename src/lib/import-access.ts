// Akses Import Data (server): daftar jenis yang diberi akses Super Admin, dan pengecekan per aksi import.
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { DEFAULT_IMPORT_ENABLED, importKindsFor, isImportKind, type ImportKind } from "@/lib/import-kinds";

export const IMPORT_SETTING_KEY = "import-access";

export async function getImportEnabled(): Promise<ImportKind[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: IMPORT_SETTING_KEY } });
  const list = (row?.value as { enabled?: unknown } | null)?.enabled;
  return Array.isArray(list) ? list.filter((k): k is ImportKind => typeof k === "string" && isImportKind(k)) : DEFAULT_IMPORT_ENABLED;
}

// Jenis import milik user yang sedang login.
export async function myImportKinds() {
  const access = await getAccess();
  return access ? importKindsFor(access, await getImportEnabled()) : [];
}

export async function requireImport(kind: ImportKind) {
  const access = await getAccess();
  if (!access || !importKindsFor(access, await getImportEnabled()).includes(kind)) throw new Error("Anda tidak punya kewenangan import ini.");
  return access;
}
