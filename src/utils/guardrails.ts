/**
 * Utility for local AI Guardrails (AI Responsibility)
 * Detects toxic, pornographic, politically sensitive, or SARA keywords
 */

const TOXIC_KEYWORDS = [
  'anjing', 'babi', 'bangsat', 'kontol', 'memek', 'jancok', 'jancuk', 'goblok', 
  'tolol', 'ngentot', 'perek', 'pelacur', 'lonte', 'brengsek', 'bajingan', 'pantek'
];

const PORNO_KEYWORDS = [
  'bokep', 'porno', 'seksual', 'persetubuhan', 'mesum', 'hentai', 'telanjang', 
  'masturbasi', 'onani', 'sodomi', 'pemerkosaan', 'vulgar'
];

const POLITICAL_KEYWORDS = [
  'makar', 'gulingkan pemerintah', 'kudeta', 'pemberontakan', 'sabotase pemilu',
  'khilafah islamiyah', 'terorisme', 'teroris', 'separatis', 'opm', 'pki'
];

const SARA_KEYWORDS = [
  'cina kafir', 'suku primitif', 'kristenisasi', 'islamisasi paksa', 
  'sesat', 'pemuja setan', 'ras rasis', 'menghina agama', 'penistaan agama'
];

/**
 * Checks if a text violates any guardrail category
 * @param text The input message to evaluate
 * @returns boolean true if violation detected, false otherwise
 */
export const checkGuardrails = (text: string): boolean => {
  if (!text) return false;
  const cleanText = text.toLowerCase();

  // Check toxic
  for (const word of TOXIC_KEYWORDS) {
    if (cleanText.includes(word)) return true;
  }

  // Check porno
  for (const word of PORNO_KEYWORDS) {
    if (cleanText.includes(word)) return true;
  }

  // Check political
  for (const word of POLITICAL_KEYWORDS) {
    if (cleanText.includes(word)) return true;
  }

  // Check SARA
  for (const word of SARA_KEYWORDS) {
    if (cleanText.includes(word)) return true;
  }

  return false;
};

export const GUARDRAIL_REFUSAL = "Maaf, sebagai asisten AI KOMUNITAS yang bertanggung jawab (AI Responsibility), saya tidak dapat merespons pertanyaan yang mengandung unsur toxic, pornografi, politik sensitif, atau isu SARA. Silakan ajukan pertanyaan yang berkaitan dengan pelayanan publik, cek fakta, atau kebutuhan warga lainnya.";
