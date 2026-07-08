/**
 * PII Redactor — Menyensor data identitas sensitif sebelum dikirim ke LLM
 * Responsible AI: Melindungi privasi warga sesuai UU PDP Indonesia
 *
 * Pattern yang di-redact:
 * - NIK (16 digit angka berturut-turut)
 * - Nomor telepon Indonesia (+62..., 08...)
 * - Nomor KK (16 digit, mirip NIK)
 * - Alamat email
 */

const NIK_PATTERN = /\b\d{16}\b/g;
const PHONE_PATTERN = /(\+62|62|0)[\s\-]?8[\d\s\-]{7,12}\b/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Menyensor/menghapus PII dari teks sebelum dikirim ke model AI
 * @param text - Teks asli yang mungkin mengandung data sensitif
 * @returns Teks yang sudah disensor
 */
export function redactPII(text: string): string {
  if (!text) return text;

  let redacted = text;

  // Redact NIK & Nomor KK (16 digit)
  redacted = redacted.replace(NIK_PATTERN, '[NIK_DISENSOR]');

  // Redact nomor telepon Indonesia
  redacted = redacted.replace(PHONE_PATTERN, '[TELEPON_DISENSOR]');

  // Redact alamat email
  redacted = redacted.replace(EMAIL_PATTERN, '[EMAIL_DISENSOR]');

  return redacted;
}

/**
 * Cek apakah teks mengandung PII
 * @param text - Teks yang akan diperiksa
 * @returns true jika mengandung PII
 */
export function containsPII(text: string): boolean {
  if (!text) return false;
  return (
    NIK_PATTERN.test(text) ||
    PHONE_PATTERN.test(text) ||
    EMAIL_PATTERN.test(text)
  );
}
