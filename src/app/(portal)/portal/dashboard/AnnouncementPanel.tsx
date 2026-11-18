"use client";

import { useState } from "react";
import { ChevronDown, Megaphone, Pin } from "lucide-react";
import { T } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import type { AnnouncementView } from "@/lib/announcement";

// Beranda karyawan: pengumuman perusahaan yang sedang tayang (seukuran kartu Task Admin).
// Klik judul untuk membaca isi; ?pengumuman=<id> dari notifikasi langsung membuka pengumuman itu.
export default function AnnouncementPanel({ items, openId }: { items: AnnouncementView[]; openId?: string }) {
  const [open, setOpen] = useState<string | null>(openId && items.some((a) => a.id === openId) ? openId : items[0]?.id ?? null);
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-white p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white shadow-md shadow-black/20">
          <Megaphone size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-gray-900"><T>Pengumuman</T></h3>
          <p className="truncate text-xs text-gray-500">{items.length ? <>{items.length} <T>pengumuman aktif</T></> : <T>Informasi resmi dari perusahaan.</T>}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex h-[18rem] flex-col items-center justify-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400"><Megaphone size={22} /></span>
          <p className="text-sm font-semibold text-gray-800"><T>Belum ada pengumuman</T></p>
          <p className="text-xs text-gray-400"><T>Pengumuman dari perusahaan akan tampil di sini.</T></p>
        </div>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto">
          {items.map((a) => {
            const on = open === a.id;
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(on ? null : a.id)} className="flex w-full items-start gap-2 py-3 text-left">
                  {a.pinned && <Pin size={13} className="mt-1 shrink-0 text-brand" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${on ? "font-semibold text-brand" : "font-medium text-gray-800"}`}>{a.title}</span>
                    <span className="block text-[11px] text-gray-400">{formatDate(a.startDate)}{a.createdBy ? ` · ${a.createdBy}` : ""}</span>
                  </span>
                  <ChevronDown size={15} className={`mt-1 shrink-0 text-gray-400 transition-transform ${on ? "rotate-180" : ""}`} />
                </button>
                {on && <p className="whitespace-pre-line pb-4 text-justify text-sm leading-relaxed text-gray-600">{a.body}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
