"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import type { AllowedLocation } from "@/lib/work-location-client";

// Peta kecil di halaman absen: lingkaran merah = area absen yang diizinkan (radius),
// titik biru = posisi karyawan sekarang, lingkaran biru tipis = akurasi GPS.
// Dimuat sekali per kunjungan halaman (satu "map load" Google); posisi diperbarui tanpa memuat ulang.
// Kalau Google Maps gagal dimuat, peta disembunyikan; status lokasi di atasnya tetap tampil.
export default function AbsenMap({ locations, pos, inside }: {
  locations: AllowedLocation[]; pos: { lat: number; lng: number; accuracy: number } | null; inside: boolean | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const meRef = useRef<google.maps.Marker | null>(null);
  const accRef = useRef<google.maps.Circle | null>(null);
  const fitted = useRef(false);
  const areas = useRef<google.maps.Circle[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !box.current || mapRef.current) return;
      const first = locations[0];
      const map = new maps.Map(box.current, {
        center: first ? { lat: first.latitude, lng: first.longitude } : { lat: -7.37, lng: 108.54 },
        zoom: 17, disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy",
      });
      for (const l of locations) {
        areas.current.push(new maps.Circle({
          map, center: { lat: l.latitude, lng: l.longitude }, radius: l.radius, clickable: false,
          strokeColor: "#BE353F", strokeWeight: 2, fillColor: "#BE353F", fillOpacity: 0.12,
        }));
        new maps.Marker({ map, position: { lat: l.latitude, lng: l.longitude }, title: l.name });
      }
      mapRef.current = map;
      setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; meRef.current?.setMap(null); accRef.current?.setMap(null); mapRef.current = null; meRef.current = null; accRef.current = null; };
    // Peta dibuat sekali; posisi diperbarui oleh effect di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos) return;
    const p = { lat: pos.lat, lng: pos.lng };
    const color = inside === false ? "#dc2626" : "#2563eb";
    if (!meRef.current) {
      meRef.current = new google.maps.Marker({
        map, position: p, zIndex: 10, title: "Posisi Anda",
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
      });
      accRef.current = new google.maps.Circle({ map, center: p, radius: pos.accuracy, clickable: false, strokeColor: color, strokeOpacity: 0.4, strokeWeight: 1, fillColor: color, fillOpacity: 0.08 });
    } else {
      meRef.current.setPosition(p);
      meRef.current.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 });
      accRef.current?.setCenter(p);
      accRef.current?.setRadius(pos.accuracy);
      accRef.current?.setOptions({ strokeColor: color, fillColor: color });
    }
    // Sekali saja: tampilkan posisi karyawan dan area absen terdekat dalam satu layar.
    if (!fitted.current) {
      fitted.current = true;
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(p);
      // Area absen terdekat ditampilkan utuh (seluruh lingkaran radius), bersama posisi karyawan.
      const gap = (c: google.maps.Circle) => { const o = c.getCenter()!; return (o.lat() - p.lat) ** 2 + (o.lng() - p.lng) ** 2; };
      const nearest = [...areas.current].sort((a, b) => gap(a) - gap(b))[0];
      const area = nearest?.getBounds();
      if (area) bounds.union(area);
      if (areas.current.length) map.fitBounds(bounds, 24); else map.setCenter(p);
      google.maps.event.addListenerOnce(map, "idle", () => { if ((map.getZoom() ?? 0) > 18) map.setZoom(18); });
    }
  }, [pos, inside, ready, locations]);

  if (failed) return null;
  return <div ref={box} className="h-56 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 sm:h-64" />;
}
