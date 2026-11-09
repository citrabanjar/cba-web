-- Komponen tidak rutin (THR, bonus) yang disertakan tiap periode Proses Gaji.
ALTER TABLE "PayrollRun" ADD COLUMN "extraCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "PayrollRun" SET "extraCodes" = ARRAY['THR'] WHERE "includeThr" = true;

-- Centang "Prorata" (dulu otomatis untuk pendapatan input/flat) dan "Termasuk upah tetap" (dulu kategori Gaji Pokok/Tunjangan Tetap).
UPDATE "PayComponent" SET "params" = COALESCE("params", '{}'::jsonb) || '{"prorate":true}'::jsonb
  WHERE "kind" = 'PENDAPATAN' AND "method" IN ('INPUT', 'NOMINAL');
UPDATE "PayComponent" SET "params" = COALESCE("params", '{}'::jsonb) || '{"fixedWage":true}'::jsonb
  WHERE "category" IN ('GAJI_POKOK', 'TUNJANGAN_TETAP');

-- Dasar Upah BPJS dipisah Ketenagakerjaan / Kesehatan.
UPDATE "PayComponent" SET "base" = 'UPAH_BPJS_KES' WHERE "base" = 'UPAH_BPJS' AND "category" = 'BPJS_KES';
UPDATE "PayComponent" SET "base" = 'UPAH_BPJS_TK' WHERE "base" = 'UPAH_BPJS';

-- "Nominal per kelipatan parameter" digabung ke "Nominal x Parameter" + centang Berlaku kelipatan.
UPDATE "PayComponent" SET "method" = 'PER_SATUAN', "params" = COALESCE("params", '{}'::jsonb) || jsonb_build_object('step', COALESCE("rate", 4)), "rate" = NULL
  WHERE "method" = 'KELIPATAN';

-- Tarif lembur jadi baris yang bisa ditambah/dihapus.
UPDATE "PayComponent" SET "params" = ("params" - 'workday' - 'rest6' - 'rest5') || jsonb_build_object(
    'work', jsonb_build_array(jsonb_build_object('upTo', 1, 'x', "params"->'workday'->0), jsonb_build_object('upTo', NULL, 'x', "params"->'workday'->1)),
    'rest', jsonb_build_array(jsonb_build_object('upTo', 7, 'x', "params"->'rest6'->0), jsonb_build_object('upTo', 8, 'x', "params"->'rest6'->1), jsonb_build_object('upTo', NULL, 'x', "params"->'rest6'->2)))
  WHERE "method" = 'LEMBUR' AND "params" ? 'workday' AND "params" ? 'rest6';

-- THR: masa kerja minimal 1 bulan, proporsional di bawah 12 bulan (Permenaker 6/2016).
UPDATE "PayComponent" SET "params" = COALESCE("params", '{}'::jsonb) || '{"minMonths":1,"proportional":true}'::jsonb WHERE "method" = 'THR';
-- Bonus: tidak rutin, dihitung seperti THR (dipilih saat Proses Gaji).
UPDATE "PayComponent" SET "method" = 'THR', "param" = 'MASA_KERJA', "base" = 'UPAH_TETAP',
    "params" = (COALESCE("params", '{}'::jsonb) - 'perPeriod' - 'prorate') || '{"months":1,"minMonths":1,"proportional":true}'::jsonb
  WHERE "code" = 'BNS';
-- "Diisi tiap periode" dihapus.
UPDATE "PayComponent" SET "params" = "params" - 'perPeriod' WHERE "params" ? 'perPeriod';

-- Kategori mengikuti baris bukti potong PPh 21 (1721-A1).
UPDATE "PayComponent" SET "category" = CASE
    WHEN "category" = 'GAJI_POKOK' THEN 'GAJI'
    WHEN "code" = 'ABS' THEN 'GAJI'
    WHEN "category" IN ('TUNJANGAN_TETAP', 'TUNJANGAN_TIDAK_TETAP', 'LEMBUR') THEN 'TUNJANGAN_LAIN'
    WHEN "category" IN ('THR', 'BONUS') THEN 'BONUS_THR'
    WHEN "category" = 'PAJAK' THEN 'PPH21'
    WHEN "category" IN ('BPJS_TK', 'BPJS_KES') AND "kind" = 'BENEFIT' AND "taxable" THEN 'PREMI_ASURANSI'
    WHEN "category" = 'BPJS_TK' AND "kind" = 'POTONGAN' THEN 'IURAN_PENSIUN'
    WHEN "category" IN ('BPJS_TK', 'BPJS_KES', 'POTONGAN_LAIN') THEN 'BUKAN_OBJEK'
    ELSE "category" END;
-- Objek pajak ditentukan kategori.
UPDATE "PayComponent" SET "taxable" = "category" IN ('GAJI', 'TUNJANGAN_PPH', 'TUNJANGAN_LAIN', 'HONORARIUM', 'PREMI_ASURANSI', 'NATURA', 'BONUS_THR');
