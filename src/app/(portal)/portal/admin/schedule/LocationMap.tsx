"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

export type MapPoint = { latitude: number; longitude: number; radius: number; name?: string };

// Default: Banjarmasin. Dipakai kalau belum ada titik yang dipilih.
const DEFAULT_CENTER: [number, number] = [-3.3186, 114.5944];

// Peta pemilih titik lokasi absen: klik peta atau geser penanda untuk memindahkan titik,
// lingkaran menunjukkan radius. Lokasi lain ditampilkan samar sebagai pembanding.
export default function LocationMap({
  point, others = [], onPick, height = 300,
}: {
  point: MapPoint | null; others?: MapPoint[]; onPick?: (lat: number, lng: number) => void; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const circleRef = useRef<Leaflet.Circle | null>(null);
  const [ready, setReady] = useState(false);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as typeof Leaflet);
      if (cancelled || !box.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(box.current, {
        center: point ? [point.latitude, point.longitude] : DEFAULT_CENTER,
        zoom: point ? 17 : 13,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      for (const o of others) {
        L.circle([o.latitude, o.longitude], { radius: o.radius, color: "#6b7280", weight: 1, fillOpacity: 0.08, dashArray: "4" })
          .bindTooltip(o.name ?? "")
          .addTo(map);
      }
      if (!point && others.length > 0) {
        const bounds = L.latLngBounds(others.map((o) => [o.latitude, o.longitude] as [number, number]));
        map.fitBounds(bounds.pad(0.4), { maxZoom: 16 });
      }
      map.on("click", (e: Leaflet.LeafletMouseEvent) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 150);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // Peta dibuat sekali; titik diperbarui oleh effect di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !point) return;
    const ll: [number, number] = [point.latitude, point.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, {
        draggable: !!pickRef.current,
        icon: L.divIcon({
          html: `<div style="background:#BE353F;width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
          iconSize: [22, 22], iconAnchor: [11, 11], className: "",
        }),
      }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        pickRef.current?.(p.lat, p.lng);
      });
      circleRef.current = L.circle(ll, { radius: point.radius, color: "#BE353F", weight: 2, fillOpacity: 0.12 }).addTo(map);
      map.setView(ll, Math.max(map.getZoom(), 16));
    } else {
      markerRef.current.setLatLng(ll);
      circleRef.current?.setLatLng(ll).setRadius(point.radius);
    }
  }, [point, ready]);

  return <div ref={box} className="w-full overflow-hidden rounded-xl border border-gray-200" style={{ height }} />;
}
