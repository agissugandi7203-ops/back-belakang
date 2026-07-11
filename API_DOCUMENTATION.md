# Dokumentasi API KOMUNITAS (v1.0.0)

Dokumentasi API resmi untuk sistem **KOMUNITAS** (Layanan Pengaduan Warga Cerdas & Portal Informasi Faktual).

---

## Keamanan dan Autentikasi (Authentication & Security)

API ini dilindungi menggunakan token JWT (JSON Web Token) yang disediakan oleh **Supabase Auth**.

- Semua endpoint yang membutuhkan autentikasi wajib menyertakan token di header `Authorization` dengan skema `Bearer`.
- Token diperoleh dari endpoint `/api/auth/login`.

```http
Authorization: Bearer <your_jwt_token>
```

### Peran dan Hak Akses (Roles & Permissions):
1. `user` (Warga Terdaftar) - Mengirim laporan aduan dan berinteraksi di ruang chat aduan miliknya.
2. `petugas` (Staf Pelayanan) - Memantau laporan aduan warga, memperbarui status aduan, dan merespons chat.
3. `admin` - Mengelola keluhan warga, akun petugas, statistik regional, dan kategori layanan.
4. `superadmin` - Memiliki kontrol penuh atas seluruh sistem dan registrasi staf admin/petugas baru.

---

## Batasan Penggunaan dan Kuota (Rate Limiting & Quota Limits)

Sistem mengimplementasikan limitasi request berbasis IP Address:
- **Auth Routes (`/api/auth/*`)**: Maksimal 15 request per menit per alamat IP.
- **Chat & AI Routes (`/api/chat/*`)**: Maksimal 60 request per menit per alamat IP.

### Kuota Penggunaan Fitur AI:
- **Guest / Warga Tanpa Akun**: Maksimal 7 prompt konsultasi per 24 jam per sesi.
- **Warga Terdaftar**: Maksimal 20 prompt konsultasi per 24 jam per akun.
- **Batas Aduan Guest**: Maksimal 2 pengaduan laporan per 24 jam berdasarkan nomor kontak pengirim.

---

## Kode Kesalahan Global (Global Error Codes)

Semua respons error menggunakan format JSON standar berikut:
```json
{
  "error": "ErrorType",
  "message": "Deskripsi kesalahan yang mudah dipahami warga"
}
```

| HTTP Status | Error Type | Description |
| :--- | :--- | :--- |
| `400` | `ValidationError` | Validasi input gagal (Zod validation fail) / input tidak valid. |
| `401` | `Unauthorized` | Token tidak dikirimkan, kedaluwarsa, atau tidak valid. |
| `403` | `Forbidden` | Pengguna tidak memiliki hak akses (*role*) yang memadai. |
| `404` | `NotFound` | Sumber daya (laporan/sesi/layanan) tidak ditemukan. |
| `429` | `TooManyRequests` | Rate limit terlampaui. Coba lagi dalam beberapa detik. |
| `500` | `InternalServerError` | Terjadi kesalahan internal pada server. |

---

## 1. Endpoint Autentikasi (Authentication Endpoints) (`/api/auth`)

### POST `/api/auth/register`
Mendaftarkan akun warga baru.  
*Register a new citizen account.*

* **Auth Required**: No
* **Request Body** (JSON):
  ```json
  {
    "email": "warga@example.com",
    "password": "PasswordStrong123!",
    "konfirmasiPassword": "PasswordStrong123!",
    "nama_lengkap": "Budi Santoso",
    "nama_panggilan": "Budi",
    "tanggal_lahir": "1995-08-17",
    "nomor_telepon": "+6281234567890"
  }
  ```
* **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "message": "Registrasi berhasil! Silakan periksa email Anda...",
    "user": {
      "id": "e44d3202-b283-4a11-85b4-bcda3068e1a1",
      "email": "warga@example.com",
      "nama_lengkap": "Budi Santoso",
      "nama_panggilan": "Budi",
      "role": "user"
    }
  }
  ```

### POST `/api/auth/login`
Autentikasi akun dan mendapatkan JWT token.  
*Authenticate account and get JWT.*

* **Auth Required**: No
* **Request Body** (JSON):
  ```json
  {
    "email": "warga@example.com",
    "password": "PasswordStrong123!"
  }
  ```
* **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Login berhasil!",
    "session": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "def456...",
      "expires_at": 1783262762
    },
    "user": {
      "id": "e44d3202-b283-4a11-85b4-bcda3068e1a1",
      "email": "warga@example.com",
      "nama_lengkap": "Budi Santoso",
      "nama_panggilan": "Budi",
      "role": "user"
    }
  }
  ```

### GET `/api/auth/me`
Mendapatkan informasi profil pengguna yang sedang login.  
*Get current logged-in user profile.*

* **Auth Required**: Yes (Any Role)
* **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "user": {
      "id": "e44d3202-b283-4a11-85b4-bcda3068e1a1",
      "email": "warga@example.com",
      "nama_lengkap": "Budi Santoso",
      "nama_panggilan": "Budi",
      "nomor_telepon": "+6281234567890",
      "tanggal_lahir": "1995-08-17",
      "role": "user"
    }
  }
  ```

---

## 2. Endpoint Layanan Chat & AI (Chat & AI Endpoints) (`/api/chat`)

### POST `/api/chat`
Kirim pesan chat asisten AI (mendukung RAG/Pencarian Layanan Publik).  
*Send message to AI assistant (RAG-enabled).*

* **Auth Required**: Optional (Guest allowed up to 7 prompts)
* **Request Body** (JSON):
  ```json
  {
    "message": "Bagaimana cara membuat KTP baru?",
    "sessionId": "session_123456"
  }
  ```
* **Response** (`200 OK`):
  ```json
  {
    "content": "Untuk membuat KTP baru, Anda perlu menyiapkan: 1. Kartu Keluarga (KK), 2. Surat Pengantar RT/RW...",
    "sessionId": "session_123456"
  }
  ```

### POST `/api/chat/stream`
Kirim pesan chat dengan respon streaming Server-Sent Events (SSE).  
*Send message with SSE streaming response.*

* **Auth Required**: Optional
* **Request Body** (JSON):
  ```json
  {
    "message": "Cek klaim: Benarkah besok subsidi BBM dicabut?",
    "sessionId": "session_123456",
    "image": "data:image/png;base64,iVBORw0KGg...",
    "mimeType": "image/png"
  }
  ```
* **Response**: Stream of events (`text`, `search_progress`, `done`, `error`)

### POST `/api/chat/validate`
Verifikasi validitas klaim informasi / berita hoax (Web Search Grounding).  
*Verify validity of news/hoax claim.*

* **Auth Required**: Optional
* **Request Body** (JSON):
  ```json
  {
    "claim": "Pemerintah bagikan bansos tunai 5 juta rupiah lewat SMS"
  }
  ```
* **Response** (`200 OK`):
  ```json
  {
    "isCredible": false,
    "confidenceScore": 95.0,
    "reasoning": "Klaim tersebut adalah modus penipuan phishing. Situs resmi Kemensos menegaskan tidak ada pembagian bantuan sosial via SMS random...",
    "sources": [
      "https://kemensos.go.id/penjelasan-hoaks-sms-bansos",
      "https://turnbackhoax.id/sms-palsu-pembagian-pkh"
    ]
  }
  ```

### POST `/api/chat/summarize`
Meringkas dokumen birokrasi dan menghasilkan visualisasi bagan alur proses (Mermaid.js).  
*Summarize bureaucrat document and generate flowcharts.*

* **Auth Required**: Optional
* **Request Body** (JSON):
  ```json
  {
    "text": "Pasal 1: Setiap warga negara wajib... Pasal 2: Prosedur pengajuan dimulai dari..."
  }
  ```
* **Response** (`200 OK`):
  ```json
  {
    "summary": "Dokumen ini mengatur hak dan kewajiban pengajuan berkas sipil...",
    "mermaid": "graph TD\n  A[Mulai] --> B[RT/RW] --> C[Kantor Desa]"
  }
  ```

### POST `/api/chat/extract-file`
Mengekstrak teks mentah dari file dokumen (PDF, DOCX, XLSX, TXT, MD).  
*Extract raw text from document files.*

* **Auth Required**: Yes (Any Role)
* **Request Body** (Multipart Form Data):
  * `file`: File Document
* **Response** (`200 OK`):
  ```json
  {
    "text": "Isi dokumen terlampir...",
    "name": "syarat_ktp.pdf",
    "size": 152431,
    "type": "application/pdf"
  }
  ```

### GET `/api/chat/quota`
Mengecek sisa kuota prompt harian pengguna.  
*Check daily prompt quota.*

* **Auth Required**: Optional
* **Query Parameters**:
  * `sessionId`: (string) Sesi chat guest
* **Response** (`200 OK`):
  ```json
  {
    "remaining": 14,
    "limit": 20,
    "resetAt": "2026-07-06T00:00:00.000Z"
  }
  ```

---

## 3. Endpoint Pengaduan Warga (Citizen Report Endpoints) (`/api/reports`)

### POST `/api/reports`
Membuat laporan aduan warga baru.  
*Create a new citizen report.*

* **Auth Required**: Optional (Jika tidak login, data dimasukkan sebagai guest)
* **Request Body** (JSON):
  ```json
  {
    "reporterName": "Budi Santoso",
    "reporterContact": "+6281234567890",
    "category": "Infrastruktur",
    "description": "Jalan berlubang besar di pertigaan Soreang Indah membahayakan pengendara motor.",
    "latitude": -7.02367,
    "longitude": 107.54516,
    "sessionId": "session_123456",
    "imageUrl": "https://supabase-storage/reports/jalan_rusak.jpg"
  }
  ```
* **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "id": "a8f3b202-b283-4a11-85b4-bcda3068e222",
      "reporter_name": "Budi Santoso",
      "category": "Infrastruktur",
      "status": "Menunggu",
      "latitude": -7.02367,
      "longitude": 107.54516,
      "province": "Jawa Barat",
      "city": "Kabupaten Bandung",
      "district": "Katapang"
    }
  }
  ```

### GET `/api/reports`
Mengambil seluruh daftar laporan (mendukung filter spasial & paginasi).  
*Fetch all reports with filters and pagination.*

* **Auth Required**: Optional (User only gets their own reports or public statistics; Staff gets all filtered reports)
* **Query Parameters**:
  * `status`: `Menunggu` | `Diproses` | `Selesai` | `Ditolak`
  * `province`: (string) Filter Provinsi
  * `city`: (string) Filter Kabupaten/Kota
  * `district`: (string) Filter Kecamatan
  * `page`: (number, default: 1)
  * `limit`: (number, default: 10)
* **Response** (`200 OK`):
  ```json
  {
    "reports": [
      {
        "id": "a8f3b202-b283-4a11-85b4-bcda3068e222",
        "reporter_name": "Budi Santoso",
        "category": "Infrastruktur",
        "status": "Menunggu",
        "province": "Jawa Barat",
        "city": "Kabupaten Bandung",
        "district": "Katapang",
        "created_at": "2026-07-05T15:20:00Z"
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
  ```

### PATCH `/api/reports/:id`
Memperbarui status laporan dan memberikan catatan pelayanan.  
*Update report status and admin notes.*

* **Auth Required**: Yes (`superadmin`, `admin`, `petugas`)
* **Request Body** (JSON):
  ```json
  {
    "status": "Diproses",
    "adminNote": "Petugas lapangan dari dinas terkait telah ditugaskan ke lokasi."
  }
  ```
* **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Status laporan berhasil diperbarui",
    "data": {
      "id": "a8f3b202-b283-4a11-85b4-bcda3068e222",
      "status": "Diproses",
      "admin_note": "Petugas lapangan dari dinas terkait telah ditugaskan ke lokasi."
    }
  }
  ```

---

## 4. Endpoint Manajemen Admin & Staf (Admin & Staff Management Endpoints) (`/api/admin`)

### GET `/api/admin/stats`
Mengambil data statistik agregat dashboard admin (regional, kategori, status).  
*Get aggregate stats for dashboard.*

* **Auth Required**: Yes (`superadmin`, `admin`, `petugas`)
* **Response** (`200 OK`):
  ```json
  {
    "totalReports": 128,
    "totalSessions": 432,
    "statusCounts": {
      "Menunggu": 32,
      "Diproses": 45,
      "Selesai": 48,
      "Ditolak": 3
    },
    "regionalStats": {
      "provinces": { "Jawa Barat": 90, "DKI Jakarta": 38 },
      "cities": { "Kabupaten Bandung": 60, "Kota Bandung": 30 },
      "districts": { "Katapang": 45, "Batununggal": 15 }
    }
  }
  ```

### POST `/api/admin/create-user`
Membuat akun petugas pelayanan / admin baru.  
*Create a new staff user profile.*

* **Auth Required**: Yes (`superadmin`, `admin`)
* **Request Body** (JSON):
  ```json
  {
    "email": "petugas.soreang@komunitas.id",
    "password": "SecurePassword99!",
    "nama_lengkap": "Agus Hermawan",
    "nama_panggilan": "Agus",
    "tanggal_lahir": "1988-02-12",
    "nomor_telepon": "+6287712345678",
    "role": "petugas"
  }
  ```
* **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "message": "Akun staf baru dengan peran \"petugas\" berhasil dibuat!",
    "user": {
      "id": "f8a2c303-b283-4a11-85b4-bcda3068e888",
      "email": "petugas.soreang@komunitas.id",
      "role": "petugas"
    }
  }
  ```

---

## 5. Protokol Obrolan Real-Time (WebSocket)

Komunikasi 2 arah secara real-time antara pelapor (warga) dan petugas pelayanan dilakukan melalui koneksi WebSocket.  
*Real-time two-way communication between reporter and staff is handled via WebSocket.*

* **WebSocket URL**:
  ```http
  ws://<domain>/api/ws/chat?reportId=<report_id>&userId=<user_id>&role=<role>&name=<display_name>
  ```

### Message Format:
Setiap pengiriman pesan wajib menggunakan struktur JSON berikut:
```json
{
  "type": "message",
  "text": "Selamat siang, apakah sudah ada petugas di lokasi?",
  "senderId": "e44d3202-b283-4a11-85b4-bcda3068e1a1",
  "senderType": "user",
  "senderName": "Budi"
}
```

### Server Broadcast:
Server akan menyiarkan pesan ke seluruh klien di ruangan aduan tersebut dengan format:
```json
{
  "type": "message",
  "data": {
    "id": 142,
    "report_id": "a8f3b202-b283-4a11-85b4-bcda3068e222",
    "sender_id": "e44d3202-b283-4a11-85b4-bcda3068e1a1",
    "sender_type": "user",
    "sender_name": "Budi",
    "text": "Selamat siang, apakah sudah ada petugas di lokasi?",
    "created_at": "2026-07-05T16:01:22.000Z"
  }
}
```
