-- =========================================================================
-- SEED DATA: KOMUNITAS - DUMMY DATA FOR ADMIN DASHBOARD TESTING
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- WARNING: Jalankan hanya di environment DEV/TESTING, bukan PRODUCTION
-- NOTE: Tidak mengubah file database.sql, hanya INSERT data dummy
-- =========================================================================

-- =========================================================================
-- SEED: citizen_reports (Laporan Warga Dummy)
-- Variatif: status, kategori, provinsi/kota, tanggal berbeda-beda
-- =========================================================================

INSERT INTO citizen_reports (reporter_name, reporter_contact, category, description, status, province, city, district, latitude, longitude, created_at)
VALUES
  -- Laporan bulan ini (Juli 2026)
  ('Budi Santoso',    '081234567801', 'Infrastruktur',   'Jalan berlubang besar di depan pasar tradisional sudah 3 bulan tidak diperbaiki. Membahayakan pengendara motor.', 'Menunggu',  'Jawa Barat',   'Kota Bandung',   'Coblong',        -6.8952, 107.6102, NOW() - INTERVAL '1 day'),
  ('Siti Rahayu',     '081234567802', 'Layanan Publik',  'Antrian BPJS sangat panjang dan petugas loket tidak ramah. Pasien lansia tidak mendapat prioritas.', 'Diproses',  'Jawa Tengah',  'Kota Semarang',  'Gayamsari',      -6.9824, 110.4251, NOW() - INTERVAL '2 days'),
  ('Ahmad Fauzi',     '081234567803', 'Kebersihan',      'Sampah menumpuk di pinggir jalan dekat permukiman warga sudah seminggu tidak diangkut petugas kebersihan.', 'Selesai',   'DKI Jakarta',  'Kota Jakarta Selatan', 'Tebet', -6.2263, 106.8502, NOW() - INTERVAL '3 days'),
  ('Dewi Lestari',    '081234567804', 'Keamanan',        'Lampu jalan mati di gang kecil selama dua minggu. Warga takut keluar malam hari karena gelap total.', 'Menunggu',  'Bali',         'Kota Denpasar',  'Denpasar Timur', -8.6705, 115.2126, NOW() - INTERVAL '4 days'),
  ('Eko Prasetyo',    '081234567805', 'Banjir',          'Saluran drainase tersumbat menyebabkan banjir saat hujan. Rumah warga terendam sampai 30cm.', 'Diproses',  'Jawa Timur',   'Kota Surabaya',  'Wonokromo',      -7.2967, 112.7228, NOW() - INTERVAL '5 days'),
  ('Fitri Handayani', '081234567806', 'Infrastruktur',   'Jembatan darurat di desa mulai rapuh dan berbahaya untuk dilalui kendaraan roda empat.', 'Selesai',   'Sumatera Utara','Kota Medan',   'Medan Kota',     3.5890, 98.6722, NOW() - INTERVAL '6 days'),
  ('Gunawan Hadi',    '081234567807', 'Layanan Publik',  'Website pelayanan KTP online sering error dan tidak bisa diakses. Sudah coba berulang kali tetap gagal.', 'Ditolak',   'DKI Jakarta',  'Kota Jakarta Pusat', 'Gambir', -6.1702, 106.8272, NOW() - INTERVAL '7 days'),
  -- Laporan 2 minggu lalu
  ('Hana Maulida',    '081234567808', 'Kebersihan',      'TPS liar bermunculan di area persawahan. Bau busuk mengganggu warga sekitar dan mencemari lingkungan.', 'Selesai',   'Jawa Barat',   'Kota Depok',     'Beji',           -6.3891, 106.8219, NOW() - INTERVAL '10 days'),
  ('Irwan Susanto',   '081234567809', 'Keamanan',        'Terjadi aksi premanisme di pasar setiap hari. Pedagang kecil dipaksa bayar pungli setiap minggu.', 'Diproses',  'Sulawesi Selatan', 'Kota Makassar', 'Tamalate',      -5.1542, 119.4328, NOW() - INTERVAL '12 days'),
  ('Joko Wirawan',    '081234567810', 'Infrastruktur',   'Tiang listrik miring dan kabel menjuntai berbahaya di pinggir trotoar pejalan kaki.', 'Menunggu',  'Jawa Tengah',  'Kota Solo',      'Laweyan',        -7.5563, 110.8120, NOW() - INTERVAL '13 days'),
  ('Kartini Sari',    '081234567811', 'Banjir',          'Selokan penuh sampah plastik menyebabkan air meluap ke jalan. Sudah dilaporkan ke RT tapi tidak ada tindakan.', 'Selesai', 'Jawa Timur', 'Kota Malang', 'Lowokwaru',      -7.9385, 112.6097, NOW() - INTERVAL '14 days'),
  -- Laporan 3 minggu lalu
  ('Lina Marlina',    '081234567812', 'Layanan Publik',  'Izin usaha mikro ditolak tanpa penjelasan yang jelas oleh petugas kelurahan. Tidak ada transparansi prosedur.', 'Ditolak', 'Bali', 'Kabupaten Badung', 'Kuta',          -8.7181, 115.1681, NOW() - INTERVAL '17 days'),
  ('Moch Ridwan',     '081234567813', 'Kebersihan',      'Air sumur warga berwarna kekuningan dan berbau sejak ada galian proyek di dekat RT 05.', 'Diproses',  'Jawa Barat',   'Kota Bogor',     'Bogor Tengah',   -6.5943, 106.7892, NOW() - INTERVAL '19 days'),
  ('Nana Suparman',   '081234567814', 'Infrastruktur',   'Trotoar rusak parah dan tidak bisa dilalui penyandang disabilitas. Kursi roda tidak bisa melintas.', 'Selesai',  'DKI Jakarta',  'Kota Jakarta Barat', 'Grogol',     -6.1687, 106.7921, NOW() - INTERVAL '21 days'),
  -- Laporan bulan lalu (Juni 2026)
  ('Oki Kurniawan',   '081234567815', 'Keamanan',        'Kenakalan remaja semakin parah di area taman kota. Terjadi vandalisme dan perkelahian hampir setiap malam.', 'Selesai', 'Kalimantan Timur', 'Kota Samarinda', 'Sungai Pinang', -0.5076, 117.1539, NOW() - INTERVAL '32 days'),
  ('Putri Yuliani',   '081234567816', 'Banjir',          'Talud sungai retak dan terancam longsor saat musim hujan. Rumah warga di dekat tepian sangat khawatir.', 'Diproses', 'Jawa Tengah', 'Kabupaten Semarang', 'Ungaran',   -7.1368, 110.4022, NOW() - INTERVAL '35 days'),
  ('Qori Handayani',  '081234567817', 'Layanan Publik',  'Pelayanan posyandu tidak konsisten. Jadwal sering berubah mendadak tanpa pemberitahuan kepada ibu balita.', 'Menunggu', 'Sumatera Selatan', 'Kota Palembang', 'Ilir Timur', -2.9761, 104.7753, NOW() - INTERVAL '38 days'),
  ('Rudi Hartono',    '081234567818', 'Infrastruktur',   'Pompa air desa rusak. Warga terpaksa jalan 2km untuk ambil air bersih dari sumber terdekat setiap hari.', 'Selesai', 'Nusa Tenggara Timur', 'Kabupaten Ende', 'Ende',    -8.8476, 121.6625, NOW() - INTERVAL '40 days'),
  ('Sri Wahyuni',     '081234567819', 'Kebersihan',      'Asap pabrik mencemari udara di perumahan warga. Banyak anak-anak menderita batuk dan sesak napas.', 'Ditolak', 'Jawa Barat', 'Kota Bekasi', 'Bekasi Utara',    -6.2349, 107.0044, NOW() - INTERVAL '42 days'),
  ('Tono Saputra',    '081234567820', 'Keamanan',        'Jalan gelap tanpa penerangan di kawasan industri. Sudah terjadi beberapa kali kecelakaan lalu lintas.', 'Menunggu', 'Jawa Timur', 'Kabupaten Sidoarjo', 'Waru',    -7.3887, 112.7329, NOW() - INTERVAL '45 days'),
  -- Laporan 2 bulan lalu (Mei 2026)
  ('Umar Ali',        '081234567821', 'Banjir',          'Embung desa penuh sampah dan tidak pernah dikeruk selama 5 tahun. Kapasitas tampung menurun drastis.', 'Selesai',  'Jawa Tengah',  'Kabupaten Klaten', 'Klaten Utara', -7.7047, 110.5965, NOW() - INTERVAL '60 days'),
  ('Vera Kristina',   '081234567822', 'Infrastruktur',   'Drainase jalan utama desa tertutup rumput liar. Air tidak mengalir dan menggenang di musim hujan.', 'Selesai',  'Sumatera Barat', 'Kota Padang',  'Padang Timur', -0.9489, 100.3542, NOW() - INTERVAL '65 days'),
  ('Wahyu Pribadi',   '081234567823', 'Layanan Publik',  'Akta kelahiran anak tidak bisa diurus karena sistem kependudukan offline lebih dari sebulan penuh.', 'Diproses', 'Kalimantan Selatan', 'Kota Banjarmasin', 'Banjarmasin Barat', -3.3272, 114.5902, NOW() - INTERVAL '68 days'),
  ('Xena Pratiwi',    '081234567824', 'Kebersihan',      'Sungai kecil berubah warna menjadi hitam dan berbau akibat limbah usaha laundry tidak resmi.', 'Selesai',  'Jawa Barat',   'Kota Cimahi',    'Cimahi Selatan', -6.8838, 107.5414, NOW() - INTERVAL '72 days'),
  -- Laporan 3 bulan lalu (April 2026)
  ('Yudi Prasetia',   '081234567825', 'Infrastruktur',   'Konstruksi jembatan baru tidak sesuai spesifikasi. Retak sudah terlihat padahal baru selesai 6 bulan lalu.', 'Ditolak', 'Jawa Timur', 'Kabupaten Jember', 'Kaliwates', -8.1652, 113.6705, NOW() - INTERVAL '85 days'),
  ('Zahra Aulia',     '081234567826', 'Keamanan',        'Penipuan berkedok investasi meresahkan warga lansia. Sudah ada beberapa korban di RT 03 dan RT 07.', 'Selesai', 'DKI Jakarta', 'Kota Jakarta Timur', 'Duren Sawit', -6.2213, 106.9219, NOW() - INTERVAL '90 days');


-- =========================================================================
-- SEED: claim_verifications (Verifikasi Hoaks/Klaim Dummy)
-- =========================================================================

INSERT INTO claim_verifications (claim_text, is_credible, confidence_score, reasoning, sources, category)
VALUES
  ('Vaksin COVID-19 menyebabkan autism pada anak-anak',
   false, 95.00,
   'Klaim ini telah terbukti salah berdasarkan puluhan penelitian ilmiah internasional. Tidak ada hubungan kausal antara vaksin dengan autism.',
   '[{"title":"WHO Vaccine Safety","url":"https://www.who.int/vaccine-safety"},{"title":"CDC Autism Studies","url":"https://www.cdc.gov/vaccinesafety"}]'::jsonb,
   'Kesehatan'),

  ('Pemerintah Indonesia akan menghapus subsidi BBM per 1 Agustus 2026',
   false, 78.00,
   'Tidak ada kebijakan resmi dari Kementerian ESDM atau Pertamina yang menyatakan hal ini.',
   '[{"title":"Pertamina Official","url":"https://www.pertamina.com"},{"title":"ESDM RI","url":"https://www.esdm.go.id"}]'::jsonb,
   'Ekonomi'),

  ('Gempa bumi berkekuatan 7.8 SR akan mengguncang Jawa pada bulan Agustus',
   false, 88.00,
   'BMKG tidak pernah membuat prediksi gempa bumi dengan tanggal pasti. Ilmu seismologi saat ini belum mampu memprediksi gempa secara akurat.',
   '[{"title":"BMKG Resmi","url":"https://www.bmkg.go.id"}]'::jsonb,
   'Bencana Alam'),

  ('Suhu udara di Indonesia meningkat rata-rata 0.5 derajat per dekade sejak 1990',
   true, 82.00,
   'Data BMKG dan penelitian iklim internasional menunjukkan tren peningkatan suhu rata-rata di Indonesia sesuai proyeksi perubahan iklim global.',
   '[{"title":"BMKG Iklim","url":"https://www.bmkg.go.id/iklim"},{"title":"IPCC Report 2023","url":"https://www.ipcc.ch"}]'::jsonb,
   'Lingkungan'),

  ('Dana BLT akan dihentikan pemerintah mulai September 2026',
   false, 71.00,
   'Kementerian Sosial tidak mengeluarkan kebijakan penghentian BLT. Informasi ini beredar tanpa sumber resmi yang dapat diverifikasi.',
   '[{"title":"Kemensos RI","url":"https://www.kemsos.go.id"}]'::jsonb,
   'Sosial');


-- =========================================================================
-- SEED: public_services RAG (Layanan Publik Dummy)
-- Catatan: kolom embedding dibiarkan NULL karena butuh vector AI
-- =========================================================================

INSERT INTO public_services (name, institution, category, description, requirements, procedures, contact_phone, contact_email, address, is_active)
VALUES
  ('Pembuatan KTP Elektronik',
   'Dinas Kependudukan dan Catatan Sipil',
   'Administrasi Kependudukan',
   'Layanan pembuatan Kartu Tanda Penduduk Elektronik bagi warga negara Indonesia yang telah berusia 17 tahun atau sudah menikah.',
   '["Surat pengantar RT/RW","Kartu Keluarga asli","Foto 3x4 latar merah (2 lembar)","Surat keterangan domisili (jika berbeda)"]'::jsonb,
   '["Datang ke kantor Disdukcapil setempat","Ambil nomor antrian","Serahkan berkas ke loket","Perekaman sidik jari dan foto","Tunggu proses cetak (14 hari kerja)","Ambil KTP jadi"]'::jsonb,
   '(021) 3456789', 'dukcapil@pemkot.go.id',
   'Jl. Raya Administrasi No. 1, Jakarta Pusat', true),

  ('Pendaftaran Peserta BPJS Kesehatan Baru',
   'BPJS Kesehatan',
   'Kesehatan',
   'Pendaftaran sebagai peserta BPJS Kesehatan untuk mendapatkan akses layanan kesehatan di seluruh fasilitas kesehatan yang bekerja sama.',
   '["KTP Elektronik","Kartu Keluarga","Pas foto terbaru","Rekening bank aktif (untuk autodebet iuran)"]'::jsonb,
   '["Kunjungi kantor BPJS terdekat atau akses Mobile JKN","Isi formulir pendaftaran","Pilih kelas kepesertaan (1/2/3)","Lakukan pembayaran iuran pertama","Kartu virtual aktif dalam 14 hari"]'::jsonb,
   '1500-400', 'care@bpjs-kesehatan.go.id',
   'Kantor Pusat: Jl. Let. Jend. Suprapto No. 20, Jakarta Pusat', true),

  ('Izin Usaha Mikro Kecil (IUMK)',
   'Dinas Penanaman Modal dan PTSP',
   'Perizinan Usaha',
   'Penerbitan Izin Usaha Mikro Kecil bagi pelaku usaha dengan modal di bawah Rp 500 juta untuk legalitas operasional usaha.',
   '["KTP pemilik usaha","Kartu Keluarga","Surat keterangan domisili usaha dari kelurahan","Foto tempat usaha (minimal 2 lembar)"]'::jsonb,
   '["Akses portal OSS di oss.go.id","Daftar akun dan login","Pilih jenis izin IUMK","Isi data usaha","Submit permohonan","Izin terbit otomatis dalam sistem"]'::jsonb,
   '(021) 1500-164', 'ptsp@pemkot.go.id',
   'Gedung PTSP Satu Pintu, Jl. Medan Merdeka Selatan No. 8', true),

  ('Bantuan Pangan Non-Tunai (BPNT)',
   'Kementerian Sosial RI',
   'Bantuan Sosial',
   'Program pemerintah berupa bantuan sembako senilai Rp 200.000/bulan yang disalurkan melalui Kartu Keluarga Sejahtera kepada Keluarga Penerima Manfaat.',
   '["Terdaftar di Data Terpadu Kesejahteraan Sosial (DTKS)","Memiliki KKS aktif","KTP dan Kartu Keluarga"]'::jsonb,
   '["Verifikasi data di kantor kelurahan setempat","Pastikan data terdaftar di DTKS","Aktivasi KKS di bank penyalur","Ambil bantuan di e-warong setiap bulan"]'::jsonb,
   '1500-229', 'bantuan@kemsos.go.id',
   'Jl. Salemba Raya No. 28, Jakarta Pusat', true),

  ('Penerbitan Akta Kelahiran',
   'Dinas Kependudukan dan Catatan Sipil',
   'Administrasi Kependudukan',
   'Penerbitan akta kelahiran sebagai dokumen hukum resmi yang mencatat identitas seseorang sejak lahir.',
   '["Surat keterangan lahir dari bidan/dokter/RS","Kartu Keluarga orang tua","KTP kedua orang tua","Buku nikah orang tua","Surat pengantar RT/RW"]'::jsonb,
   '["Siapkan semua dokumen persyaratan","Datang ke kantor Disdukcapil atau upload via aplikasi Dukcapil Go!","Isi formulir permohonan F-2.01","Verifikasi dokumen oleh petugas","Akta terbit dalam 3-7 hari kerja","Ambil akta atau terima via pos"]'::jsonb,
   '(021) 3456789', 'dukcapil@pemkot.go.id',
   'Jl. Raya Administrasi No. 1, Jakarta Pusat', true);


-- =========================================================================
-- SEED: hoax_database (Kata Kunci Hoaks WhatsApp)
-- =========================================================================

INSERT INTO hoax_database (keyword, title, description, source, is_verified)
VALUES
  ('vaksin autism', 'Vaksin Menyebabkan Autism',
   'Klaim bahwa vaksin menyebabkan autism adalah hoaks yang sudah dibantah oleh ratusan penelitian ilmiah. Tidak ada hubungan kausal yang terbukti.',
   'WHO, CDC, BPOM Indonesia', true),

  ('bbm naik agustus', 'BBM Naik Agustus 2026',
   'Tidak ada kebijakan resmi kenaikan harga BBM bersubsidi pada Agustus 2026. Informasi ini beredar tanpa dasar dari Pertamina atau Kementerian ESDM.',
   'Pertamina, Kementerian ESDM', true),

  ('gempa besar jawa', 'Prediksi Gempa Besar di Jawa',
   'BMKG tidak pernah membuat prediksi gempa dengan tanggal spesifik. Hoaks prediksi gempa bumi sering beredar di WhatsApp dan sudah dibantah secara resmi.',
   'BMKG', true),

  ('blt dihentikan', 'BLT Dihentikan Pemerintah',
   'Program Bantuan Langsung Tunai tidak dihentikan. Klaim ini tidak didukung oleh Kementerian Sosial. Informasi palsu yang beredar di grup warga.',
   'Kementerian Sosial RI', true),

  ('air minum microchip', 'Air Minum Mengandung Mikrochip 5G',
   'Klaim ini adalah hoaks konspirasi tanpa dasar ilmiah. Tidak ada teknologi yang memungkinkan mikrochip nano bekerja dalam cairan.',
   'BPOM, Kemenkes RI', true),

  ('matahari terbit barat 2026', 'Matahari Akan Terbit dari Barat Tahun 2026',
   'Secara astronomi, perubahan arah terbit matahari tidak dapat terjadi dalam waktu singkat. Tidak ada data ilmiah yang mendukung klaim ini.',
   'LAPAN, BRIN', true);


-- =========================================================================
-- VERIFIKASI: Cek jumlah data yang berhasil di-seed
-- =========================================================================

SELECT
  'citizen_reports' as tabel, COUNT(*) as jumlah FROM citizen_reports
UNION ALL
SELECT 'claim_verifications', COUNT(*) FROM claim_verifications
UNION ALL
SELECT 'public_services', COUNT(*) FROM public_services
UNION ALL
SELECT 'hoax_database', COUNT(*) FROM hoax_database;
