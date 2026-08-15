export const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
export const normalizeEmail = value => cleanText(value, 200).toLowerCase();
export const normalizePhone = value => cleanText(value, 30).replace(/[\s-]/g, '');
export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isPhone = value => /^\+?\d{10,15}$/.test(value.replace(/^0098/, '+98')) || /^09\d{9}$/.test(value);
export const toInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
export const orderCode = () => `SJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
export const publicUser = u => u ? ({ id: Number(u.id), name: u.name, email: u.email, phone: u.phone || '', role: u.role, createdAt: u.created_at }) : null;
