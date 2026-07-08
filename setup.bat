@echo off
echo ===================================================
echo 🚀 SAHABATLKS AI BACKEND SETUP SCRIPT
echo ===================================================
echo.

:: 1. Create directory structure
echo 📂 Creating folder structure...
mkdir src\types 2>nul
mkdir src\utils 2>nul
mkdir src\services 2>nul
mkdir src\controllers 2>nul
mkdir src\routes 2>nul
echo.

:: 2. Writing tsconfig.json
echo 📄 Writing tsconfig.json...
powershell -NoProfile -Command "Set-Content -Path 'tsconfig.json' -Value '{`n  \"compilerOptions\": {`n    \"target\": \"ESNext\",`n    \"module\": \"ESNext\",`n    \"moduleResolution\": \"bundler\",`n    \"strict\": true,`n    \"esModuleInterop\": true,`n    \"skipLibCheck\": true,`n    \"forceConsistentCasingInFileNames\": true,`n    \"outDir\": \"./dist\",`n    \"rootDir\": \"./src\",`n    \"types\": [\"bun-types\"]`n  },`n  \"include\": [\"src/**/*\"],`n  \"exclude\": [\"node_modules\", \"dist\"]`n}'"

:: 3. Writing package.json (Corrected dependencies)
echo 📄 Writing package.json...
powershell -NoProfile -Command "Set-Content -Path 'package.json' -Value '{`n  \"name\": \"backend\",`n  \"module\": \"src/index.ts\",`n  \"type\": \"module\",`n  \"scripts\": {`n    \"dev\": \"bun run --watch src/index.ts\",`n    \"start\": \"bun run src/index.ts\"`n  },`n  \"devDependencies\": {`n    \"@types/bun\": \"latest\",`n    \"typescript\": \"^5.0.0\"`n  },`n  \"peerDependencies\": {`n    \"typescript\": \"^5.0.0\"`n  },`n  \"dependencies\": {`n    \"@hono/zod-validator\": \"^0.8.0\",`n    \"@supabase/supabase-js\": \"^2.49.1\",`n    \"hono\": \"^4.12.26\",`n    \"zod\": \"^4.4.3\"`n  }`n}'"

:: 4. Writing .env
echo 📄 Writing .env...
powershell -NoProfile -Command "Set-Content -Path '.env' -Value 'PORT=3000`nOPENROUTER_API_KEY=sk-or-v1-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`nOPENROUTER_BASE_URL=https://openrouter.ai/api/v1`nSUPABASE_URL=https://XXXXXXXXXXXXXXXXXXXXXXXXXXXXX.supabase.co`nSUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`nDEFAULT_MODEL=anthropic/claude-3.5-sonnet'"

:: 5. Writing src/types/index.ts
echo 📄 Writing src/types/index.ts...
powershell -NoProfile -Command "Set-Content -Path 'src/types/index.ts' -Value 'export interface ChatMessage {`n  role: '\''user'\'' | '\''assistant'\'' | '\''system'\'';`n  content: string;`n}`n`nexport interface ChatRequest {`n  message: string;`n  sessionId?: string;`n  history?: ChatMessage[];`n}`n`nexport interface ChatResponse {`n  content: string;`n  sessionId: string;`n  sources?: string[];`n}`n`nexport interface OpenRouterMessage {`n  role: '\''user'\'' | '\''assistant'\'' | '\''system'\'';`n  content: string;`n}`n`nexport interface OpenRouterRequest {`n  model: string;`n  messages: OpenRouterMessage[];`n  temperature?: number;`n  max_tokens?: number;`n}`n`nexport interface OpenRouterResponse {`n  choices: {`n    message: {`n      content: string;`n    };`n  }[];`n}`n`nexport interface ClaimValidationResult {`n  isCredible: boolean;`n  reasoning: string;`n  sources?: string[];`n}`n`nexport interface SummaryResult {`n  summary: string;`n  keyPoints?: string[];`n}'"

:: 6. Writing src/utils/logger.ts
echo 📄 Writing src/utils/logger.ts...
powershell -NoProfile -Command "Set-Content -Path 'src/utils/logger.ts' -Value 'export const logger = {`n  info: (...args: any[]) => console.log(\"[INFO]\", new Date().toISOString(), ...args),`n  error: (...args: any[]) => console.error(\"[ERROR]\", new Date().toISOString(), ...args),`n  warn: (...args: any[]) => console.warn(\"[WARN]\", new Date().toISOString(), ...args),`n  debug: (...args: any[]) => console.debug(\"[DEBUG]\", new Date().toISOString(), ...args),`n};'"

:: 7. Writing src/services/supabaseService.ts
echo 📄 Writing src/services/supabaseService.ts...
(
echo import { createClient } from '@supabase/supabase-js';
echo import { logger } from '../utils/logger';
echo const supabaseUrl = process.env.SUPABASE_URL!;
echo const supabaseKey = process.env.SUPABASE_ANON_KEY!;
echo export const supabase = createClient^(supabaseUrl, supabaseKey^);
echo export const saveChatHistory = async ^(sessionId: string, messages: any[]^): Promise^<void^> =^> {
echo   try {
echo     const { error } = await supabase.from^('chat_history'^).upsert^({ session_id: sessionId, messages: messages, updated_at: new Date^(^).toISOString^(^) }^);
echo     if ^(error^) throw error;
echo     logger.info^('✅ Chat history saved for session:', sessionId^);
echo   } catch ^(error^) {
echo     logger.error^('❌ Failed to save chat history:', error^);
echo     throw error;
echo   }
echo };
echo export const getChatHistory = async ^(sessionId: string^): Promise^<any[] ^| null^> =^> {
echo   try {
echo     const { data, error } = await supabase.from^('chat_history'^).select^('messages'^).eq^('session_id', sessionId^).single^(^);
echo     if ^(error^) {
echo       if ^(error.code === 'PGRST116'^) return null;
echo       throw error;
echo     }
echo     logger.info^('✅ Chat history retrieved for session:', sessionId^);
echo     return data?.messages ^|^| [];
echo   } catch ^(error^) {
echo     logger.error^('❌ Failed to get chat history:', error^);
echo     return null;
echo   }
echo };
echo export const deleteChatHistory = async ^(sessionId: string^): Promise^<void^> =^> {
echo   try {
echo     const { error } = await supabase.from^('chat_history'^).delete^(^).eq^('session_id', sessionId^);
echo     if ^(error^) throw error;
echo     logger.info^('🗑️ Chat history deleted for session:', sessionId^);
echo   } catch ^(error^) {
echo     logger.error^('❌ Failed to delete chat history:', error^);
echo     throw error;
echo   }
echo };
) > src\services\supabaseService.ts

:: 8. Writing src/services/openRouterService.ts
echo 📄 Writing src/services/openRouterService.ts...
(
echo import { OpenRouterRequest, OpenRouterResponse, ChatMessage, ClaimValidationResult, SummaryResult } from '../types';
echo import { logger } from '../utils/logger';
echo const API_KEY = process.env.OPENROUTER_API_KEY!;
echo const BASE_URL = process.env.OPENROUTER_BASE_URL!;
echo const DEFAULT_MODEL = process.env.DEFAULT_MODEL ^|^| 'anthropic/claude-3.5-sonnet';
echo export const callAI = async ^(messages: ChatMessage[], model: string = DEFAULT_MODEL, temperature: number = 0.7^): Promise^<string^> =^> {
echo   try {
echo     logger.info^('📤 Calling AI with model:', model^);
echo     const request: OpenRouterRequest = { model, messages: messages.map^(m =^> ^({ role: m.role, content: m.content }^)^), temperature, max_tokens: 1500 };
echo     const response = await fetch^(`${BASE_URL}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'SahabatLKS - AI Assistant' }, body: JSON.stringify^(request^) }^);
echo     if ^(!response.ok^) {
echo       const errorText = await response.text^(^);
echo       logger.error^('❌ OpenRouter API error:', response.status, errorText^);
echo       let errorMessage = `API error: ${response.status}`;
echo       try {
echo         const errorJson = JSON.parse^(errorText^);
echo         if ^(errorJson.error?.message^) errorMessage = errorJson.error.message;
echo       } catch {}
echo       throw new Error^(`OpenRouter API error: ${errorMessage}`^);
echo     }
echo     const data = await response.json^(^) as OpenRouterResponse;
echo     logger.info^('✅ AI response received'^);
echo     if ^(!data.choices ^|^| !data.choices[0] ^|^| !data.choices[0].message^) throw new Error^('Invalid response structure from AI'^);
echo     return data.choices[0].message.content;
echo   } catch ^(error^) {
echo     logger.error^('❌ AI service error:', error^);
echo     throw error;
echo   }
echo };
echo export const validateClaim = async ^(claim: string^): Promise^<ClaimValidationResult^> =^> {
echo   logger.info^('🔍 Validating claim:', claim.substring^(0, 100^) + '...'^);
echo   const systemPrompt = 'Anda adalah asisten AI yang ahli dalam memverifikasi informasi dan klaim. FORMAT JAWABAN (HARUS JSON VALID): { \"isCredible\": true/false, \"reasoning\": \"Penjelasan\" }';
echo   const messages: ChatMessage[] = [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Klaim yang perlu diverifikasi: "${claim}"` } ];
echo   try {
echo     const response = await callAI^(messages, DEFAULT_MODEL, 0.3^);
echo     const jsonMatch = response.match^(/{[\s\S]*}/^);
echo     if ^(jsonMatch^) return JSON.parse^(jsonMatch[0]^) as ClaimValidationResult;
echo     return { isCredible: false, reasoning: 'Tidak dapat memverifikasi klaim ini secara otomatis.' };
echo   } catch ^(error^) {
echo     return { isCredible: false, reasoning: 'Terjadi kesalahan dalam verifikasi.' };
echo   }
echo };
echo export const summarizeDocument = async ^(text: string^): Promise^<string^> =^> {
echo   logger.info^('📄 Summarizing document, length:', text.length^);
echo   const systemPrompt = 'Anda adalah asisten AI yang ahli dalam meringkas dokumen resmi dan prosedur.';
echo   const messages: ChatMessage[] = [ { role: 'system', content: systemPrompt }, { role: 'user', content: `Teks yang perlu diringkas:\n\n${text}` } ];
echo   try {
echo     return await callAI^(messages, DEFAULT_MODEL, 0.5^);
echo   } catch ^(error^) {
echo     return 'Maaf, terjadi kesalahan saat meringkas dokumen.';
echo   }
echo };
echo export const createSystemPrompt = ^(^) =^> {
echo   return 'Anda adalah SahabatLKS - asisten AI yang ramah, sabar, dan membantu untuk warga Indonesia.';
echo };
) > src\services\openRouterService.ts

:: 9. Writing src/controllers/chatController.ts
echo 📄 Writing src/controllers/chatController.ts...
(
echo import { Context } from 'hono';
echo import { callAI, createSystemPrompt, validateClaim, summarizeDocument } from '../services/openRouterService';
echo import { saveChatHistory, getChatHistory, deleteChatHistory } from '../services/supabaseService';
echo import { ChatMessage } from '../types';
echo import { logger } from '../utils/logger';
echo import { z } from 'zod';
echo const chatSchema = z.object^({ message: z.string^(^).min^(1, 'Pesan tidak boleh kosong'^), sessionId: z.string^(^).optional^(^) }^);
echo const validateSchema = z.object^({ claim: z.string^(^).min^(3, 'Klaim terlalu pendek'^) }^);
echo const summarizeSchema = z.object^({ text: z.string^(^).min^(10, 'Teks terlalu pendek untuk diringkas'^) }^);
echo export const chatController = async ^(c: Context^) =^> {
echo   try {
echo     const body = await c.req.json^(^);
echo     const validated = chatSchema.parse^(body^);
echo     const sessionId = validated.sessionId ^|^| `session_${Date.now^(^)}_${Math.random^(^).toString^(36^).substring^(7^)}`;
echo     let history = await getChatHistory^(sessionId^) ^|^| [];
echo     const messages: ChatMessage[] = [ { role: 'system', content: createSystemPrompt^(^) }, ...history.map^(h =^> ^({ role: h.role, content: h.content }^)^), { role: 'user', content: validated.message } ];
echo     const response = await callAI^(messages^);
echo     await saveChatHistory^(sessionId, [...history, { role: 'user', content: validated.message }, { role: 'assistant', content: response }]^);
echo     return c.json^({ content: response, sessionId, timestamp: new Date^(^).toISOString^(^) }^);
echo   } catch ^(error: any^) {
echo     if ^(error instanceof z.ZodError^) return c.json^({ error: 'Validasi gagal', details: error.issues.map^(e =^> e.message^) }, 400^);
echo     return c.json^({ error: 'Terjadi kesalahan.', message: error.message }, 500^);
echo   }
echo };
echo export const validateClaimController = async ^(c: Context^) =^> {
echo   try {
echo     const body = await c.req.json^(^);
echo     const validated = validateSchema.parse^(body^);
echo     const result = await validateClaim^(validated.claim^);
echo     return c.json^({ ...result, timestamp: new Date^(^).toISOString^(^) }^);
echo   } catch ^(error: any^) {
echo     if ^(error instanceof z.ZodError^) return c.json^({ error: 'Validasi gagal', details: error.issues.map^(e =^> e.message^) }, 400^);
echo     return c.json^({ error: 'Gagal memverifikasi klaim', message: error.message }, 500^);
echo   }
echo };
echo export const summarizeController = async ^(c: Context^) =^> {
echo   try {
echo     const body = await c.req.json^(^);
echo     const validated = summarizeSchema.parse^(body^);
echo     const summary = await summarizeDocument^(validated.text^);
echo     return c.json^({ summary, timestamp: new Date^(^).toISOString^(^) }^);
echo   } catch ^(error: any^) {
echo     if ^(error instanceof z.ZodError^) return c.json^({ error: 'Validasi gagal', details: error.issues.map^(e =^> e.message^) }, 400^);
echo     return c.json^({ error: 'Gagal meringkas dokumen', message: error.message }, 500^);
echo   }
echo };
echo export const getHistoryController = async ^(c: Context^) =^> {
echo   try {
echo     const sessionId = c.req.param^('sessionId'^);
echo     if ^(!sessionId^) return c.json^({ error: 'Session ID diperlukan' }, 400^);
echo     const history = await getChatHistory^(sessionId^);
echo     return c.json^({ history: history ^|^| [], sessionId, timestamp: new Date^(^).toISOString^(^) }^);
echo   } catch ^(error: any^) {
echo     return c.json^({ error: 'Gagal mengambil riwayat', message: error.message }, 500^);
echo   }
echo };
echo export const deleteHistoryController = async ^(c: Context^) =^> {
echo   try {
echo     const sessionId = c.req.param^('sessionId'^);
echo     if ^(!sessionId^) return c.json^({ error: 'Session ID diperlukan' }, 400^);
echo     await deleteChatHistory^(sessionId^);
echo     return c.json^({ success: true, sessionId, timestamp: new Date^(^).toISOString^(^) }^);
echo   } catch ^(error: any^) {
echo     return c.json^({ error: 'Gagal menghapus riwayat', message: error.message }, 500^);
echo   }
echo };
) > src\controllers\chatController.ts

:: 10. Writing src/routes/chat.ts
echo 📄 Writing src/routes/chat.ts...
(
echo import { Hono } from 'hono';
echo import { chatController, validateClaimController, summarizeController, getHistoryController, deleteHistoryController } from '../controllers/chatController';
echo const chat = new Hono^(^);
echo chat.post^('/', chatController^);
echo chat.post^('/validate', validateClaimController^);
echo chat.post^('/summarize', summarizeController^);
echo chat.get^('/history/:sessionId', getHistoryController^);
echo chat.delete^('/history/:sessionId', deleteHistoryController^);
echo export default chat;
) > src\routes\chat.ts

:: 11. Writing src/index.ts
echo 📄 Writing src/index.ts...
(
echo import { Hono } from 'hono';
echo import { cors } from 'hono/cors';
echo import { logger } from 'hono/logger';
echo import chatRoutes from './routes/chat';
echo const app = new Hono^(^);
echo app.use^('*', logger^(^)^);
echo app.use^('*', cors^({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], exposeHeaders: ['Content-Length', 'X-Requested-With'], maxAge: 86400 }^)^);
echo app.route^('/api/chat', chatRoutes^);
echo app.get^('/health', ^(c^) =^> c.json^({ status: 'ok', timestamp: new Date^(^).toISOString^(^), uptime: process.uptime^(^), version: '1.0.0' }^)^);
echo app.get^('/', ^(c^) =^> c.json^({ name: 'SahabatLKS AI API', version: '1.0.0', endpoints: { chat: { POST: '/api/chat', validate: '/api/chat/validate', summarize: '/api/chat/summarize', history: '/api/chat/history/:sessionId' }, health: '/health' } }^)^);
echo app.onError^((err, c^) =^> {
echo   console.error^('🔥 Global error:', err^);
echo   return c.json^({ error: 'Internal server error', message: err.message }, 500^);
echo }^);
echo const port = parseInt^(process.env.PORT ^|^| '3000'^);
echo console.log^('📡 Server running on: http://localhost:' + port^);
echo export default { port, fetch: app.fetch };
) > src\index.ts

:: 12. Writing redirect index.ts
echo 📄 Writing redirect index.ts...
echo // Redirect to src/index.ts > index.ts
echo import './src/index'; >> index.ts

:: 13. Installing dependencies
echo.
echo 📦 Running bun install...
call bun install

echo.
echo ===================================================
echo 🎉 SETUP COMPLETE! RUN THE SERVER WITH: bun run dev
echo ===================================================
pause
