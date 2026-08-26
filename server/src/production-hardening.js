import fs from 'node:fs';
import { db } from './db.js';
import { config } from './config.js';

export function ensureProductionSchema() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_coupons_active_code ON coupons(is_active, code);
  `);
  try {
    db.exec(`
      UPDATE payments
      SET status='failed', updated_at=CURRENT_TIMESTAMP
      WHERE status='pending'
        AND id NOT IN (SELECT MAX(id) FROM payments WHERE status='pending' GROUP BY order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending_per_order
      ON payments(order_id) WHERE status='pending';
    `);
  } catch (error) {
    console.warn('Could not enforce one pending payment per order:', error.message);
  }
}

export function productionReadiness() {
  const isVercel=Boolean(process.env.VERCEL);
  const checks={
    environment: config.isProduction,
    https: !config.isProduction || (config.publicBaseUrl.startsWith('https://') && String(config.clientOrigin).startsWith('https://')),
    secureCookie: !config.isProduction || config.cookieSecure,
    jwtSecret: config.jwtSecret.length >= 32,
    adminPassword: config.admin.password.length >= 12 && config.admin.password !== 'Admin@123456',
    paymentConfigured: config.payment.isSandboxMode || Boolean(config.payment.merchantId),
    paymentLive: !config.payment.isSandboxMode,
    smsConfigured: !config.sms.enabled || (Boolean(config.sms.apiKey) && Boolean(config.sms.verifyTemplateId)),
    smsLive: config.sms.enabled && !config.sms.dryRun,
    smsAdminAlertConfigured: !config.sms.enabled || config.sms.adminMobiles.length > 0,
    storageSuitable: !isVercel,
    databaseReachable: fs.existsSync(config.databasePath)
  };
  return {
    ready: Object.entries(checks).filter(([key])=>!['environment','paymentLive','smsLive'].includes(key)).every(([,v])=>Boolean(v)),
    checks,
    warnings: [
      ...(isVercel ? ['Vercel serverless filesystem is not suitable for persistent SQLite databases or uploaded product images. Use a VPS/persistent volume or external database/object storage before serving customers.'] : []),
      ...(config.payment.isSandboxMode ? ['Payment sandbox bypass is enabled. Set IS_SANDBOX_MODE=false and configure ZARINPAL_MERCHANT_ID for live sales.'] : []),
      ...(config.sms.enabled && config.sms.dryRun ? ['SMS dry-run is enabled. Set SMS_DRY_RUN=false for real SMS.ir delivery.'] : []),
      ...(config.sms.enabled && !config.sms.adminMobiles.length ? ['No SMS_ADMIN_MOBILES is configured; admin order/payment alerts will be skipped.'] : [])
    ]
  };
}
