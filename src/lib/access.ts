import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu, type MenuKey } from "@/lib/roles";

// Hak akses selalu dibaca dari database, bukan dari sesi login. Dengan begitu,
// perubahan menu oleh super admin langsung berlaku tanpa harus login ulang.
export async function getAccess() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
