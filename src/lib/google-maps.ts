// Memuat Google Maps JavaScript API sekali saja di browser.
// Kunci peta Google memang selalu terlihat di browser; pengamannya adalah pembatasan di
// Google Cloud (project cba-portal-514102, akun admin@apocalypto.id): hanya boleh dipakai
// dari *.citrabanjar.com, citrabanjar.com, dan localhost:3000, dan hanya untuk API Maps.
// Disimpan di kode atas persetujuan pemilik (2026-11-08).
export const GOOGLE_MAPS_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAHJjG8Lb0otpn-VnzSUXAIia381Scg-bw";

let loading: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const callback = "__cbaGoogleMapsReady";
    (window as unknown as Record<string, () => void>)[callback] = () => resolve(window.google.maps);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly&language=id&region=ID&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => { loading = null; reject(new Error("Google Maps gagal dimuat")); };
    document.head.appendChild(script);
  });
  return loading;
}

// Tautan untuk membuka titik di aplikasi/website Google Maps.
export const googleMapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
