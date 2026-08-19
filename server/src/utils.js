export const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
export const normalizeEmail = value => cleanText(value, 200).toLowerCase();
export const normalizePhone = value => {
  const raw = cleanText(value, 40).replace(/[^\d+]/g, '');
  if (!raw) return '';
  let digits = raw.replace(/^\+/, '');
  if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98')) digits = digits.slice(2);
  if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`;
  return digits;
};
export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isPhone = value => /^09\d{9}$/.test(normalizePhone(value));
export const toInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
export const orderCode = () => `SJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
export const phonePlaceholderEmail = phone => `sms-${normalizePhone(phone)}@phone.sportcarjavid.local`;
export const isPhonePlaceholderEmail = email => /^sms-09\d{9}@phone\.sportcarjavid\.local$/i.test(String(email || ''));
export const publicUser = u => u ? ({ id: Number(u.id), name: u.name, email: isPhonePlaceholderEmail(u.email) ? '' : u.email, phone: u.phone || '', role: u.role, createdAt: u.created_at }) : null;
