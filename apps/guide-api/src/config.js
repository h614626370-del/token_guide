import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(apiDir, '..', '..')

dotenv.config({ path: path.join(repoRoot, '.env') })
dotenv.config({ path: path.join(apiDir, '.env'), override: true })

const defaultDbPath = path.join(apiDir, 'data', 'guide-api.sqlite')
const defaultCorsOrigins = [
  'https://kkflow.org',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]

function normalizePrefix(value) {
  const raw = String(value || '/guide-api').trim()
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`
  return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed
}

function parseCsv(value, fallback) {
  if (!value) return fallback
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function normalizeSub2apiBase(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GUIDE_API_HOST: z.string().default('127.0.0.1'),
  GUIDE_API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  GUIDE_API_PREFIX: z.string().default('/guide-api'),
  GUIDE_API_DB_PATH: z.string().default(defaultDbPath),
  GUIDE_API_ADMIN_TOKEN: z.string().optional(),
  GUIDE_API_PUBLIC_ORIGIN: z.string().url().default('https://kkflow.org'),
  GUIDE_API_CORS_ORIGINS: z.string().optional(),
  GUIDE_API_BODY_LIMIT_BYTES: z.coerce.number().int().min(4096).max(1024 * 1024).default(65536),
  GUIDE_API_RATE_WINDOW_MS: z.coerce.number().int().min(10_000).default(10 * 60 * 1000),
  GUIDE_API_RATE_MAX: z.coerce.number().int().min(1).default(5),
  GUIDE_API_FEEDBACK_DAILY_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  GUIDE_API_TRUST_PROXY: z.string().optional(),
  GUIDE_API_IP_HASH_SALT: z.string().optional(),
  GUIDE_API_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  GUIDE_API_SUB2API_BASE_URL: z.string().optional(),
  GUIDE_API_SUB2API_ADMIN_API_KEY: z.string().optional(),
  GUIDE_API_PRICING_PLATFORMS: z.string().default('openai,anthropic,gemini,antigravity,grok'),
  GUIDE_API_PRICING_CACHE_TTL_MS: z.coerce.number().int().min(30_000).default(5 * 60 * 1000),
  GUIDE_API_PRICING_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8000),
  GUIDE_API_USD_TO_CNY: z.coerce.number().positive().default(6.8102),
})

const parsed = envSchema.parse(process.env)
const isProduction = parsed.NODE_ENV === 'production'
const warnings = []

let adminToken = parsed.GUIDE_API_ADMIN_TOKEN
if (!adminToken && !isProduction) {
  adminToken = 'dev-admin-token'
  warnings.push('GUIDE_API_ADMIN_TOKEN is not set; using dev-admin-token for local development.')
}
if (!adminToken && isProduction) {
  throw new Error('GUIDE_API_ADMIN_TOKEN is required in production.')
}

let ipHashSalt = parsed.GUIDE_API_IP_HASH_SALT
if (!ipHashSalt && !isProduction) {
  ipHashSalt = 'dev-guide-api-ip-salt'
  warnings.push('GUIDE_API_IP_HASH_SALT is not set; using a development salt.')
}
if (!ipHashSalt && isProduction) {
  throw new Error('GUIDE_API_IP_HASH_SALT is required in production.')
}

export const config = {
  nodeEnv: parsed.NODE_ENV,
  isProduction,
  host: parsed.GUIDE_API_HOST,
  port: parsed.GUIDE_API_PORT,
  apiPrefix: normalizePrefix(parsed.GUIDE_API_PREFIX),
  dbPath: path.resolve(parsed.GUIDE_API_DB_PATH),
  adminToken,
  publicOrigin: parsed.GUIDE_API_PUBLIC_ORIGIN.replace(/\/+$/, ''),
  corsOrigins: parseCsv(parsed.GUIDE_API_CORS_ORIGINS, defaultCorsOrigins),
  bodyLimitBytes: parsed.GUIDE_API_BODY_LIMIT_BYTES,
  rateWindowMs: parsed.GUIDE_API_RATE_WINDOW_MS,
  rateMax: parsed.GUIDE_API_RATE_MAX,
  feedbackDailyLimit: parsed.GUIDE_API_FEEDBACK_DAILY_LIMIT,
  trustProxy: parseBool(parsed.GUIDE_API_TRUST_PROXY, true),
  ipHashSalt,
  logLevel: parsed.GUIDE_API_LOG_LEVEL,
  sub2apiApiBase: normalizeSub2apiBase(parsed.GUIDE_API_SUB2API_BASE_URL),
  sub2apiAdminApiKey: parsed.GUIDE_API_SUB2API_ADMIN_API_KEY || '',
  pricingPlatforms: parseCsv(parsed.GUIDE_API_PRICING_PLATFORMS, ['openai', 'anthropic']),
  pricingCacheTtlMs: parsed.GUIDE_API_PRICING_CACHE_TTL_MS,
  pricingFetchTimeoutMs: parsed.GUIDE_API_PRICING_FETCH_TIMEOUT_MS,
  usdToCny: parsed.GUIDE_API_USD_TO_CNY,
}

export const configWarnings = warnings
