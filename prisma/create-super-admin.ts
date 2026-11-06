// Membuat akun SUPER_ADMIN. Nilainya dibaca dari environment supaya password
// tidak pernah tertulis di kode atau di riwayat git:
//   SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, DATABASE_URL
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.SUPER_ADMIN_NAME;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error("SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, dan SUPER_ADMIN_PASSWORD wajib diisi.");
  }
  if (password.length < 12) {
    throw new Error("Password super admin minimal 12 karakter.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`Email ${email} sudah dipakai akun lain. Pakai email berbeda.`);
  }

  await prisma.user.create({
    data: {
      name,
      email,
      role: "SUPER_ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Akun SUPER_ADMIN dibuat untuk ${email}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
