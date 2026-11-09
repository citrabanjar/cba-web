-- CreateTable
CREATE TABLE "PayComponent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "base" TEXT,
    "capAmount" DOUBLE PRECISION,
    "floorAmount" DOUBLE PRECISION,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "legalBasis" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayComponent_code_key" ON "PayComponent"("code");

-- Isi awal komponen payroll & benefit (untuk direview pemilik)
INSERT INTO "PayComponent" ("id","code","name","kind","category","method","amount","rate","base","capAmount","floorAmount","taxable","legalBasis","note","isActive","sortOrder","updatedBy","createdAt","updatedAt") VALUES
(gen_random_uuid()::text, 'GP', 'Gaji Pokok', 'PENDAPATAN', 'GAJI_POKOK', 'TETAP', NULL, NULL, NULL, NULL, NULL, true, 'Pasal 88E UU 13/2003 jo. UU 6/2023; PP 36/2021 tentang Pengupahan', 'Nominal per karyawan, diisi di profil (tab Gaji & Tunjangan). Upah tidak boleh di bawah UMK. Bila upah terdiri dari upah pokok dan tunjangan tetap, upah pokok paling sedikit 75% dari jumlah keduanya.', true, 1, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'TJ', 'Tunjangan Jabatan', 'PENDAPATAN', 'TUNJANGAN_TETAP', 'TETAP', NULL, NULL, NULL, NULL, NULL, true, 'PP 36/2021 tentang Pengupahan', 'Tunjangan tetap: dibayar tetap tiap bulan, tidak tergantung kehadiran. Ikut menjadi dasar lembur, THR, dan BPJS.', true, 2, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'UM', 'Uang Makan', 'PENDAPATAN', 'TUNJANGAN_TIDAK_TETAP', 'PER_HADIR', 0, NULL, NULL, NULL, NULL, true, 'Kebijakan perusahaan (tunjangan tidak tetap)', 'Nominal per hari hadir. Isi nominalnya sesuai kebijakan CBA.', true, 3, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'UT', 'Uang Transport', 'PENDAPATAN', 'TUNJANGAN_TIDAK_TETAP', 'PER_HADIR', 0, NULL, NULL, NULL, NULL, true, 'Kebijakan perusahaan (tunjangan tidak tetap)', 'Nominal per hari hadir. Isi nominalnya sesuai kebijakan CBA.', true, 4, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'LBR', 'Upah Lembur', 'PENDAPATAN', 'LEMBUR', 'RUMUS_LEMBUR', NULL, NULL, 'UPAH_TETAP', NULL, NULL, true, 'Pasal 78 UU 13/2003 jo. UU 6/2023; Pasal 31-32 PP 35/2021', 'Upah sejam = 1/173 x upah sebulan (pokok + tunjangan tetap). Hari kerja: jam ke-1 1,5x, jam berikutnya 2x. Hari istirahat/libur (6 hari kerja): jam ke-1 s/d 7 2x, jam ke-8 3x, jam ke-9 s/d 10 4x; (5 hari kerja): jam ke-1 s/d 8 2x, jam ke-9 3x, jam ke-10 s/d 11 4x. Lembur paling lama 4 jam sehari dan 18 jam seminggu, harus ada perintah dan persetujuan.', true, 5, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'THR', 'Tunjangan Hari Raya', 'PENDAPATAN', 'THR', 'RUMUS_THR', NULL, NULL, 'UPAH_TETAP', NULL, NULL, true, 'Permenaker 6/2016 tentang THR Keagamaan', 'Masa kerja 12 bulan atau lebih: 1 bulan upah. Masa kerja 1 bulan s/d kurang dari 12 bulan: proporsional (masa kerja / 12 x 1 bulan upah). Dibayar paling lambat 7 hari sebelum hari raya keagamaan masing-masing.', true, 6, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'BNS', 'Bonus / Insentif', 'PENDAPATAN', 'BONUS', 'TETAP', NULL, NULL, NULL, NULL, NULL, true, 'Kebijakan perusahaan', 'Diisi per periode bila ada.', true, 7, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'JHTP', 'JHT (Perusahaan)', 'BENEFIT', 'BPJS_TK', 'PERSEN', NULL, 3.7, 'UPAH_BPJS', NULL, NULL, false, 'PP 46/2015 tentang Jaminan Hari Tua', 'Ditanggung perusahaan, tidak mengurangi gaji. Tidak ada batas atas upah.', true, 8, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'JKK', 'JKK - Jaminan Kecelakaan Kerja', 'BENEFIT', 'BPJS_TK', 'PERSEN', NULL, 1.27, 'UPAH_BPJS', NULL, NULL, true, 'PP 44/2015 jo. PP 82/2019 dan PP 6/2025', 'Tarif sesuai tingkat risiko: 0,24% (sangat rendah), 0,54% (rendah), 0,89% (sedang), 1,27% (tinggi), 1,74% (sangat tinggi). Diisi 1,27% sebagai perkiraan untuk fabrikasi/kontraktor; cocokkan dengan penetapan BPJS Ketenagakerjaan untuk CBA. Iuran JKP 0,36% berasal dari rekomposisi JKK dan pemerintah, tidak menambah beban.', true, 9, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'JKM', 'JKM - Jaminan Kematian', 'BENEFIT', 'BPJS_TK', 'PERSEN', NULL, 0.3, 'UPAH_BPJS', NULL, NULL, true, 'PP 44/2015', 'Ditanggung perusahaan.', true, 10, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'JPP', 'Jaminan Pensiun (Perusahaan)', 'BENEFIT', 'BPJS_TK', 'PERSEN', NULL, 2, 'UPAH_BPJS', 11086300, NULL, false, 'PP 45/2015 tentang Jaminan Pensiun; surat BPJS Ketenagakerjaan tentang batas upah JP', 'Batas upah JP Rp11.086.300 mulai Maret 2026 (naik tiap tahun; cek surat BPJS Ketenagakerjaan terbaru).', true, 11, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'KESP', 'BPJS Kesehatan (Perusahaan)', 'BENEFIT', 'BPJS_KES', 'PERSEN', NULL, 4, 'UPAH_BPJS', 12000000, 3855894, true, 'Perpres 82/2018 jo. Perpres 64/2020 tentang Jaminan Kesehatan', 'Batas atas upah Rp12.000.000, batas bawah UMK.', true, 12, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'JHTK', 'JHT (Karyawan)', 'POTONGAN', 'BPJS_TK', 'PERSEN', NULL, 2, 'UPAH_BPJS', NULL, NULL, false, 'PP 46/2015', 'Dipotong dari gaji; mengurangi penghasilan kena pajak.', true, 13, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'JPK', 'Jaminan Pensiun (Karyawan)', 'POTONGAN', 'BPJS_TK', 'PERSEN', NULL, 1, 'UPAH_BPJS', 11086300, NULL, false, 'PP 45/2015', 'Dipotong dari gaji; batas upah sama dengan JP perusahaan.', true, 14, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'KESK', 'BPJS Kesehatan (Karyawan)', 'POTONGAN', 'BPJS_KES', 'PERSEN', NULL, 1, 'UPAH_BPJS', 12000000, 3855894, false, 'Perpres 64/2020', 'Untuk karyawan + 4 anggota keluarga. Anggota keluarga tambahan dipotong 1% per orang.', true, 15, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'PPH21', 'PPh Pasal 21', 'POTONGAN', 'PAJAK', 'PPH21_TER', NULL, NULL, NULL, NULL, NULL, false, 'PP 58/2023 dan PMK 168/2023 (Tarif Efektif Rata-rata); PTKP PMK 101/2016', 'Januari-November memakai tarif efektif (TER) kategori A/B/C sesuai PTKP; Desember dihitung ulang setahun dengan tarif Pasal 17 dan biaya jabatan 5% (maks. Rp6 juta setahun). PTKP Rp54 juta setahun untuk TK/0.', true, 16, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'ABS', 'Potongan Tidak Masuk (Mangkir)', 'POTONGAN', 'POTONGAN_LAIN', 'PRORATA_MANGKIR', NULL, NULL, 'UPAH_TETAP', NULL, NULL, false, 'Pasal 93 ayat (1) UU 13/2003', 'Upah tidak dibayar bila karyawan tidak masuk tanpa keterangan: upah sebulan / hari kerja sebulan x hari mangkir.', true, 17, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'KSB', 'Kasbon / Pinjaman', 'POTONGAN', 'POTONGAN_LAIN', 'TETAP', NULL, NULL, NULL, NULL, NULL, false, 'PP 36/2021 tentang Pengupahan (potongan upah)', 'Diisi per periode. Total potongan upah paling banyak 50% dari upah yang diterima.', true, 18, 'Sistem', now(), now());
