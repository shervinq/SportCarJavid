import { db } from './db.js';

export function ensureSmsSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS sms_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('login','reset')),
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    requested_ip TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    mobile TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'sms.ir',
    provider_message_id TEXT DEFAULT '',
    error TEXT DEFAULT '',
    entity_id TEXT DEFAULT '',
    payload_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone <> '';
  CREATE INDEX IF NOT EXISTS idx_sms_codes_phone_purpose ON sms_codes(phone,purpose,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sms_logs_created ON sms_logs(created_at DESC);
  `);
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone <> ''");
  } catch (error) {
    console.warn('Could not enforce unique phone index because existing duplicate phone values were found.', error.message);
  }
}
