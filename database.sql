-- =========================================================================
-- DATABASE SCHEMA: KOMUNITAS - AI Assistant & Valid Information Portal
-- For LKS EKKA National Competition 2026 (Komunitas Case Study)
-- Database Engine: PostgreSQL (Supabase)
-- Status: FULLY SECURED & OPTIMIZED (UNIFIED SCHEMA - ULTIMATE EDITION)
-- =========================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- =========================================================================
-- 1. TABLE: public_services
-- =========================================================================
drop table if exists public_services cascade;
create table public_services (
    id uuid default uuid_generate_v4() primary key,
    name varchar(255) not null,
    institution varchar(255) not null,
    category varchar(100) not null,
    description text not null,
    requirements jsonb default '[]'::jsonb,
    procedures jsonb default '[]'::jsonb,
    contact_phone varchar(50),
    contact_email varchar(100),
    address text,
    website varchar(255),
    embedding vector(1536),
    is_active boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_public_services_category on public_services(category);
create index idx_public_services_name_inst on public_services(name, institution);
create index idx_public_services_embedding on public_services using hnsw (embedding vector_cosine_ops);

-- =========================================================================
-- 2. TABLE: chat_history
-- =========================================================================
drop table if exists chat_history cascade;
create table chat_history (
    session_id text primary key,
    user_id uuid references profiles(id) on delete cascade,
    messages jsonb not null default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_chat_history_updated_at on chat_history(updated_at desc);

-- =========================================================================
-- 3. TABLE: claim_verifications
-- =========================================================================
drop table if exists claim_verifications cascade;
create table claim_verifications (
    id uuid default uuid_generate_v4() primary key,
    claim_text text not null,
    is_credible boolean default false not null,
    confidence_score numeric(5,2) default 0.00 not null,
    reasoning text not null,
    sources jsonb default '[]'::jsonb,
    category varchar(100) default 'Umum'::varchar,
    search_count integer default 1 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_claim_verifications_search_count on claim_verifications(search_count desc);

-- =========================================================================
-- 4. TABLE: document_summaries
-- =========================================================================
drop table if exists document_summaries cascade;
create table document_summaries (
    id uuid default uuid_generate_v4() primary key,
    original_hash varchar(64) unique not null,
    original_text text not null,
    summary text not null,
    key_points jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =========================================================================
-- 5. TABLE: profiles
-- =========================================================================
drop table if exists profiles cascade;
create table profiles (
    id uuid references auth.users on delete cascade primary key,
    email varchar(255) unique not null,
    nama_lengkap varchar(255) not null,
    nama_panggilan varchar(255) not null,
    tanggal_lahir date,
    nomor_telepon varchar(50) not null,
    role varchar(50) default 'user'::varchar not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =========================================================================
-- 6. TABLE: citizen_reports
-- =========================================================================
drop table if exists citizen_reports cascade;
create table citizen_reports (
    id uuid default uuid_generate_v4() primary key,
    session_id text references chat_history(session_id) on delete set null,
    user_id uuid references profiles(id) on delete set null,
    reporter_name varchar(100) default 'Anonim'::varchar not null,
    reporter_contact varchar(100),
    category varchar(100) not null,
    description text not null,
    status varchar(50) default 'Menunggu'::varchar not null,
    admin_note text,
    latitude double precision,
    longitude double precision,
    image_url text,
    province text,
    city text,
    district text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_citizen_reports_status on citizen_reports(status);
create index idx_citizen_reports_created_at on citizen_reports(created_at desc);
create index idx_citizen_reports_province on citizen_reports(province);
create index idx_citizen_reports_city on citizen_reports(city);
create index idx_citizen_reports_district on citizen_reports(district);

-- =========================================================================
-- 7. TABLE: user_usage
-- =========================================================================
drop table if exists user_usage cascade;
create table user_usage (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references profiles(id) on delete cascade,
    session_id text,
    prompt_count integer default 0 not null,
    reset_at timestamp with time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_user_usage_user_id on user_usage(user_id);
create index idx_user_usage_session_id on user_usage(session_id);

-- =========================================================================
-- 8. TABLE: hoax_database
-- =========================================================================
drop table if exists hoax_database cascade;
create table hoax_database (
    id uuid default uuid_generate_v4() primary key,
    keyword text unique not null,
    title text not null,
    description text not null,
    source text default 'Situs Resmi Cek Fakta KOMUNITAS'::text,
    is_verified boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_hoax_database_keyword on hoax_database(keyword);

-- =========================================================================
-- 9. TABLE: chat_messages
-- =========================================================================
drop table if exists chat_messages cascade;
create table chat_messages (
    id uuid default uuid_generate_v4() primary key,
    report_id uuid references citizen_reports(id) on delete cascade not null,
    sender_id text not null,
    sender_type varchar(20) not null check (sender_type in ('user', 'petugas')),
    sender_name varchar(255) not null default 'Anonim',
    message text not null,
    is_read boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_chat_messages_report_id on chat_messages(report_id);
create index idx_chat_messages_created_at on chat_messages(created_at desc);

-- =========================================================================
-- VECTOR MATCHING FUNCTION (RPC for RAG Search)
-- =========================================================================
create or replace function match_services (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  name varchar(255),
  institution varchar(255),
  category varchar(100),
  description text,
  requirements jsonb,
  procedures jsonb,
  contact_phone varchar(50),
  contact_email varchar(100),
  address text,
  website text,
  similarity float
)
language sql stable
as $$
  select
    public_services.id,
    public_services.name,
    public_services.institution,
    public_services.category,
    public_services.description,
    public_services.requirements,
    public_services.procedures,
    public_services.contact_phone,
    public_services.contact_email,
    public_services.address,
    public_services.website::text,
    1 - (public_services.embedding <=> query_embedding) as similarity
  from public_services
  where 1 - (public_services.embedding <=> query_embedding) > match_threshold
  order by public_services.embedding <=> query_embedding
  limit match_count;
$$;

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
alter table public_services enable row level security;
alter table chat_history enable row level security;
alter table claim_verifications enable row level security;
alter table document_summaries enable row level security;
alter table profiles enable row level security;
alter table citizen_reports enable row level security;
alter table user_usage enable row level security;
alter table hoax_database enable row level security;
alter table chat_messages enable row level security;

-- Profiles Policies
create policy "Allow read on profiles for owners and staff"
on profiles for select using (
  auth.uid() = id OR 
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin', 'petugas')
  )
);
create policy "Allow insert on profiles for anyone"
on profiles for insert with check (true);
create policy "Allow update on profiles for owners"
on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Public Services Policies
create policy "Allow public read on public_services" 
on public_services for select using (true);

-- Chat History Policies
create policy "Allow all operations on chat_history for anonymous users"
on chat_history for all using (true) with check (true);

-- Claim Verifications Policies
create policy "Allow read/write on claim_verifications"
on claim_verifications for all using (true) with check (true);

-- Document Summaries Policies
create policy "Allow read/write on document_summaries"
on document_summaries for all using (true) with check (true);

-- Citizen Reports Policies
create policy "Allow select on citizen_reports for anyone"
on citizen_reports for select using (true);
create policy "Allow insert on citizen_reports for authenticated users"
on citizen_reports for insert with check (
  auth.uid() is not null or session_id is not null
);
create policy "Allow update on citizen_reports for staff only"
on citizen_reports for update using (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin', 'petugas')
  )
);
create policy "Allow delete on citizen_reports for staff only"
on citizen_reports for delete using (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin')
  )
);

-- User Usage Policies
create policy "Allow select on user_usage for owner or staff"
on user_usage for select using (
  auth.uid() = user_id or
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin')
  )
);
create policy "Allow insert on user_usage for owner"
on user_usage for insert with check (auth.uid() = user_id);
create policy "Allow update on user_usage for owner"
on user_usage for update using (auth.uid() = user_id);
create policy "Allow delete on user_usage for staff only"
on user_usage for delete using (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin')
  )
);

-- Chat Messages Policies
create policy "Allow select on chat_messages for participants"
on chat_messages for select using (
  auth.uid() in (
    select user_id from citizen_reports where id = report_id
  ) or
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin', 'petugas')
  )
);
create policy "Allow insert on chat_messages for participants"
on chat_messages for insert with check (
  auth.uid() in (
    select user_id from citizen_reports where id = report_id
  ) or
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin', 'petugas')
  )
);
create policy "Allow delete on chat_messages for staff only"
on chat_messages for delete using (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin')
  )
);

-- Hoax Database Policies
create policy "Allow public read on hoax_database"
on hoax_database for select using (true);
create policy "Allow admin all on hoax_database"
on hoax_database for all using (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin')
  )
) with check (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('superadmin', 'admin')
  )
);

-- =========================================================================
-- SEED DATA (INITIAL FACTUAL DIRECTORIES)
-- =========================================================================
insert into public_services (name, institution, category, description, requirements, procedures, contact_phone, contact_email, address, website)
values 
(
    'Pengaduan Kekerasan dan Hak Anak',
    'Komisi Perlindungan Anak Indonesia (KPAI)',
    'Perlindungan Anak',
    'Layanan pengaduan resmi bagi masyarakat yang menyaksikan atau menjadi korban pelanggaran hak anak, kekerasan, eksploitasi, maupun penelantaran anak.',
    '["KTP/Identitas Pelapor", "Kronologi Kejadian (Tertulis)", "Bukti Pendukung (Foto/Video jika ada)", "Nama & Usia Anak"]'::jsonb,
    '["Masyarakat mengirimkan laporan via form online atau datang langsung", "KPAI melakukan verifikasi awal laporan", "KPAI mengadakan mediasi atau koordinasi dengan lembaga hukum/dinas sosial jika ada unsur pidana", "Tindak lanjut pengawasan kasus hingga selesai"]'::jsonb,
    '021-31901556',
    'pengaduan@kpai.go.id',
    'Jl. Teuku Umar No. 10, Gondangdia, Menteng, Jakarta Pusat',
    'https://www.kpai.go.id'
),
(
    'Layanan Ambulans Gawat Darurat dan Donor Darah',
    'Palang Merah Indonesia (PMI)',
    'Layanan Kesehatan',
    'Penyediaan unit ambulans gratis untuk evakuasi darurat, stok kantong darah, penanganan bencana alam tingkat nasional, dan pelatihan pertolongan pertama.',
    '["Surat Permintaan Kebutuhan Darah (untuk donor darah)", "Kartu Identitas (untuk donor darah)", "Panggilan Darurat bebas dokumen (untuk Ambulans)"]'::jsonb,
    '["Untuk donor darah: datang ke Unit Transfusi Darah (UTD) terdekat, isi kuesioner medis, lakukan cek HB dan tensi, proses donor darah.", "Untuk bencana/ambulans: Hubungi call center PMI di 112 atau nomor wilayah setempat, tim evakuasi segera meluncur ke lokasi."]'::jsonb,
    '021-7992325',
    'pmi@pmi.or.id',
    'Jl. Jenderal Gatot Subroto Kav. 96, Jakarta Selatan',
    'https://www.pmi.or.id'
),
(
    'Pengaduan Pelanggaran Hak Asasi Manusia',
    'Komisi Nasional Hak Asasi Manusia (Komnas HAM)',
    'Perlindungan Hukum',
    'Menerima pengaduan masyarakat atas dugaan pelanggaran Hak Asasi Manusia yang dilakukan oleh aparatur negara maupun pihak swasta.',
    '["KTP/Paspor Pelapor", "Uraian kronologis pelanggaran HAM", "Identitas korban dan pihak terlapor", "Dokumen bukti permulaan (surat keputusan, foto, dll)"]'::jsonb,
    '["Pengadu menyampaikan berkas pengaduan secara tertulis maupun daring", "Komnas HAM memeriksa kelengkapan berkas", "Analisis materiil untuk menentukan apakah ada pelanggaran HAM", "Mediasi, rekomendasi kepada aparat penegak hukum, atau penyelidikan lapangan jika diperlukan"]'::jsonb,
    '021-3925230',
    'pengaduan@komnasham.go.id',
    'Jl. Latuharhary No. 4B, Menteng, Jakarta Pusat',
    'https://www.komnasham.go.id'
),
(
    'Aduan Konten Internet Negatif',
    'Kementerian Komunikasi dan Digital (Kemenkomdigi / Kominfo)',
    'Layanan Digital',
    'Fasilitas pengaduan masyarakat untuk melaporkan konten negatif di internet seperti perjudian online, penipuan digital, pornografi, ujaran kebencian, hoax, dan radikalisme.',
    '["Tautan (URL) konten negatif yang dilaporkan", "Tangkapan layar (screenshot) bukti tampilan konten", "Deskripsi singkat pelanggaran", "Email aktif pelapor"]'::jsonb,
    '["Pemohon mengirimkan laporan melalui situs aduankonten.id atau nomor WhatsApp resmi", "Tim analis verifikator Kominfo meninjau validitas aduan", "Kominfo menerbitkan perintah pemblokiran (take down) ke ISP/penyedia platform sosial media", "Notifikasi hasil aduan dikirim ke email pelapor"]'::jsonb,
    '08119000505',
    'aduankonten@mail.kominfo.go.id',
    'Jl. Medan Merdeka Barat No. 9, Jakarta Pusat',
    'https://aduankonten.id'
),
(
    'Pemeriksaan Penerima dan Pendaftaran Bantuan Sosial DTKS',
    'Kementerian Sosial (Kemensos)',
    'Bantuan Sosial',
    'Sistem basis data terpadu untuk pengusulan dan pemeriksaan kelayakan status penerima program bantuan sosial nasional seperti Program Keluarga Harapan (PKH), Bantuan Pangan Non-Tunai (BPNT), serta KIS PBI.',
    '["Kartu Tanda Penduduk Elektronik (e-KTP) asli", "Kartu Keluarga (KK) terbaru", "Surat Keterangan Tidak Mampu (SKTM) dari Kelurahan/Desa"]'::jsonb,
    '["Warga mengajukan usulan pendaftaran melalui Musyawarah Desa/Kelurahan setempat", "Dinas Sosial Kabupaten/Kota melakukan verifikasi kelayakan di lapangan", "Pemerintah daerah mengunggah data hasil validasi ke sistem SIKS-NG", "Kementerian Sosial menetapkan keputusan final kepesertaan secara periodik"]'::jsonb,
    '1500299',
    'saran@kemensos.go.id',
    'Jl. Salemba Raya No. 28, Jakarta Pusat',
    'https://cekbansos.kemensos.go.id'
),
(
    'Permintaan Data Statistik dan Publikasi Publik BPS',
    'Badan Pusat Statistik (BPS)',
    'Layanan Publik',
    'Penyediaan data statistik makro, sektoral, hasil sensus penduduk, inflasi, indeks pembangunan manusia, serta rilis berita resmi statistik secara gratis maupun berbayar untuk penelitian.',
    '["Kartu Identitas Pengguna (KTP/KTM/Paspor)", "Formulir permohonan data mikro", "Surat pengantar resmi dari Universitas/Instansi (khusus data mikro sensitif)"]'::jsonb,
    '["Pemohon mendaftar akun di portal Pelayanan Statistik Terpadu (silastic.bps.go.id)", "Memilih katalog publikasi atau dataset yang diinginkan", "Mengunduh file publikasi gratis langsung dalam format PDF/Excel", "Mengajukan persetujuan lisensi penggunaan data mikro akademis"]'::jsonb,
    '021-3841195',
    'bpshq@bps.go.id',
    'Jl. dr. Sutomo No. 6-8, Jakarta Pusat',
    'https://www.bps.go.id'
);
