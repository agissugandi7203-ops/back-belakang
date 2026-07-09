/**
 * Entry point utama aplikasi backend
 * Setup server Hono dengan semua middleware dan routes
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createBunWebSocket } from 'hono/bun';
import chatRoutes from './routes/chat';
import authRoutes from './routes/auth';
import { rateLimiter } from './utils/rateLimiter';
import { getMessages, persistMessage } from './services/chatWebSocketService';
import { 
  createReportController,
  getReportsController,
  getReportsStatisticsController,
  updateReportStatusController,
  getDashboardStatsController,
  createServiceController,
  getServicesController,
  deleteServiceController,
  getClaimsController,
  deleteClaimController,
  getSummariesController,
  deleteSummaryController,
  getChatHistoriesController,
  deleteHistoryController,
  getActiveChatsController,
  parseServiceDocumentController,
  getRAGDocumentsController,
  createRAGDocumentController,
  deleteRAGDocumentController,
} from './controllers/chatController';
import { authMiddleware, requireRoles, optionalAuthMiddleware } from './utils/authMiddleware';
import { createStaffUserController, getStaffUsersController } from './controllers/authController';
import {
  whatsappWebhookController,
  getHoaxesController,
  createHoaxController,
  updateHoaxController,
  deleteHoaxController,
} from './controllers/whatsappController';
import { adminEvents } from './utils/eventEmitter';

// --- Inisialisasi App ---
const app = new Hono();

// --- WebSocket Setup ---
const { upgradeWebSocket, websocket } = createBunWebSocket();

// Map untuk melacak koneksi aktif per reportId (room)
const activeRooms = new Map<string, Set<any>>();

// Set untuk melacak koneksi admin aktif
const activeAdmins = new Set<any>();


app.get(
  '/api/ws/chat',
  upgradeWebSocket((c) => {
    const reportId = c.req.query('reportId');
    const userId = c.req.query('userId');
    const role = c.req.query('role');
    const name = c.req.query('name') || 'Warga';

    if (!reportId || !userId || !role) {
      console.error('❌ [WS Chat] Upgrade connection failed: Missing parameters');
      return {};
    }

    return {
      onOpen(evt, ws) {
        console.log(`🔌 [WS Chat] Connection opened. Report: ${reportId}, User: ${userId}, Role: ${role}`);
        if (!activeRooms.has(reportId)) {
          activeRooms.set(reportId, new Set());
        }
        activeRooms.get(reportId)!.add(ws);
      },
      async onMessage(evt, ws) {
        try {
          const payload = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
          
          if (payload && payload.type === 'message') {
            const senderId = payload.senderId || userId;
            const senderType = (payload.senderType || role) as 'user' | 'petugas';
            const senderName = payload.senderName || name;
            const text = payload.text;

            if (!text) return;

            // Simpan ke DB (dengan dual-mode fallback)
            const savedMsg = await persistMessage(reportId, senderId, senderType, senderName, text);

            // Siarkan ke seluruh client di ruangan ini
            const room = activeRooms.get(reportId);
            if (room) {
              const broadcastPayload = JSON.stringify({
                type: 'message',
                data: savedMsg
              });
              for (const client of room) {
                client.send(broadcastPayload);
              }
            }
          }
        } catch (err: any) {
          console.error('❌ [WS Chat] Error processing message:', err.message || err);
        }
      },
      onClose(evt, ws) {
        console.log(`🔌 [WS Chat] Connection closed. Report: ${reportId}, User: ${userId}`);
        const room = activeRooms.get(reportId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) {
            activeRooms.delete(reportId);
          }
        }
      }
    };
  })
);

app.get(
  '/api/ws/admin',
  upgradeWebSocket((c) => {
    return {
      onOpen(evt, ws) {
        console.log('🔌 [WS Admin] Admin connection opened.');
        activeAdmins.add(ws);
      },
      onClose(evt, ws) {
        console.log('🔌 [WS Admin] Admin connection closed.');
        activeAdmins.delete(ws);
      }
    };
  })
);

// Event listener untuk mem-broadcast notifikasi real-time ke semua dashboard admin
adminEvents.on('broadcast', (payload) => {
  const broadcastPayload = JSON.stringify(payload);
  for (const client of activeAdmins) {
    try {
      client.send(broadcastPayload);
    } catch (err) {
      activeAdmins.delete(client);
    }
  }
});


// --- Middleware ---

/**
 * Logger Middleware
 * Mencatat semua request yang masuk
 */
app.use('*', logger());

/**
 * CORS Middleware
 * Mengizinkan akses dari frontend
 */
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    try {
      const hostname = new URL(origin).hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === 'komunitasai.web.id' ||
        hostname.endsWith('.komunitasai.web.id') ||
        hostname.endsWith('.run.app')
      ) {
        return origin;
      }
    } catch {
      // Invalid URL format
    }
    return 'https://komunitasai.web.id';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length', 'X-Requested-With'],
  maxAge: 86400, // 24 hours cache untuk preflight
}));

// --- Routes ---

/**
 * Registrasi semua route chat
 * Semua endpoint di bawah /api/chat
 */
app.route('/api/chat', chatRoutes);

/**
 * Registrasi semua route auth (user login & register)
 * Semua endpoint di bawah /api/auth
 */
app.use('/api/auth/login', rateLimiter(15, 60 * 1000));
app.use('/api/auth/register', rateLimiter(15, 60 * 1000));
app.route('/api/auth', authRoutes);

/**
 * Registrasi aduan warga (reports)
 * POST   /api/reports - Buat laporan baru
 * GET    /api/reports - Ambil semua laporan (Admin)
 * PATCH  /api/reports/:id - Update status laporan (Admin/Petugas)
 * GET    /api/admin/stats - Statistik dashboard admin
 */
app.post('/api/reports', optionalAuthMiddleware, createReportController);
app.get(
  '/api/reports',
  optionalAuthMiddleware,
  getReportsController
);
app.get(
  '/api/reports/statistics',
  authMiddleware,
  requireRoles(['superadmin', 'admin', 'petugas']),
  getReportsStatisticsController
);
app.patch(
  '/api/reports/:id',
  authMiddleware,
  requireRoles(['superadmin', 'admin', 'petugas']),
  updateReportStatusController
);
app.get('/api/reports/:id/messages',
  optionalAuthMiddleware,
  async (c) => {
    const reportId = c.req.param('id') || '';
    try {
      const messages = await getMessages(reportId);
      return c.json({ success: true, data: messages });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  }
);
app.get('/api/admin/stats', getDashboardStatsController);

/**
 * Registrasi layanan RAG (services)
 * POST   /api/services - Tambah layanan (Admin)
 * GET    /api/services - Ambil semua layanan (Admin/Umum)
 * DELETE /api/services/:id - Hapus layanan (Admin)
 */
app.post('/api/services', createServiceController);
app.get('/api/services', getServicesController);
app.delete('/api/services/:id', deleteServiceController);
app.get('/api/services/documents', getRAGDocumentsController);
app.post('/api/services/documents', createRAGDocumentController);
app.delete('/api/services/documents/:id', deleteRAGDocumentController);
app.post(
  '/api/services/parse-doc',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  parseServiceDocumentController
);

/**
 * Registrasi manajemen data tambahan (Admin)
 */
app.get('/api/claims', getClaimsController);
app.delete('/api/claims/:id', deleteClaimController);
app.get('/api/summaries', getSummariesController);
app.delete('/api/summaries/:id', deleteSummaryController);
app.get('/api/histories', getChatHistoriesController);
app.delete('/api/histories/:sessionId', deleteHistoryController);

// --- WhatsApp Bot Webhook (Public) ---
app.post('/api/whatsapp/webhook', whatsappWebhookController);

// --- Admin & Staff Management (Protected) ---
// Only superadmin can create admin accounts; both superadmin and admin can create petugas
app.post(
  '/api/admin/create-user',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  createStaffUserController
);

app.get(
  '/api/admin/staff',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  getStaffUsersController
);

// --- WhatsApp Hoax Bot Keyword CRUD (Protected) ---
app.get(
  '/api/admin/hoax',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  getHoaxesController
);
app.post(
  '/api/admin/hoax',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  createHoaxController
);
app.put(
  '/api/admin/hoax/:id',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  updateHoaxController
);
app.delete(
  '/api/admin/hoax/:id',
  authMiddleware,
  requireRoles(['superadmin', 'admin']),
  deleteHoaxController
);

// --- Active chats for admin percakapan tab ---
app.get(
  '/api/chat/active',
  authMiddleware,
  requireRoles(['superadmin', 'admin', 'petugas']),
  getActiveChatsController
);

// --- AI Quota Check Endpoint (for frontend counter UI) ---
app.get(
  '/api/chat/quota',
  async (c) => {
    try {
      const { supabase } = await import('./services/supabaseService');
      const authHeader = c.req.header('Authorization');
      let userId: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) userId = user.id;
      }
      const sessionId = c.req.query('sessionId') || '';
      const isUser = !!userId;
      const limit = isUser ? 20 : 7;
      if (isUser) {
        const { data } = await supabase
          .from('user_usage')
          .select('prompt_count, reset_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return c.json({ remaining: limit, limit, resetAt: null });
        const now = Date.now();
        if (now > new Date(data.reset_at).getTime()) {
          return c.json({ remaining: limit, limit, resetAt: null });
        }
        return c.json({
          remaining: Math.max(0, limit - data.prompt_count),
          limit,
          resetAt: data.reset_at,
        });
      } else {
        const queryKey = sessionId;
        if (!queryKey) return c.json({ remaining: limit, limit, resetAt: null });
        const { data } = await supabase
          .from('user_usage')
          .select('prompt_count, reset_at')
          .eq('session_id', queryKey)
          .maybeSingle();
        if (!data) return c.json({ remaining: limit, limit, resetAt: null });
        const now = Date.now();
        if (now > new Date(data.reset_at).getTime()) {
          return c.json({ remaining: limit, limit, resetAt: null });
        }
        return c.json({
          remaining: Math.max(0, limit - data.prompt_count),
          limit,
          resetAt: data.reset_at,
        });
      }
    } catch (err: any) {
      return c.json({ remaining: 7, limit: 7, resetAt: null });
    }
  }
);

// --- Utility Endpoints ---

/**
 * Health Check Endpoint
 * Untuk monitoring dan testing
 * GET /health
 */
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

/**
 * Root Endpoint
 * Dokumentasi API Sederhana & Portabilitas Entry-Level KOMUNITAS
 * GET /
 */
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KOMUNITAS API Documentation</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace;
      background-color: #ffffff;
      color: #111827;
      padding: 30px 15px;
      font-size: 13px;
    }
    .title-area {
      margin-bottom: 25px;
      border-bottom: 2px solid #111827;
      padding-bottom: 15px;
    }
    .title-area h1 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.02em;
      margin: 0 0 4px 0;
    }
    .title-area p {
      color: #6b7280;
      font-size: 12px;
      margin: 0;
    }
    .search-container {
      margin-bottom: 20px;
    }
    .search-input {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 12px;
      width: 100%;
      max-width: 300px;
      outline: none;
    }
    .search-input:focus {
      border-color: #0284c7;
    }
    .group-section {
      margin-top: 25px;
    }
    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 4px;
      margin-bottom: 12px;
    }
    .group-title {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .group-desc {
      font-weight: 400;
      color: #6b7280;
      text-transform: none;
    }
    .api-row {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 4px;
      margin-bottom: 6px;
      transition: background-color 0.1s ease;
      border: 1px solid;
      user-select: none;
    }
    .api-method {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      color: #ffffff;
      min-width: 60px;
      text-align: center;
      margin-right: 12px;
      border-radius: 3px;
    }
    .api-path {
      font-weight: 600;
      font-size: 12.5px;
      flex-grow: 1;
    }
    .api-operation {
      font-size: 11px;
      color: #6b7280;
    }

    /* GET */
    .api-row-get {
      background-color: #f8fafc;
      border-color: #cbd5e1;
      color: #1e293b;
    }
    .api-row-get:hover {
      background-color: #f1f5f9;
    }
    .api-row-get .api-method {
      background-color: #0284c7;
    }
    .api-row-get .api-path {
      color: #0f172a;
    }

    /* POST */
    .api-row-post {
      background-color: #f0fdf4;
      border-color: #bbf7d0;
      color: #166534;
    }
    .api-row-post:hover {
      background-color: #dcfce7;
    }
    .api-row-post .api-method {
      background-color: #16a34a;
    }
    .api-row-post .api-path {
      color: #14532d;
    }

    /* DELETE */
    .api-row-delete {
      background-color: #fef2f2;
      border-color: #fecaca;
      color: #991b1b;
    }
    .api-row-delete:hover {
      background-color: #fee2e2;
    }
    .api-row-delete .api-method {
      background-color: #dc2626;
    }
    .api-row-delete .api-path {
      color: #7f1d1d;
    }

    /* PATCH / PUT */
    .api-row-patch {
      background-color: #fffbeb;
      border-color: #fef3c7;
      color: #92400e;
    }
    .api-row-patch:hover {
      background-color: #fef3c7;
    }
    .api-row-patch .api-method {
      background-color: #d97706;
    }
    .api-row-patch .api-path {
      color: #78350f;
    }

    /* WebSocket */
    .api-row-ws {
      background-color: #faf5ff;
      border-color: #e9d5ff;
      color: #581c87;
    }
    .api-row-ws:hover {
      background-color: #f3e8ff;
    }
    .api-row-ws .api-method {
      background-color: #7c3aed;
    }
    .api-row-ws .api-path {
      color: #4c1d95;
    }

    .api-details {
      border: 1px solid #e5e7eb;
      border-top: none;
      background-color: #ffffff;
      padding: 12px;
      margin-bottom: 12px;
      margin-top: -6px;
      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;
    }
    .api-details pre {
      margin: 0;
      padding: 8px;
      background-color: #f9fafb;
      color: #111827;
      border: 1px solid #cbd5e1 !important;
      border-radius: 4px;
      font-size: 11px;
    }
    .auth-badge {
      background-color: #fef3c7;
      border: 1px solid #fde68a;
      color: #b45309;
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 700;
      margin-left: 8px;
    }
    .footer-info {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 40px;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container" style="max-width: 900px;">
    
    <!-- Title Area -->
    <div class="title-area d-flex justify-content-between align-items-end flex-wrap gap-2">
      <div>
        <h1>KOMUNITAS API Hub</h1>
        <p>Dokumentasi spesifikasi rute & endpoint backend</p>
      </div>
      <div class="search-container">
        <input 
          type="text" 
          id="searchBox" 
          placeholder="Filter rute..." 
          class="search-input"
          onkeyup="filterEndpoints()"
        />
      </div>
    </div>

    <!-- Group 1: chat-controller -->
    <div class="group-section">
      <div class="group-header">
        <h2 class="group-title">
          chat-controller <span class="group-desc">: AI & Chat Assistant</span>
        </h2>
      </div>

      <div id="group-chat">
        <!-- POST /api/chat -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-chat" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/chat</span>
            <span class="api-operation">chatController</span>
          </div>
          <div class="collapse" id="collapse-chat">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengirim pesan chat AI (RAG semantik) tanpa streaming.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "message": "bagaimana cara melapor ke KPAI?",
  "sessionId": "session_xxx" // opsional
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "content": "Langkah melapor ke KPAI adalah...",
  "sessionId": "session_xxx",
  "timestamp": "2026-06-30T12:00:00.000Z"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- POST /api/chat/stream -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-chat-stream" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/chat/stream</span>
            <span class="api-operation">chatStreamController</span>
          </div>
          <div class="collapse" id="collapse-chat-stream">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Obrolan asisten AI menggunakan streaming Server-Sent Events (SSE) dengan media gambar.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "message": "pola spasial banjir bandang",
  "sessionId": "session_xxx",
  "image": "base64...", // opsional
  "mimeType": "image/jpeg" // opsional
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">SSE Event Payload:</span>
                  <pre>data: {"type": "token", "content": "..."}
data: {"type": "search_progress", "phase": "..."}
data: {"type": "done", "sessionId": "..."}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GET /api/chat/quota -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-chat-quota" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/api/chat/quota</span>
            <span class="api-operation">quotaCheckEndpoint</span>
          </div>
          <div class="collapse" id="collapse-chat-quota">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengecek sisa kuota harian AI untuk IP/User terkait.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Query Params:</span>
                  <pre>?sessionId=session_xxx</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "remaining": 15,
  "limit": 20,
  "resetAt": "2026-07-01T12:00:00.000Z"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- POST /api/chat/ocr -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-chat-ocr" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/chat/ocr</span>
            <span class="api-operation">ocrController</span>
          </div>
          <div class="collapse" id="collapse-chat-ocr">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Membaca teks dokumen fisik via AI Vision OCR.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "image": "base64...",
  "mimeType": "image/png"
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "text": "[Hasil Ekstraksi Teks]"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- POST /api/chat/validate -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-chat-validate" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/chat/validate</span>
            <span class="api-operation">validateClaimController</span>
          </div>
          <div class="collapse" id="collapse-chat-validate">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Verifikasi validitas klaim informasi lewat web search grounding.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "claim": "Bansos tunai dibagikan lewat WA"
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "isValid": false,
  "explanation": "Klaim tersebut palsu/hoaks...",
  "source": "TurnBackHoax.id"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- POST /api/chat/summarize -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-chat-summarize" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/chat/summarize</span>
            <span class="api-operation">summarizeController</span>
          </div>
          <div class="collapse" id="collapse-chat-summarize">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Meringkas berkas aturan/konsep birokrasi dan merancang diagram Mermaid.js.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "text": "[Aturan Panjang]"
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "summary": "[Hasil Ringkasan + Diagram]"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GET /api/chat/history/:sessionId -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-chat-history" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/api/chat/history/:sessionId</span>
            <span class="api-operation">getHistoryController</span>
          </div>
          <div class="collapse" id="collapse-chat-history">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengambil riwayat percakapan sesi AI.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Params:</span>
                  <pre>Path: sessionId (string)</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "history": [
    { "role": "user", "content": "..." }
  ]
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group 2: report-controller -->
    <div class="group-section">
      <div class="group-header">
        <h2 class="group-title">
          report-controller <span class="group-desc">: Citizen Report & Messages</span>
        </h2>
      </div>

      <div id="group-report">
        <!-- POST /api/reports -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-report-post" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/reports</span>
            <span class="api-operation">createReportController</span>
          </div>
          <div class="collapse" id="collapse-report-post">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Membuat aduan/pengaduan insiden terintegrasi lokasi GPS koordinat.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "reporterName": "Budi",
  "reporterContact": "+6281234567890",
  "category": "Infrastruktur",
  "description": "Jalan amblas...",
  "latitude": -6.2088,
  "longitude": 106.8456,
  "province": "Jawa Barat",
  "city": "Bandung",
  "district": "Coblong"
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "id": "report-uuid",
  "status": "Menunggu",
  "message": "Laporan berhasil disimpan."
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GET /api/reports -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-report-get" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/api/reports</span>
            <span class="api-operation">getReportsController</span>
            <span class="auth-badge">RBAC REQUIRED</span>
          </div>
          <div class="collapse" id="collapse-report-get">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengambil semua daftar laporan warga dengan filter wilayah dan status (Khusus Staf/Admin).</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Query Params:</span>
                  <pre>?status=Menunggu&province=Jawa Barat&page=1</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "reports": [...],
  "total": 5
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- PATCH /api/reports/:id -->
        <div class="api-item">
          <div class="api-row api-row-patch" data-bs-toggle="collapse" data-bs-target="#collapse-report-patch" aria-expanded="false">
            <span class="api-method">PATCH</span>
            <span class="api-path">/api/reports/:id</span>
            <span class="api-operation">updateReportStatusController</span>
            <span class="auth-badge">RBAC REQUIRED</span>
          </div>
          <div class="collapse" id="collapse-report-patch">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengubah status penanganan aduan warga.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "status": "Diproses",
  "adminNote": "Petugas meluncur..."
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "message": "Status laporan berhasil diubah ke Diproses"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GET /api/reports/:id/messages -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-report-messages" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/api/reports/:id/messages</span>
            <span class="api-operation">getMessages</span>
            <span class="auth-badge">AUTH REQUIRED</span>
          </div>
          <div class="collapse" id="collapse-report-messages">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengambil riwayat pesan diskusi aduan antara warga dan petugas.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Params:</span>
                  <pre>Path: id (UUID Laporan)</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "success": true,
  "data": [
    {
      "sender_name": "Petugas Fikri",
      "message": "Sedang kami periksa...",
      "created_at": "..."
    }
  ]
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group 3: service-controller -->
    <div class="group-section">
      <div class="group-header">
        <h2 class="group-title">
          service-controller <span class="group-desc">: Public Services RAG Directory</span>
        </h2>
      </div>

      <div id="group-service">
        <!-- POST /api/services -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-service-post" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/services</span>
            <span class="api-operation">createServiceController</span>
            <span class="auth-badge">RBAC REQUIRED</span>
          </div>
          <div class="collapse" id="collapse-service-post">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Menambahkan data layanan publik RAG (otomatis text-embedding vektor).</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "name": "Layanan BPJS",
  "institution": "BPJS Kesehatan",
  "category": "Kesehatan",
  "description": "Pendaftaran...",
  "requirements": ["KTP"],
  "procedures": ["Daftar..."]
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "id": "service-uuid",
  "message": "Layanan publik berhasil ditambahkan."
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GET /api/services -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-service-get" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/api/services</span>
            <span class="api-operation">getServicesController</span>
          </div>
          <div class="collapse" id="collapse-service-get">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengambil katalog daftar layanan RAG.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Query Params:</span>
                  <pre>?category=Kesehatan</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "services": [...]
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group 4: admin-controller -->
    <div class="group-section">
      <div class="group-header">
        <h2 class="group-title">
          admin-controller <span class="group-desc">: Staff & Database Management</span>
        </h2>
      </div>

      <div id="group-admin">
        <!-- POST /api/admin/create-user -->
        <div class="api-item">
          <div class="api-row api-row-post" data-bs-toggle="collapse" data-bs-target="#collapse-admin-create" aria-expanded="false">
            <span class="api-method">POST</span>
            <span class="api-path">/api/admin/create-user</span>
            <span class="api-operation">createStaffUserController</span>
            <span class="auth-badge">RBAC REQUIRED</span>
          </div>
          <div class="collapse" id="collapse-admin-create">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Membuat akun staf/petugas baru (hanya boleh dibuat oleh superadmin).</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Request Body:</span>
                  <pre>{
  "email": "petugas@komunitas.id",
  "password": "kataSandiKuat",
  "role": "petugas",
  "nama_lengkap": "Alif",
  "nama_panggilan": "Alif",
  "tanggal_lahir": "2000-01-01",
  "nomor_telepon": "+628..."
}</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "success": true,
  "message": "User baru berhasil dibuat."
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- GET /api/admin/hoax -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-admin-hoax" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/api/admin/hoax</span>
            <span class="api-operation">getHoaxesController</span>
            <span class="auth-badge">RBAC REQUIRED</span>
          </div>
          <div class="collapse" id="collapse-admin-hoax">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengambil isi database klarifikasi kata kunci hoaks WhatsApp Bot.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Query Params:</span>
                  <pre>?search=keyword&page=1</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Response (200 OK):</span>
                  <pre>{
  "hoaxes": [...],
  "total": 12
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group 5: websocket-controller -->
    <div class="group-section">
      <div class="group-header">
        <h2 class="group-title">
          websocket-controller <span class="group-desc">: Real-time Room Connection</span>
        </h2>
      </div>

      <div id="group-ws">
        <!-- GET /api/ws/chat -->
        <div class="api-item">
          <div class="api-row api-row-ws" data-bs-toggle="collapse" data-bs-target="#collapse-ws" aria-expanded="false">
            <span class="api-method">WS</span>
            <span class="api-path">/api/ws/chat</span>
            <span class="api-operation">upgradeWebSocket</span>
          </div>
          <div class="collapse" id="collapse-ws">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Saluran koneksi WebSocket real-time aduan warga.</p>
              <div class="row g-2">
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Query Connection Params:</span>
                  <pre>reportId=aduan-uuid
userId=warga-atau-petugas-uuid
role=user|petugas
name=Budi</pre>
                </div>
                <div class="col-md-6">
                  <span class="d-block fw-bold mb-1" style="font-size: 11px;">Message Format (JSON):</span>
                  <pre>{
  "type": "message",
  "text": "Apakah aduan saya sudah dibaca?",
  "senderId": "user-uuid",
  "senderName": "Budi",
  "senderType": "user"
}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group 6: utility-controller -->
    <div class="group-section">
      <div class="group-header">
        <h2 class="group-title">
          utility-controller <span class="group-desc">: Health Check</span>
        </h2>
      </div>

      <div id="group-utility">
        <!-- GET /health -->
        <div class="api-item">
          <div class="api-row api-row-get" data-bs-toggle="collapse" data-bs-target="#collapse-health" aria-expanded="false">
            <span class="api-method">GET</span>
            <span class="api-path">/health</span>
            <span class="api-operation">healthCheck</span>
          </div>
          <div class="collapse" id="collapse-health">
            <div class="api-details">
              <p class="mb-2"><strong>Deskripsi:</strong> Mengecek status runtime server.</p>
              <pre>{
  "status": "ok",
  "timestamp": "2026-06-30T12:00:00.000Z",
  "uptime": 12.5,
  "version": "1.0.0"
}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer info -->
    <div class="footer-info text-center">
      KOMUNITAS API ENGINE &bull; VERSION 1.0.2
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    function filterEndpoints() {
      const searchVal = document.getElementById('searchBox').value.toLowerCase();
      const items = document.getElementsByClassName('api-item');
      for (let item of items) {
        const path = item.querySelector('.api-path').textContent.toLowerCase();
        const desc = item.querySelector('.api-details')?.textContent.toLowerCase() || '';
        if (path.includes(searchVal) || desc.includes(searchVal)) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      }
    }
  </script>
</body>
</html>`);
});

// --- Error Handling ---

/**
 * Global Error Handler
 * Menangani semua error yang tidak terhandle
 */
app.onError((err, c) => {
  console.error('🔥 Global error:', err);
  
  // Log error untuk debugging
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });
  
  return c.json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Terjadi kesalahan pada server',
    timestamp: new Date().toISOString(),
  }, 500);
});

// --- Start Server ---

const port = parseInt(process.env.PORT || '3000');

console.log('============================================================');
console.log('KOMUNITAS AI API Server');
console.log('============================================================');
console.log(`Server running on: http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/health`);
console.log(`API documentation: http://localhost:${port}/`);
console.log('============================================================');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`AI Model: ${process.env.DEFAULT_MODEL || 'google/gemini-2.5-flash'}`);
console.log(`Embedding Model: ${process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small'}`);
console.log(`Search Grounding: ${process.env.SERPER_API_KEY ? 'Serper.dev Enabled' : 'Disabled (LLM Fallback)'}`);
console.log(`Database: ${process.env.SUPABASE_URL ? 'Connected' : 'Disconnected'}`);
console.log('============================================================');

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  websocket,
};
