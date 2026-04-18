const rateLimit = require('express-rate-limit');

// General: 100 req / minute per IP across all API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות — נסה שוב בעוד דקה' },
});

// Auth: strict — 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות כניסה — נסה שוב בעוד 15 דקות' },
  skipSuccessfulRequests: true,
});

// Upload: 20 requests / minute per IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי העלאות — נסה שוב בעוד דקה' },
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
