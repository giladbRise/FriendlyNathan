import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for workflow generation
 * Allows 10 workflow generations per user per 15 minutes
 */
export const workflowGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per user
  message: {
    error: 'Rate limit exceeded, please wait',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Use user ID if available, otherwise fall back to IP
  keyGenerator: (req) => {
    const userId = (req as any).userId;
    return userId || req.ip || 'unknown';
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded, please wait',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * Rate limiter for login attempts
 * Allows 5 login attempts per IP per 15 minutes
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many login attempts, please try again later',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many login attempts, please try again later',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * General API rate limiter
 * Allows 100 requests per IP per minute
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests, please slow down',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
