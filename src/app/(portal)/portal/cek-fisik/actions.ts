"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { saveCheck } from "@/lib/overtime-check";

// Security menandai keberadaan karyawan lembur: Ada / Tidak ada.
export async function markPresence(overtimeId: string, present: boolean): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const r = await saveCheck(overtimeId, { id: session.user.id, name: session.user.name ?? "" }, present);
  if (!r.error) { revalidatePath("/portal/cek-fisik"); revalidatePath("/portal/admin/lembur"); }
  return r;
}
