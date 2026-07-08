/**
 * Service untuk menangani persistensi pesan chat real-time antara warga dan petugas.
 * Menggunakan pendekatan Dual-Mode Persistence:
 * 1. Mencoba menyimpan dan membaca dari tabel 'chat_messages' terlebih dahulu.
 * 2. Jika tabel tersebut tidak ada atau gagal diakses (error PGRST205 / relation not found),
 *    maka otomatis menggunakan fallback dengan menyimpan data pesan ke dalam array
 *    di tabel 'chat_history' menggunakan report_id sebagai session_id.
 */

import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

export interface ChatMessage {
  id?: string;
  report_id: string;
  sender_id: string;
  sender_type: 'user' | 'petugas';
  sender_name: string;
  message: string;
  created_at: string;
}

/**
 * Menyimpan pesan chat baru ke database dengan skema dual-mode fallback
 */
export async function persistMessage(
  reportId: string,
  senderId: string,
  senderType: 'user' | 'petugas',
  senderName: string,
  message: string
): Promise<ChatMessage> {
  const newMessage: ChatMessage = {
    report_id: reportId,
    sender_id: senderId,
    sender_type: senderType,
    sender_name: senderName,
    message: message,
    created_at: new Date().toISOString()
  };

  try {
    // Mode 1: Coba simpan ke tabel 'chat_messages'
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([newMessage])
      .select()
      .single();

    if (!error && data) {
      logger.info(`✅ [WS Chat] Pesan disimpan ke tabel 'chat_messages' untuk aduan: ${reportId}`);
      return data as ChatMessage;
    }

    // Jika error berkaitan dengan ketiadaan tabel, lempar ke catch block untuk diproses oleh fallback
    if (error && (error.code === 'PGRST205' || error.message?.includes('relation "public.chat_messages" does not exist'))) {
      logger.warn(`⚠️ [WS Chat] Tabel 'chat_messages' tidak ditemukan. Menggunakan fallback ke 'chat_history'...`);
      return await persistMessageFallback(reportId, newMessage);
    }

    if (error) throw error;
    return newMessage;
  } catch (err: any) {
    logger.warn(`⚠️ [WS Chat] Percobaan simpan 'chat_messages' gagal. Error: ${err.message || err}. Menjalankan fallback...`);
    return await persistMessageFallback(reportId, newMessage);
  }
}

/**
 * Logika Fallback: Menyimpan pesan baru ke dalam array di tabel 'chat_history'
 */
async function persistMessageFallback(reportId: string, msg: ChatMessage): Promise<ChatMessage> {
  try {
    // Ambil data riwayat chat yang ada untuk session_id = reportId
    const { data, error: selectError } = await supabase
      .from('chat_history')
      .select('messages')
      .eq('session_id', reportId)
      .single();

    let messages: any[] = [];
    if (!selectError && data && data.messages) {
      messages = Array.isArray(data.messages) ? data.messages : [];
    }

    // Tambahkan pesan baru
    const fallbackMessage = {
      ...msg,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
    };
    messages.push(fallbackMessage);

    // Upsert riwayat chat
    const { error: upsertError } = await supabase
      .from('chat_history')
      .upsert({
        session_id: reportId,
        messages: messages,
        updated_at: new Date().toISOString()
      });

    if (upsertError) throw upsertError;

    logger.info(`✅ [WS Chat-Fallback] Pesan berhasil disimpan ke 'chat_history' untuk session_id: ${reportId}`);
    return fallbackMessage;
  } catch (error: any) {
    logger.error(`❌ [WS Chat-Fallback] Gagal menyimpan pesan ke 'chat_history':`, error);
    throw error;
  }
}

/**
 * Mengambil seluruh riwayat pesan untuk aduan tertentu
 */
export async function getMessages(reportId: string): Promise<ChatMessage[]> {
  try {
    // Mode 1: Coba ambil dari tabel 'chat_messages'
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      logger.info(`✅ [WS Chat] Riwayat pesan diambil dari 'chat_messages' untuk aduan: ${reportId}`);
      return data as ChatMessage[];
    }

    // Jika error berkaitan dengan ketiadaan tabel, lempar ke catch block untuk fallback
    if (error && (error.code === 'PGRST205' || error.message?.includes('relation "public.chat_messages" does not exist'))) {
      return await getMessagesFallback(reportId);
    }

    if (error) throw error;
    return [];
  } catch (err: any) {
    logger.warn(`⚠️ [WS Chat] Gagal mengambil dari 'chat_messages'. Menggunakan fallback ke 'chat_history'...`);
    return await getMessagesFallback(reportId);
  }
}

/**
 * Logika Fallback: Mengambil pesan dari array di tabel 'chat_history'
 */
async function getMessagesFallback(reportId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('chat_history')
      .select('messages')
      .eq('session_id', reportId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Belum ada chat history untuk aduan ini
        return [];
      }
      throw error;
    }

    if (data && data.messages && Array.isArray(data.messages)) {
      return data.messages as ChatMessage[];
    }

    return [];
  } catch (error: any) {
    logger.error(`❌ [WS Chat-Fallback] Gagal memuat riwayat dari 'chat_history':`, error);
    return [];
  }
}
