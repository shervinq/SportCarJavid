import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const baseConfigPath = path.join(serverRoot, 'config', 'appsettings.json');
const localConfigPath = path.join(serverRoot, 'config', 'appsettings.local.json');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [key, value] of Object.entries(b || {})) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? deepMerge(a?.[key] || {}, value) : value;
  }
  return out;
};
const envBool = (name, fallback) => {
  if (process.env[name] == null || process.env[name] === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
};
const envList = name => String(process.env[name] || '').split(',').map(v => v.trim()).filter(Boolean);
const envNumber = (name, fallback) => process.env[name] == null || process.env[name] === '' ? Number(fallback) : Number(process.env[name]);

let raw = readJson(baseConfigPath);
if (fs.existsSync(localConfigPath)) raw = deepMerge(raw, readJson(localConfigPath));

const publicBaseUrl = process.env.PUBLIC_BASE_URL || raw.App.PublicBaseUrl;
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const jwtSecret = process.env.JWT_SECRET || raw.Security.JwtSecret || 'dev-only-change-me-sport-car-javid';
const adminPassword = process.env.ADMIN_PASSWORD || raw.Admin.SeedPassword;
const clientOrigin = process.env.CLIENT_ORIGIN || raw.App.ClientOrigin;
const cookieSecure = envBool('COOKIE_SECURE', isProduction ? true : (raw.Security.CookieSecure ?? false));
const paymentSandbox = envBool('IS_SANDBOX_MODE', raw.Payment.IsSandboxMode);
const merchantId = process.env.ZARINPAL_MERCHANT_ID || raw.Payment.ZarinPal.MerchantId || '';
const smsEnabled = envBool('SMS_ENABLED', false);
const smsDryRun = envBool('SMS_DRY_RUN', false);
const smsApiKey = process.env.SMS_API_KEY || '';
const smsLineNumber = process.env.SMS_LINE_NUMBER || '';
const smsVerifyTemplateId = Number(process.env.SMS_VERIFY_TEMPLATE_ID || 0);

if (isProduction && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production.');
if (isProduction && (adminPassword === 'Admin@123456' || adminPassword.length < 12)) throw new Error('ADMIN_PASSWORD must be changed and contain at least 12 characters before production.');
if (isProduction && !cookieSecure) throw new Error('COOKIE_SECURE must be true in production.');
if (isProduction && (!String(publicBaseUrl).startsWith('https://') || !String(clientOrigin).startsWith('https://'))) throw new Error('PUBLIC_BASE_URL and CLIENT_ORIGIN must use HTTPS in production.');
if (isProduction && !paymentSandbox && !merchantId) throw new Error('ZARINPAL_MERCHANT_ID is required when production payment sandbox is disabled.');
if (isProduction && smsEnabled && !smsDryRun && (!smsApiKey || !smsVerifyTemplateId)) throw new Error('SMS_API_KEY and SMS_VERIFY_TEMPLATE_ID are required when SMS is enabled in production.');

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || raw.App.Port || 5000),
  publicBaseUrl: String(publicBaseUrl).replace(/\/$/, ''),
  clientOrigin,
  databasePath: path.resolve(serverRoot, process.env.DATABASE_PATH || './data/store.db'),
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR || './data/uploads'),
  jwtSecret,
  cookieSecure,
  sms: {
    enabled: smsEnabled,
    dryRun: smsDryRun,
    apiKey: smsApiKey,
    lineNumber: smsLineNumber,
    verifyTemplateId: smsVerifyTemplateId,
    resetTemplateId: Number(process.env.SMS_RESET_TEMPLATE_ID || process.env.SMS_VERIFY_TEMPLATE_ID || 0),
    baseUrl: String(process.env.SMS_BASE_URL || 'https://api.sms.ir/v1').replace(/\/$/, ''),
    adminMobiles: envList('SMS_ADMIN_MOBILES'),
    otpTtlSeconds: Math.max(60, envNumber('SMS_OTP_TTL_SECONDS', 120)),
    resendCooldownSeconds: Math.max(30, envNumber('SMS_RESEND_COOLDOWN_SECONDS', 60)),
    maxOtpAttempts: Math.max(3, envNumber('SMS_MAX_OTP_ATTEMPTS', 5))
  },
  payment: {
    isSandboxMode: paymentSandbox,
    merchantId,
    callbackUrl: process.env.ZARINPAL_CALLBACK_URL || raw.Payment.ZarinPal.CallbackUrl || `${String(publicBaseUrl).replace(/\/$/, '')}/api/payments/zarinpal/callback`,
    currency: process.env.ZARINPAL_CURRENCY || raw.Payment.ZarinPal.Currency || 'IRT'
  },
  admin: {
    name: process.env.ADMIN_NAME || raw.Admin.SeedName,
    email: (process.env.ADMIN_EMAIL || raw.Admin.SeedEmail).toLowerCase(),
    password: adminPassword
  },
  store: {
    freeShippingThreshold: Math.max(0, envNumber('FREE_SHIPPING_THRESHOLD', raw.Store.FreeShippingThreshold || 5000000)),
    tehranShippingCost: Math.max(0, envNumber('TEHRAN_SHIPPING_COST', raw.Store.TehranShippingCost || 180000)),
    defaultShippingCost: Math.max(0, envNumber('DEFAULT_SHIPPING_COST', raw.Store.DefaultShippingCost || 220000)),
    pendingOrderExpiryMinutes: Math.max(5, envNumber('PENDING_ORDER_EXPIRY_MINUTES', raw.Store.PendingOrderExpiryMinutes || 30))
  },
  serverRoot
};
