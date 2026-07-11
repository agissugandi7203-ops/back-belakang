# API Server & AI Engine — KOMUNITAS

Aplikasi server backend dan pemrosesan AI berbasis Bun Runtime, Hono framework, Supabase PostgreSQL, dan OpenRouter API.

Dokumen ini menjelaskan kendala pengembangan backend, keputusan teknis yang diambil, serta panduan instalasi server.

---

## Tim Pengembang (SMK MARHAS Margahayu)

Aplikasi server backend ini dikembangkan dan dioptimalkan oleh:
* **Fachri Angga Pratama** (Ketua Tim / Full Stack Developer)
* **Alif Ikhwan Aulad Alhafidz** (Full Stack Creator)
* **Fikri Awaluddin Rahmat** (Administrasi Projek)

Aplikasi live dapat diakses melalui: **[komunitasai.web.id](https://komunitasai.web.id)**

---

## Rumusan Masalah dan Solusi Teknis

Dalam mengembangkan arsitektur backend pelayanan publik ini, beberapa tantangan teknis diselesaikan menggunakan solusi terstruktur:

### 1. Keamanan Informasi Sensitif Warga (Responsible AI)
* **Kendala**: Risiko kebocoran data sensitif warga (seperti NIK, Nomor HP, atau Email) ke API model kecerdasan buatan pihak ketiga saat berkonsultasi.
* **Solusi**: Kami membangun filter penyaring PII (*Personally Identifiable Information*) berbasis pencocokan pola Regex di backend. Data sensitif tersebut disensor secara otomatis sebelum diteruskan ke OpenRouter.

### 2. Akurasi Hasil Rujukan Regulasi (Mitigasi Halusinasi)
* **Kendala**: Keterbatasan model bahasa generatif biasa dalam menyajikan aturan hukum pelayanan publik secara akurat dan konsisten.
* **Solusi**: Kami mengimplementasikan metode pencarian hibrida yang menggabungkan pencarian teks penuh (FTS) bahasa Indonesia dan pencarian vektor semantik (*pgvector*), kemudian hasilnya digabungkan menggunakan algoritma **Reciprocal Rank Fusion (RRF)** sebagai konteks prompt AI.

### 3. Latensi Pengiriman Respon AI yang Panjang
* **Kendala**: Memuat seluruh jawaban panduan administrasi yang panjang sekaligus memicu waktu tunggu (latensi) yang tidak nyaman bagi warga.
* **Solusi**: Penyediaan endpoint asisten AI menggunakan protokol **Server-Sent Events (SSE)** agar respon dikirim secara bertahap (karakter demi karakter) menggunakan `ReadableStream`.

### 4. Skalabilitas Pemrosesan Aduan Warga
* **Kendala**: Proses evaluasi urgensi pengaduan warga oleh AI memerlukan waktu beberapa detik, yang dapat memblokir proses respons pengaduan jika dilakukan secara sinkron.
* **Solusi**: Backend memproses penentuan tingkat urgensi laporan (Kritis, Tinggi, Sedang, Rendah) secara asinkron di latar belakang (*background task*), sehingga warga mendapatkan konfirmasi pengiriman laporan dengan cepat.

---

## Spesifikasi Teknologi
* **Core Runtime**: Bun (Fast JS/TS Runtime)
* **Framework**: Hono (Lightweight web framework)
* **Database**: Supabase PostgreSQL dengan ekstensi `pgvector`
* **AI Model/Embeddings**: OpenRouter API (Gemini-2.5-Flash, OpenAI text-embedding-3-small)
* **Validation**: Zod (Runtime type validation)

---

## Skema Prosedur SQL Pencarian Hibrida (PostgreSQL)

Fungsi database PostgreSQL berikut digunakan untuk menggabungkan pencarian vektor dan kata kunci:

```sql
-- Mengaktifkan ekstensi vector di database
create extension if not exists vector;

-- Fungsi pencarian hibrida menggunakan kombinasi kemiripan vektor & FTS
create or replace function hybrid_search_services(
  query_text text,
  query_embedding vector(1536),
  match_count int
)
returns table (
  id uuid,
  name varchar,
  institution varchar,
  category varchar,
  description text,
  requirements text,
  steps text,
  contact_info text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  with vector_search as (
    select s.id, (1 - (s.embedding <=> query_embedding))::float as similarity
    from public_services s
    order by s.embedding <=> query_embedding
    limit match_count * 2
  ),
  text_search as (
    select s.id, ts_rank_cd(to_tsvector('indonesian', s.name || ' ' || s.description), plainto_tsquery('indonesian', query_text))::float as text_rank
    from public_services s
    where to_tsvector('indonesian', s.name || ' ' || s.description) @@ plainto_tsquery('indonesian', query_text)
    limit match_count * 2
  )
  select 
    s.id, s.name, s.institution, s.category, s.description, s.requirements, s.steps, s.contact_info,
    coalesce(v.similarity, 0.0) as similarity
  from public_services s
  left join vector_search v on s.id = v.id
  left join text_search t on s.id = t.id
  where v.id is not null or t.id is not null
  order by (coalesce(v.similarity, 0.0) * 0.7 + coalesce(t.text_rank, 0.0) * 0.3) desc
  limit match_count;
end;
$$;
```

---

## Panduan Instalasi dan Pengembangan Lokal

### Prasyarat
Pastikan komputer Anda telah terpasang **Bun Runtime (v1.1+)**.

### Langkah 1: Instalasi Dependensi
Jalankan perintah berikut di dalam direktori backend:
```bash
bun install
```

### Langkah 2: Konfigurasi File Lingkungan (.env)
Buat berkas `.env` di dalam direktori `/backend` dan lengkapi nilainya:
```env
PORT=3000
NODE_ENV=production

# Supabase URL & Service Role Key
SUPABASE_URL=https://proyek-anda.supabase.co
SUPABASE_SERVICE_ROLE_KEY=kunci-service-role-supabase-anda

# OpenRouter Kunci API & Konfigurasi Model
OPENROUTER_API_KEY=kunci-openrouter-anda
DEFAULT_MODEL=google/gemini-2.5-flash
EMBEDDING_MODEL=openai/text-embedding-3-small
```

### Langkah 3: Menjalankan Data Seed
Untuk memuat basis pengetahuan awal layanan publik ke database:
```bash
bun run src/index.ts --seed
```

### Langkah 4: Menjalankan Server API
Jalankan server dalam mode pengembangan:
```bash
bun dev
```
Server backend akan aktif di `http://localhost:3000`.

---

## Lisensi

Proyek backend ini dirilis di bawah lisensi **MIT License**.
