// Data wilayah administrasi resmi Kemendagri (Kepmendagri No 300.2.2-2138 Tahun 2025, via cahyadsn/wilayah, MIT).
// Disimpan sebagai berkas statis di server sendiri: /wilayah/provinsi.json dan /wilayah/<kodeProvinsi>.json
// (kab/kota "k", kecamatan per kab "c", kelurahan/desa per kecamatan "d"). Kode desa: 63.71.01.1001.
// Aman dipakai di server dan browser.

// Baris kelurahan/desa bisa membawa kode pos (dari kode-wilayah-id, MIT; bukan data resmi Pos Indonesia → tetap bisa diubah).
export type WilayahRow = [code: string, name: string, postal?: string];
export type ProvinceFile = { k: WilayahRow[]; c: Record<string, WilayahRow[]>; d: Record<string, WilayahRow[]> };

export const WILAYAH_SOURCE = "Kepmendagri No 300.2.2-2138 Tahun 2025";

// Kode desa → kode provinsi / kab / kecamatan.
export function regionParts(code: string) {
  const p = code.split(".");
  return {
    province: p[0] ?? "",
    city: p.length >= 2 ? p.slice(0, 2).join(".") : "",
    district: p.length >= 3 ? p.slice(0, 3).join(".") : "",
    village: p.length >= 4 ? code : "",
  };
}

// Kode kelurahan/desa lengkap (4 tingkat).
export const isVillageCode = (code: string | null | undefined) => !!code && /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(code);

// Nama lengkap untuk disimpan dan ditampilkan: "Mantuil, Kec. Banjarmasin Selatan, Kota Banjarmasin, Kalimantan Selatan".
export const isPostalCode = (v: string | null | undefined) => !!v && /^\d{5}$/.test(v);

export const regionLabel = (village: string, district: string, city: string, province: string) =>
  [village, district && `KEC. ${district}`, city, province].filter(Boolean).join(", ");
