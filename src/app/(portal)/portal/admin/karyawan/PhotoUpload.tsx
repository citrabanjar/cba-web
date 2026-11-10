"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileImage, FolderOpen, ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { uploadEmployeePhoto } from "./actions";

type Person = { id: string; employeeId: string; name: string };
type Status = "siap" | "proses" | "selesai" | "gagal";
type Item = { file: File; person?: Person; status: Status; error?: string };

const SIZE = 300;

// Deteksi wajah (MediaPipe, berjalan di browser; foto tidak dikirim ke mana pun). Dimuat sekali saat
// dibutuhkan. Kalau gagal dimuat, foto tetap diproses dengan potongan yang condong ke atas.
type Box = { x: number; y: number; w: number; h: number };
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
let detector: Promise<((img: ImageBitmap) => Box | null) | null> | null = null;
function faceDetector() {
  detector ??= (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE);
      const fd = await FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "IMAGE", minDetectionConfidence: 0.5 });
      return (img: ImageBitmap) => {
        const boxes = fd.detect(img).detections.map((d) => d.boundingBox).filter((b): b is NonNullable<typeof b> => !!b);
        if (!boxes.length) return null;
        const b = boxes.sort((p, q) => q.width * q.height - p.width * p.height)[0]; // wajah terbesar
        return { x: b.originX, y: b.originY, w: b.width, h: b.height };
      };
    } catch {
      return null;
    }
  })();
  return detector;
}

// Kotak potong persegi: wajah di tengah dengan ruang untuk rambut di atas; tanpa wajah terdeteksi,
// potongan condong ke atas (pas foto: kepala di bagian atas gambar).
function cropBox(width: number, height: number, face: Box | null) {
  const max = Math.min(width, height);
  if (!face) return { sx: (width - max) / 2, sy: (height - max) * 0.15, side: max };
  const side = Math.min(max, Math.max(face.w, face.h) * 2.6);
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2 - side * 0.09; // geser sedikit ke atas supaya ubun-ubun tidak terpotong
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  return { sx: clamp(cx - side / 2, width - side), sy: clamp(cy - side / 2, height - side), side };
}

// Foto dipotong persegi (wajah di tengah) dan dikecilkan di browser, supaya hemat ruang database.
async function toSquareJpeg(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const detect = await faceDetector();
  let face: Box | null = null;
  try { face = detect ? detect(image) : null; } catch { face = null; }
  const { sx, sy, side } = cropBox(image.width, image.height, face);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext("2d")?.drawImage(image, sx, sy, side, side, 0, 0, SIZE, SIZE);
  image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gagal"))), "image/jpeg", 0.85);
  });
}

const fileId = (name: string) => name.replace(/\.[^.]+$/, "").trim().toLowerCase();
const IMAGE = /\.(jpe?g|png|webp)$/i;
// Kunci unik per file (folder bisa berisi subfolder dengan nama file yang sama).
const fileKey = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

export default function PhotoUpload({
  employees, onClose,
}: {
  employees: Person[]; onClose: (changed: boolean) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);

  const byId = useMemo(
    () => new Map(employees.map((e) => [e.employeeId.toLowerCase(), e])),
    [employees],
  );
  const ready = items.filter((i) => i.person && i.status !== "selesai");
  const done = items.filter((i) => i.status === "selesai").length;

  const matched = items.filter((i) => i.person).length;
  const [skipped, setSkipped] = useState(0);

  // Dari pilihan file atau satu folder: hanya gambar yang diambil, file lain di folder dilewati.
  function choose(files: FileList | null) {
    const all = [...(files ?? [])];
    const images = all.filter((f) => IMAGE.test(f.name) || f.type.startsWith("image/"));
    setSkipped(all.length - images.length);
    setItems(images
      .map((file) => ({ file, person: byId.get(fileId(file.name)), status: "siap" as Status }))
      // Yang cocok dengan karyawan di atas, yang tidak cocok di bawah.
      .sort((a, b) => Number(!a.person) - Number(!b.person) || a.file.name.localeCompare(b.file.name)));
  }

  const patch = (file: File, change: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.file === file ? { ...i, ...change } : i)));

  // Dikirim satu per satu supaya satu foto gagal tidak membatalkan yang lain.
  async function upload() {
    setUploading(true);
    for (const item of ready) {
      patch(item.file, { status: "proses", error: undefined });
      try {
        const form = new FormData();
        form.append("photo", await toSquareJpeg(item.file), "foto.jpg");
        const result = await uploadEmployeePhoto(item.person!.id, form);
        patch(item.file, result.error
          ? { status: "gagal", error: result.error }
          : { status: "selesai" });
      } catch {
        patch(item.file, { status: "gagal", error: "File tidak bisa dibaca sebagai gambar." });
      }
    }
    setUploading(false);
  }

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open && !uploading) onClose(done > 0); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle><T>Upload Foto Karyawan</T></DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-700 space-y-1">
            <p><T>• Nama file harus sama dengan Employee ID, misalnya P023.jpg.</T></p>
            <p><T>• Bisa pilih beberapa file, atau satu folder sekaligus (file selain foto dilewati). Foto lama akan diganti.</T></p>
            <p><T>• Foto otomatis dipotong persegi dengan wajah di tengah.</T></p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center hover:border-brand hover:bg-brand/5 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              <FileImage size={20} className="text-brand" />
              <span className="text-xs font-semibold text-gray-800"><T>Pilih File</T></span>
              <span className="text-[11px] text-gray-400"><T>satu atau beberapa foto</T></span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading}
                aria-label={t("Pilih File")} className="sr-only"
                onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />
            </label>
            <label className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center hover:border-brand hover:bg-brand/5 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              <FolderOpen size={20} className="text-brand" />
              <span className="text-xs font-semibold text-gray-800"><T>Pilih Folder</T></span>
              <span className="text-[11px] text-gray-400"><T>semua foto di dalam folder</T></span>
              <input type="file" multiple disabled={uploading} aria-label={t("Pilih Folder")} className="sr-only"
                ref={(el) => { el?.setAttribute("webkitdirectory", ""); el?.setAttribute("directory", ""); }}
                onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />
            </label>
          </div>

          {items.length > 0 && (
            <p className="text-xs text-gray-600">
              <b className="text-emerald-700">{matched}</b> <T>foto cocok dengan karyawan</T>
              {items.length - matched > 0 && <> · <b className="text-red-700">{items.length - matched}</b> <T>tidak cocok</T></>}
              {skipped > 0 && <> · {skipped} <T>file bukan foto dilewati</T></>}
            </p>
          )}

          {items.length > 0 && (
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 text-xs">
              {items.map((item) => (
                <li key={fileKey(item.file)} className="flex items-center gap-2 py-1.5">
                  <span className="font-mono text-gray-500 w-28 shrink-0 truncate">{item.file.name}</span>
                  <span className={`flex-1 min-w-0 truncate ${item.person ? "text-gray-700" : "text-red-700"}`}>
                    {item.person ? item.person.name : <T>Employee ID tidak ditemukan</T>}
                  </span>
                  {item.status === "proses" && <Loader2 size={14} className="animate-spin text-gray-500" />}
                  {item.status === "selesai" && <CheckCircle2 size={14} className="text-green-700" />}
                  {item.error && <span className="text-red-700 shrink-0"><T>{item.error}</T></span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => onClose(done > 0)}>
            <T>Tutup</T>
          </Button>
          <Button size="sm" onClick={upload} disabled={uploading || ready.length === 0} className="gap-2">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
            <T>Upload Foto</T> ({ready.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
