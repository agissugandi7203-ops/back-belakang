# 🇮🇩 KOMUNITAS — API Server & AI Engine

> **Backend Application Service**  
> Engine Utama berbasis Bun, Hono, Supabase PostgreSQL Vector, dan OpenRouter AI. Menyediakan API untuk Cek Fakta, RAG (Retrieval-Augmented Generation), Analisis Tingkat Urgensi Aduan Warga, Sensor Data Sensitif (PII), dan Notifikasi Realtime.

---

## 🛡️ Fitur Utama & Arsitektur Keamanan

1. **🔒 Responsible AI — PII Redactor**
   - Menghapus dan menyensor Informasi Sensitif Pribadi (NIK 16 digit, nomor handphone, email) secara real-time sebelum data dikirimkan ke model bahasa LLM pihak ketiga untuk melindungi privasi warga.

2. **⚖️ Hybrid Search & RAG (Reciprocal Rank Fusion)**
   - Menggabungkan pencarian kata kunci tradisional (Full-Text Search / BM25) dan pencarian kemiripan vektor semantik di PostgreSQL.
   - Hasil pencarian di-fusion menggunakan algoritma **RRF (Reciprocal Rank Fusion)** untuk memberikan referensi panduan pelayanan publik yang paling relevan bagi warga.

3. **🚨 AI Urgency Scoring**
   - Menganalisis teks aduan warga secara non-blocking di background untuk menilai tingkat kedaruratan laporan (Kritis, Tinggi, Sedang, Rendah) beserta alasan konkretnya menggunakan model bahasa AI.

4. **⚡ Real-time Event System (SSE / WebSocket)**
   - Menyediakan koneksi real-time untuk menyiarkan pembaruan status laporan dari admin panel ke web warga secara instan.

5. **📂 AI Document Parser**
   - Menerima teks dokumen panjang, mengekstrak entitas penting (nama layanan, lembaga, persyaratan, langkah prosedur) menggunakan JSON Structured Output (Gemini-2.5-Flash), dan mendaftarkannya ke basis pengetahuan RAG.

---

## 🛠️ Teknologi & Stack Backend

- **Runtime**: Bun (Fast JS/TS Runtime & Bundler)
- **Framework**: Hono (Ultra lightweight web framework)
- **Database**: Supabase PostgreSQL with `pgvector` extension
- **LLM/Embeddings**: OpenRouter API (Gemini-2.5-Flash, OpenAI text-embedding-3-small)
- **Validation**: Zod (Runtime type validation)
- **FTS / Search Grounding**: Serper.dev API (optional fallback search)

---

## 🚀 Memulai (Local Development)

### 1. Prasyarat
Pastikan Anda telah menginstal **Bun (v1.0+)** di komputer Anda.

### 2. Klon Repositori & Install Dependencies
```bash
git clone https://github.com/agissugandi7203-ops/back-belakang-.git
cd back-belakang-
bun install
```

### 3. Konfigurasi Variabel Lingkungan
Buat berkas `.env` di root folder proyek dan isi parameternya:
```env
PORT=3000
NODE_ENV=development

# OpenRouter Configuration (AI & Embeddings)
OPENROUTER_API_KEY=your-openrouter-key-here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=google/gemini-2.5-flash
EMBEDDING_MODEL=openai/text-embedding-3-small

# Supabase Database Configuration
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional APIs (Search Grounding)
SERPER_API_KEY=your-serper-key-here
```

### 4. Jalankan Migrasi Database
Gunakan file SQL berikut di panel SQL Editor Supabase Anda untuk mempersiapkan skema database:
- `database.sql` (Skema dasar dan tabel platform)
- `migration_hybrid_urgency.sql` (Fungsi Hybrid Search RRF & kolom urgensi)
- `migration_rag_documents.sql` (Tabel dokumen/PDF RAG asli)

### 5. Jalankan Server
```bash
bun run src/index.ts
```
Server akan aktif di [http://localhost:3000](http://localhost:3000).

---

## 🐋 Deploy ke Production (Google Cloud Run)

Repositori ini telah dilengkapi dengan `Dockerfile` siap pakai yang secara otomatis mendeteksi variabel port internal dari Google Cloud Run.

### Build Image Docker
```bash
docker build -t gcr.io/your-gcp-project/komunitas-backend:latest .
```

### Konfigurasi Cloud Run Environment
Pastikan Anda menambahkan seluruh variabel lingkungan berikut pada setelan service Google Cloud Run Anda:
1. `PORT` (Otomatis ditentukan oleh Cloud Run)
2. `NODE_ENV` = `production`
3. `SUPABASE_URL`
4. `SUPABASE_SERVICE_ROLE_KEY`
5. `OPENROUTER_API_KEY`
6. `OPENROUTER_BASE_URL`
