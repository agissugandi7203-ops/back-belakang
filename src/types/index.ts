/**
 * Type definitions untuk aplikasi backend
 * Mendefinisikan semua interface yang digunakan di seluruh aplikasi
 */

// Interface untuk pesan chat
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any;
}

// Interface untuk request chat
export interface ChatRequest {
  message: string;
  sessionId?: string;
  history?: ChatMessage[];
}

// Interface untuk response chat
export interface ChatResponse {
  content: string;
  sessionId: string;
  sources?: string[];
}

// Interface untuk request ke OpenRouter
export interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any;
}

// Interface lengkap untuk request OpenRouter
export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: {
    type: 'json_object';
  };
}

// Interface untuk response dari OpenRouter
export interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

// Interface untuk hasil verifikasi klaim
export interface ClaimValidationResult {
  isCredible: boolean;
  reasoning: string;
  sources?: string[];
  confidence?: number;
}

// Interface untuk hasil ringkasan dokumen
export interface SummaryResult {
  summary: string;
  keyPoints?: string[];
}
