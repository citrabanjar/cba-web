"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { MapPin, Clock, LogIn, LogOut, Loader2, AlertTriangle, CheckCircle2, Navigation } from "lucide-react";
import { checkIn, checkOut } from "./actions";
import { getDistanceMeters, formatDateTime } from "@/lib/utils";
import type { Attendance } from "@prisma/client";

const OFFICE_LAT = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LAT ?? "-3.3186");
const OFFICE_LNG = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LNG ?? "114.5944");
const OFFICE_RADIUS = parseFloat(process.env.NEXT_PUBLIC_OFFICE_RADIUS_METERS ?? "200");

interface Props {
  today: Attendance | null;
  week: Attendance[];
}

function getDurationStr(checkIn: Date, checkOut?: Date | null) {
  const end = checkOut ? new Date(checkOut) : new Date();
  const diff = Math.floor((end.getTime() - new Date(checkIn).getTime()) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}j ${m}m`;
}

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function AbsensiClient({ today, week }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load Leaflet (client-only)
  useEffect(() => {
    import("leaflet").then((L) => {
      leafletRef.current = L.default ?? L;

      if (!mapRef.current || mapInstanceRef.current) return;

      const map = leafletRef.current.map(mapRef.current, {
        center: [OFFICE_LAT, OFFICE_LNG],
        zoom: 16,
        zoomControl: true,
      });

      leafletRef.current.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // Office marker
      const officeIcon = leafletRef.current.divIcon({
        html: `<div style="background:#1e3a5f;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)">🏢</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: "",
      });
      leafletRef.current.marker([OFFICE_LAT, OFFICE_LNG], { icon: officeIcon })
        .bindPopup("Kantor PT. Citra Banjar Abadi")
        .addTo(map);

      // Office radius circle
      leafletRef.current.circle([OFFICE_LAT, OFFICE_LNG], {
        radius: OFFICE_RADIUS,
        color: "#1e3a5f",
        fillColor: "#3b82f6",
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(map);

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

        const dist = getDistanceMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
        setDistance(Math.round(dist));

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
        setMessage({ type: "err", text: res.error });
      } else {
        const dist = res.distance ?? 0;
        if (!res.inRadius) {
          setMessage({ type: "warn", text: `Check-in berhasil. Anda berada ${dist}m dari kantor (di luar radius ${OFFICE_RADIUS}m).` });
        } else {
          setMessage({ type: "ok", text: `Check-in berhasil! Anda berada ${dist}m dari kantor. ✓` });
        }
      }
    });
  };

  const handleCheckOut = () => {
    if (!pos) return setMessage({ type: "err", text: "GPS belum siap." });
    setMessage(null);
    startTransition(async () => {
      const res = await checkOut(pos.lat, pos.lng);
      if ("error" in res) {
        setMessage({ type: "err", text: res.error });
      } else {
        setMessage({ type: "ok", text: "Check-out berhasil! Sampai jumpa besok." });
      }
    });
  };

  const inRadius = distance !== null && distance <= OFFICE_RADIUS;
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
          ) : distance !== null ? (
            <div className={`rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-medium ${inRadius ? "bg-green-50 border border-green-200 text-green-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
              <Navigation size={14} className="shrink-0" />
              {inRadius
                ? `${distance}m dari kantor — Dalam area ✓`
                : `${distance}m dari kantor — Di luar radius ${OFFICE_RADIUS}m`}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={14} className="animate-spin shrink-0" />
              Mendeteksi lokasi GPS...
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
            {message.text}
          </div>
        )}

        {/* Status hari ini */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Status Hari Ini</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                <LogIn size={12} /> Check-in
              </p>
              <p className={`font-bold text-sm ${hasCheckIn ? "text-green-600" : "text-gray-300"}`}>
                {hasCheckIn ? new Date(today!.checkIn!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
                <LogOut size={12} /> Check-out
              </p>
              <p className={`font-bold text-sm ${hasCheckOut ? "text-blue-600" : "text-gray-300"}`}>
                {hasCheckOut ? new Date(today!.checkOut!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
          </div>
          {hasCheckIn && (
            <div className="text-center border-t border-gray-200 pt-2">
              <p className="text-xs text-gray-400">Durasi kerja</p>
              <p className="font-semibold text-[#1e3a5f] text-sm mt-0.5">
                {getDurationStr(today!.checkIn!, today?.checkOut)}
                {!hasCheckOut && <span className="text-xs text-green-500 ml-1">(sedang berjalan)</span>}
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
            disabled={isPending || !pos}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {isPending ? "Memproses..." : "Check-in Sekarang"}
          </button>
        ) : !hasCheckOut ? (
          <button
            onClick={handleCheckOut}
            disabled={isPending || !pos}
            className="w-full bg-[#1e3a5f] text-white font-semibold py-3 rounded-xl hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            {isPending ? "Memproses..." : "Check-out Sekarang"}
          </button>
        ) : (
          <div className="bg-blue-50 text-blue-700 text-sm text-center py-3 rounded-xl font-medium">
            ✓ Absensi hari ini selesai
          </div>
        )}

        {/* Rekap minggu ini */}
        {week.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Minggu Ini</p>
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
