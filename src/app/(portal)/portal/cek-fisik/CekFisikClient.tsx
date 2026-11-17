"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, UserCheck, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { showNotice } from "@/components/portal/Confirm";
import { formatDate } from "@/lib/utils";
import type { CheckItem } from "@/lib/overtime-check";
import { markPresence } from "./actions";

export default function CekFisikClient({ items }: { items: CheckItem[] }) {
  const open = items.filter((i) => i.open);
  const later = items.filter((i) => !i.open);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Perlu dicek sekarang</T> · {open.length}</p>
        {open.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
            <UserCheck size={26} className="mx-auto text-gray-300" />
            <p className="mt-2 text-sm text-gray-500"><T>Tidak ada karyawan lembur yang perlu dicek saat ini.</T></p>
          </div>
        ) : open.map((i) => <Card key={i.id} item={i} />)}
      </section>
      {later.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Lembur berikutnya</T> · {later.length}</p>
          {later.map((i) => <Card key={i.id} item={i} />)}
        </section>
      )}
    </div>
  );
}

function Card({ item: i }: { item: CheckItem }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const mark = (present: boolean) => start(async () => {
    const r = await markPresence(i.id, present);
    if (r.error) { void showNotice(t(r.error), "error"); return; }
    router.refresh();
  });
  const last = i.checks.at(-1);
  return (
    <div className={`rounded-2xl border bg-white p-4 ${last && !last.present ? "border-amber-300" : "border-gray-200"}`}>
      <p className="text-sm font-semibold text-gray-900">{i.name} <span className="text-xs font-normal text-gray-400">{[i.employeeId, i.department].filter(Boolean).join(" · ")}</span></p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-700"><Clock size={13} className="text-brand" /> {formatDate(new Date(i.date))} · <b>{i.start}–{i.end}</b></p>
      {i.reason && <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">{i.reason}</p>}
      {i.checks.length > 0 && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          <T>Cek sebelumnya</T>: {i.checks.map((c) => `${c.present ? t("Ada") : t("Tidak ada")} ${c.at} (${c.name})`).join(" · ")}
        </p>
      )}
      {i.open ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} onClick={() => mark(false)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} <T>Tidak ada</T>
          </button>
          <button type="button" disabled={pending} onClick={() => mark(true)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} <T>Ada</T>
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400"><T>Cek fisik dibuka pukul</T> {i.opensAt}</p>
      )}
    </div>
  );
}
