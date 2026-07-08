import { Context, Next } from 'hono';
import { logger } from './logger';

// Store request timestamps per IP address
const rateLimitMap = new Map<string, number[]>();

/**
 * Memory-based Sliding Window Rate Limiter Middleware
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export const rateLimiter = (limit: number, windowMs: number) => {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const now = Date.now();

    let clientRequests = rateLimitMap.get(ip) || [];

    // Filter out requests that are older than the sliding window
    clientRequests = clientRequests.filter(timestamp => now - timestamp < windowMs);

    // Check if limit is exceeded
    if (clientRequests.length >= limit) {
      logger.warn(`⚠️ Rate limit exceeded for IP: ${ip}`);
      
      const resetTime = clientRequests[0] + windowMs;
      const retryAfterSeconds = Math.ceil((resetTime - now) / 1000);

      c.header('Retry-After', retryAfterSeconds.toString());
      c.header('X-RateLimit-Limit', limit.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

      return c.json({
        error: 'Too Many Requests',
        message: `Terlalu banyak permintaan. Silakan coba lagi dalam ${retryAfterSeconds} detik.`,
        retryAfter: retryAfterSeconds
      }, 429);
    }

    // Record the current request timestamp
    clientRequests.push(now);
    rateLimitMap.set(ip, clientRequests);

    // Set rate limit headers
    const remaining = limit - clientRequests.length;
    const resetTime = clientRequests[0] + windowMs;
    c.header('X-RateLimit-Limit', limit.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

    await next();
  };
};

// Periodically clean up idle IPs from memory to prevent memory leaks (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const tenMinutesMs = 10 * 60 * 1000;
  
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const validTimestamps = timestamps.filter(timestamp => now - timestamp < tenMinutesMs);
    if (validTimestamps.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, validTimestamps);
    }
  }
}, 10 * 60 * 1000);
