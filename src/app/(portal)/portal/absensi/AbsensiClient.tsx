"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { MapPin, Clock, LogIn, LogOut, Loader2, AlertTriangle, CheckCircle2, Navigation } from "lucide-react";
import { checkIn, checkOut } from "./actions";
import { formatDateTime } from "@/lib/utils";
import type { Attendance } from "@prisma/client";
import { T } from "@/components/i18n";
import { nearestLocation, type AllowedLocation } from "@/lib/work-location-client";

// Titik awal peta kalau belum ada lokasi absen (Banjarmasin).
const DEFAULT_CENTER: [number, number] = [-3.3186, 114.5944];

interface Props {
  today: Attendance | null;
  week: Attendance[];
  locations: AllowedLocation[];
  onTrip: boolean;
}

function getDurationStr(checkIn: Date, checkOut?: Date | null) {
  const end = checkOut ? new Date(checkOut) : new Date();
  const diff = Math.floor((end.getTime() - new Date(checkIn).getTime()) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}j ${m}m`;
}

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function AbsensiClient({ today, week, locations, onTrip }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [near, setNear] = useState<{ name: string; distance: number; radius: number; inside: boolean } | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load Leaflet (client-only)
  useEffect(() => {
    import("leaflet").then((L) => {
      leafletRef.current = L.default ?? L;

      if (!mapRef.current || mapInstanceRef.current) return;

      const map = leafletRef.current.map(mapRef.current, {
        center: locations[0] ? [locations[0].latitude, locations[0].longitude] : DEFAULT_CENTER,
        zoom: 16,
        zoomControl: true,
      });

      leafletRef.current.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // Semua lokasi absen yang boleh dipakai karyawan ini.
      const officeIcon = leafletRef.current.divIcon({
        html: `<div style="background:#BE353F;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)">🏢</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: "",
      });
      for (const loc of locations) {
        leafletRef.current.marker([loc.latitude, loc.longitude], { icon: officeIcon })
          .bindPopup(`${loc.name} (radius ${loc.radius} m)`)
          .addTo(map);
        leafletRef.current.circle([loc.latitude, loc.longitude], {
          radius: loc.radius,
          color: "#BE353F",
          fillColor: "#3b82f6",
          fillOpacity: 0.1,
          weight: 2,
        }).addTo(map);
      }

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Browser tidak mendukung GPS.");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPos({ lat, lng });
        setGpsError(null);

        const best = nearestLocation(locations, lat, lng);
        setNear(best ? {
          name: best.location.name, distance: Math.round(best.distance),
          radius: best.location.radius, inside: best.inside,
        } : null);

        if (mapInstanceRef.current && leafletRef.current) {
          const L = leafletRef.current;
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([lat, lng]);
          } else {
            const userIcon = L.divIcon({
              html: `<div style="background:#22c55e;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)">📍</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              className: "",
            });
            userMarkerRef.current = L.marker([lat, lng], { icon: userIcon })
              .bindPopup("Lokasi Anda sekarang")
              .addTo(mapInstanceRef.current);
          }
          mapInstanceRef.current.setView([lat, lng], 16);
        }
      },
      (err) => setGpsError("Izinkan akses lokasi untuk absensi GPS."),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const handleCheckIn = () => {
    if (!pos) return setMessage({ type: "err", text: "GPS belum siap. Tunggu sebentar." });
    setMessage(null);
    startTransition(async () => {
      const res = await checkIn(pos.lat, pos.lng);
      if ("error" in res) {
        setMessage({ type: "err", text: res.error ?? "" });
      } else {
        setMessage({
          type: "ok",
          text: res.location === "Dinas Luar"
            ? "Check-in berhasil (Dinas Luar). Lokasi Anda tersimpan."
            : res.location
              ? `Check-in berhasil di ${res.location} (${res.distance ?? 0} m). ✓`
              : "Check-in berhasil! ✓",
        });
      }
    });
  };

  const handleCheckOut = () => {
    if (!pos) return setMessage({ type: "err", text: "GPS belum siap." });
    setMessage(null);
    startTransition(async () => {
      const res = await checkOut(pos.lat, pos.lng);
      if ("error" in res) {
        setMessage({ type: "err", text: res.error ?? "" });
      } else {
        setMessage({ type: "ok", text: "Check-out berhasil! Sampai jumpa besok." });
      }
    });
  };

  // Tombol absen hanya aktif di dalam radius, kecuali saat Dinas Luar atau belum ada lokasi.
  const canAbsen = onTrip || locations.length === 0 || !!near?.inside;
  const hasCheckIn = !!today?.checkIn;
  const hasCheckOut = !!today?.checkOut;

  return (
    <div className="flex flex-col h-full">
      {/* Map */}
      <div className="relative flex-1 min-h-[280px]">
        <div ref={mapRef} className="w-full h-full" />

        {/* GPS status overlay */}
        <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none">
          {gpsError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-red-700">
              <AlertTriangle size={14} className="shrink-0" />
              {gpsError}
            </div>
          ) : onTrip && pos ? (
            <div className="rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-medium bg-sky-50 border border-sky-200 text-sky-700">
              <Navigation size={14} className="shrink-0" />
              Dinas Luar — absen boleh di mana saja, lokasi tetap disimpan
            </div>
          ) : near ? (
            <div className={`rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-medium ${near.inside ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <Navigation size={14} className="shrink-0" />
              {near.inside
                ? `${near.distance} m dari ${near.name} — Dalam area ✓`
                : `${near.distance} m dari ${near.name} — Di luar radius ${near.radius} m, absen tidak bisa dilakukan`}
            </div>
          ) : pos && locations.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-gray-500">
              <Navigation size={14} className="shrink-0" />
              <T>Lokasi GPS terbaca.</T>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={14} className="animate-spin shrink-0" />
              <T>Mendeteksi lokasi GPS...</T>
            </div>
          )}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="bg-white border-t border-gray-100 p-4 space-y-4 max-h-[55vh] overflow-y-auto">

        {/* Pesan hasil */}
        {message && (
          <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${
            message.type === "ok" ? "bg-green-50 text-green-700" :
            message.type === "warn" ? "bg-amber-50 text-amber-700" :
            "bg-red-50 text-red-700"
          }`}>
            {message.type === "ok" ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> :
             <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
            <T>{message.text}</T>
          </div>
        )}

        {/* Status hari ini */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide"><T>Status Hari Ini</T></p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                <LogIn size={12} /> <T>Check-in</T>
              </p>
              <p className={`font-bold text-sm ${hasCheckIn ? "text-green-600" : "text-gray-300"}`}>
                {hasCheckIn ? new Date(today!.checkIn!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                <LogOut size={12} /> <T>Check-out</T>
              </p>
              <p className={`font-bold text-sm ${hasCheckOut ? "text-blue-600" : "text-gray-300"}`}>
                {hasCheckOut ? new Date(today!.checkOut!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
          </div>
          {hasCheckIn && (
            <div className="text-center border-t border-gray-200 pt-2">
              <p className="text-xs text-gray-400"><T>Durasi kerja</T></p>
              <p className="font-semibold text-ink text-sm mt-0.5">
                {getDurationStr(today!.checkIn!, today?.checkOut)}
                {!hasCheckOut && <span className="text-xs text-green-500 ml-1"><T>(sedang berjalan)</T></span>}
              </p>
            </div>
          )}
          {hasCheckIn && today?.checkInAddr && (
            <p className="text-xs text-gray-400 flex items-start gap-1">
              <MapPin size={11} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{today.checkInAddr}</span>
            </p>
          )}
        </div>

        {/* Tombol aksi */}
        {!hasCheckIn ? (
          <button
            onClick={handleCheckIn}
            disabled={isPending || !pos || !canAbsen}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {isPending ? <T>{"Memproses..."}</T> : <T>{"Check-in Sekarang"}</T>}
          </button>
        ) : !hasCheckOut ? (
          <button
            onClick={handleCheckOut}
            disabled={isPending || !pos || !canAbsen}
            className="w-full bg-ink text-white font-semibold py-3 rounded-xl hover:bg-brand transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            {isPending ? <T>{"Memproses..."}</T> : <T>{"Check-out Sekarang"}</T>}
          </button>
        ) : (
          <div className="bg-gray-100 text-gray-700 text-sm text-center py-3 rounded-xl font-medium">
            <T>✓ Absensi hari ini selesai</T>
          </div>
        )}

        {/* Rekap minggu ini */}
        {week.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><T>Minggu Ini</T></p>
            <div className="space-y-2">
              {week.map((rec) => {
                const d = new Date(rec.date);
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div key={rec.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isToday ? "bg-blue-50 border border-blue-100" : "bg-gray-50"}`}>
                    <div className="text-center w-8 shrink-0">
                      <p className="text-xs text-gray-400">{DAY_NAMES[d.getDay()]}</p>
                      <p className="text-sm font-bold text-gray-700">{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">
                        {rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                        {" → "}
                        {rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      rec.status === "HADIR" ? "bg-green-100 text-green-700" :
                      rec.status === "CUTI" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {rec.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
