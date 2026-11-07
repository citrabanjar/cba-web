"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { uploadEmployeePhoto } from "./actions";

type Person = { id: string; employeeId: string; name: string };
type Status = "siap" | "proses" | "selesai" | "gagal";
type Item = { file: File; person?: Person; status: Status; error?: string };

const SIZE = 300;

// Foto dipotong persegi dan dikecilkan di browser, supaya hemat ruang database.
async function toSquareJpeg(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext("2d")?.drawImage(
    image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIZE, SIZE,
  );
  image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gagal"))), "image/jpeg", 0.85);
  });
}

const fileId = (name: string) => name.replace(/\.[^.]+$/, "").trim().toLowerCase();

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

  function choose(files: FileList | null) {
    setItems([...(files ?? [])].map((file) => ({
      file, person: byId.get(fileId(file.name)), status: "siap",
    })));
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
            <p><T>• Bisa pilih banyak foto sekaligus. Foto lama akan diganti.</T></p>
            <p><T>• Foto otomatis dipotong persegi dari bagian tengah.</T></p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs"><T>Pilih Foto</T></Label>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              aria-label={t("Pilih Foto")}
              onChange={(e) => choose(e.target.files)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand file:text-white file:text-xs file:font-medium hover:file:bg-brand-dark cursor-pointer"
            />
          </div>

          {items.length > 0 && (
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 text-xs">
              {items.map((item) => (
                <li key={item.file.name} className="flex items-center gap-2 py-1.5">
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
