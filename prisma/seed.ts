import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Departemen
  const depts = await Promise.all([
    prisma.department.upsert({
      where: { name: "HRD" },
      update: {},
      create: { name: "HRD" },
    }),
    prisma.department.upsert({
      where: { name: "Teknik" },
      update: {},
      create: { name: "Teknik" },
    }),
    prisma.department.upsert({
      where: { name: "Keuangan" },
      update: {},
      create: { name: "Keuangan" },
    }),
  ]);

  const [deptHRD, deptTeknik, deptKeuangan] = depts;

  // Admin
  await prisma.user.upsert({
    where: { employeeId: "ADM001" },
    update: {},
    create: {
      employeeId: "ADM001",
      name: "Admin HRD",
      email: "admin@citrabanjara.co.id",
      passwordHash: await bcrypt.hash("Admin@123", 10),
      role: "ADMIN",
      employmentStatus: "TETAP",
      departmentId: deptHRD.id,
      position: "HR Manager",
    },
  });

  // Karyawan test
  await prisma.user.upsert({
    where: { employeeId: "EMP001" },
    update: {},
    create: {
      employeeId: "EMP001",
      name: "Budi Santoso",
      email: "budi@citrabanjara.co.id",
      passwordHash: await bcrypt.hash("Karyawan@123", 10),
      role: "KARYAWAN",
      employmentStatus: "TETAP",
      departmentId: deptTeknik.id,
      position: "Teknisi Senior",
    },
  });

  await prisma.user.upsert({
    where: { employeeId: "EMP002" },
    update: {},
    create: {
      employeeId: "EMP002",
      name: "Siti Rahayu",
      email: "siti@citrabanjara.co.id",
      passwordHash: await bcrypt.hash("Karyawan@123", 10),
      role: "KARYAWAN",
      employmentStatus: "KONTRAK",
      departmentId: deptKeuangan.id,
      position: "Staff Keuangan",
    },
  });

  console.log("✅ Seed selesai!");
  console.log("\n📋 Akun yang dibuat:");
  console.log("  Admin   : ADM001 / Admin@123");
  console.log("  Karyawan: EMP001 / Karyawan@123");
  console.log("  Karyawan: EMP002 / Karyawan@123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
