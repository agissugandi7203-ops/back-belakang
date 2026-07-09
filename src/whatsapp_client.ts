import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { supabase } from './services/supabaseService';
import { logger } from './utils/logger';

// Clean user query for template placeholder (remove 'apakah', 'adakah', 'benarkah' and trailing '?')
const cleanQuery = (text: string) => {
  return text
    .replace(/^(apakah|adakah|benarkah|benerkah|apa)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();
};

async function startWhatsAppBot() {
  console.log('🔄 Menginisialisasi WhatsApp Client (Baileys)...');
  
  // Save authentication details in 'auth_info' directory so you don't have to scan QR code every time
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // We will print it manually using qrcode-terminal for better scaling
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n============================================================');
      console.log('📱 QR CODE BOT WHATSAPP KOMUNITAS KELUAR!');
      console.log('============================================================');
      console.log('Silakan buka WhatsApp HP Anda:');
      console.log('1. Ketuk Menu (Tiga Titik) / Settings');
      console.log('2. Pilih "Perangkat Tertaut" (Linked Devices)');
      console.log('3. Klik "Tautkan Perangkat" (Link a Device) dan scan QR berikut:\n');
      
      qrcode.generate(qr, { small: true });
      
      console.log('============================================================\n');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Koneksi terputus. Menghubungkan kembali:', shouldReconnect);
      if (shouldReconnect) {
        startWhatsAppBot();
      }
    } else if (connection === 'open') {
      console.log('\n============================================================');
      console.log('✅ WhatsApp Bot KOMUNITAS Berhasil Terhubung dan Siap!');
      console.log('============================================================\n');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    // Only process incoming messages (notify event)
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Ignore messages sent by the bot itself
      if (msg.key.fromMe) continue;

      // Extract message content
      const messageBody = msg.message?.conversation || 
                          msg.message?.extendedTextMessage?.text || 
                          '';

      if (!messageBody) continue;

      const fromNumber = msg.key.remoteJid; // Sender JID (e.g. 628123456789@s.whatsapp.net)
      if (!fromNumber) continue;

      console.log(`📱 Pesan Masuk dari ${fromNumber}: "${messageBody}"`);

      try {
        // Query the hoax database in Supabase
        const { data: hoaxes, error } = await supabase
          .from('hoax_database')
          .select('*');

        if (error) throw error;

        // Perform case-insensitive search
        const matched = (hoaxes || []).find(h => {
          const kw = h.keyword.toLowerCase().trim();
          const bodyLower = messageBody.toLowerCase().trim();
          if (kw.length < 3 && bodyLower !== kw) return false;
          return bodyLower.includes(kw) || kw.includes(bodyLower);
        });

        let replyMessage = '';

        if (matched) {
          replyMessage = `🔍 Menurut database kami, klaim '${matched.title}' adalah HOAKS. Sumber: ${matched.source || 'Kemenkes RI'}. Untuk informasi lebih lanjut, silakan kunjungi website kami: https://komunitasai.web.id`;
        } else {
          const queryCleaned = cleanQuery(messageBody);
          replyMessage = `⚠️ Informasi '${queryCleaned}' TIDAK DITEMUKAN di database kami. Silakan kunjungi website kami atau chat dengan AI kami untuk verifikasi lebih lanjut.`;
        }

        // Send reply message
        await sock.sendMessage(fromNumber, { text: replyMessage });
        console.log(`📤 Balasan Terkirim ke ${fromNumber}: "${replyMessage}"`);

      } catch (err: any) {
        console.error('❌ Gagal memproses pesan WhatsApp:', err.message || err);
      }
    }
  });
}

startWhatsAppBot().catch(console.error);
