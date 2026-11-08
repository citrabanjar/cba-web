-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quota" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'HARI_KERJA',
    "period" TEXT NOT NULL DEFAULT 'KEJADIAN',
    "minServiceMonths" INTEGER NOT NULL DEFAULT 0,
    "gender" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "payNote" TEXT,
    "deductsAnnual" BOOLEAN NOT NULL DEFAULT false,
    "needsAttachment" BOOLEAN NOT NULL DEFAULT false,
    "attachmentNote" TEXT,
    "carryOverDays" INTEGER NOT NULL DEFAULT 0,
    "noticeDays" INTEGER NOT NULL DEFAULT 0,
    "legalBasis" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_code_key" ON "LeavePolicy"("code");

-- Isi awal sesuai UU Ketenagakerjaan, UU Cipta Kerja, PP 35/2021, dan UU KIA (untuk direview pemilik)
INSERT INTO "LeavePolicy" ("id","code","name","category","quota","unit","period","minServiceMonths","gender","paid","payNote","deductsAnnual","needsAttachment","attachmentNote","carryOverDays","noticeDays","legalBasis","note","isActive","sortOrder","updatedBy","createdAt","updatedAt") VALUES
(gen_random_uuid()::text, 'CT', 'Cuti Tahunan', 'TAHUNAN', 12, 'HARI_KERJA', 'TAHUN', 12, NULL, true, NULL, false, false, NULL, 0, 0, 'Pasal 79 ayat (3) UU 13/2003 jo. UU 6/2023; Pasal 35 PP 35/2021', 'Paling sedikit 12 hari kerja setelah bekerja 12 bulan terus-menerus. Sisa cuti, batas pengajuan, dan masa berlaku diatur perusahaan.', true, 1, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CB', 'Cuti Bersama', 'TAHUNAN', NULL, 'HARI_KERJA', 'TAHUN', 0, NULL, true, NULL, true, false, NULL, 0, 0, 'SKB Menteri Agama, Menaker, dan MenPAN-RB tentang Hari Libur Nasional dan Cuti Bersama', 'Tanggal mengikuti Kalender Libur. Perusahaan boleh memotong saldo cuti tahunan; kalau tidak dipotong, matikan opsi Potong cuti tahunan.', true, 2, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CM', 'Cuti Melahirkan', 'MELAHIRKAN', 3, 'BULAN', 'KEJADIAN', 0, 'P', true, 'Bulan 1-4 upah penuh, bulan 5-6 75%', false, true, 'Surat keterangan dokter/bidan', 0, 30, 'Pasal 82 ayat (1) UU 13/2003; Pasal 4 ayat (3) dan Pasal 5 UU 4/2024 (KIA)', 'Paling singkat 3 bulan pertama, dapat ditambah paling lama 3 bulan lagi (total 6 bulan) bila ada kondisi khusus yang dibuktikan surat dokter.', true, 3, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CK', 'Cuti Keguguran', 'MELAHIRKAN', 45, 'HARI_KALENDER', 'KEJADIAN', 0, 'P', true, NULL, false, true, 'Surat keterangan dokter/bidan', 0, 0, 'Pasal 82 ayat (2) UU 13/2003; Pasal 4 ayat (3) huruf b UU 4/2024 (KIA)', 'Istirahat 1,5 bulan atau sesuai surat keterangan dokter/bidan.', true, 4, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CNK', 'Cuti Menikah', 'KHUSUS', 3, 'HARI_KERJA', 'KEJADIAN', 0, NULL, true, NULL, false, true, 'Undangan atau buku nikah', 0, 7, 'Pasal 93 ayat (4) huruf a UU 13/2003', NULL, true, 5, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CNA', 'Menikahkan Anak', 'KHUSUS', 2, 'HARI_KERJA', 'KEJADIAN', 0, NULL, true, NULL, false, false, NULL, 0, 7, 'Pasal 93 ayat (4) huruf b UU 13/2003', NULL, true, 6, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CKA', 'Mengkhitankan Anak', 'KHUSUS', 2, 'HARI_KERJA', 'KEJADIAN', 0, NULL, true, NULL, false, false, NULL, 0, 0, 'Pasal 93 ayat (4) huruf c UU 13/2003', NULL, true, 7, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CBA', 'Membaptiskan Anak', 'KHUSUS', 2, 'HARI_KERJA', 'KEJADIAN', 0, NULL, true, NULL, false, false, NULL, 0, 0, 'Pasal 93 ayat (4) huruf d UU 13/2003', NULL, true, 8, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CIM', 'Istri Melahirkan / Keguguran', 'KHUSUS', 2, 'HARI_KERJA', 'KEJADIAN', 0, 'L', true, NULL, false, true, 'Surat keterangan kelahiran / dokter', 0, 0, 'Pasal 93 ayat (4) huruf e UU 13/2003; Pasal 6 UU 4/2024 (KIA)', 'UU KIA: suami berhak cuti pendampingan 2 hari saat istri melahirkan, dapat ditambah paling lama 3 hari berikutnya atau sesuai kesepakatan. Saat istri keguguran: 2 hari.', true, 9, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CDK', 'Duka: Keluarga Inti Meninggal', 'KHUSUS', 2, 'HARI_KERJA', 'KEJADIAN', 0, NULL, true, NULL, false, false, NULL, 0, 0, 'Pasal 93 ayat (4) huruf f UU 13/2003', 'Suami/istri, orang tua/mertua, anak, atau menantu meninggal dunia.', true, 10, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CDS', 'Duka: Anggota Keluarga Serumah', 'KHUSUS', 1, 'HARI_KERJA', 'KEJADIAN', 0, NULL, true, NULL, false, false, NULL, 0, 0, 'Pasal 93 ayat (4) huruf g UU 13/2003', 'Anggota keluarga dalam satu rumah meninggal dunia.', true, 11, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'SK', 'Sakit dengan Surat Dokter', 'SAKIT', NULL, 'HARI_KALENDER', 'KEJADIAN', 0, NULL, true, '4 bulan pertama 100%, 4 bulan kedua 75%, 4 bulan ketiga 50%, selanjutnya 25% sampai PHK', false, true, 'Surat keterangan dokter', 0, 0, 'Pasal 93 ayat (2) huruf a dan ayat (3) UU 13/2003', 'Tidak memotong cuti tahunan.', true, 12, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'IBD', 'Ibadah Keagamaan', 'IBADAH', NULL, 'HARI_KALENDER', 'KEJADIAN', 0, NULL, true, NULL, false, true, 'Bukti jadwal ibadah (mis. haji)', 0, 30, 'Pasal 80 dan Pasal 93 ayat (2) huruf e UU 13/2003', 'Untuk menjalankan ibadah yang diperintahkan agama (mis. haji). Lama dan frekuensinya diatur perusahaan.', true, 13, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'DL', 'Dinas Luar', 'DINAS', NULL, 'HARI_KALENDER', 'KEJADIAN', 0, NULL, true, NULL, false, false, NULL, 0, 1, 'Kebijakan perusahaan', 'Tugas kerja di luar kantor. Bukan cuti: karyawan boleh absen di mana saja, lokasinya tetap tercatat.', true, 14, 'Sistem', now(), now()),
(gen_random_uuid()::text, 'CTU', 'Cuti di Luar Tanggungan', 'TANPA_UPAH', NULL, 'HARI_KALENDER', 'KEJADIAN', 12, NULL, false, NULL, false, false, NULL, 0, 14, 'Kebijakan perusahaan (Pasal 93 ayat (1) UU 13/2003: tidak bekerja, upah tidak dibayar)', 'Cuti tanpa upah atas permintaan karyawan dan persetujuan perusahaan. Batas lama ditentukan perusahaan.', true, 15, 'Sistem', now(), now());
