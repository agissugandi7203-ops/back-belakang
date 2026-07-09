/**
 * Controller untuk menangani semua request terkait chat, verifikasi, ringkasan, OCR, dan laporan warga
 * Mengelola endpoint API dan logika bisnis
 */

import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import crypto from 'crypto';
import { 
  callAI, 
  callAIStream,
  createSystemPrompt, 
  validateClaim, 
  summarizeDocument,
  extractTextFromImage,
  scoreUrgency
} from '../services/openRouterService';
import { 
  saveChatHistory, 
  getChatHistory,
  deleteChatHistory,
  supabase,
  supabaseAdmin
} from '../services/supabaseService';
import { adminEvents } from '../utils/eventEmitter';
import { getEmbedding } from '../services/embeddingService';
import { searchMultiPhase, SearchResultItem } from '../services/searchService';
import { ChatMessage, ClaimValidationResult, SummaryResult } from '../types';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { checkGuardrails, GUARDRAIL_REFUSAL } from '../utils/guardrails';
import { extractTextFromFile } from '../services/fileExtractService';
import { redactPII } from '../utils/piiRedactor';

// --- Sanitize Helper ---

/**
 * Strip HTML tags from text to prevent XSS in stored content
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Helper to build RAG context string
 */
function buildRagContext(services: any[]): string {
  return `\n\nREFERENSI DOKUMEN LAYANAN PUBLIK YANG RELEVAN DI DATABASE:\n` +
    services.map((s: any) => 
      `Layanan: ${s.name}\n` +
      `Lembaga: ${s.institution}\n` +
      `Kategori: ${s.category}\n` +
      `Deskripsi: ${s.description}\n` +
      `Syarat Dokumen: ${JSON.stringify(s.requirements)}\n` +
      `Langkah Prosedur: ${JSON.stringify(s.procedures)}\n` +
      `Kontak Resmi: ${s.contact_phone || '-'} | ${s.contact_email || '-'}\n` +
      `Alamat: ${s.address || '-'}\n` +
      `Link Resmi: ${s.website || '-'}\n` +
      `---`
    ).join('\n');
}

// --- Quota Tracking Helper ---
async function incrementQuota(userId: string | null, sessionId: string) {
  try {
    const isUser = !!userId;
    const now = new Date();
    // Default reset is next day
    const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (isUser) {
      const { data } = await supabase.from('user_usage').select('id, prompt_count, reset_at').eq('user_id', userId).maybeSingle();
      if (!data) {
        await supabase.from('user_usage').insert({ user_id: userId, prompt_count: 1, reset_at: nextReset.toISOString() });
      } else {
        if (now.getTime() > new Date(data.reset_at).getTime()) {
          await supabase.from('user_usage').update({ prompt_count: 1, reset_at: nextReset.toISOString() }).eq('id', data.id);
        } else {
          await supabase.from('user_usage').update({ prompt_count: data.prompt_count + 1 }).eq('id', data.id);
        }
      }
    } else {
      if (!sessionId) return;
      const { data } = await supabase.from('user_usage').select('id, prompt_count, reset_at').eq('session_id', sessionId).maybeSingle();
      if (!data) {
        await supabase.from('user_usage').insert({ session_id: sessionId, prompt_count: 1, reset_at: nextReset.toISOString() });
      } else {
        if (now.getTime() > new Date(data.reset_at).getTime()) {
          await supabase.from('user_usage').update({ prompt_count: 1, reset_at: nextReset.toISOString() }).eq('id', data.id);
        } else {
          await supabase.from('user_usage').update({ prompt_count: data.prompt_count + 1 }).eq('id', data.id);
        }
      }
    }
  } catch (err) {
    logger.error('Failed to increment quota:', err);
  }
}

// --- Validation Schemas ---

/**
 * Schema validasi untuk request chat menggunakan Zod
 */
const chatSchema = z.object({
  message: z.string().max(10000, 'Pesan terlalu panjang (maks 10000 karakter)').default(''),
  sessionId: z.string().max(255).optional(),
  image: z.string().optional(),
  mimeType: z.string().optional(),
  history: z.array(z.any()).optional(),
});

const validateSchema = z.object({
  claim: z.string().min(1, 'Klaim tidak boleh kosong').max(5000, 'Klaim terlalu panjang (maks 5000 karakter)'),
  image: z.string().optional(),
  mimeType: z.string().optional(),
});

const summarizeSchema = z.object({
  text: z.string().min(1, 'Teks tidak boleh kosong').max(50000, 'Teks terlalu panjang (maks 50000 karakter)'),
});

const ocrSchema = z.object({
  image: z.string().min(1, 'Data gambar base64 tidak boleh kosong'),
  mimeType: z.string().default('image/jpeg'),
});

export const reportSchema = z.object({
  reporterName: z.string()
    .min(1, 'Nama pelapor tidak boleh kosong')
    .max(100, 'Nama pelapor terlalu panjang')
    .transform(stripHtml),
  reporterContact: z.string()
    .min(1, 'Kontak pelapor tidak boleh kosong')
    .max(100, 'Kontak pelapor terlalu panjang'),
  category: z.string().min(1, 'Kategori tidak boleh kosong'),
  description: z.string()
    .min(10, 'Deskripsi laporan minimal 10 karakter')
    .max(5000, 'Deskripsi terlalu panjang (maks 5000 karakter)')
    .transform(stripHtml),
  sessionId: z.string().optional(),
  latitude: z.number({ message: 'Koordinat lokasi GPS (latitude) wajib disertakan' }),
  longitude: z.number({ message: 'Koordinat lokasi GPS (longitude) wajib disertakan' }),
  image: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
});

// --- Controllers ---

/**
 * Chat Controller - Endpoint utama untuk chat dengan RAG pipeline
 * POST /api/chat
 */
export const chatController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = chatSchema.parse(body);
    const user = c.get('user');
    const userId = user ? user.id : null;
    
    logger.info('📨 Chat request received:', {
      message: validated.message ? (validated.message.substring(0, 50) + '...') : '',
      hasImage: !!validated.image,
      sessionId: validated.sessionId || 'new'
    });

    if (!validated.message && !validated.image) {
      return c.json({ error: 'Validasi gagal', message: 'Pesan atau gambar harus dikirim' }, 400);
    }

    const sessionId = validated.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // --- LOCAL AI GUARDRAILS (AI RESPONSIBILITY) ---
    if (validated.message && checkGuardrails(validated.message)) {
      logger.info('🛡️ Guardrails triggered (local blocking) for message:', validated.message);
      return c.json({
        content: GUARDRAIL_REFUSAL,
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    let history = await getChatHistory(sessionId) || [];
    
    // --- PII REDACTION (Responsible AI) ---
    const safeMessage = validated.message ? redactPII(validated.message) : validated.message;

    // --- HYBRID RAG PIPELINE (Vector + BM25 + RRF) ---
    let ragContext = '';
    if (safeMessage) {
      try {
        const queryVector = await getEmbedding(safeMessage);
        const { data: matchedServices, error: rpcError } = await supabase.rpc('hybrid_search_services', {
          query_text: safeMessage,
          query_embedding: queryVector,
          match_count: 5
        });

        if (rpcError) {
          logger.error('❌ Supabase Hybrid RAG RPC error:', rpcError);
          // Fallback to vector-only
          const { data: fallbackServices } = await supabase.rpc('match_services', {
            query_embedding: queryVector,
            match_threshold: 0.35,
            match_count: 3
          });
          if (fallbackServices && fallbackServices.length > 0) {
            ragContext = buildRagContext(fallbackServices);
          }
        } else if (matchedServices && matchedServices.length > 0) {
          logger.info(`🔍 Hybrid RAG+RRF: Found ${matchedServices.length} matching services`);
          ragContext = buildRagContext(matchedServices);
        }
      } catch (e) {
        logger.error('⚠️ RAG pipeline failed, falling back to standard LLM chat:', e);
      }
    }

    const systemPromptText = createSystemPrompt() + (ragContext ? ragContext : '');
    
    // Construct user content for this turn (text or multimodal)
    const userContent = validated.image
      ? [
          { type: 'text', text: safeMessage || 'Minta tolong analisis gambar ini.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${validated.mimeType || 'image/jpeg'};base64,${validated.image}`
            }
          }
        ]
      : safeMessage;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPromptText },
      ...history.map((h: any) => ({
        role: h.role as 'user' | 'assistant' | 'system',
        content: h.content,
      })),
      { role: 'user', content: userContent },
    ];

    const response = await callAI(messages);

    const updatedHistory = [
      ...history,
      { role: 'user', content: userContent },
      { role: 'assistant', content: response },
    ];
    
    await saveChatHistory(sessionId, updatedHistory, userId);
    await incrementQuota(userId, sessionId);

    return c.json({
      content: response,
      sessionId,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('⚠️ Validation error:', error.issues);
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ Chat controller error:', error);
    return c.json({ 
      error: 'Terjadi kesalahan. Silakan coba lagi.',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Chat Stream Controller - Endpoint streaming SSE untuk chat dengan RAG + Search
 * POST /api/chat/stream
 */
export const chatStreamController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = chatSchema.parse(body);
    const user = c.get('user');
    const userId = user ? user.id : null;
    
    logger.info('📨 Chat streaming request received:', {
      message: validated.message ? (validated.message.substring(0, 50) + '...') : '',
      hasImage: !!validated.image,
      sessionId: validated.sessionId || 'new'
    });

    if (!validated.message && !validated.image) {
      return c.json({ error: 'Validasi gagal', message: 'Pesan atau gambar harus dikirim' }, 400);
    }

    const sessionId = validated.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // --- LOCAL AI GUARDRAILS (AI RESPONSIBILITY) ---
    if (validated.message && checkGuardrails(validated.message)) {
      logger.info('🛡️ Guardrails triggered (local blocking) for streaming message:', validated.message);
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      return streamSSE(c, async (stream) => {
        // Stream the guardrail refusal message
        const tokens = GUARDRAIL_REFUSAL.split(" ");
        for (const token of tokens) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'token',
              content: token + " "
            })
          });
          // Small delay for natural typing appearance
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'done',
            sessionId
          })
        });
      });
    }

    // Set headers explicitly for SSE to bypass any issues, though streamSSE does it
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
      let history = await getChatHistory(sessionId) || [];
      
      // --- PII REDACTION (Responsible AI) ---
      const safeMessage = validated.message ? redactPII(validated.message) : validated.message;

      // --- HYBRID RAG PIPELINE (Vector + BM25 + RRF) ---
      let ragContext = '';
      if (safeMessage) {
        try {
          const queryVector = await getEmbedding(safeMessage);
          const { data: matchedServices, error: rpcError } = await supabase.rpc('hybrid_search_services', {
            query_text: safeMessage,
            query_embedding: queryVector,
            match_count: 5
          });

          if (rpcError) {
            logger.error('❌ Supabase Hybrid RAG RPC error:', rpcError);
            // Fallback to vector-only
            const { data: fallbackServices } = await supabase.rpc('match_services', {
              query_embedding: queryVector,
              match_threshold: 0.35,
              match_count: 3
            });
            if (fallbackServices && fallbackServices.length > 0) {
              ragContext = buildRagContext(fallbackServices);
            }
          } else if (matchedServices && matchedServices.length > 0) {
            logger.info(`🔍 Hybrid RAG+RRF: Found ${matchedServices.length} matching services`);
            ragContext = buildRagContext(matchedServices);
          }
        } catch (e) {
          logger.error('⚠️ RAG pipeline failed, falling back to standard LLM chat:', e);
        }
      }

      // --- MULTI-PHASE SEARCH PIPELINE ---
      let searchResults: SearchResultItem[] = [];
      if (validated.message) {
        try {
          searchResults = await searchMultiPhase(validated.message, async (progress) => {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'search_progress',
                phase: progress.phase,
                count: progress.count,
                sites: progress.sites
              })
            });
          });

          // Send all search results
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'search_result',
              items: searchResults
            })
          });
        } catch (searchErr) {
          logger.error('❌ Search multi-phase failed:', searchErr);
        }
      }

      let searchContext = '';
      if (searchResults.length > 0) {
        searchContext = `\n\nHASIL PENELUSURAN INTERNET TERBARU (Gunakan ini sebagai rujukan utama Anda):\n` +
          searchResults.map((r, idx) => 
            `Sumber #${idx + 1}:\n` +
            `Judul: ${r.title}\n` +
            `Link: ${r.link}\n` +
            `Kutipan: ${r.snippet}\n` +
            `Website: ${r.source || 'Web'}\n` +
            `---`
          ).join('\n');
      }

      const systemPromptText = createSystemPrompt() + (ragContext ? ragContext : '') + (searchContext ? searchContext : '');
      
      // Construct user content for this turn (text or multimodal)
      const userContent = validated.image
        ? [
            { type: 'text', text: safeMessage || 'Minta tolong analisis gambar ini.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${validated.mimeType || 'image/jpeg'};base64,${validated.image}`
              }
            }
          ]
        : safeMessage;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPromptText },
        ...history.map((h: any) => ({
          role: h.role as 'user' | 'assistant' | 'system',
          content: h.content,
        })),
        { role: 'user', content: userContent },
      ];

      // Stream AI tokens
      let assistantContent = '';
      try {
        await callAIStream(messages, async (token) => {
          assistantContent += token;
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'token',
              content: token
            })
          });
        });
      } catch (aiErr: any) {
        logger.error('❌ Streaming AI failed:', aiErr);
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: aiErr.message || 'Gagal menghasilkan respons AI secara streaming.'
          })
        });
        return;
      }

      // Save history & end stream
      try {
        const updatedHistory = [
          ...history,
          { role: 'user', content: userContent },
          { role: 'assistant', content: assistantContent },
        ];
        
        await saveChatHistory(sessionId, updatedHistory, userId);
        await incrementQuota(userId, sessionId);

        await stream.writeSSE({
          data: JSON.stringify({
            type: 'done',
            sessionId
          })
        });
      } catch (saveErr) {
        logger.error('❌ Failed to save streaming chat history:', saveErr);
      }
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('⚠️ Validation error:', error.issues);
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ Chat stream controller error:', error);
    return c.json({ 
      error: 'Terjadi kesalahan. Silakan coba lagi.',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * OCR Controller - Mengekstrak teks dari gambar dokumen (Mendukung multipart/form-data & JSON)
 * POST /api/chat/ocr
 */
export const ocrController = async (c: Context) => {
  try {
    let base64Data = '';
    let mimeType = 'image/jpeg';

    const contentType = c.req.header('content-type') || '';

    // Deteksi jika input dikirim via Multipart Form Data (seperti React Frontend)
    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody();
      const file = body['file'];

      if (!file || !(file instanceof File)) {
        return c.json({ error: 'Validasi gagal', message: 'File dokumen tidak ditemukan atau tidak valid' }, 400);
      }

      // Konversi File Buffer ke Base64 menggunakan runtime Bun/Node
      const bytes = await file.arrayBuffer();
      base64Data = Buffer.from(bytes).toString('base64');
      mimeType = file.type || 'image/jpeg';
      
      logger.info('📸 OCR processing via multipart upload:', file.name, 'Mime:', mimeType);
    } else {
      // Deteksi jika input dikirim via JSON Base64
      const body = await c.req.json();
      const validated = ocrSchema.parse(body);
      
      base64Data = validated.image.replace(/^data:image\/[a-z]+;base64,/, '');
      mimeType = validated.mimeType;
      
      logger.info('📸 OCR processing via JSON base64 payload');
    }

    if (!base64Data) {
      return c.json({ error: 'Validasi gagal', message: 'Data gambar dokumen kosong' }, 400);
    }

    const result = await extractTextFromImage(base64Data, mimeType);

    // Kembalikan objek 'text' dan 'content' agar kompatibel dengan tipe frontend & backend
    return c.json({
      text: result,
      content: result,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('⚠️ Validation error:', error.issues);
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ OCR controller error:', error);
    return c.json({ 
      error: 'Gagal menganalisis dokumen gambar',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Validate Claim Controller - Verifikasi klaim dengan web search grounding & pemetaan key frontend
 * POST /api/chat/validate
 */
export const validateClaimController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = validateSchema.parse(body);
    
    logger.info('🔍 Claim validation request:', {
      claim: validated.claim.substring(0, 100) + '...',
      hasImage: !!validated.image
    });

    const result = await validateClaim(validated.claim, validated.image, validated.mimeType);
    
    // Simpan hasil verifikasi klaim ke Supabase
    try {
      const cleanClaim = validated.claim.trim();
      const { data: existingClaims } = await supabaseAdmin
        .from('claim_verifications')
        .select('id, search_count')
        .ilike('claim_text', cleanClaim)
        .limit(1);

      if (existingClaims && existingClaims.length > 0) {
        const existing = existingClaims[0];
        await supabaseAdmin
          .from('claim_verifications')
          .update({
            search_count: existing.search_count + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        logger.info('📈 Incremented search count for claim:', existing.id);
      } else {
        await supabaseAdmin
          .from('claim_verifications')
          .insert({
            claim_text: cleanClaim,
            is_credible: result.isCredible,
            confidence_score: result.confidence || (result.isCredible ? 90.00 : 20.00),
            reasoning: result.reasoning,
            sources: result.sources || [],
            category: 'Umum',
            search_count: 1
          });
        logger.info('💾 Saved new claim verification to DB');
      }
    } catch (dbErr) {
      logger.error('⚠️ Failed to save claim verification to DB:', dbErr);
    }

    // Petakan output untuk mendukung key frontend (isValid, explanation, source, confidence)
    return c.json({
      isCredible: result.isCredible,
      isValid: result.isCredible,                    // Map isCredible -> isValid
      reasoning: result.reasoning,
      explanation: result.reasoning,                // Map reasoning -> explanation
      sources: result.sources || [],
      source: result.sources && result.sources.length > 0 ? result.sources[0] : 'Situs Resmi Cek Fakta', // Map first source url -> source
      confidence: result.confidence || (result.isCredible ? 90 : 20),
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ Validate claim error:', error);
    return c.json({ 
      error: 'Gagal memverifikasi klaim',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Summarize Controller - Meringkas dokumen panjang menjadi poin & Mermaid diagram
 * POST /api/chat/summarize
 */
export const summarizeController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = summarizeSchema.parse(body);
    
    logger.info('📄 Summarize request:', {
      textLength: validated.text.length
    });

    const cleanText = validated.text.trim();
    const originalHash = crypto.createHash('sha256').update(cleanText).digest('hex');

    // Cek cache ringkasan dokumen di database
    try {
      const { data: existingSummary } = await supabaseAdmin
        .from('document_summaries')
        .select('summary')
        .eq('original_hash', originalHash)
        .maybeSingle();

      if (existingSummary) {
        logger.info('⚡ Retrieved summary from DB cache (hash hit)');
        return c.json({
          summary: existingSummary.summary,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (dbErr) {
      logger.error('⚠️ Failed to check document summaries cache:', dbErr);
    }

    const summary = await summarizeDocument(validated.text);
    
    // Simpan hasil ringkasan dokumen ke database Supabase
    try {
      const keyPoints = summary
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^\d+\.\s+/.test(line))
        .map(line => line.replace(/^\d+\.\s+/, ''));

      await supabaseAdmin
        .from('document_summaries')
        .insert({
          original_hash: originalHash,
          original_text: cleanText,
          summary: summary,
          key_points: keyPoints,
        });
      logger.info('💾 Saved new document summary to DB cache');
    } catch (dbErr) {
      logger.error('⚠️ Failed to save document summary to DB:', dbErr);
    }

    return c.json({
      summary,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ Summarize error:', error);
    return c.json({ 
      error: 'Gagal meringkas dokumen',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Get Reports Controller - Mengambil semua laporan aduan warga
 * GET /api/reports
 */
export const getReportsController = async (c: Context) => {
  try {
    const user = c.get('user');
    const profile = c.get('profile');
    const contact = c.req.query('contact');
    const status = c.req.query('status');
    const province = c.req.query('province');
    const city = c.req.query('city');
    const district = c.req.query('district');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    logger.info('📋 Get reports request:', { email: user?.email, role: profile?.role, contact, status, province, city, district });

    const supabaseClient = c.get('supabase') || supabase;
    let query = supabaseClient
      .from('citizen_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply role-based and contact filtering
    if (profile) {
      if (profile.role === 'user') {
        // Regular citizen: only see their own reports (by user_id OR contact match)
        const clauses = [`user_id.eq.${profile.id}`];
        if (profile.email) clauses.push(`reporter_contact.eq.${profile.email}`);
        if (profile.nomor_telepon) clauses.push(`reporter_contact.eq.${profile.nomor_telepon}`);
        query = query.or(clauses.join(','));
      } else {
        // Staff/Admin/Superadmin: can see all. If contact filter is supplied, apply it
        if (contact) {
          query = query.eq('reporter_contact', contact);
        }
      }
    } else {
      // Guest: must provide contact, otherwise see nothing
      if (contact) {
        query = query.eq('reporter_contact', contact);
      } else {
        return c.json({
          reports: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (province && province !== 'all') {
      query = query.eq('province', province);
    }
    if (city && city !== 'all') {
      query = query.eq('city', city);
    }
    if (district && district !== 'all') {
      query = query.eq('district', district);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return c.json({
      reports: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    logger.error('❌ Get reports error:', error);
    return c.json({
      error: 'Gagal mengambil data laporan',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Update Report Status Controller - Mengubah status laporan aduan (Admin)
 * PATCH /api/reports/:id
 */
export const updateReportStatusController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { status, adminNote } = body;

    const validStatuses = ['Menunggu', 'Diproses', 'Selesai', 'Ditolak'];
    if (!status || !validStatuses.includes(status)) {
      return c.json({ error: 'Status tidak valid. Gunakan: Menunggu, Diproses, Selesai, atau Ditolak' }, 400);
    }

    logger.info('📝 Admin: Update report status', { id, status });

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (adminNote !== undefined) {
      updateData.admin_note = adminNote;
    }

    const supabaseClient = c.get('supabase') || supabase;
    const { data, error } = await supabaseClient
      .from('citizen_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info('✅ Report status updated:', id, '->', status);

    // Emit real-time event to refresh admin dashboards
    adminEvents.emit('broadcast', { type: 'REPORT_UPDATED', id });

    return c.json({ report: data, message: `Status laporan berhasil diubah ke "${status}"` });
  } catch (error: any) {
    logger.error('❌ Update report status error:', error);
    return c.json({
      error: 'Gagal mengubah status laporan',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Get Dashboard Stats Controller - Statistik ringkas untuk admin dashboard
 * GET /api/admin/stats
 */
export const getDashboardStatsController = async (c: Context) => {
  try {
    logger.info('📊 Admin: Get dashboard stats');

    const supabaseClient = c.get('supabase') || supabase;
    const [reportsResult, chatHistoryResult, claimsResult, summariesResult] = await Promise.all([
      supabaseClient.from('citizen_reports').select('status, district, urgency_level', { count: 'exact' }),
      supabaseClient.from('chat_history').select('session_id', { count: 'exact' }),
      supabaseClient.from('claim_verifications').select('id', { count: 'exact' }),
      supabaseClient.from('document_summaries').select('id', { count: 'exact' }),
    ]);

    const reports = reportsResult.data || [];
    const totalReports = reportsResult.count || 0;
    const totalSessions = chatHistoryResult.count || 0;
    const totalClaims = claimsResult.count || 0;
    const totalSummaries = summariesResult.count || 0;

    const statusCounts = reports.reduce((acc: any, r: any) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const urgencyCounts = reports.reduce((acc: any, r: any) => {
      const level = r.urgency_level || 'Sedang';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    const districtCounts = reports.reduce((acc: any, r: any) => {
      if (r.district) {
        acc[r.district] = (acc[r.district] || 0) + 1;
      }
      return acc;
    }, {});

    return c.json({
      totalReports,
      totalSessions,
      totalClaims,
      totalSummaries,
      statusCounts: {
        Menunggu: statusCounts['Menunggu'] || 0,
        Diproses: statusCounts['Diproses'] || 0,
        Selesai: statusCounts['Selesai'] || 0,
        Ditolak: statusCounts['Ditolak'] || 0,
      },
      urgencyCounts: {
        Kritis: urgencyCounts['Kritis'] || 0,
        Tinggi: urgencyCounts['Tinggi'] || 0,
        Sedang: urgencyCounts['Sedang'] || 0,
        Rendah: urgencyCounts['Rendah'] || 0,
      },
      districtCounts,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('❌ Get dashboard stats error:', error);
    return c.json({
      error: 'Gagal mengambil statistik',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Create Report Controller - Membuat aduan darurat warga dan menyimpan ke Supabase
 * POST /api/reports
 */
export const createReportController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = reportSchema.parse(body);
    const user = c.get('user');
    const userId = user ? user.id : null;
    const supabaseClient = c.get('supabase') || supabase;

    logger.info('📋 Citizen report request received:', {
      reporterName: validated.reporterName,
      category: validated.category,
      hasGPS: validated.latitude !== undefined && validated.longitude !== undefined,
      userId,
    });

    // 1. Pembatasan Pengaduan Guest & Tamu (Max 2x Sehari)
    if (!userId) {
      // User is guest. Limit check: max 2 reports per day based on reporter_contact
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: guestReports, error: countError } = await supabaseClient
        .from('citizen_reports')
        .select('id')
        .is('user_id', null)
        .eq('reporter_contact', validated.reporterContact)
        .gte('created_at', today.toISOString());

      if (countError) {
        logger.error('❌ Failed to check guest report limit:', countError);
      } else if (guestReports && guestReports.length >= 2) {
        logger.warn('🚫 Guest limit reached for contact:', validated.reporterContact);
        return c.json({
          error: 'GuestLimitReached',
          message: 'Batas laporan tanpa login adalah 2 kali sehari. Silakan masuk (login) terlebih dahulu untuk membuat laporan lebih lanjut.'
        }, 429);
      }
    }

    // Pastikan session_id ada di tabel chat_history terlebih dahulu untuk menghindari error foreign key (23503)
    if (validated.sessionId) {
      const history = await getChatHistory(validated.sessionId);
      if (!history) {
        logger.info('🆕 Session ID not found in chat_history. Initializing empty history for:', validated.sessionId);
        await saveChatHistory(validated.sessionId, []);
      }
    }

    // Simpan aduan warga ke database Supabase (tabel citizen_reports)
    const { data, error } = await supabaseClient
      .from('citizen_reports')
      .insert({
        reporter_name: validated.reporterName,
        reporter_contact: validated.reporterContact,
        category: validated.category,
        description: validated.description,
        session_id: validated.sessionId || null,
        status: 'Menunggu', // Status awal laporan
        latitude: validated.latitude,
        longitude: validated.longitude,
        image_url: validated.image || null,
        province: validated.province || null,
        city: validated.city || null,
        district: validated.district || null,
        user_id: userId,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    logger.info('✅ Citizen report created successfully, ID:', data.id);

    // Emit real-time event to refresh admin dashboards
    adminEvents.emit('broadcast', { type: 'REPORT_CREATED', id: data.id });

    // --- AI URGENCY SCORING (async, non-blocking) ---
    // Run in background so it doesn't delay citizen's response
    const reportId = data.id;
    setImmediate(async () => {
      try {
        const urgency = await scoreUrgency(validated.description, validated.category);
        await supabaseClient
          .from('citizen_reports')
          .update({ urgency_level: urgency.level, urgency_reason: urgency.reason })
          .eq('id', reportId);
        logger.info(`🚨 Urgency scored for report ${reportId}: ${urgency.level}`);
        adminEvents.emit('broadcast', { type: 'REPORT_URGENCY_UPDATED', id: reportId });
      } catch (urgencyErr) {
        logger.error('⚠️ Urgency scoring failed for report:', reportId, urgencyErr);
      }
    });

    return c.json({
      id: data.id,
      status: 'Menunggu',
      message: 'Laporan Anda berhasil disimpan dalam database KOMUNITAS. Petugas akan segera memproses laporan Anda.',
    }, 201);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('⚠️ Validation error in report:', error.issues);
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ Create report controller error:', error);
    return c.json({ 
      error: 'Gagal membuat laporan aduan',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Get History Controller - Mengambil riwayat chat (Dipetakan agar mendukung key 'messages')
 * GET /api/chat/history/:sessionId
 */
export const getHistoryController = async (c: Context) => {
  try {
    const sessionId = c.req.param('sessionId');
    const user = c.get('user');
    
    if (!sessionId) {
      return c.json({ error: 'Session ID diperlukan' }, 400);
    }

    logger.info('📜 Get history request:', { sessionId, user: user?.email });

    const { data: sessionData, error } = await supabaseAdmin
      .from('chat_history')
      .select('messages, user_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;

    if (sessionData) {
      // Check ownership if session is bound to a user
      if (sessionData.user_id && (!user || user.id !== sessionData.user_id)) {
        logger.warn('🚫 Unauthorized access to chat history session:', { sessionId, requestedBy: user?.id, owner: sessionData.user_id });
        return c.json({ error: 'Unauthorized', message: 'Anda tidak memiliki akses ke percakapan ini.' }, 403);
      }

      const history = sessionData.messages || [];
      return c.json({
        history: history,
        messages: history,
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      history: [],
      messages: [],
      sessionId,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error('❌ Get history error:', error);
    return c.json({ 
      error: 'Gagal mengambil riwayat',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Delete History Controller - Menghapus riwayat chat
 * DELETE /api/chat/history/:sessionId
 */
export const deleteHistoryController = async (c: Context) => {
  try {
    const sessionId = c.req.param('sessionId');
    
    if (!sessionId) {
      return c.json({ error: 'Session ID diperlukan' }, 400);
    }

    logger.info('🗑️ Delete history request:', { sessionId });

    await deleteChatHistory(sessionId);
    
    return c.json({
      success: true,
      sessionId,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error('❌ Delete history error:', error);
    return c.json({ 
      error: 'Gagal menghapus riwayat',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

// --- Services (RAG Directory) Management ---

/**
 * Schema validasi untuk data layanan publik baru (Zod)
 */
const serviceSchema = z.object({
  name: z.string().min(1, 'Nama layanan tidak boleh kosong'),
  institution: z.string().min(1, 'Nama lembaga tidak boleh kosong'),
  category: z.string().min(1, 'Kategori tidak boleh kosong'),
  description: z.string().min(1, 'Deskripsi tidak boleh kosong'),
  requirements: z.array(z.string()).default([]),
  procedures: z.array(z.string()).default([]),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
});

/**
 * Create Service Controller - Menambahkan layanan publik baru & generate embedding secara aman (Admin)
 * POST /api/services
 */
export const createServiceController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = serviceSchema.parse(body);

    logger.info('📂 Admin: Create service request received:', {
      name: validated.name,
      institution: validated.institution,
    });

    // 1. Gabungkan informasi layanan menjadi satu teks untuk representasi semantik (RAG)
    const embeddingText = `Layanan: ${validated.name}
Lembaga: ${validated.institution}
Kategori: ${validated.category}
Deskripsi: ${validated.description}
Persyaratan: ${validated.requirements.join(', ')}
Prosedur: ${validated.procedures.join(' -> ')}`;

    // 2. Generate embedding secara aman di server menggunakan OpenRouter
    //    Jika gagal (API key belum diset, rate limit, dsb.), layanan tetap disimpan tanpa vektor
    let vector: number[] | null = null;
    try {
      vector = await getEmbedding(embeddingText);
    } catch (embeddingError: any) {
      logger.warn('⚠️ Embedding generation failed — service akan disimpan tanpa vektor RAG:', embeddingError.message);
    }

    // 3. Simpan data layanan beserta embeddingnya ke Supabase
    const { data, error } = await supabaseAdmin
      .from('public_services')
      .insert({
        name: validated.name,
        institution: validated.institution,
        category: validated.category,
        description: validated.description,
        requirements: validated.requirements,
        procedures: validated.procedures,
        contact_phone: validated.contactPhone || null,
        contact_email: validated.contactEmail || null,
        address: validated.address || null,
        website: validated.website || null,
        embedding: vector,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    const hasVector = vector !== null;
    logger.info(`✅ Public service created successfully. ID: ${data.id} | Vector: ${hasVector ? 'YES' : 'NO (fallback mode)'}`);

    return c.json({
      id: data.id,
      message: hasVector
        ? 'Layanan publik berhasil ditambahkan beserta data representasi vektor (RAG).'
        : 'Layanan publik berhasil ditambahkan. Catatan: embedding vektor tidak tersedia saat ini (cek OPENROUTER_API_KEY).',
      hasVector,
    }, 201);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('⚠️ Validation error in service data:', error.issues);
      return c.json({ 
        error: 'Validasi gagal', 
        details: error.issues.map(e => e.message) 
      }, 400);
    }
    
    logger.error('❌ Create service error:', error);
    return c.json({ 
      error: 'Gagal menambahkan layanan publik',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Get All Services Controller - Mengambil daftar semua layanan publik
 * GET /api/services
 */
export const getServicesController = async (c: Context) => {
  try {
    const category = c.req.query('category');
    logger.info('📂 Get all public services request', { category });

    let query = supabase
      .from('public_services')
      .select('id, name, institution, category, description, requirements, procedures, contact_phone, contact_email, address, website, created_at')
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Map database snake_case keys back to camelCase for the frontend client
    const services = (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      institution: s.institution,
      category: s.category,
      description: s.description,
      requirements: s.requirements || [],
      procedures: s.procedures || [],
      contactPhone: s.contact_phone,
      contactEmail: s.contact_email,
      address: s.address,
      website: s.website,
      createdAt: s.created_at,
    }));

    return c.json({ services });

  } catch (error: any) {
    logger.error('❌ Get services error:', error);
    return c.json({ 
      error: 'Gagal mengambil daftar layanan publik',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Delete Service Controller - Menghapus layanan publik (Admin)
 * DELETE /api/services/:id
 */
export const deleteServiceController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    logger.info('🗑️ Admin: Delete public service request for ID:', id);

    const { error } = await supabaseAdmin
      .from('public_services')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    logger.info('✅ Public service deleted successfully. ID:', id);

    return c.json({
      success: true,
      message: 'Layanan publik berhasil dihapus.',
    });

  } catch (error: any) {
    logger.error('❌ Delete service error:', error);
    return c.json({ 
      error: 'Gagal menghapus layanan publik',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

/**
 * Get All Claims Controller - Mengambil data verifikasi klaim hoaks (Admin)
 * GET /api/claims
 */
export const getClaimsController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    logger.info('📋 Admin: Get all claims request', { page, limit });

    const { data, error, count } = await supabase
      .from('claim_verifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return c.json({
      claims: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    logger.error('❌ Get claims error:', error);
    return c.json({ error: 'Gagal mengambil data verifikasi klaim', message: error.message || 'Unknown error' }, 500);
  }
};

/**
 * Delete Claim Controller - Menghapus verifikasi klaim hoaks (Admin)
 * DELETE /api/claims/:id
 */
export const deleteClaimController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    logger.info('🗑️ Admin: Delete claim request for ID:', id);

    const { error } = await supabase
      .from('claim_verifications')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return c.json({ success: true, message: 'Data verifikasi klaim berhasil dihapus.' });
  } catch (error: any) {
    logger.error('❌ Delete claim error:', error);
    return c.json({ error: 'Gagal menghapus data verifikasi klaim', message: error.message || 'Unknown error' }, 500);
  }
};

/**
 * Get All Summaries Controller - Mengambil data ringkasan dokumen (Admin)
 * GET /api/summaries
 */
export const getSummariesController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    logger.info('📋 Admin: Get all summaries request', { page, limit });

    const { data, error, count } = await supabase
      .from('document_summaries')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return c.json({
      summaries: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    logger.error('❌ Get summaries error:', error);
    return c.json({ error: 'Gagal mengambil data ringkasan dokumen', message: error.message || 'Unknown error' }, 500);
  }
};

/**
 * Delete Summary Controller - Menghapus ringkasan dokumen (Admin)
 * DELETE /api/summaries/:id
 */
export const deleteSummaryController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    logger.info('🗑️ Admin: Delete summary request for ID:', id);

    const { error } = await supabase
      .from('document_summaries')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return c.json({ success: true, message: 'Data ringkasan dokumen berhasil dihapus.' });
  } catch (error: any) {
    logger.error('❌ Delete summary error:', error);
    return c.json({ error: 'Gagal menghapus data ringkasan dokumen', message: error.message || 'Unknown error' }, 500);
  }
};

/**
 * Get All Chat Histories Controller - Mengambil semua sesi chat obrolan warga (Admin)
 * GET /api/histories
 */
export const getChatHistoriesController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    logger.info('📋 Admin: Get all chat histories request', { page, limit });

    const { data, error, count } = await supabase
      .from('chat_history')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return c.json({
      histories: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    logger.error('❌ Get chat histories error:', error);
    return c.json({ error: 'Gagal mengambil riwayat chat', message: error.message || 'Unknown error' }, 500);
  }
};

/**
 * Extract File Controller - Mengekstrak teks dari dokumen berkas (PDF, DOCX, XLSX, TXT, MD)
 * POST /api/chat/extract-file
 */
export const extractFileController = async (c: Context) => {
  try {
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return c.json({ error: 'Validasi gagal', message: 'Content-Type harus multipart/form-data' }, 400);
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Validasi gagal', message: 'File tidak ditemukan atau tidak valid' }, 400);
    }

    logger.info(`📁 Extracting text from uploaded file: ${file.name} (${file.size} bytes, type: ${file.type})`);
    
    // Batasan ukuran berkas: 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return c.json({ error: 'Validasi gagal', message: 'Ukuran file maksimal adalah 10MB' }, 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const extractedText = await extractTextFromFile(buffer, file.type, file.name);

    return c.json({
      text: extractedText,
      name: file.name,
      size: file.size,
      type: file.type,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('❌ File extraction controller error:', error);
    return c.json({
      error: 'Gagal mengekstrak teks berkas',
      message: error.message || 'Unknown error'
    }, 500);
  }
};



/**
 * Get Reports Statistics Controller - Statistik daerah/wilayah aduan untuk admin
 * GET /api/reports/statistics
 */
export const getReportsStatisticsController = async (c: Context) => {
  try {
    logger.info('📊 Admin: Get reports statistics');
    const supabaseClient = c.get('supabase') || supabase;
    const { data: reports, error } = await supabaseClient
      .from('citizen_reports')
      .select('province, city, district, category, status');

    if (error) throw error;

    const provinceCounts: Record<string, number> = {};
    const cityCounts: Record<string, number> = {};
    const districtCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    reports?.forEach((r: any) => {
      if (r.province) provinceCounts[r.province] = (provinceCounts[r.province] || 0) + 1;
      if (r.city) cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
      if (r.district) districtCounts[r.district] = (districtCounts[r.district] || 0) + 1;
      if (r.category) categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    });

    return c.json({
      success: true,
      provinces: provinceCounts,
      cities: cityCounts,
      districts: districtCounts,
      categories: categoryCounts,
      total: reports?.length || 0,
    });
  } catch (error: any) {
    logger.error('❌ Get reports statistics error:', error);
    return c.json({ error: 'Gagal mengambil statistik laporan', message: error.message }, 500);
  }
};

/**
 * Get Active Chats Controller - Mengambil daftar laporan/aduan warga yang sedang aktif (Menunggu / Diproses)
 * GET /api/chat/active
 */
export const getActiveChatsController = async (c: Context) => {
  try {
    logger.info('💬 Admin/Petugas: Get active chats list');
    const supabaseClient = c.get('supabase') || supabase;
    const { data: reports, error } = await supabaseClient
      .from('citizen_reports')
      .select('*')
      .in('status', ['Menunggu', 'Diproses'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    return c.json({
      success: true,
      data: reports || [],
    });
  } catch (error: any) {
    logger.error('❌ Get active chats list error:', error);
    return c.json({ error: 'Gagal mengambil daftar percakapan aktif', message: error.message }, 500);
  }
};

/**
 * Parse Service Document Controller - Menganalisis dokumen panduan layanan publik menggunakan AI (Gemini 2.5 Flash - Murah & Akurat)
 * POST /api/services/parse-doc
 */
export const parseServiceDocumentController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Validasi gagal', message: 'Teks dokumen diperlukan untuk diproses' }, 400);
    }

    logger.info('📂 Admin: Parsing service document text using AI (Gemini-2.5-Flash)');

    const prompt = `Analisis teks panduan/dokumen pelayanan publik berikut dan ekstrak informasinya ke dalam format JSON yang terstruktur.

Kategori yang diperbolehkan hanya salah satu dari: 'darurat', 'layanan', 'hoaks', 'infrastruktur', 'sosial', 'lainnya'.
Prosedur harus berupa langkah-langkah konkret berurutan (array of strings).
Persyaratan harus berupa dokumen pendukung yang wajib dibawa (array of strings).

JSON Output harus mengikuti skema ini persis:
{
  "name": "Nama layanan publik",
  "institution": "Nama instansi/lembaga penyelenggara",
  "category": "kategori",
  "categoryReason": "Penjelasan mengapa dokumen diklasifikasikan ke kategori tersebut",
  "description": "Deskripsi singkat layanan",
  "requirements": ["Syarat 1", "Syarat 2"],
  "procedures": ["Langkah 1", "Langkah 2"],
  "contactPhone": "Nomor telepon kontak resmi (jika ada, jika tidak kosongkan)",
  "contactEmail": "Alamat email kontak resmi (jika ada, jika tidak kosongkan)",
  "address": "Alamat fisik instansi (jika ada, jika tidak kosongkan)",
  "website": "URL website resmi (jika ada, jika tidak kosongkan)"
}

Teks Dokumen:
${text}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: 'Anda adalah asisten AI yang ahli dalam mengekstrak informasi terstruktur dari dokumen birokrasi pemerintahan Indonesia.' },
      { role: 'user', content: prompt }
    ];

    // Menggunakan callAI dengan jsonMode: true agar output terjamin valid JSON
    const aiResponse = await callAI(messages, undefined, 0.1, true);
    
    // Parse JSON output secara aman
    const parsedData = JSON.parse(aiResponse);

    return c.json({
      success: true,
      data: parsedData
    });

  } catch (error: any) {
    logger.error('❌ Parse service document error:', error);
    return c.json({
      error: 'Gagal menganalisis dokumen',
      message: error.message || 'Unknown error'
    }, 500);
  }
};

const ragDocumentSchema = z.object({
  filename: z.string().min(1, 'Nama file wajib diisi'),
  file_size: z.number().int().positive('Ukuran file tidak valid'),
  file_type: z.string().min(1, 'Tipe file wajib diisi'),
  file_path: z.string().optional(),
});

/**
 * Get RAG Documents Controller
 * GET /api/services/documents
 */
export const getRAGDocumentsController = async (c: Context) => {
  try {
    logger.info('📂 Admin: Get RAG documents list');
    const supabaseClient = c.get('supabase') || supabase;
    const { data, error } = await supabaseClient
      .from('rag_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return c.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    logger.error('❌ Get RAG documents list error:', error);
    return c.json({ error: 'Gagal mengambil daftar dokumen RAG', message: error.message }, 500);
  }
};

/**
 * Create RAG Document Controller
 * POST /api/services/documents
 */
export const createRAGDocumentController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = ragDocumentSchema.parse(body);

    logger.info('📂 Admin: Saving RAG document metadata:', validated.filename);
    const { data, error } = await supabaseAdmin
      .from('rag_documents')
      .insert({
        filename: validated.filename,
        file_size: validated.file_size,
        file_type: validated.file_type,
        file_path: validated.file_path || null,
      })
      .select()
      .single();

    if (error) throw error;

    return c.json({
      success: true,
      data,
      message: 'Dokumen RAG berhasil disimpan.',
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'ValidationError', message: error.issues[0]?.message || 'Validasi gagal' }, 400);
    }
    logger.error('❌ Create RAG document error:', error);
    return c.json({ error: 'Gagal menyimpan dokumen RAG', message: error.message }, 500);
  }
};

/**
 * Delete RAG Document Controller
 * DELETE /api/services/documents/:id
 */
export const deleteRAGDocumentController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    logger.info('📂 Admin: Delete RAG document request for ID:', id);

    const { error } = await supabaseAdmin
      .from('rag_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return c.json({
      success: true,
      message: 'Dokumen RAG berhasil dihapus.',
    });
  } catch (error: any) {
    logger.error('❌ Delete RAG document error:', error);
    return c.json({ error: 'Gagal menghapus dokumen RAG', message: error.message }, 500);
  }
};

