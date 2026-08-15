import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const baseConfigPath = path.join(serverRoot, 'config', 'appsettings.json');
const localConfigPath = path.join(serverRoot, 'config', 'appsettings.local.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [key, value] of Object.entries(b || {})) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(a?.[key] || {}, value)
      : value;
  }
  return out;
};

let raw = readJson(baseConfigPath);
if (fs.existsSync(localConfigPath)) raw = deepMerge(raw, readJson(localConfigPath));

const envBool = (name, fallback) => {
  if (process.env[name] == null || process.env[name] === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
};

const publicBaseUrl = process.env.PUBLIC_BASE_URL || raw.App.PublicBaseUrl;
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const jwtSecret = process.env.JWT_SECRET || raw.Security.JwtSecret || 'dev-only-change-me-sport-car-javid';
const adminPassword = process.env.ADMIN_PASSWORD || raw.Admin.SeedPassword;
const clientOrigin = process.env.CLIENT_ORIGIN || raw.App.ClientOrigin;
const cookieSecure = envBool('COOKIE_SECURE', isProduction ? true : (raw.Security.CookieSecure ?? false));

if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}
if (isProduction && (adminPassword === 'Admin@123456' || adminPassword.length < 12)) {
  throw new Error('ADMIN_PASSWORD must be changed and contain at least 12 characters before production.');
}
if (isProduction && !cookieSecure) {
  throw new Error('COOKIE_SECURE must be true in production.');
}
if (isProduction && (!String(publicBaseUrl).startsWith('https://') || !String(clientOrigin).startsWith('https://'))) {
  throw new Error('PUBLIC_BASE_URL and CLIENT_ORIGIN must use HTTPS in production.');
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || raw.App.Port || 5000),
  publicBaseUrl: String(publicBaseUrl).replace(/\/$/, ''),
  clientOrigin,
  databasePath: path.resolve(serverRoot, process.env.DATABASE_PATH || './data/store.db'),
  jwtSecret,
  cookieSecure,
  payment: {
    isSandboxMode: envBool('IS_SANDBOX_MODE', raw.Payment.IsSandboxMode),
    merchantId: process.env.ZARINPAL_MERCHANT_ID || raw.Payment.ZarinPal.MerchantId || '',
    callbackUrl: process.env.ZARINPAL_CALLBACK_URL || raw.Payment.ZarinPal.CallbackUrl || `${String(publicBaseUrl).replace(/\/$/, '')}/api/payments/zarinpal/callback`,
    currency: raw.Payment.ZarinPal.Currency || 'IRT'
  },
  admin: {
    name: process.env.ADMIN_NAME || raw.Admin.SeedName,
    email: (process.env.ADMIN_EMAIL || raw.Admin.SeedEmail).toLowerCase(),
    password: adminPassword
  },
  store: {
    freeShippingThreshold: Number(raw.Store.FreeShippingThreshold || 5000000),
    tehranShippingCost: Number(raw.Store.TehranShippingCost || 180000),
    defaultShippingCost: Number(raw.Store.DefaultShippingCost || 220000),
    pendingOrderExpiryMinutes: Number(raw.Store.PendingOrderExpiryMinutes || 30)
  },
  serverRoot
};
