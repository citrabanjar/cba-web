import { redirect } from "next/navigation";

// Menu Rekap diganti Laporan (alamat lama tetap bisa dibuka).
export default async function RekapRedirect({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(`/portal/admin/laporan${qs ? `?${qs}` : ""}`);
}
