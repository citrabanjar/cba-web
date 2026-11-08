import { redirect } from "next/navigation";

// Jadwal Bulanan sekarang menjadi tab di halaman Schedule.
export default async function JadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; semua?: string }>;
}) {
  const { bulan, semua } = await searchParams;
  const q = new URLSearchParams({ tab: "jadwal" });
  if (bulan) q.set("bulan", bulan);
  if (semua === "1") q.set("semua", "1");
  redirect(`/portal/admin/schedule?${q}`);
}
