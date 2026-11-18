"use client";

import { useState, useTransition } from "react";
import { BookOpen, ChevronRight, Download, Loader2, MessageCircleQuestion, Plus, Save, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { formatDate } from "@/lib/utils";
import { answerQuestionAdmin, deleteArticle, dismissQuestion, loadDefaultArticles, saveArticle } from "./actions";

type Article = { id: string; title: string; body: string; keywords: string; isActive: boolean; hits: number };
type Question = { id: string; question: string; asked: boolean; createdAt: string; who: string };
const area = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50";
const label = "mb-1 block text-xs font-medium text-gray-500";

export default function HelpDeskClient({ articles, questions, initialTab }: { articles: Article[]; questions: Question[]; initialTab: "artikel" | "pertanyaan" }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Help Desk</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Robot Help Desk menjawab pertanyaan karyawan dari data portal dan Basis Pengetahuan. Pertanyaan yang belum terjawab dicatat agar jawabannya dapat ditambahkan.</T></p>
      </div>
      <main className="max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <div className="flex gap-1 rounded-2xl border border-gray-200 bg-white p-2">
          {([["artikel", "Basis Pengetahuan", BookOpen, articles.length], ["pertanyaan", "Pertanyaan Belum Terjawab", MessageCircleQuestion, questions.length]] as const).map(([k, l, Icon, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
              <Icon size={15} /> <T>{l}</T> {n > 0 && <span className="text-xs opacity-70">{n}</span>}
            </button>
          ))}
        </div>
        {tab === "artikel" ? <Articles rows={articles} /> : <Questions rows={questions} />}
      </main>
    </div>
  );
}

// Basis Pengetahuan: daftar artikel di kiri, formulir di kanan.
function Articles({ rows }: { rows: Article[] }) {
  const t = useT();
  const canEdit = useCanEdit("pengaturan");
  const [sel, setSel] = useState<string | null>(rows[0]?.id ?? null);
  const blank = { title: "", body: "", keywords: "", isActive: true };
  const pick = (r: Article | null) => { setSel(r?.id ?? null); setForm(r ? { title: r.title, body: r.body, keywords: r.keywords, isActive: r.isActive } : blank); };
  const cur = rows.find((r) => r.id === sel);
  const [form, setForm] = useState(cur ? { title: cur.title, body: cur.body, keywords: cur.keywords, isActive: cur.isActive } : blank);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    const r = await saveArticle(sel, form);
    if (r.error) { showNotice(t(r.error), "error"); return; }
    setSel(r.id ?? null); showNotice(t("Artikel disimpan. Robot langsung dapat memakainya."));
  });
  const remove = async () => {
    if (!sel || !await askConfirm(t("Hapus artikel ini dari Basis Pengetahuan?"))) return;
    start(async () => { await deleteArticle(sel); pick(null); });
  };
  const loadDefaults = () => start(async () => {
    const r = await loadDefaultArticles();
    if (r.error) showNotice(t(r.error), "error");
    else showNotice(r.added ? `${r.added} ${t("artikel SOP bawaan ditambahkan.")}` : t("Semua artikel SOP bawaan sudah ada."));
  });

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-3">
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={() => pick(null)} className="flex-1 gap-1.5"><Plus size={15} /> <T>Artikel Baru</T></Button>
            <Button variant="outline" onClick={loadDefaults} disabled={pending} title={t("Muat Artikel SOP Bawaan")} className="gap-1.5"><Download size={15} /> <T>SOP Bawaan</T></Button>
          </div>
        )}
        <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400"><T>Belum ada artikel. Klik SOP Bawaan untuk memuat artikel awal.</T></p>}
          {rows.map((r) => {
            const on = r.id === sel;
            return (
              <button key={r.id} type="button" onClick={() => pick(r)}
                className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"} ${r.isActive ? "" : "opacity-60"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? "bg-gradient-to-br from-brand to-rose-400 text-white" : "bg-gray-100 text-gray-500"}`}><BookOpen size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}>{r.title}</span>
                  <span className="block truncate text-[11px] text-gray-400">{r.isActive ? `${r.hits} ${t("kali dipakai")}` : t("Nonaktif")}</span>
                </span>
                <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
              </button>
            );
          })}
        </nav>
      </div>
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900"><T>{sel ? "Ubah Artikel" : "Artikel Baru"}</T></h3>
        <div><label className={label}><T>Judul / pertanyaan</T> *</label>
          <Input value={form.title} disabled={!canEdit} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={label}><T>Kata kunci (pisahkan dengan koma)</T></label>
          <Input value={form.keywords} disabled={!canEdit} placeholder={t("mis. cuti, saldo cuti, sisa cuti")} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
          <p className="mt-1 text-[11px] text-gray-400"><T>Kata atau frasa yang kemungkinan diketik karyawan. Makin lengkap, makin mudah robot menemukan artikel ini.</T></p></div>
        <div><label className={label}><T>Jawaban / isi SOP</T> *</label>
          <textarea value={form.body} disabled={!canEdit} rows={9} onChange={(e) => setForm({ ...form, body: e.target.value })} className={area} /></div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.isActive} disabled={!canEdit} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand)]" />
          <T>Aktif (dipakai robot)</T>
        </label>
        {canEdit && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <Button onClick={save} disabled={pending} className="gap-1.5">{pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} <T>Simpan</T></Button>
            {sel && <Button variant="outline" onClick={remove} disabled={pending} className="gap-1.5 text-red-600 hover:text-red-700"><Trash2 size={15} /> <T>Hapus</T></Button>}
          </div>
        )}
      </section>
    </div>
  );
}

// Pertanyaan belum terjawab: yang diteruskan ke HRD tampil paling atas.
function Questions({ rows }: { rows: Question[] }) {
  const t = useT();
  const canEdit = useCanEdit("pengaturan");
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [asArticle, setAsArticle] = useState(true);
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [pending, start] = useTransition();
  const open = (q: Question) => { setOpenId(q.id); setAnswer(""); setTitle(q.question.slice(0, 200)); setKeywords(""); setAsArticle(true); };
  const send = (id: string) => start(async () => {
    const r = await answerQuestionAdmin(id, answer, asArticle ? { title, keywords } : null);
    if (r.error) { showNotice(t(r.error), "error"); return; }
    setOpenId(null);
    showNotice(t(asArticle ? "Jawaban dikirim ke karyawan dan disimpan sebagai artikel." : "Jawaban dikirim ke karyawan."));
  });

  if (!rows.length) return <section className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400"><T>Tidak ada pertanyaan yang belum terjawab.</T></section>;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-100">
        {rows.map((q) => (
          <li key={q.id} className="px-5 py-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{q.question}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{q.who} · {formatDate(q.createdAt.slice(0, 10))}
                  {q.asked && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-px font-semibold text-amber-700"><T>Ditanyakan ke HRD</T></span>}</p>
              </div>
              {canEdit && openId !== q.id && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => open(q)} className="h-8 gap-1.5 text-xs"><Send size={13} /> <T>Jawab</T></Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await dismissQuestion(q.id); })} className="h-8 gap-1.5 text-xs"><X size={13} /> <T>Tutup</T></Button>
                </div>
              )}
            </div>
            {openId === q.id && (
              <div className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3">
                <div><label className={label}><T>Jawaban</T> *</label>
                  <textarea value={answer} rows={5} onChange={(e) => setAnswer(e.target.value)} className={area} /></div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={asArticle} onChange={(e) => setAsArticle(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
                  <T>Simpan juga sebagai artikel agar robot dapat menjawab pertanyaan serupa</T>
                </label>
                {asArticle && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className={label}><T>Judul artikel</T></label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                    <div><label className={label}><T>Kata kunci (pisahkan dengan koma)</T></label><Input value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => send(q.id)} disabled={pending} className="gap-1.5">{pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <T>Kirim Jawaban</T></Button>
                  <Button size="sm" variant="outline" onClick={() => setOpenId(null)}><T>Batal</T></Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
