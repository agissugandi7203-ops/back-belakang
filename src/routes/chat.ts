/**
 * Route definitions untuk semua endpoint chat dan AI utilities
 * Mengorganisir semua endpoint API ke dalam router Hono
 */

import { Hono } from 'hono';
import { 
  chatController,
  chatStreamController,
  validateClaimController, 
  summarizeController,
  ocrController,
  getHistoryController,
  deleteHistoryController,
  extractFileController
} from '../controllers/chatController';
import { rateLimiter } from '../utils/rateLimiter';
import { optionalAuthMiddleware } from '../utils/authMiddleware';

// Inisialisasi router untuk chat
const chat = new Hono();

// Mount rate limiter middleware untuk semua endpoint chat & AI (60 request per menit per IP)
chat.use('*', rateLimiter(60, 60 * 1000));

// Terapkan deteksi autentikasi opsional agar info user masuk ke context Hono jika sedang login
chat.use('*', optionalAuthMiddleware);

// --- Endpoint definitions ---

/**
 * POST / - Kirim pesan chat (RAG + AI)
 * Body: { message: string, sessionId?: string }
 * Response: { content: string, sessionId: string }
 */
chat.post('/', chatController);

/**
 * POST /stream - Kirim pesan chat secara streaming (SSE)
 * Body: { message: string, sessionId?: string, image?: string, mimeType?: string }
 * Response: Event stream (search_progress, search_result, token, done, error)
 */
chat.post('/stream', chatStreamController);

/**
 * POST /ocr - Membaca dan menganalisis teks gambar/dokumen (OCR Vision)
 * Body: { image: string (base64), mimeType?: string }
 * Response: { content: string }
 */
chat.post('/ocr', ocrController);

/**
 * POST /validate - Verifikasi klaim berita/hoaks (Web Search Grounding)
 * Body: { claim: string }
 * Response: { isCredible: boolean, reasoning: string, sources?: string[] }
 */
chat.post('/validate', validateClaimController);

/**
 * POST /summarize - Ringkas dokumen birokrasi & hasilkan bagan Mermaid.js
 * Body: { text: string }
 * Response: { summary: string }
 */
chat.post('/summarize', summarizeController);

/**
 * POST /extract-file - Mengekstrak teks dari berkas dokumen (PDF, DOCX, XLSX, TXT, MD)
 * Body: Multipart Form Data dengan field 'file'
 * Response: { text: string, name: string, size: number, type: string }
 */
chat.post('/extract-file', extractFileController);

/**
 * GET /history/:sessionId - Ambil riwayat chat
 * Response: { history: ChatMessage[] }
 */
chat.get('/history/:sessionId', getHistoryController);

/**
 * DELETE /history/:sessionId - Hapus riwayat chat
 * Response: { success: boolean }
 */
chat.delete('/history/:sessionId', deleteHistoryController);

// Export router untuk digunakan di index.ts
export default chat;
