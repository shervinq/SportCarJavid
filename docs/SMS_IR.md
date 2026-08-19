# SMS.ir integration

SportCarJavid uses SMS.ir only from the backend. Never place the API key in React/Vite code or commit it to Git.

## Supported flows

- Passwordless login / first-time mobile signup with a 6-digit OTP.
- Password recovery with OTP and a new password.
- Customer SMS when an order is created.
- Customer + admin SMS after successful payment.
- Customer SMS when an admin changes an order to processing, shipped, delivered, or cancelled.
- Persistent `sms_logs` records for delivery attempts/errors.
- OTPs are stored as HMAC hashes in SQLite, expire automatically, have a resend cooldown and an attempt limit.

## SMS.ir endpoints

The backend uses SMS.ir API v1:

- `POST /send/verify` for template-based OTP messages.
- `POST /send/bulk` for order/payment/status notifications.
- Header: `x-api-key`.

The verify template must contain a `CODE` parameter (for example `#CODE#`).

## Environment variables

Copy `server/.env.example` to `server/.env` and configure:

```env
SMS_ENABLED=true
SMS_DRY_RUN=false
SMS_API_KEY=...
SMS_LINE_NUMBER=...
SMS_VERIFY_TEMPLATE_ID=...
SMS_RESET_TEMPLATE_ID=
SMS_ADMIN_MOBILES=0912xxxxxxx,0935xxxxxxx
```

`SMS_RESET_TEMPLATE_ID` is optional; if omitted, the login verification template is reused for password recovery.

### Dry run

Set `SMS_DRY_RUN=true` to test the full application flow without contacting SMS.ir. This is separate from `IS_SANDBOX_MODE`, which controls payment only.

## Production checklist

1. Set all secrets as host/deployment environment variables, not repository files.
2. Set `SMS_DRY_RUN=false` only after the template and line are active in SMS.ir.
3. Add at least one `SMS_ADMIN_MOBILES` number if admin order alerts are required.
4. Use a dedicated password-reset template when available.
5. Verify OTP, password reset, new order, payment success, and order-status SMS on a low-risk test order.
