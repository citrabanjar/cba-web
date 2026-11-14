import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu, type MenuKey } from "@/lib/roles";
import { approvedRun } from "@/lib/approval-hold";

// Hak akses selalu dibaca dari database, bukan dari sesi login. Dengan begitu,
// perubahan menu oleh super admin langsung berlaku tanpa harus login ulang.
export async function getAccess() {
  // Menjalankan pengajuan yang sudah disetujui: bertindak sebagai Admin yang mengajukan.
  const run = approvedRun.getStore();
  const session = run ? null : await auth();
  const userId = run?.requesterId ?? session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, menuAccess: true, isActive: true },
  });
  return user?.isActive ? user : null;
}

// Untuk aksi yang mengubah data: wajib hak edit (hak lihat saja ditolak).
export async function requireMenu(menu: MenuKey) {
  const user = await getAccess();
  if (!user || !canEditMenu(user, menu)) throw new Error("Anda hanya punya hak lihat di menu ini.");
  return user;
}

export async function requireSuperAdmin() {
  const user = await getAccess();
  if (user?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
  return user;
}
