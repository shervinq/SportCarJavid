import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
export const db = new DatabaseSync(config.databasePath, { timeout: 5000 });
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

const nowSql = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${nowSql}),
  updated_at TEXT NOT NULL DEFAULT (${nowSql})
) STRICT;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0),
  old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  badge TEXT DEFAULT '',
  emoji TEXT DEFAULT '🛞',
  image_url TEXT DEFAULT '',
  gallery_json TEXT NOT NULL DEFAULT '[]',
  compatibility TEXT DEFAULT 'تمام خودروها',
  description TEXT DEFAULT '',
  rating REAL NOT NULL DEFAULT 5,
  featured INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${nowSql}),
  updated_at TEXT NOT NULL DEFAULT (${nowSql})
) STRICT;

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK(value > 0),
  min_total INTEGER NOT NULL DEFAULT 0,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${nowSql})
) STRICT;

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','processing','shipped','delivered','cancelled','payment_failed')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','failed','refunded')),
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT DEFAULT '',
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  province TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  postal_code TEXT DEFAULT '',
  shipping_method TEXT NOT NULL DEFAULT 'post',
  notes TEXT DEFAULT '',
  stock_reserved INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${nowSql}),
  updated_at TEXT NOT NULL DEFAULT (${nowSql}),
  FOREIGN KEY(user_id) REFERENCES users(id)
) STRICT;

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  line_total INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
) STRICT;

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'zarinpal',
  authority TEXT UNIQUE,
  ref_id TEXT DEFAULT '',
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded')),
  is_sandbox INTEGER NOT NULL DEFAULT 0,
  raw_response TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (${nowSql}),
  updated_at TEXT NOT NULL DEFAULT (${nowSql}),
  FOREIGN KEY(order_id) REFERENCES orders(id)
) STRICT;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (${nowSql}),
  FOREIGN KEY(user_id) REFERENCES users(id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_paid_per_order ON payments(order_id) WHERE status='paid';
`);

try { db.exec("ALTER TABLE products ADD COLUMN gallery_json TEXT NOT NULL DEFAULT '[]'"); } catch (error) {
  if (!String(error?.message || error).includes('duplicate column name')) throw error;
}

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function audit(userId, action, entity, entityId = '', details = {}) {
  db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)')
    .run(userId || null, action, entity, String(entityId || ''), JSON.stringify(details || {}));
}

export function restoreOrderStock(orderId) {
  return transaction(() => {
    const order = db.prepare('SELECT id, stock_reserved FROM orders WHERE id=?').get(orderId);
    if (!order || !order.stock_reserved) return false;
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id=?').all(orderId);
    const inc = db.prepare('UPDATE products SET stock=stock+?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
    for (const item of items) inc.run(item.quantity, item.product_id);
    db.prepare('UPDATE orders SET stock_reserved=0, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(orderId);
    return true;
  });
}

export function releaseExpiredOrders() {
  const expired = db.prepare(`SELECT id FROM orders WHERE status='pending_payment' AND payment_status='pending' AND stock_reserved=1 AND expires_at IS NOT NULL AND expires_at < ?`).all(new Date().toISOString());
  for (const row of expired) {
    restoreOrderStock(row.id);
    db.prepare("UPDATE orders SET status='payment_failed', payment_status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
    db.prepare("UPDATE payments SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='pending'").run(row.id);
  }
  return expired.length;
}

const seedProducts = [
  ['SJ-LIGHT-V90','هدلایت لنزو V90 Pro','light',3480000,3890000,8,'پرفروش','💡','تمام خودروها','نور سفید یخی، فن توربو بی‌صدا، ضمانت ۱۸ ماهه',4.9,1],
  ['SJ-LENS-X7','لنز بای‌لد سه اینچ X7','light',6250000,7100000,4,'ویژه','🔘','پژو، دنا، سمند','خط کات حرفه‌ای، نور بالا و پایین یکپارچه',4.8,1],
  ['SJ-TINT-UV400','دودی نانو سرامیک UV400','tint',1890000,2200000,14,'نصب رایگان','◼️','تمام خودروها','کاهش ۹۹٪ اشعه UV، دید شفاف از داخل',4.7,1],
  ['SJ-BODY-WING','بال اسپرت صندوق یونیورسال','body',2890000,null,6,'جدید','🏎️','دنا، پژو، ساینا','ABS درجه یک، رنگ مشکی پیانویی',4.6,0],
  ['SJ-CABIN-MAT5D','کف‌پوش پنج‌بعدی چرمی','cabin',2450000,2750000,11,'محبوب','▦','مدل خودرو انتخابی','قالب دقیق، ضدآب، لبه بلند و قابل شست‌وشو',4.9,1],
  ['SJ-EXHAUST-GATE','گیت اگزوز ریموت‌دار','exhaust',5700000,6200000,3,'صدای قابل تنظیم','🔥','تمام خودروها','ریموت دوحالته، استیل ضدزنگ، سایز ۲.۵ اینچ',4.8,1],
  ['SJ-SEC-STEELMATE','دزدگیر تصویری استیل‌میت','security',4980000,null,9,'ضمانت اصالت','🔐','تمام خودروها','ریموت تصویری، شوک‌سنسور و قفل کودک',4.7,0],
  ['SJ-GPS-JX','ردیاب GPS آهنربایی JX','security',3690000,4100000,7,'شارژدهی ۳۰ روز','📍','خودرو و موتورسیکلت','ردیابی آنلاین، هشدار حرکت و اپ فارسی',4.5,0],
  ['SJ-CABIN-CONSOLE','کنسول وسط پریمیوم','cabin',1650000,1950000,16,'ارسال امروز','🕹️','پراید، تیبا، کوییک','روکش چرم، جالیوانی و محفظه مخفی',4.4,0],
  ['SJ-ACC-AMBIENT','کیت نورپردازی داخل کابین','accessory',1290000,1490000,21,'اپلیکیشن‌دار','🌈','تمام خودروها','۶۴ رنگ، موزیک‌سینک و کنترل موبایل',4.6,0]
];

export function seedDatabase() {
  const existingAdmin = db.prepare('SELECT id,password_hash FROM users WHERE email=?').get(config.admin.email);
  const adminHash = bcrypt.hashSync(config.admin.password, 12);
  if (!existingAdmin) {
    db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)')
      .run(config.admin.name, config.admin.email, '', adminHash, 'admin');
  } else if (!bcrypt.compareSync(config.admin.password, existingAdmin.password_hash)) {
    db.prepare("UPDATE users SET name=?,password_hash=?,role='admin',is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(config.admin.name, adminHash, existingAdmin.id);
  }
  if (config.isProduction && config.admin.email !== 'admin@sportcarjavid.local') {
    db.prepare("UPDATE users SET is_active=0 WHERE email='admin@sportcarjavid.local' COLLATE NOCASE").run();
  }

  const count = Number(db.prepare('SELECT COUNT(*) AS c FROM products').get().c);
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO products(sku,title,category,price,old_price,stock,badge,emoji,compatibility,description,rating,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    transaction(() => seedProducts.forEach(p => stmt.run(...p)));
  }
}
