-- Uang Makan Lembur: Rp15.000 per kelipatan 4 jam lembur per pengajuan (keputusan pemilik 2026-11-09).
UPDATE "PayComponent" SET "sortOrder" = "sortOrder" + 1 WHERE "sortOrder" >= 5;
INSERT INTO "PayComponent" ("id","code","name","kind","category","method","amount","rate","base","capAmount","floorAmount","taxable","legalBasis","note","isActive","sortOrder","updatedBy","createdAt","updatedAt")
VALUES (gen_random_uuid()::text, 'UML', 'Uang Makan Lembur', 'PENDAPATAN', 'TUNJANGAN_TIDAK_TETAP', 'PER_LEMBUR', 15000, 4, NULL, NULL, NULL, true,
'Kebijakan perusahaan (SOP lembur CBA)',
'Diberikan bila lembur yang diakui 4 jam atau lebih, berlaku kelipatan per pengajuan: 4-7 jam = 1x, 8-11 jam = 2x, 12 jam = 3x, dst.',
true, 5, 'Sistem', now(), now())
ON CONFLICT ("code") DO NOTHING;
