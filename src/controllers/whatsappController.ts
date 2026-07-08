/**
 * Controller untuk menangani chatbot WhatsApp (Webhook)
 * dan manajemen database hoaks (CRUD) oleh Admin/Superadmin
 */

import { Context } from 'hono';
import { supabase, supabaseAdmin } from '../services/supabaseService';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { validateRequest } from 'twilio';

// --- In-Memory Hoax Database Fallback ---
const fallbackHoaxes = [
  {
    id: 'f1',
    keyword: 'vaksin',
    title: 'Hoaks Chip Magnetik Vaksin COVID-19',
    description: 'Klaim bahwa vaksin COVID-19 mengandung chip magnetik atau alat pelacak mikro 5G adalah HOAKS. Tidak ada chip pelacak di dalam vaksin. Bahan vaksin aman dan telah diuji klinis.',
    source: 'Kementerian Kesehatan RI / TurnBackHoax',
    is_verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'f2',
    keyword: 'bansos',
    title: 'Hoaks Tautan Pendaftaran Bansos BBM/Kesehatan',
    description: 'Pesan berantai WhatsApp yang menawarkan bantuan sosial (bansos) Rp 1.500.000 dengan mengklik tautan tidak dikenal adalah HOAKS. Pendaftaran bansos resmi hanya melalui aplikasi Cek Bansos Kemensos RI.',
    source: 'Kementerian Sosial RI',
    is_verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'f3',
    keyword: 'gempa',
    title: 'Hoaks Gempa Susulan Megathrust Malam Ini',
    description: 'Pemberitahuan bahwa akan terjadi gempa bumi susulan berkekuatan besar malam ini di wilayah Jawa/Sumatera adalah HOAKS. Gempa bumi tidak dapat diprediksi secara presisi waktu dan tanggalnya.',
    source: 'BMKG',
    is_verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// --- Zod Validation Schema for Hoax Database ---
const hoaxSchema = z.object({
  keyword: z.string().min(1, 'Kata kunci tidak boleh kosong'),
  title: z.string().min(1, 'Judul hoaks tidak boleh kosong'),
  description: z.string().min(1, 'Penjelasan hoaks tidak boleh kosong'),
  source: z.string().optional().default('Situs Resmi Cek Fakta KOMUNITAS'),
  isVerified: z.boolean().optional(),
  is_verified: z.boolean().optional(),
});

/**
 * WhatsApp Webhook - Melakukan pencarian kata kunci dan mengembalikan pesan otomatis (No LLM)
 * POST /api/whatsapp/webhook
 */
export const whatsappWebhookController = async (c: Context) => {
  try {
    const contentType = c.req.header('content-type') || '';

    // Twilio Webhook Signature Validation
    const signature = c.req.header('X-Twilio-Signature');
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const webhookUrl = process.env.WEBHOOK_URL;

    if (signature && authToken && webhookUrl) {
      let params: Record<string, any> = {};
      if (contentType.includes('application/x-www-form-urlencoded')) {
        params = await c.req.parseBody();
      }
      const isValid = validateRequest(authToken, signature, webhookUrl, params);
      if (!isValid) {
        logger.warn('⚠️ [WhatsApp] Invalid Twilio Signature validation failed!');
        return c.text('Forbidden: Invalid Twilio Signature', 403);
      }
    }

    let messageBody = '';
    let fromNumber = '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.parseBody();
      messageBody = (body['Body'] as string) || '';
      fromNumber = (body['From'] as string) || '';
    } else {
      try {
        const body = await c.req.json();
        messageBody = body.Body || body.message || body.text || '';
        fromNumber = body.From || body.from || '';
      } catch (e) {
        // Fallback jika json parsing gagal
        messageBody = '';
        fromNumber = '';
      }
    }

    messageBody = messageBody.trim();
    logger.info('📱 Received WhatsApp message:', { body: messageBody, from: fromNumber });

    if (!messageBody) {
      // Kirim respons kosong jika pesan kosong
      return c.text('No content', 200);
    }

    // Ambil data hoaks dari Supabase
    let hoaxes = [...fallbackHoaxes];
    try {
      const { data, error } = await supabase
        .from('hoax_database')
        .select('*');
      
      if (error && error.message?.includes('relation "public.hoax_database" does not exist')) {
        logger.warn('⚠️ [WhatsApp] hoax_database table does not exist. Using fallback hoaxes.');
      } else if (error) {
        throw error;
      } else if (data && data.length > 0) {
        hoaxes = data.map(h => ({
          id: h.id,
          keyword: h.keyword,
          title: h.title,
          description: h.description,
          source: h.source,
          is_verified: h.is_verified,
          created_at: h.created_at,
          updated_at: h.updated_at
        }));
      }
    } catch (err: any) {
      logger.error('⚠️ [WhatsApp] Error fetching hoax database from DB:', err.message || err);
    }

    // Clean user query for template placeholder (remove 'apakah', 'adakah', 'benarkah' and trailing '?')
    const cleanQuery = (text: string) => {
      return text
        .replace(/^(apakah|adakah|benarkah|benerkah|apa)\s+/i, '')
        .replace(/\?+$/, '')
        .trim();
    };

    // Lakukan pencarian kata kunci case-insensitive secara fleksibel
    const matched = hoaxes.find(h => {
      const kw = h.keyword.toLowerCase().trim();
      const msg = messageBody.toLowerCase().trim();
      // Avoid matching very short keywords (like 'a') unless there's an exact match
      if (kw.length < 3 && msg !== kw) return false;
      return msg.includes(kw) || kw.includes(msg);
    });

    let replyMessage = '';

    if (matched) {
      replyMessage = `🔍 Menurut database kami, klaim '${matched.title}' adalah HOAKS. Sumber: ${matched.source || 'Kemenkes RI'}. Untuk informasi lebih lanjut, silakan kunjungi website kami: https://komunitasai.web.id`;
    } else {
      const queryCleaned = cleanQuery(messageBody);
      replyMessage = `⚠️ Informasi '${queryCleaned}' TIDAK DITEMUKAN di database kami. Silakan kunjungi website kami atau chat dengan AI kami untuk verifikasi lebih lanjut.`;
    }

    // Jika datang dari Twilio (x-www-form-urlencoded), balas dengan format Twilio XML
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${replyMessage.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>
</Response>`;
      return c.body(xmlResponse, 200, {
        'Content-Type': 'text/xml; charset=utf-8'
      });
    }

    // Kembalikan JSON response untuk integrasi bot non-Twilio / Frontend simulator
    return c.json({
      from: fromNumber,
      message: messageBody,
      reply: replyMessage,
      matched: !!matched,
      matchedHoax: matched || null,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('❌ WhatsApp Webhook Error:', error);
    return c.json({ error: 'Internal Server Error', message: error.message }, 500);
  }
};

// --- ADMIN HOAX CRUD CONTROLLERS ---

/**
 * Get All Hoaxes (Admin)
 * GET /api/admin/hoax
 */
export const getHoaxesController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;

    logger.info('📋 Admin: Get hoax database list request', { page, limit, search });

    let query = supabase
      .from('hoax_database')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`keyword.ilike.%${search}%,title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Ambil dengan range halaman
    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      logger.warn('⚠️ [Admin Hoax] Supabase table or query error, falling back to in-memory hoaxes:', error.message || error);
      let filteredFallback = [...fallbackHoaxes];
      if (search) {
        filteredFallback = filteredFallback.filter(h => 
          h.keyword.toLowerCase().includes(search.toLowerCase()) ||
          h.title.toLowerCase().includes(search.toLowerCase()) ||
          h.description.toLowerCase().includes(search.toLowerCase())
        );
      }
      return c.json({
        hoaxes: filteredFallback,
        total: filteredFallback.length,
        page: 1,
        limit,
        totalPages: 1,
        usingFallback: true
      });
    }

    return c.json({
      hoaxes: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      usingFallback: false
    });

  } catch (error: any) {
    logger.error('❌ Get hoaxes error:', error);
    // Ultimate fail-safe fallback
    return c.json({
      hoaxes: fallbackHoaxes,
      total: fallbackHoaxes.length,
      page: 1,
      limit: 50,
      totalPages: 1,
      usingFallback: true
    });
  }
};

/**
 * Create New Hoax (Admin)
 * POST /api/admin/hoax
 */
export const createHoaxController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = hoaxSchema.parse(body);
    const resolvedIsVerified = typeof validated.isVerified !== 'undefined' 
      ? validated.isVerified 
      : (validated.is_verified ?? false);

    logger.info('🆕 Admin: Create new hoax keyword entry:', validated.keyword);

    const { data, error } = await supabaseAdmin
      .from('hoax_database')
      .insert({
        keyword: validated.keyword,
        title: validated.title,
        description: validated.description,
        source: validated.source,
        is_verified: resolvedIsVerified,
      })
      .select()
      .single();

    if (error) {
      logger.error('⚠️ [Admin Hoax] DB insert error, using in-memory mock save:', error.message);
      // Fallback response so frontend doesn't crash
      const mockNewHoax = {
        id: crypto.randomUUID(),
        keyword: validated.keyword,
        title: validated.title,
        description: validated.description,
        source: validated.source,
        is_verified: resolvedIsVerified,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      // Keep it in fallback list for session longevity
      fallbackHoaxes.unshift(mockNewHoax);
      return c.json({
        hoax: mockNewHoax,
        message: 'Data disimpan sementara di memori server karena tabel database belum aktif.'
      }, 201);
    }

    return c.json({
      hoax: data,
      message: 'Data kata kunci hoaks WhatsApp berhasil ditambahkan.'
    }, 201);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validasi gagal', details: error.issues.map(e => e.message) }, 400);
    }
    logger.error('❌ Create hoax error:', error);
    return c.json({ error: 'Gagal menambahkan data hoaks', message: error.message }, 500);
  }
};

/**
 * Update Hoax Entry (Admin)
 * PUT /api/admin/hoax/:id
 */
export const updateHoaxController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = hoaxSchema.parse(body);
    const resolvedIsVerified = typeof validated.isVerified !== 'undefined' 
      ? validated.isVerified 
      : (validated.is_verified ?? false);

    logger.info('📝 Admin: Update hoax request for ID:', id);

    const { data, error } = await supabaseAdmin
      .from('hoax_database')
      .update({
        keyword: validated.keyword,
        title: validated.title,
        description: validated.description,
        source: validated.source,
        is_verified: resolvedIsVerified,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('⚠️ [Admin Hoax] DB update error, using in-memory mock update:', error.message);
      // Attempt to update local fallback array
      const localIdx = fallbackHoaxes.findIndex(h => h.id === id);
      if (localIdx !== -1) {
        fallbackHoaxes[localIdx] = {
          ...fallbackHoaxes[localIdx],
          keyword: validated.keyword,
          title: validated.title,
          description: validated.description,
          source: validated.source,
          is_verified: resolvedIsVerified,
          updated_at: new Date().toISOString()
        };
        return c.json({
          hoax: fallbackHoaxes[localIdx],
          message: 'Data diperbarui sementara di memori server.'
        });
      }
      return c.json({ error: 'Tabel database tidak ditemukan', message: error.message }, 400);
    }

    return c.json({
      hoax: data,
      message: 'Data kata kunci hoaks WhatsApp berhasil diperbarui.'
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validasi gagal', details: error.issues.map(e => e.message) }, 400);
    }
    logger.error('❌ Update hoax error:', error);
    return c.json({ error: 'Gagal memperbarui data hoaks', message: error.message }, 500);
  }
};

/**
 * Delete Hoax Entry (Admin)
 * DELETE /api/admin/hoax/:id
 */
export const deleteHoaxController = async (c: Context) => {
  try {
    const id = c.req.param('id');
    logger.info('🗑️ Admin: Delete hoax request for ID:', id);

    const { error } = await supabaseAdmin
      .from('hoax_database')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.message?.includes('relation "public.hoax_database" does not exist')) {
        return c.json({ error: 'Tabel database tidak ditemukan' }, 400);
      }
      throw error;
    }

    return c.json({
      success: true,
      message: 'Data kata kunci hoaks WhatsApp berhasil dihapus.'
    });

  } catch (error: any) {
    logger.error('❌ Delete hoax error:', error);
    return c.json({ error: 'Gagal menghapus data hoaks', message: error.message }, 500);
  }
};
