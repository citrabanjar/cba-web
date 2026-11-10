// Label status tukar shift (aman dipakai di browser).
export const SWAP_STATUS: Record<string, { label: string; cls: string }> = {
  MENUNGGU_REKAN: { label: "Menunggu rekan", cls: "bg-amber-100 text-amber-700" },
  MENUNGGU_ATASAN: { label: "Menunggu atasan", cls: "bg-amber-100 text-amber-700" },
  DISETUJUI: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
  DITOLAK: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
  DIBATALKAN: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-500" },
};
export const OPEN_SWAP = ["MENUNGGU_REKAN", "MENUNGGU_ATASAN"];
