import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from './auth.js';
import { cleanText, isEmail, normalizeEmail, normalizePhone, publicUser } from './utils.js';

export function registerAuthRoutes(app, authLimiter) {
app.post('/api/auth/register', authLimiter, (req,res) => {
  const name = cleanText(req.body?.name, 100);
  const email = normalizeEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (name.length < 2 || !isEmail(email) || password.length < 8) return res.status(400).json({ message:'نام، ایمیل معتبر و رمز حداقل ۸ کاراکتری الزامی است.' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ message:'این ایمیل قبلاً ثبت شده است.' });
  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)').run(name,email,phone,hash,'customer');
  const user = db.prepare('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?').get(Number(result.lastInsertRowid));
  setSessionCookie(res, signSession(user));
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, (req,res) => {
  const identity = cleanText(req.body?.identity || req.body?.email, 200).toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=? OR phone=? LIMIT 1').get(identity, normalizePhone(identity));
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ message:'ایمیل/موبایل یا رمز عبور نادرست است.' });
  setSessionCookie(res, signSession(user));
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (_req,res) => { clearSessionCookie(res); res.json({ success:true }); });
app.get('/api/auth/me', (req,res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/auth/profile', requireAuth, (req,res) => {
  const name = cleanText(req.body?.name,100);
  const phone = normalizePhone(req.body?.phone);
  if (name.length < 2) return res.status(400).json({ message:'نام معتبر وارد کنید.' });
  db.prepare('UPDATE users SET name=?, phone=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name,phone,req.user.id);
  const user = db.prepare('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?').get(req.user.id);
  res.json({ user: publicUser(user) });
});
}
