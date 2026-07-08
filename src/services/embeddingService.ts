import { logger } from '../utils/logger';

// Retrieve configurations from env
const API_KEY = process.env.OPENROUTER_API_KEY!;
const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';

/**
 * Generate a 1536-dimensional vector embedding for a given text
 * @param text - The input string to embed
 * @returns Promise<number[]> - 1536-dimensional float array
 */
export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    if (!API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not defined in environment variables');
    }

    logger.info('🧠 Generating embedding for query using:', EMBEDDING_MODEL);

    // Clean up text by removing newlines (standard practice for embeddings)
    const cleanedText = text.replace(/\n/g, ' ');

    const response = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'KOMUNITAS - Embeddings API'
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: cleanedText,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ Embedding API error:', response.status, errorText);
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      logger.error('❌ Invalid embedding response structure:', data);
      throw new Error('Invalid response structure from Embedding API');
    }

    logger.info('✅ Embedding generated successfully');
    return data.data[0].embedding;

  } catch (error) {
    logger.error('❌ Failed to generate embedding:', error);
    throw error;
  }
};
