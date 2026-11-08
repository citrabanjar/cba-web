"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { GOOGLE_MAPS_KEY, loadGoogleMaps } from "@/lib/google-maps";

export type MapPoint = { latitude: number; longitude: number; radius: number; name?: string };

// Default: Banjarmasin. Dipakai kalau belum ada titik yang dipilih.
const DEFAULT_CENTER: [number, number] = [-3.3186, 114.5944];

type MapProps = {
  point: MapPoint | null; others?: MapPoint[]; onPick?: (lat: number, lng: number) => void; height?: number;
};

// Peta pemilih titik lokasi absen: klik peta atau geser penanda untuk memindahkan titik,
// lingkaran menunjukkan radius. Lokasi lain ditampilkan samar sebagai pembanding.
// Memakai Google Maps kalau kuncinya tersedia; kalau tidak, OpenStreetMap.
export default function LocationMap(props: MapProps) {
  return GOOGLE_MAPS_KEY ? <GoogleLocationMap {...props} /> : <OsmLocationMap {...props} />;
}

function GoogleLocationMap({ point, others = [], onPick, height = 300 }: MapProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !box.current || mapRef.current) return;
      const map = new maps.Map(box.current, {
        center: point ? { lat: point.latitude, lng: point.longitude } : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
        zoom: point ? 17 : 13,
        mapTypeControl: true,
        mapTypeControlOptions: { mapTypeIds: ["roadmap", "hybrid"] },
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
      for (const o of others) {
        new maps.Circle({
          map, center: { lat: o.latitude, lng: o.longitude }, radius: o.radius,
          strokeColor: "#BE353F", strokeWeight: 1.5, fillColor: "#BE353F", fillOpacity: 0.12, clickable: false,
        });
        if (o.name) {
          new maps.Marker({ map, position: { lat: o.latitude, lng: o.longitude }, title: o.name });
        }
      }
      if (!point && others.length === 1) {
        map.setCenter({ lat: others[0].latitude, lng: others[0].longitude });
        map.setZoom(17);
      } else if (!point && others.length > 1) {
        const bounds = new maps.LatLngBounds();
        for (const o of others) bounds.extend({ lat: o.latitude, lng: o.longitude });
        map.fitBounds(bounds, 60);
      }
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) pickRef.current?.(e.latLng.lat(), e.latLng.lng());
      });
      mapRef.current = map;
      setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // Peta dibuat sekali; titik diperbarui oleh effect di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    const pos = { lat: point.latitude, lng: point.longitude };
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({ map, position: pos, draggable: !!pickRef.current });
      markerRef.current.addListener("dragend", () => {
        const p = markerRef.current!.getPosition();
        if (p) pickRef.current?.(p.lat(), p.lng());
      });
      circleRef.current = new google.maps.Circle({
        map, center: pos, radius: point.radius, clickable: false,
        strokeColor: "#BE353F", strokeWeight: 2, fillColor: "#BE353F", fillOpacity: 0.15,
      });
      map.setCenter(pos);
      if ((map.getZoom() ?? 0) < 16) map.setZoom(17);
    } else {
      markerRef.current.setPosition(pos);
      circleRef.current?.setCenter(pos);
      circleRef.current?.setRadius(point.radius);
    }
  }, [point, ready]);

  if (failed) return <OsmLocationMap point={point} others={others} onPick={onPick} height={height} />;
  return <div ref={box} className="w-full overflow-hidden rounded-xl border border-gray-200" style={{ height }} />;
}

function OsmLocationMap({ point, others = [], onPick, height = 300 }: MapProps) {
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
