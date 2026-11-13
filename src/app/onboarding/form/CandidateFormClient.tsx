"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, Loader2, LogOut, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeclarationText } from "@/components/portal/DeclarationText";
import { LanguageSwitcher, T } from "@/components/i18n";
import CandidateDataForm from "@/components/portal/CandidateDataForm";
import { candidateCanEdit, missingData, type CandidateData } from "@/lib/onboarding";
import { logoutCandidate, saveCandidateData } from "../actions";

const DRAFT_KEY = "cba-onboarding-draft";

export default function CandidateFormClient({ name, status, note, initial }: {
  name: string; status: string; note: string | null; initial: CandidateData;
}) {
  const router = useRouter();
  // Isian yang belum terkirim karena halaman perlu dimuat ulang dipulihkan dari browser (lihat save()).
  const [data, setData] = useState<CandidateData>(() => {
    if (typeof window === "undefined" || !candidateCanEdit(status)) return initial;
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
      return saved ? { ...initial, ...(JSON.parse(saved) as Partial<CandidateData>) } : initial;
    } catch { return initial; }
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null);
  const [pending, start] = useTransition();
  // Pernyataan kebenaran data: muncul setiap kali Kirim ke HRD (termasuk kirim ulang setelah perbaikan).
  const [declare, setDeclare] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const editable = candidateCanEdit(status);
  const missing = missingData(data);

  const save = (submit: boolean, agree = false) => {
    setMsg(null);
    // Isian sudah lengkap: tampilkan pernyataan dulu; yang belum lengkap langsung diberi tahu server.
    if (submit && !agree && missing.length === 0) { setAgreed(false); setDeclare(true); return; }
    setDeclare(false);
    start(async () => {
      // Bila portal baru diperbarui saat halaman ini masih terbuka, panggilan ke server bisa gagal:
      // tampilkan pesan (isian tidak hilang) alih-alih halaman error.
      let r: Awaited<ReturnType<typeof saveCandidateData>>;
      try { r = await saveCandidateData(data, submit, agree); }
      catch {
        try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* abaikan */ }
        setMsg({ ok: false, text: "Portal baru saja diperbarui. Muat ulang halaman ini (tekan F5 / tarik ke bawah), isian Anda tetap ada, lalu tekan tombol kirim lagi." });
        return;
      }
      if (r.error) setMsg({ ok: false, text: r.error, list: r.missing });
      else { setMsg({ ok: true, text: submit ? "Data terkirim ke HRD. Terima kasih." : "Draf tersimpan." }); router.refresh(); }
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-xl bg-white px-3 py-2"><Image src="/logo.jpg" alt="PT. Citra Banjar Abadi" width={150} height={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-white"><T>Data Calon Karyawan</T></h1>
          <p className="text-xs text-white/65">{name}</p>
        </div>
        <LanguageSwitcher />
        <button type="button" onClick={() => start(async () => { await logoutCandidate(); router.replace("/onboarding"); })}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"><LogOut size={13} /> <T>Keluar</T></button>
      </div>

      {status === "DIKEMBALIKAN" && note && (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800"><b><T>Catatan HRD</T>:</b> {note}</div>
      )}
      {!editable && (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span><T>Data Anda sudah diterima HRD dan sedang diproses. Bawa dokumen asli (KTP, KK, NPWP, buku rekening, ijazah) untuk dicocokkan HRD.</T></span>
        </div>
      )}

      <CandidateDataForm value={data} onChange={setData} disabled={!editable} />

      {msg && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          <T>{msg.text}</T>
          {msg.list && <ul className="mt-1 list-disc pl-5 text-xs">{msg.list.map((x) => <li key={x}><T>{x}</T></li>)}</ul>}
        </div>
      )}
      {editable && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
          <p className="mr-auto text-xs text-gray-500">
            {missing.length ? <><T>Belum lengkap</T>: {missing.length} <T>isian</T></> : <T>Semua isian wajib sudah lengkap.</T>}
          </p>
          <Button variant="outline" disabled={pending} onClick={() => save(false)}><T>Simpan Draf</T></Button>
          <Button disabled={pending} className="gap-1.5" onClick={() => save(true)}>
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <T>Kirim ke HRD</T>
          </Button>
        </div>
      )}

      <Dialog open={declare} onOpenChange={(o: boolean) => { if (!o) setDeclare(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle><T>Pernyataan Calon Karyawan</T></DialogTitle></DialogHeader>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <DeclarationText name={data.name} idType={data.idType} idNumber={data.ktpNumber} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#BE353F]" />
            <span className="text-sm font-semibold text-gray-900"><T>Saya telah membaca, memahami, dan menyetujui pernyataan di atas.</T></span>
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeclare(false)}><T>Batal</T></Button>
            <Button disabled={!agreed || pending} className="gap-1.5" onClick={() => save(true, true)}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <T>Setuju & Kirim</T>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
