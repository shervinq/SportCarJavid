import { ZarinPal } from 'zarinpal-node-sdk';
import { config } from './config.js';

let client;
function getClient() {
  if (!config.payment.merchantId) throw new Error('ZARINPAL_MERCHANT_ID is not configured.');
  if (!client) client = new ZarinPal({ merchantId: config.payment.merchantId, sandbox: false });
  return client;
}

export async function requestZarinPalPayment({ amount, orderCode, mobile, email }) {
  const zarinpal = getClient();
  const response = await zarinpal.payments.create({
    amount,
    callback_url: config.payment.callbackUrl,
    description: `Sport Car Javid order ${orderCode}`,
    mobile: mobile || undefined,
    email: email || undefined,
    currency: config.payment.currency
  });

  const authority = response?.data?.authority || response?.authority;
  const code = response?.data?.code ?? response?.code;
  if (!authority || (code != null && Number(code) !== 100)) {
    const error = new Error('ZarinPal payment request failed.');
    error.gatewayResponse = response;
    throw error;
  }
  return { authority, redirectUrl: zarinpal.payments.getRedirectUrl(authority), response };
}

export async function verifyZarinPalPayment({ authority, amount }) {
  const response = await getClient().verifications.verify({ authority, amount });
  const data = response?.data || response;
  return {
    ok: Number(data?.code) === 100 || Number(data?.code) === 101,
    alreadyVerified: Number(data?.code) === 101,
    refId: data?.ref_id ? String(data.ref_id) : '',
    code: Number(data?.code),
    response
  };
}
