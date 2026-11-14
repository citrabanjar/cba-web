// Status lembur (aman dipakai di browser).
// Status yang berarti lembur sah dijalankan.
export const OT_APPROVED = ["DISETUJUI", "APPROVED"];
export const OT_STATUS: Record<string, { label: string; cls: string }> = {
  MENUNGGU_KARYAWAN: { label: "Menunggu jawaban", cls: "bg-amber-100 text-amber-700" },
  DISETUJUI: { label: "Bersedia", cls: "bg-emerald-100 text-emerald-700" },
  TIDAK_BERSEDIA: { label: "Tidak bersedia", cls: "bg-gray-100 text-gray-600" },
  PENDING: { label: "Menunggu persetujuan", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-500" },
  DIBATALKAN: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-500" },
};

