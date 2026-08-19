import { config } from './config.js';

export async function sendSmsTemplate(phone, code, extra = {}) {
  if (!config.sms.enabled) return { skipped: true };

  const payload = {
    mobile: phone,
    templateId: config.sms.verifyTemplateId,
    parameters: [
      { name: 'CODE', value: String(code) },
      ...Object.entries(extra).map(([name, value]) => ({ name, value: String(value) }))
    ]
  };

  const response = await fetch(config.sms.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.sms.apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`SMS provider error: ${response.status}`);
  }

  return response.json();
}
