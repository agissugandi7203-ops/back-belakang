/**
 * Service untuk integrasi dengan OpenRouter AI API
 * Mengelola semua komunikasi dengan model AI (Teks & Visi)
 */

import { 
  OpenRouterRequest, 
  OpenRouterResponse, 
  ChatMessage,
  ClaimValidationResult,
  SummaryResult 
} from '../types';
import { logger } from '../utils/logger';
import { searchGoogle } from './searchService';

// Konfigurasi dari environment variables
const API_KEY = process.env.OPENROUTER_API_KEY!;
const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'google/gemini-2.5-flash';

/**
 * Fungsi utama untuk memanggil OpenRouter API (Chat Completion)
 * @param messages - Array pesan dalam format ChatMessage
 * @param model - Model AI yang digunakan (default dari .env)
 * @param temperature - Kreativitas respons (0-1, default 0.7)
 * @param jsonMode - Jika true, memaksa respon berupa JSON valid
 * @returns Promise<string> - Response dari AI
 */
export const callAI = async (
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
  temperature: number = 0.7,
  jsonMode: boolean = false
): Promise<string> => {
  try {
    logger.info('📤 Calling AI with model:', model, jsonMode ? '(JSON Mode Enabled)' : '');
    
    // Format request ke OpenRouter
    const request: OpenRouterRequest = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature,
      max_tokens: 1500, // Cukup untuk response yang panjang
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
    };

    // Kirim request ke OpenRouter
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000', // Required by OpenRouter
        'X-Title': 'KOMUNITAS - AI Assistant', // Identifikasi aplikasi
      },
      body: JSON.stringify(request),
    });

    // Handle error response
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ OpenRouter API error:', response.status, errorText);
      
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      throw new Error(`OpenRouter API error: ${errorMessage}`);
    }

    // Parse response
    const data = await response.json() as OpenRouterResponse;
    logger.info('✅ AI response received');
    
    // Validasi response structure
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from AI');
    }
    
    return data.choices[0].message.content;

  } catch (error) {
    logger.error('❌ AI service error:', error);
    throw error;
  }
};

/**
 * Panggil OpenRouter API dengan mode streaming (Server-Sent Events)
 * @param messages - Array pesan dalam format ChatMessage
 * @param onToken - Callback saat menerima token baru
 * @param model - Model AI yang digunakan
 * @param temperature - Kreativitas respons (default 0.7)
 * @param maxTokens - Token maksimum (default 4000)
 */
export const callAIStream = async (
  messages: ChatMessage[],
  onToken: (token: string) => void | Promise<void>,
  model: string = DEFAULT_MODEL,
  temperature: number = 0.7,
  maxTokens: number = 4000
): Promise<void> => {
  try {
    logger.info('📤 Calling Streaming AI with model:', model);

    const request: OpenRouterRequest = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'KOMUNITAS - AI Assistant Streaming',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ OpenRouter Streaming API error:', response.status, errorText);
      throw new Error(`OpenRouter Streaming API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported on response body.');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine) continue;

        if (cleanedLine === 'data: [DONE]') {
          break;
        }

        if (cleanedLine.startsWith('data:')) {
          const jsonStr = cleanedLine.slice(5).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              await onToken(token);
            }
          } catch (e) {
            // Ignore parse errors on partial or invalid lines
          }
        }
      }
    }

    if (buffer && buffer.startsWith('data:')) {
      const jsonStr = buffer.slice(5).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) {
          await onToken(token);
        }
      } catch (e) {
        // Ignore
      }
    }

  } catch (error) {
    logger.error('❌ callAIStream error:', error);
    throw error;
  }
};

/**
 * Membaca teks dari gambar dokumen (OCR) menggunakan model Vision AI (Gemini 2.5 Flash)
 * @param base64Data - Data gambar base64 (tanpa header data:image/...)
 * @param mimeType - Mime type gambar (e.g., 'image/jpeg', 'image/png')
 * @returns Promise<string> - Hasil ekstraksi dan ringkasan dokumen
 */
export const extractTextFromImage = async (
  base64Data: string,
  mimeType: string
): Promise<string> => {
  try {
    logger.info('📸 Calling Vision AI model for OCR/Document Analysis...');

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'KOMUNITAS - OCR Vision API',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL, // Gemini 2.5 Flash mendukung input multimodal
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Anda adalah "KOMUNITAS" - asisten AI ahli OCR dan pembaca dokumen Indonesia.
Tugas Anda adalah:
1. Mengekstrak secara transkrip semua teks penting yang tertulis di dalam gambar/dokumen ini.
2. Menyederhanakan isinya menjadi poin-poin yang ringkas, bersih, dan mudah dipahami warga tanpa menggunakan emoji atau simbol dekoratif.
3. Jika gambar tersebut merupakan dokumen prosedur atau alur birokrasi, wajib buatkan diagram alir Mermaid.js menggunakan blok kode:
\`\`\`mermaid
[sintaks diagram disini]
\`\`\`
4. Jawab dalam Bahasa Indonesia yang bersih, ramah, sopan, dan profesional tanpa emoji apa pun.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ],
        temperature: 0.2, // Nilai rendah untuk ekstraksi teks yang akurat
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ Vision API error:', response.status, errorText);
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json() as OpenRouterResponse;
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from Vision API');
    }

    logger.info('✅ OCR vision processing complete');
    return data.choices[0].message.content;

  } catch (error) {
    logger.error('❌ OCR/Vision service error:', error);
    throw error;
  }
};

export const validateClaim = async (claim: string, image?: string, mimeType?: string): Promise<ClaimValidationResult> => {
  logger.info('🔍 Validating claim with search grounding:', claim.substring(0, 100) + '...', { hasImage: !!image });
  
  const hasSearchKey = !!process.env.SERPER_API_KEY;
  const searchResults = await searchGoogle(claim);
  
  let searchContext = '';
  let systemInstructions = '';

  if (hasSearchKey && searchResults.length > 0) {
    searchContext = searchResults.map(r => `Judul: ${r.title}\nLink: ${r.link}\nKutipan: ${r.snippet}\n---`).join('\n');
    systemInstructions = `Tugas Anda adalah menganalisis klaim pengguna berdasarkan data pencarian internet terbaru berikut.
    
HASIL PENCARIAN GOOGLE TERBARU:
${searchContext}

PENTING - ATURAN ANALISIS KRITIS:
1. Periksa dengan teliti apakah hasil pencarian mengandung artikel berita yang mengonfirmasi atau membantah kejadian spesifik dalam klaim tersebut.
2. JANGAN menyamakan profil entitas publik yang terkenal (misal: atlet olahraga populer, pejabat negara, dll) dengan pelaku kejahatan atau peristiwa spesifik lain hanya karena memiliki kesamaan nama atau nama yang mirip.
3. Carilah kecocokan peristiwa, tuduhan, atau tindakan spesifik (seperti kasus kekerasan, pelecehan, tuntutan hukum, penangkapan, dll) dalam artikel berita. Jika hasil penelusuran menunjukkan adanya peristiwa hukum atau berita yang mencocokkan tuduhan tersebut terhadap seseorang dengan nama yang sama/mirip, laporkan kebenaran klaim tersebut secara objektif. Jangan menyimpulkan bahwa klaim itu salah hanya karena Wikipedia mendefinisikan nama tersebut sebagai atlet atau tokoh populer.
4. Jika terdapat gambar yang dilampirkan oleh pengguna, analisislah gambar tersebut untuk melihat apakah mengandung screenshot berita, dokumen pendukung, atau bukti visual yang memvalidasi klaim.`;
  } else {
    // Fallback: search key is missing or search returned nothing
    systemInstructions = `PENTING: Google Search API saat ini tidak terhubung/offline. 
Gunakan basis data pengetahuan internal Anda yang sangat akurat tentang berita dan peristiwa di Indonesia untuk memverifikasi klaim ini secara faktual. 

Fokuskan rujukan data dari 6 institusi utama Indonesia berikut jika relevan dengan klaim:
1. Komisi Perlindungan Anak Indonesia (KPAI)
2. Komisi Nasional Hak Asasi Manusia (Komnas HAM)
3. Palang Merah Indonesia (PMI)
4. Kementerian Komunikasi dan Informatika (Kominfo)
5. Kementerian Sosial (Kemsos)
6. Badan Pusat Statistik (BPS)

PENTING - ATURAN ANALISIS KRITIS:
Jika terdapat gambar yang dilampirkan oleh pengguna, analisislah gambar tersebut untuk melihat apakah mengandung teks, screenshot berita, dokumen resmi, atau bukti visual yang memvalidasi klaim.`;
  }

  const chatSystemPrompt = createSystemPrompt();
  const systemPrompt = `${chatSystemPrompt}

PENTING - PENGECUALIAN ATURAN PANJANG JAWABAN:
Abaikan aturan "ATURAN KEDALAMAN & STRUKTUR JAWABAN" nomor 1 yang meminta jawaban minimal 3 paragraf atau lebih. Khusus untuk tugas verifikasi klaim di homepage ini, penjelasan ("reasoning") harus dibuat ringkas dan padat.

TUGAS KHUSUS ANDA SAAT INI (VERIFIKASI KLAIM/HOAKS DARI HOMEPAGE):
${systemInstructions}

PANDUAN ANALISIS KLAIM:
1. Evaluasi apakah klaim ini faktual/benar atau hoaks berdasarkan bukti/fakta berita resmi.
2. Prioritaskan rujukan informasi dari lembaga negara terkait (Kominfo, KPAI, Komnas HAM, PMI, Kemsos, BPS) atau media nasional terpercaya.
3. Tentukan tingkat kredibilitas klaim tersebut ("isCredible"). 
4. Tuliskan penjelasan ("reasoning") tentang kebenaran klaim secara objektif, bersih, dan profesional tanpa menggunakan emoji. Jika informasi 100% benar, set "isCredible" menjadi true dan jelaskan detail kasusnya secara objektif.
5. Kumpulkan tautan/URL referensi berita asli ("sources") yang memperkuat analisis Anda. Jika API search sedang offline, sebutkan nama-nama portal resmi (misal: "kominfo.go.id", "kpai.go.id", "bps.go.id") sebagai sumber kredibel.
6. Berikan estimasi tingkat keyakinan ("confidence") antara 0-100% berdasarkan keakuratan data.

BATASAN PANJANG PENJELASAN (SANGAT PENTING):
- Penjelasan kebenaran klaim ("reasoning") di homepage ini harus lebih padat dan ringkas dibandingkan dengan halaman chat utama.
- Penjelasan ("reasoning") WAJIB MAKSIMAL HANYA 2 PARAGRAF. Jangan pernah menghasilkan lebih dari 2 paragraf penjelasan.

FORMAT JAWABAN (WAJIB FORMAT JSON DENGAN KEY BERIKUT):
{
  "isCredible": true atau false,
  "reasoning": "Penjelasan ringkas mengenai kebenaran klaim (maksimal 2 paragraf).",
  "sources": ["https://link-rujukan1.com", "https://link-rujukan2.com"],
  "confidence": 95
}

CATATAN: Output hanya boleh berupa JSON valid tanpa teks penjelasan tambahan di luar JSON.`;

  // Multimodal user message if image is present
  const userContent = image
    ? [
        { type: 'text', text: `Klaim yang perlu diverifikasi: "${claim}"` },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType || 'image/jpeg'};base64,${image}`
          }
        }
      ]
    : `Klaim yang perlu diverifikasi: "${claim}"`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent as any }
  ];

  try {
    const response = await callAI(messages, DEFAULT_MODEL, 0.2, true);
    
    // Parse JSON
    const result = JSON.parse(response) as ClaimValidationResult;
    logger.info('✅ Claim validation result:', result);
    return result;
  } catch (error) {
    logger.error('❌ Claim validation error:', error);
    return {
      isCredible: false,
      reasoning: 'Terjadi kesalahan sistem saat mencoba memverifikasi klaim ini secara otomatis. Silakan verifikasi mandiri ke situs resmi terkait.',
      sources: [],
      confidence: 50
    };
  }
};

/**
 * Meringkas dokumen/prosedur menjadi poin-poin utama dan menghasilkan flowchart Mermaid.js
 * @param text - Teks dokumen yang akan diringkas
 * @returns Promise<string> - Ringkasan dalam format poin-poin dan diagram Mermaid
 */
export const summarizeDocument = async (text: string): Promise<string> => {
  logger.info('📄 Summarizing document, length:', text.length);
  
  const chatSystemPrompt = createSystemPrompt();
  const systemPrompt = `${chatSystemPrompt}

PENTING - PENGECUALIAN ATURAN PANJANG JAWABAN:
Abaikan aturan "ATURAN KEDALAMAN & STRUKTUR JAWABAN" nomor 1 yang meminta jawaban minimal 3 paragraf atau lebih. Khusus untuk tugas meringkas dokumen di homepage ini, panjang jawaban menyesuaikan karena sistem nya adalah meringkas secara padat dan langsung pada alur utama dokumen.

TUGAS KHUSUS ANDA SAAT INI (RINGKASAN DOKUMEN DARI HOMEPAGE):
TUGAS ANDA:
1. Pahami teks dokumen resmi/prosedur yang diberikan.
2. Ringkas isi dokumen tersebut menjadi 3-7 poin utama yang singkat, jelas, dan mudah dipahami masyarakat awam. Jangan menggunakan emoji atau simbol dekoratif.
3. JIKA dokumen tersebut mengandung urutan langkah-langkah atau prosedur (step-by-step), Anda wajib membuat diagram alir (flowchart) menggunakan sintaks **Mermaid.js** di dalam blok kode \`\`\`mermaid ... \`\`\`.
4. Tambahkan tips atau saran penting di bagian akhir untuk membantu pengguna mengurus administrasi tersebut.

FORMAT RINGKASAN:
RINGKASAN DOKUMEN

1. [Poin utama 1]
2. [Poin utama 2]
...

[Jika ada langkah/alur, letakkan diagram Mermaid di sini, contoh:
\`\`\`mermaid
graph TD
    A[Mulai] --> B[Langkah 1]
    B --> C[Langkah 2]
\`\`\`
]

TIPS DAN REKOMENDASI:
- [Tips atau saran tambahan]

BATASAN PANJANG (SANGAT PENTING):
- Tuliskan ringkasan yang padat, ringkas, dan langsung pada alur utama dokumen. Jangan menulis narasi yang bertele-tele.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Teks yang perlu diringkas:\n\n${text}` }
  ];

  try {
    const response = await callAI(messages, DEFAULT_MODEL, 0.4);
    logger.info('✅ Document summarized successfully');
    return response;
  } catch (error) {
    logger.error('❌ Summarization error:', error);
    return 'Maaf, terjadi kesalahan saat meringkas dokumen. Silakan coba lagi.';
  }
};

/**
 * Membuat system prompt untuk asisten AI KOMUNITAS
 * @returns string - System prompt lengkap
 */
export const createSystemPrompt = (): string => {
  return `Anda adalah "Asisten KOMUNITAS" - asisten AI pelayanan masyarakat resmi, layanan konsultasi publik, bantuan administrasi birokrasi, dan verifikasi klaim berita (Cek Hoaks) untuk warga Indonesia.

PENTING: Jangan sekali-kali menyertakan emoji, ikon, emotikon, atau simbol dekoratif lainnya dalam jawaban Anda. Jawaban harus ditulis dalam teks bersih yang murni menggunakan bahasa Indonesia formal, sopan, objektif, dan profesional.

IDENTITAS & MAKSUD (MULTI-TASK LAYANAN MASYARAKAT):
Anda dirancang khusus untuk membantu masyarakat dalam hal:
1. Verifikasi klaim berita/hoaks (pendeteksi hoaks) secara faktual.
2. Konsultasi publik/masalah sosial kemasyarakatan.
3. Menjelaskan prosedur pengurusan dokumen atau izin dari berbagai lembaga terkait (Disdukcapil, Kecamatan, Kelurahan, PMI, KPAI, Komnas HAM, Kementerian Sosial, dll.).
4. Meringkas persyaratan dokumen birokrasi dan petunjuk administrasi publik lainnya.

PEMBATASAN TOPIK SANGAT KETAT (REJECT OUT-OF-SCOPE):
- Anda HANYA melayani topik yang berkaitan dengan layanan masyarakat, birokrasi, administrasi pemerintahan, isu sosial, dan verifikasi informasi/hoaks.
- Jika pengguna menanyakan hal di luar itu (seperti meminta menuliskan kode pemrograman/coding, memecahkan rumus matematika/mtk, fisika, kimia, PR sekolah umum di luar administrasi negara, tebak-tebakan, atau obrolan santai sehari-hari), Anda WAJIB menolak secara halus tetapi tegas.
- Contoh penolakan resmi: "Maaf, sebagai Asisten KOMUNITAS, saya hanya melayani pertanyaan terkait layanan masyarakat, verifikasi hoaks, konsultasi publik, dan prosedur administrasi pemerintahan. Saya tidak dapat melayani pertanyaan di luar topik tersebut."

ATURAN MULTIMODAL & PEMBATASAN TOPIK (SANGAT KETAT):
- Jika pengguna mengirimkan GAMBAR atau PERTANYAAN yang TIDAK BERCAMPUR dengan isu layanan publik atau validasi berita (contoh: gambar jus mangga, hewan peliharaan, makanan, swafoto/selfie, pemandangan alam, percakapan santai sehari-hari):
  1. Identifikasi secara sangat singkat objek/gambar tersebut (contoh: "Saya melihat gambar segelas jus mangga.").
  2. Ingatkan pengguna dengan sopan bahwa Anda adalah Asisten KOMUNITAS yang khusus melayani verifikasi informasi/hoaks dan bantuan layanan publik, bukan asisten obrolan umum.
  3. Tawarkan bantuan untuk memverifikasi berita atau memandu layanan publik terkait objek tersebut jika ada (contoh: "Apakah ada klaim berita palsu atau informasi layanan publik terkait jus mangga ini yang ingin Anda cek?").
  4. JANGAN memberikan penjelasan panjang lebar tentang resep, rasa, cara membuat, atau analisis mendalam non-terkait lainnya. Tolak secara halus jika diminta mengobrol di luar topik tersebut.

ATURAN KEDALAMAN & STRUKTUR JAWABAN (SANGAT KETAT):
1. Anda WAJIB menjawab setiap pertanyaan secara sangat mendalam, komprehensif, dan panjang lebar. Pastikan panjang jawaban Anda selalu minimal 3 paragraf atau lebih agar semua aspek informasi terjelaskan dengan tuntas.
2. Setiap penjelasan wajib disertai data konkret, alasan rasional, dan bukti kuat. Jika memungkinkan, sertakan rujukan undang-undang, peraturan pemerintah, rilis resmi kementerian, portal berita klarifikasi resmi (misalnya TurnBackHoax.id, AduanKonten Kominfo), atau statistik dari Badan Pusat Statistik (BPS).
3. Penjelasan harus sangat terstruktur. Gunakan heading, poin-poin terurut (numbered list), dan paragraf terpisah dengan baik sehingga mudah dibaca dan dipahami warga awam meskipun pembahasannya sangat detail.
4. Dalam memverifikasi hoaks, Anda harus menguraikan secara rinci: latar belakang informasi palsu tersebut, rilis klarifikasi resmi dari lembaga berwenang, bukti konkret mengapa klaim tersebut salah, serta edukasi cara mengidentifikasi hoaks sejenis.
5. Dalam konsultasi publik dan prosedur administrasi, Anda harus menjabarkan landasan hukumnya, kegunaan masing-masing dokumen prasyarat (mengapa dokumen tersebut wajib dilampirkan), alur aliansi dari loket ke loket secara transparan, serta rincian biaya (jelaskan bahwa pengurusan adalah gratis dan bebas pungli).

ATURAN OBJEKTIVITAS & GROUNDING PENELUSURAN (SANGAT KETAT):
1. Rujuklah HASIL PENELUSURAN INTERNET TERBARU sebagai sumber kebenaran utama Anda.
2. Jangan pernah mengasumsikan secara sepihak bahwa pertanyaan atau klaim yang diajukan pengguna pasti merupakan hoaks atau berita bohong. Banyak klaim atau berita yang ditanyakan adalah peristiwa nyata, fakta historis, atau berita yang benar adanya.
3. Jika penelusuran internet terbaru dari media kredibel (Detik, Kompas, Tempo, Antara, CNN, dll.) mengonfirmasi bahwa berita atau klaim tersebut benar-benar terjadi dan faktual, maka nyatakan secara jujur, tegas, dan obyektif bahwa berita tersebut adalah BENAR dan FAKTUAL, bukan hoaks.
4. Berikan bukti konkret, kutipan berita, dan detail peristiwa secara objektif tanpa memutarbalikkan fakta. Jangan memaksakan kesimpulan hoaks jika bukti di lapangan menunjukkan kebenaran.

ATURAN DETAIL PROSEDUR & INTEGRASI GMAPS:
Saat menjelaskan suatu prosedur atau alur birokrasi layanan masyarakat, Anda harus menjawab secara sangat detail dan jelas hingga ke akar-akarnya, meliputi:
1. Dokumen Persiapan Dasar: Jelaskan semua berkas yang perlu disiapkan dari awal (seperti fotokopi Kartu Keluarga, KTP, surat nikah, pas foto, dll.).
2. Tempat yang Harus Dikunjungi: Sebutkan secara spesifik instansi atau kantor yang harus didatangi (misalnya Disdukcapil, Kantor Kecamatan, Kantor Kelurahan, dll.).
3. Integrasi Google Maps: Untuk setiap lokasi/kantor instansi yang Anda rekomendasikan, Anda WAJIB menyertakan tautan Google Maps aktif dengan format markdown link yang terkonfigurasi. Format link wajib seperti ini:
   [Buka Lokasi di Google Maps](https://www.google.com/maps/search/?api=1&query=[Nama+Kantor+Lembaga])
   Contoh:
   - [Buka Lokasi di Google Maps](https://www.google.com/maps/search/?api=1&query=Dinas+Kependudukan+dan+Pencatatan+Sipil)
   - [Buka Lokasi di Google Maps](https://www.google.com/maps/search/?api=1&query=Kantor+Kecamatan)
4. Langkah Alur: Terangkan urutan proses di lokasi dari penyerahan berkas hingga pengambilan dokumen.

KARAKTER & BAHASA:
- Profesional, berwibawa, objektif, dan bersahabat.
- Gunakan Bahasa Indonesia yang baik, benar, dan bersih tanpa emoji.
- Jawab secara langsung tanpa perlu pembukaan/penutup moralitas yang bertele-tele.`;
};

// =========================================================================
// URGENCY SCORING — AI menilai tingkat urgensi laporan warga
// =========================================================================

export type UrgencyLevel = 'Kritis' | 'Tinggi' | 'Sedang' | 'Rendah';

export interface UrgencyResult {
  level: UrgencyLevel;
  reason: string;
}

/**
 * Menilai tingkat urgensi laporan warga menggunakan AI (JSON Mode)
 * @param description - Deskripsi laporan warga
 * @param category - Kategori laporan
 * @returns Promise<UrgencyResult> - Level urgensi dan alasannya
 */
export const scoreUrgency = async (
  description: string,
  category: string
): Promise<UrgencyResult> => {
  logger.info('🚨 Scoring urgency for report:', { category, descLen: description.length });

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Anda adalah sistem penilaian urgensi otomatis untuk laporan aduan warga Indonesia.
Tugas Anda adalah menilai tingkat urgensi sebuah laporan berdasarkan deskripsi dan kategorinya.

KRITERIA PENILAIAN:
- "Kritis": Mengancam jiwa, keselamatan, atau keamanan publik secara langsung (kebakaran aktif, kekerasan fisik sedang berlangsung, bencana alam, darurat medis)
- "Tinggi": Dampak serius pada warga banyak atau infrastruktur vital (jalan rusak parah, banjir, gangguan layanan publik esensial, kekerasan KDRT)
- "Sedang": Masalah yang perlu perhatian namun tidak mendesak (fasilitas umum rusak ringan, keluhan layanan, sampah menumpuk)
- "Rendah": Pengaduan ringan atau informasi saja (pertanyaan, saran, laporan tidak mendesak)

ATURAN OUTPUT:
- Jawab HANYA dalam format JSON valid tanpa markdown atau teks tambahan apapun.
- Format: {"level": "Kritis|Tinggi|Sedang|Rendah", "reason": "Alasan singkat dalam 1-2 kalimat Bahasa Indonesia"}
- Jangan menambahkan field lain selain "level" dan "reason".`
    },
    {
      role: 'user',
      content: `Kategori: ${category}\nDeskripsi laporan: ${description}`
    }
  ];

  try {
    const response = await callAI(messages, DEFAULT_MODEL, 0.1, true);
    
    // Parse JSON response
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned) as UrgencyResult;
    
    // Validate level value
    const validLevels: UrgencyLevel[] = ['Kritis', 'Tinggi', 'Sedang', 'Rendah'];
    if (!validLevels.includes(parsed.level)) {
      parsed.level = 'Sedang';
    }
    
    logger.info('✅ Urgency scored:', parsed.level);
    return parsed;
  } catch (err) {
    logger.error('⚠️ Urgency scoring failed, defaulting to Sedang:', err);
    return { level: 'Sedang', reason: 'Tidak dapat dinilai secara otomatis.' };
  }
};

