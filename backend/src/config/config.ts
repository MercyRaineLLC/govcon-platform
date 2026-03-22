// =============================================================
// Config - Centralized environment configuration
// =============================================================
import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

const env = optional('NODE_ENV', 'development');
const jwtSecret = optional('JWT_SECRET', 'dev-secret-change-in-production');

if (env === 'production') {
  if (jwtSecret === 'dev-secret-change-in-production' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong value in production');
  }
}

export const config = {
  env,
  port: parseInt(optional('PORT', '3001'), 10),

  database: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },

  jwt: {
    secret: jwtSecret,
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

  uploads: {
    maxMb: parseInt(optional('MAX_UPLOAD_MB', '25'), 10),
  },

  gcp: {
    projectId: optional('GCP_PROJECT_ID', 'gov-con-491005'),
    bqDataset: optional('BQ_DATASET', 'govcon_analytics'),
    // Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json for Docker/CI.
    // Leave unset to use Application Default Credentials (gcloud auth).
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },

  isProduction: env === 'production',
  isDevelopment: env === 'development',
};
