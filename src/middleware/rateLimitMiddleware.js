const rateLimit = require('express-rate-limit');

// Rate limiter for auth endpoints (stricter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per window (increased for development)
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    // Disable trust proxy validation - configured at Express app level with app.set('trust proxy', 1)
    validate: {
        xForwardedForHeader: false,
        trustProxy: false
    }
});

// Rate limiter for API endpoints
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    // Disable trust proxy validation - configured at Express app level with app.set('trust proxy', 1)
    validate: {
        xForwardedForHeader: false,
        trustProxy: false
    }
});

module.exports = {
    authLimiter,
    apiLimiter
};
