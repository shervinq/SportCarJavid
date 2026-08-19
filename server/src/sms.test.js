import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { after } from 'node:test';

process.env.NODE_ENV = 'development';
process.env.DATABASE_PATH = './data/test-sms.db';
process.env.SMS_ENABLED = 'true';
process.env.SMS_DRY_RUN = 'true';
process.env.SMS_API_KEY = 'test-key';
process.env.SMS_LINE_NUMBER = '30000000000000';
process.env.SMS_VERIFY_TEMPLATE_ID = '12345';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-only';

const { config } = await import('./config.js');
const { db } = await import('./db.js');
const { ensureSmsSchema } = await import('./sms-store.js');
ensureSmsSchema();
const { normalizePhone, isPhone, phonePlaceholderEmail, publicUser } = await import('./utils.js');
const { sendTextSms, sendVerifyCode } = await import('./sms.js');

after(() => {
  try { db.close(); } catch {}
  try { fs.rmSync(config.databasePath, { force:true }); } catch {}
  try { fs.rmSync(`${config.databasePath}-shm`, { force:true }); } catch {}
  try { fs.rmSync(`${config.databasePath}-wal`, { force:true }); } catch {}
});

test('Iran mobile numbers are normalized consistently', () => {
  assert.equal(normalizePhone('+98 912-123-4567'), '09121234567');
  assert.equal(normalizePhone('00989121234567'), '09121234567');
  assert.equal(normalizePhone('9121234567'), '09121234567');
  assert.equal(isPhone('09121234567'), true);
});

test('phone-only accounts hide internal placeholder email', () => {
  const email = phonePlaceholderEmail('09121234567');
  const user = publicUser({ id:1, name:'Test', email, phone:'09121234567', role:'customer', created_at:new Date().toISOString() });
  assert.equal(user.email, '');
});

test('verify SMS supports dry-run without provider network access', async () => {
  const result = await sendVerifyCode('09121234567', '123456', 'login');
  assert.equal(result.dryRun, true);
  const log = db.prepare("SELECT * FROM sms_logs WHERE kind='otp_login' ORDER BY id DESC LIMIT 1").get();
  assert.equal(log.mobile, '09121234567');
  assert.equal(log.status, 'dry_run');
});

test('transactional SMS supports dry-run and logs the attempt', async () => {
  const result = await sendTextSms(['09121234567'], 'test message', { kind:'test_notification', entityId:'42' });
  assert.equal(result.dryRun, true);
  const log = db.prepare("SELECT * FROM sms_logs WHERE kind='test_notification' ORDER BY id DESC LIMIT 1").get();
  assert.equal(log.entity_id, '42');
  assert.equal(log.status, 'dry_run');
});
