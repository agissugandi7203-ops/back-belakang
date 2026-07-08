-- =========================================================================
-- CLEANUP SEED: KOMUNITAS - HAPUS SEMUA DATA DUMMY
-- Jalankan di Supabase SQL Editor untuk membersihkan data dummy
-- CATATAN: Hanya menghapus data, TIDAK mengubah struktur tabel (schema)
-- =========================================================================

-- Hapus berdasarkan urutan dependensi (FK constraints)
-- chat_messages -> citizen_reports -> profiles -> auth.users

-- 1. Hapus semua pesan chat dari laporan dummy
DELETE FROM chat_messages
WHERE report_id IN (
  SELECT id FROM citizen_reports
  WHERE reporter_contact LIKE '08123456%'
);

-- 2. Hapus semua laporan warga dummy
--    (reporter_contact diisi dengan pola 08123456XXXX pada seed)
DELETE FROM citizen_reports
WHERE reporter_contact LIKE '08123456%';

-- 3. Hapus semua claim_verifications dummy
DELETE FROM claim_verifications
WHERE claim_text IN (
  'Vaksin COVID-19 menyebabkan autism pada anak-anak',
  'Pemerintah Indonesia akan menghapus subsidi BBM per 1 Agustus 2026',
  'Gempa bumi berkekuatan 7.8 SR akan mengguncang Jawa pada bulan Agustus',
  'Suhu udara di Indonesia meningkat rata-rata 0.5 derajat per dekade sejak 1990',
  'Dana BLT akan dihentikan pemerintah mulai September 2026'
);

-- 4. Hapus semua public_services dummy
DELETE FROM public_services
WHERE institution IN (
  'Dinas Kependudukan dan Catatan Sipil',
  'BPJS Kesehatan',
  'Dinas Penanaman Modal dan PTSP',
  'Kementerian Sosial RI'
);

-- 5. Hapus semua hoax_database dummy
DELETE FROM hoax_database
WHERE keyword IN (
  'vaksin autism',
  'bbm naik agustus',
  'gempa besar jawa',
  'blt dihentikan',
  'air minum microchip',
  'matahari terbit barat 2026'
);

-- =========================================================================
-- VERIFIKASI: Cek sisa data setelah cleanup
-- =========================================================================

SELECT
  'citizen_reports' as tabel, COUNT(*) as sisa FROM citizen_reports
UNION ALL
SELECT 'claim_verifications', COUNT(*) FROM claim_verifications
UNION ALL
SELECT 'public_services', COUNT(*) FROM public_services
UNION ALL
SELECT 'hoax_database', COUNT(*) FROM hoax_database
UNION ALL
SELECT 'chat_messages', COUNT(*) FROM chat_messages;
