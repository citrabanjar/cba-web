"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bot, ChevronDown, Loader2, MessageCircle, Send, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import type { HelpAnswer } from "@/lib/helpdesk";
import { askHelpDesk, forwardToHrd } from "@/app/(portal)/helpdesk-actions";

type Msg = { from: "me" | "bot"; text: string; answer?: HelpAnswer; forwarded?: boolean };
const SUGGEST = ["Berapa sisa cuti saya?", "Jadwal shift saya besok?", "Status pengajuan saya", "Cara mengajukan cuti", "Aturan lembur"];

// Tombol chat Help Desk di pojok kanan bawah portal (karyawan & Admin; bukan Super Admin).
export default function HelpDeskChat() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [more, setMore] = useState<string | null>(null); // artikel lain yang sedang dibuka
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pending]);

  function ask(q: string) {
    const question = q.trim();
    if (!question || pending) return;
    setText("");
    setMsgs((m) => [...m, { from: "me", text: question }]);
    start(async () => {
      const r = await askHelpDesk(question);
      setMsgs((m) => [...m, "error" in r ? { from: "bot", text: t(r.error) } : { from: "bot", text: r.text, answer: r }]);
    });
  }
  function forward(i: number, id: string) {
    start(async () => {
      const r = await forwardToHrd(id);
      setMsgs((m) => m.map((x, j) => (j === i ? { ...x, forwarded: !r.error } : x)).concat(r.error ? [{ from: "bot", text: t(r.error) }] : [{ from: "bot", text: t("Pertanyaan Anda sudah diteruskan ke HRD. Jawabannya akan dikirim melalui Notifikasi.") }]));
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={t("Help Desk")}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand to-rose-400 text-white shadow-xl shadow-black/30 transition-transform hover:scale-105">
        {open ? <ChevronDown size={24} /> : <MessageCircle size={24} />}
      </button>
      {open && (
        <div className="fixed bottom-24 right-4 z-40 flex h-[32rem] max-h-[calc(100vh-8rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/30">
          <div className="flex items-center gap-3 bg-gradient-to-r from-brand to-rose-500 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Bot size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold"><T>Help Desk</T></p>
              <p className="text-[11px] text-white/80"><T>Asisten otomatis seputar SOP dan data kepegawaian Anda.</T></p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("Tutup")} className="rounded-full p-1 hover:bg-white/20"><X size={16} /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3 text-sm">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-gray-700 shadow-sm">
              <T>Halo! Silakan tanyakan seputar cuti, absensi, lembur, jadwal, slip gaji, pinjaman, atau SOP perusahaan.</T>
            </div>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGEST.map((s) => <button key={s} type="button" onClick={() => ask(t(s))} className="rounded-full border border-brand/30 bg-white px-2.5 py-1 text-xs text-brand hover:bg-brand/5"><T>{s}</T></button>)}
              </div>
            )}
            {msgs.map((m, i) => m.from === "me" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-brand px-3 py-2 text-white">{m.text}</div>
            ) : (
              <div key={i} className="max-w-[90%] space-y-2 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-gray-700 shadow-sm">
                {m.answer?.articles?.[0] && <p className="text-xs font-semibold text-brand">{m.answer.articles[0].title}</p>}
                <p className="whitespace-pre-line">{m.text}</p>
                {m.answer?.links?.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="inline-block rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/15"><T>{l.label}</T> →</Link>)}
                {m.answer?.articles && m.answer.articles.length > 1 && (
                  <div className="border-t border-gray-100 pt-2">
                    <p className="mb-1 text-[11px] text-gray-400"><T>Artikel terkait</T>:</p>
                    {m.answer.articles.slice(1).map((a) => (
                      <div key={a.id}>
                        <button type="button" onClick={() => setMore(more === a.id ? null : a.id)} className="text-left text-xs font-medium text-brand hover:underline">{a.title}</button>
                        {more === a.id && <p className="mt-1 whitespace-pre-line text-xs text-gray-600">{a.body}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {m.answer?.unanswered && m.answer.questionId && (
                  m.forwarded
                    ? <p className="text-xs font-semibold text-emerald-600"><T>Sudah diteruskan ke HRD.</T></p>
                    : <button type="button" disabled={pending} onClick={() => forward(i, m.answer!.questionId!)} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-ink/85 disabled:opacity-60"><T>Tanya HRD</T></button>
                )}
              </div>
            ))}
            {pending && <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs text-gray-400 shadow-sm"><Loader2 size={13} className="animate-spin" /> <T>Mencari jawaban…</T></div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2 border-t border-gray-100 bg-white p-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Tulis pertanyaan…")} maxLength={500}
              className="h-10 min-w-0 flex-1 rounded-full border border-gray-300 px-4 text-sm focus:border-brand focus:outline-none" />
            <button type="submit" disabled={pending || !text.trim()} aria-label={t("Kirim")} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50"><Send size={16} /></button>
          </form>
        </div>
      )}
    </>
  );
}
