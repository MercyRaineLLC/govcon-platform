"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// =============================================================
// Config - Centralized environment configuration
// =============================================================
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function required(key) {
    const val = process.env[key];
    if (!val)
        throw new Error(`Missing required environment variable: ${key}`);
    return val;
}
function optional(key, fallback) {
    return process.env[key] || fallback;
}
exports.config = {
    env: optional('NODE_ENV', 'development'),
    port: parseInt(optional('PORT', '3001'), 10),
    database: {
        url: required('DATABASE_URL'),
    },
    redis: {
        url: optional('REDIS_URL', 'redis://localhost:6379'),
    },
    jwt: {
        secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
        expiresIn: optional('JWT_EXPIRES_IN', '8h'),
    },
    sam: {
        apiKey: optional('SAM_API_KEY', ''),
        baseUrl: optional('SAM_BASE_URL', 'https://api.sam.gov/opportunities/v2'),
    },
    usaSpending: {
        baseUrl: optional('USASPENDING_BASE_URL', 'https://api.usaspending.gov/api/v2'),
    },
    rateLimit: {
        windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '900000'), 10),
        max: parseInt(optional('RATE_LIMIT_MAX', '500'), 10),
    },
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
};
//# sourceMappingURL=config.js.map