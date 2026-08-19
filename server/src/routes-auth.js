import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, transaction } from './db.js';
import { config } from './config.js';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from './auth.js';
import { cleanText, isEmail, isPhone, normalizeEmail, normalizePhone, phonePlaceholderEmail, publicUser } from './utils.js';
import { sendVerifyCode } from './sms.js';

const codeHash = (phone, purpose, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${phone}:${purpose}:${code}`).digest('hex');
const clientIp = req => cleanText(req.ip || req.socket?.remoteAddress || '', 100);

function cleanupCodes() {
  db.prepare("DELETE FROM sms_codes WHERE (consumed_at IS NOT NULL OR expires_at < ?) AND created_at < datetime('now','-1 day')").run(new Date().toISOString());
}

function latestCode(phone, purpose) {
  return db.prepare(`SELECT * FROM sms_codes WHERE phone=? AND purpose=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`).get(phone, purpose);
}

function verifyOtp(phone, purpose, code) {
  const saved = latestCode(phone, purpose);
  if (!saved || saved.expires_at < new Date().toISOString()) {
    throw Object.assign(new Error('کد تایید منقضی شده است. کد جدید دریافت کنید.'), { status:400 });
  }
  if (Number(saved.attempts) >= config.sms.maxOtpAttempts) {
    throw Object.assign(new Error('تعداد تلاش مجاز تمام شده است. کد جدید دریافت کنید.'), { status:429 });
  }
  const expected = Buffer.from(saved.code_hash, 'hex');
  const actual = Buffer.from(codeHash(phone, purpose, code), 'hex');
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!ok) {
    db.prepare('UPDATE sms_codes SET attempts=attempts+1 WHERE id=?').run(saved.id);
    throw Object.assign(new Error('کد تایید اشتباه است.'), { status:400 });
  }
  db.prepare('UPDATE sms_codes SET consumed_at=?, attempts=attempts+1 WHERE id=?').run(new Date().toISOString(), saved.id);
  return saved;
}

async function issueCode(req, phone, purpose) {
  cleanupCodes();
  const normalized = normalizePhone(phone);
  if (!isPhone(normalized)) throw Object.assign(new Error('شماره موبایل معتبر نیست.'), { status:400 });

  const previous = latestCode(normalized, purpose);
  if (previous) {
    const created = new Date(previous.created_at).getTime();
    const waitMs = config.sms.resendCooldownSeconds * 1000 - (Date.now() - created);
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      throw Object.assign(new Error(`برای ارسال مجدد ${seconds} ثانیه صبر کنید.`), { status:429, retryAfter:seconds });
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + config.sms.otpTtlSeconds * 1000).toISOString();
  const row = db.prepare('INSERT INTO sms_codes(phone,purpose,code_hash,expires_at,requested_ip) VALUES(?,?,?,?,?)')
    .run(normalized, purpose, codeHash(normalized, purpose, code), expiresAt, clientIp(req));
  try {
    await sendVerifyCode(normalized, code, purpose);
  } catch (error) {
    db.prepare('UPDATE sms_codes SET consumed_at=? WHERE id=?').run(new Date().toISOString(), Number(row.lastInsertRowid));
    throw error;
  }
  return { expiresIn:config.sms.otpTtlSeconds, resendAfter:config.sms.resendCooldownSeconds };
}

export function registerAuthRoutes(app, authLimiter, smsLimiter) {
app.post('/api/auth/register', authLimiter, (req,res) => {
  const name = cleanText(req.body?.name, 100);
  const email = normalizeEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (name.length < 2 || !isEmail(email) || password.length < 8) return res.status(400).json({ message:'نام، ایمیل معتبر و رمز حداقل ۸ کاراکتری الزامی است.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ message:'شماره موبایل معتبر نیست.' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ message:'این ایمیل قبلاً ثبت شده است.' });
  if (phone && db.prepare("SELECT id FROM users WHERE phone=? AND phone<>''").get(phone)) return res.status(409).json({ message:'این شماره موبایل قبلاً ثبت شده است.' });
  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)').run(name,email,phone,hash,'customer');
  const user = db.prepare('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?').get(Number(result.lastInsertRowid));
  setSessionCookie(res, signSession(user));
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, (req,res) => {
  const identityRaw = cleanText(req.body?.identity || req.body?.email, 200);
  const identity = identityRaw.toLowerCase();
  const phone = normalizePhone(identityRaw);
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=? OR phone=? LIMIT 1').get(identity, phone);
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ message:'ایمیل/موبایل یا رمز عبور نادرست است.' });
  setSessionCookie(res, signSession(user));
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/request-otp', smsLimiter, async (req,res) => {
  const result = await issueCode(req, req.body?.phone, 'login');
  res.json({ success:true, ...result });
});

app.post('/api/auth/verify-otp', smsLimiter, (req,res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = cleanText(req.body?.code, 10);
  if (!isPhone(phone) || !/^\d{6}$/.test(code)) return res.status(400).json({ message:'شماره موبایل و کد ۶ رقمی را صحیح وارد کنید.' });
  verifyOtp(phone, 'login', code);
  let user = db.prepare('SELECT * FROM users WHERE phone=? LIMIT 1').get(phone);
  if (user && !user.is_active) return res.status(403).json({ message:'این حساب غیرفعال شده است.' });
  if (!user) {
    const generatedPassword = crypto.randomBytes(32).toString('hex');
    const result = db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)')
      .run('کاربر اسپرت جاوید', phonePlaceholderEmail(phone), phone, bcrypt.hashSync(generatedPassword, 12), 'customer');
    user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid));
  }
  setSessionCookie(res, signSession(user));
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/password/request-reset', smsLimiter, async (req,res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!isPhone(phone)) return res.status(400).json({ message:'شماره موبایل معتبر نیست.' });
  const user = db.prepare('SELECT id,is_active FROM users WHERE phone=? LIMIT 1').get(phone);
  if (user?.is_active) await issueCode(req, phone, 'reset');
  res.json({ success:true, message:'اگر این شماره در سایت ثبت شده باشد، کد بازیابی ارسال می‌شود.', expiresIn:config.sms.otpTtlSeconds, resendAfter:config.sms.resendCooldownSeconds });
});

app.post('/api/auth/password/reset', smsLimiter, (req,res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = cleanText(req.body?.code, 10);
  const password = String(req.body?.password || '');
  if (!isPhone(phone) || !/^\d{6}$/.test(code) || password.length < 8) return res.status(400).json({ message:'شماره، کد ۶ رقمی و رمز حداقل ۸ کاراکتری لازم است.' });
  const user = db.prepare('SELECT * FROM users WHERE phone=? AND is_active=1 LIMIT 1').get(phone);
  if (!user) return res.status(400).json({ message:'کد تایید معتبر نیست.' });
  verifyOtp(phone, 'reset', code);
  transaction(() => {
    db.prepare('UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(bcrypt.hashSync(password,12),user.id);
    db.prepare("UPDATE sms_codes SET consumed_at=COALESCE(consumed_at,?) WHERE phone=? AND purpose='reset'").run(new Date().toISOString(),phone);
  });
  const updated = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  setSessionCookie(res, signSession(updated));
  res.json({ success:true, user:publicUser(updated) });
});

app.post('/api/auth/logout', (_req,res) => { clearSessionCookie(res); res.json({ success:true }); });
app.get('/api/auth/me', (req,res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/auth/profile', requireAuth, (req,res) => {
  const name = cleanText(req.body?.name,100);
  const phone = normalizePhone(req.body?.phone);
  if (name.length < 2) return res.status(400).json({ message:'نام معتبر وارد کنید.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ message:'شماره موبایل معتبر نیست.' });
  const duplicate = phone ? db.prepare('SELECT id FROM users WHERE phone=? AND id<>? LIMIT 1').get(phone,req.user.id) : null;
  if (duplicate) return res.status(409).json({ message:'این شماره موبایل به حساب دیگری متصل است.' });
  db.prepare('UPDATE users SET name=?, phone=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name,phone,req.user.id);
  const user = db.prepare('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?').get(req.user.id);
  res.json({ user: publicUser(user) });
});
}
