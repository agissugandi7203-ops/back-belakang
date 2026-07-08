/**
 * Service untuk berinteraksi dengan Supabase database
 * Mengelola penyimpanan dan pengambilan riwayat chat
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

// Ambil konfigurasi dari environment variables
const supabaseUrl = process.env.SUPABASE_URL!;
logger.info('Supabase URL:', supabaseUrl);
logger.info('Using Service Role Key?', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Separate admin client that never signs in users, ensuring service role key is always used
export const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

/**
 * Menyimpan riwayat chat ke database
 * @param sessionId - ID sesi chat (unique identifier)
 * @param messages - Array pesan yang akan disimpan
 * @returns Promise<void>
 */
export const saveChatHistory = async (sessionId: string, messages: any[], userId?: string | null): Promise<void> => {
  try {
    const upsertData: any = {
      session_id: sessionId,
      messages: messages,
      updated_at: new Date().toISOString(),
    };
    if (userId) {
      upsertData.user_id = userId;
    }

    const { error } = await supabaseAdmin
      .from('chat_history')
      .upsert(upsertData);

    if (error) throw error;
    logger.info('✅ Chat history saved for session:', sessionId);
  } catch (error) {
    logger.error('❌ Failed to save chat history:', error);
    throw error; // Re-throw agar controller bisa handle
  }
};

/**
 * Mengambil riwayat chat dari database
 * @param sessionId - ID sesi chat
 * @returns Array pesan atau null jika tidak ditemukan
 */
export const getChatHistory = async (sessionId: string): Promise<any[] | null> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_history')
      .select('messages')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Tidak ada data untuk session ini
        return null;
      }
      throw error;
    }
    
    logger.info('✅ Chat history retrieved for session:', sessionId);
    return data?.messages || [];
  } catch (error) {
    logger.error('❌ Failed to get chat history:', error);
    return null;
  }
};

/**
 * Menghapus riwayat chat (opsional)
 * @param sessionId - ID sesi chat
 */
export const deleteChatHistory = async (sessionId: string): Promise<void> => {
  try {
    const { error } = await supabaseAdmin
      .from('chat_history')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw error;
    logger.info('🗑️ Chat history deleted for session:', sessionId);
  } catch (error) {
    logger.error('❌ Failed to delete chat history:', error);
    throw error;
  }
};
