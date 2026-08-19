import { config } from './config.js';
import { db } from './db.js';
import { normalizePhone } from './utils.js';

const provider = 'sms.ir';
const configured = () => Boolean(config.sms.enabled && config.sms.apiKey && config.sms.verifyTemplateId);

function logSms({ kind, mobile, status, providerId = '', error = '', entityId = '', payload = {} }) {
  try {
    db.prepare(`INSERT INTO sms_logs(kind,mobile,status,provider_message_id,error,entity_id,payload_json) VALUES(?,?,?,?,?,?,?)`)
      .run(kind, normalizePhone(mobile), status, String(providerId || ''), String(error || '').slice(0,1000), String(entityId || ''), JSON.stringify(payload || {}));
  } catch (e) {
    console.error('SMS log failed', e);
  }
}

async function smsRequest(path, payload) {
  if (!config.sms.enabled) return { skipped: true, reason: 'disabled' };
  if (!config.sms.apiKey) throw Object.assign(new Error('SMS_API_KEY is not configured.'), { code: 'SMS_NOT_CONFIGURED' });
  if (config.sms.dryRun) return { dryRun: true, data: { messageId: `DRY-${Date.now()}` } };

  const response = await fetch(`${config.sms.baseUrl}/${path.replace(/^\//,'')}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-api-key': config.sms.apiKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status === 0) {
    const message = body?.message || body?.messageText || `SMS.ir HTTP ${response.status}`;
    const error = new Error(message);
    error.providerResponse = body;
    throw error;
  }
  return body;
}

export function smsPublicStatus() {
  return {
    enabled: config.sms.enabled,
    configured: configured(),
    dryRun: config.sms.dryRun
  };
}

export async function sendVerifyCode(phone, code, purpose = 'login') {
  const mobile = normalizePhone(phone);
  const templateId = purpose === 'reset' ? config.sms.resetTemplateId : config.sms.verifyTemplateId;
  if (!config.sms.enabled) throw Object.assign(new Error('ارسال پیامک در حال حاضر غیرفعال است.'), { status: 503 });
  if (!config.sms.apiKey || !templateId) throw Object.assign(new Error('سرویس پیامک هنوز کامل تنظیم نشده است.'), { status: 503 });
  const payload = {
    Mobile: mobile,
    TemplateId: templateId,
    Parameters: [{ name: 'CODE', value: String(code) }]
  };
  try {
    const result = await smsRequest('send/verify', payload);
    const messageId = result?.data?.messageId || result?.data?.MessageId || result?.messageId || '';
    logSms({ kind: `otp_${purpose}`, mobile, status: config.sms.dryRun ? 'dry_run' : 'sent', providerId: messageId, payload: { templateId } });
    return result;
  } catch (error) {
    logSms({ kind: `otp_${purpose}`, mobile, status: 'failed', error: error.message, payload: { templateId } });
    throw Object.assign(new Error('ارسال کد تایید با مشکل مواجه شد. دوباره تلاش کنید.'), { status: 502, cause: error });
  }
}

export async function sendTextSms(mobiles, message, { kind = 'notification', entityId = '' } = {}) {
  let targets = [...new Set((Array.isArray(mobiles) ? mobiles : [mobiles]).map(normalizePhone).filter(Boolean))];
  if (entityId) targets = targets.filter(mobile => !db.prepare("SELECT id FROM sms_logs WHERE kind=? AND entity_id=? AND mobile=? AND status IN ('sent','dry_run') LIMIT 1").get(kind,String(entityId),mobile));
  if (!targets.length || !config.sms.enabled) return { skipped: true };
  if (!config.sms.apiKey || !config.sms.lineNumber) {
    console.warn('SMS notification skipped: API key or line number is missing.');
    return { skipped: true, reason: 'not-configured' };
  }
  const payload = {
    lineNumber: Number(config.sms.lineNumber),
    MessageText: String(message),
    Mobiles: targets,
    SendDateTime: null
  };
  try {
    const result = await smsRequest('send/bulk', payload);
    const packId = result?.data?.packId || result?.data?.PackId || result?.packId || '';
    for (const mobile of targets) logSms({ kind, mobile, status: config.sms.dryRun ? 'dry_run' : 'sent', providerId: packId, entityId, payload: { packId } });
    return result;
  } catch (error) {
    for (const mobile of targets) logSms({ kind, mobile, status: 'failed', error: error.message, entityId });
    console.error(`SMS notification failed (${kind})`, error);
    return { failed: true, error: error.message };
  }
}

const toman = value => new Intl.NumberFormat('fa-IR').format(Number(value || 0));
const faDateTime = value => new Intl.DateTimeFormat('fa-IR', { timeZone:'Asia/Tehran', dateStyle:'short', timeStyle:'short' }).format(new Date(value || Date.now()));

export async function notifyOrderCreated(order) {
  const customer = order.receiver_phone ? sendTextSms(order.receiver_phone,
    `اسپرت جاوید\nسفارش ${order.order_code} در ${faDateTime(order.created_at)} ثبت شد.\nمبلغ: ${toman(order.total)} تومان\nوضعیت: در انتظار پرداخت`,
    { kind:'order_created_customer', entityId: order.id }) : Promise.resolve({ skipped:true });
  const admin = config.sms.adminMobiles.length ? sendTextSms(config.sms.adminMobiles,
    `اسپرت جاوید - سفارش جدید\nکد: ${order.order_code}\nزمان: ${faDateTime(order.created_at)}\nمشتری: ${order.receiver_name}\nمبلغ: ${toman(order.total)} تومان`,
    { kind:'order_created_admin', entityId: order.id }) : Promise.resolve({ skipped:true });
  return Promise.allSettled([customer, admin]);
}

export async function notifyPaymentSuccess(order, refId = '') {
  const message = `اسپرت جاوید\nپرداخت سفارش ${order.order_code} با موفقیت انجام شد.${refId ? `\nکد پیگیری پرداخت: ${refId}` : ''}\nسفارش وارد مرحله پردازش شد.`;
  const customer = order.receiver_phone ? sendTextSms(order.receiver_phone, message, { kind:'payment_success_customer', entityId: order.id }) : Promise.resolve({skipped:true});
  const admin = config.sms.adminMobiles.length ? sendTextSms(config.sms.adminMobiles,
    `اسپرت جاوید - پرداخت موفق\nسفارش: ${order.order_code}\nمبلغ: ${toman(order.total)} تومان${refId ? `\nپیگیری: ${refId}` : ''}`,
    { kind:'payment_success_admin', entityId: order.id }) : Promise.resolve({skipped:true});
  return Promise.allSettled([customer, admin]);
}

export async function notifyOrderStatus(order, status) {
  const labels = { processing:'در حال پردازش', shipped:'ارسال شده', delivered:'تحویل شده', cancelled:'لغو شده' };
  if (!order?.receiver_phone || !labels[status]) return { skipped:true };
  return sendTextSms(order.receiver_phone,
    `اسپرت جاوید\nوضعیت سفارش ${order.order_code}: ${labels[status]}\nبرای پیگیری وارد حساب کاربری شوید.`,
    { kind:`order_status_${status}`, entityId: order.id });
}
