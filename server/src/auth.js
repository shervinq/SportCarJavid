import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { config } from './config.js';

const COOKIE = 'sj_session';

export function signSession(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: '7d', issuer: 'sport-car-javid' });
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' });
}

function resolveUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { issuer: 'sport-car-javid' });
    const user = db.prepare('SELECT id,name,email,phone,role,is_active,created_at FROM users WHERE id=?').get(Number(payload.sub));
    return user && user.is_active ? user : null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = resolveUser(req);
  next();
}

export function requireAuth(req, res, next) {
  req.user = resolveUser(req);
  if (!req.user) return res.status(401).json({ message: 'برای ادامه وارد حساب کاربری شوید.' });
  next();
}

export function requireAdmin(req, res, next) {
  req.user = resolveUser(req);
  if (!req.user) return res.status(401).json({ message: 'ورود ادمین الزامی است.' });
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'دسترسی ادمین لازم است.' });
  next();
}
