/**
 * Utility logging sederhana dengan level berbeda
 * Membantu debugging dan monitoring aplikasi
 */

export const logger = {
  /**
   * Log informasi umum
   * @param args - Data yang akan di-log
   */
  info: (...args: any[]) => console.log('[INFO]', new Date().toISOString(), ...args),
  
  /**
   * Log error
   * @param args - Data error yang akan di-log
   */
  error: (...args: any[]) => console.error('[ERROR]', new Date().toISOString(), ...args),
  
  /**
   * Log peringatan
   * @param args - Data peringatan yang akan di-log
   */
  warn: (...args: any[]) => console.warn('[WARN]', new Date().toISOString(), ...args),
  
  /**
   * Log debug (hanya untuk development)
   * @param args - Data debug yang akan di-log
   */
  debug: (...args: any[]) => console.debug('[DEBUG]', new Date().toISOString(), ...args),
};
