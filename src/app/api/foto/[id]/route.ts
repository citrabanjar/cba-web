import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Foto hanya untuk pengguna portal yang sudah login.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });

  const { id } = await params;
  const photo = await prisma.employeePhoto.findUnique({ where: { userId: id }, select: { data: true } });
  if (!photo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": "image/jpeg",
      // Alamat foto berubah setiap kali diganti, jadi aman disimpan browser.
      "Cache-Control": "private, max-age=604800, immutable",
    },
  });
}
