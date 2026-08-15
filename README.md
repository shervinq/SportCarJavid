# اسپرت جاوید — فروشگاه Full‑Stack

نسخه نهایی فروشگاه لوازم اسپرت خودرو با React/Vite و API مستقل Node.js/Express، دیتابیس SQLite داخلی Node، احراز هویت، پنل مدیریت، سفارش، موجودی، کد تخفیف، گزارش فروش و اتصال زرین‌پال.

## امکانات اصلی

- ثبت‌نام و ورود کاربر با رمز هش‌شده و Cookie امن HttpOnly
- حساب کاربری و تاریخچه سفارش‌ها
- محصولات واقعی از دیتابیس، موجودی، قیمت و وضعیت فعال/غیرفعال
- سبد خرید و محاسبه مبلغ نهایی فقط سمت سرور
- رزرو موجودی هنگام ساخت سفارش و آزادسازی سفارش‌های پرداخت‌نشده منقضی
- پنل ادمین: داشبورد، محصول، سفارش، مشتری، تخفیف، گزارش و Audit Log سمت API
- پرداخت زرین‌پال با SDK رسمی و Verify سمت سرور
- `IsSandboxMode`: پرداخت تستی داخلی بدون تماس با درگاه و بدون کسر وجه
- سرو Frontend از Express در Production

## پیش‌نیاز

Node.js 22.13 یا بالاتر.

## اجرای توسعه

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

Frontend روی `http://localhost:5173` و API روی `http://localhost:5000` اجرا می‌شود.

### ادمین تست

در حالت توسعه مقادیر پیش‌فرض `server/config/appsettings.json` استفاده می‌شوند:

- Email: `admin@sportcarjavid.local`
- Password: `Admin@123456`

**قبل از Production حتماً این رمز را از طریق Environment Variable تغییر دهید.** سرور در Production با رمز پیش‌فرض بالا اجرا نمی‌شود.

## تنظیم پرداخت تستی

در `server/config/appsettings.json`:

```json
"Payment": {
  "IsSandboxMode": true,
  "ZarinPal": {
    "MerchantId": "",
    "CallbackUrl": "",
    "Currency": "IRT"
  }
}
```

وقتی `IsSandboxMode=true` باشد، سفارش بدون اتصال به زرین‌پال با وضعیت Paid ثبت می‌شود. این حالت برای تست تمام مسیر خرید است.

## فعال‌سازی زرین‌پال واقعی

روش پیشنهادی این است که اطلاعات محرمانه را داخل Git Commit نکنید و در `server/.env` یا Environment Variables سرور بگذارید:

```env
IS_SANDBOX_MODE=false
ZARINPAL_MERCHANT_ID=YOUR-MERCHANT-ID
PUBLIC_BASE_URL=https://your-domain.ir
CLIENT_ORIGIN=https://your-domain.ir
ZARINPAL_CALLBACK_URL=https://your-domain.ir/api/payments/zarinpal/callback
JWT_SECRET=YOUR-LONG-RANDOM-SECRET
COOKIE_SECURE=true
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=YOUR-STRONG-ADMIN-PASSWORD
```

اگر `ZARINPAL_CALLBACK_URL` خالی باشد، برنامه آن را از `PUBLIC_BASE_URL` می‌سازد.

## Build و Production

```bash
npm install
npm run build
NODE_ENV=production npm start
```

در Production، Express پوشه `dist` را سرو می‌کند؛ بنابراین یک سرویس Node کافی است. دیتابیس پیش‌فرض در `server/data/store.db` ساخته می‌شود و این مسیر در Git Ignore است.

## نکات استقرار

1. دامنه و HTTPS را روی Reverse Proxy (مثل Nginx) تنظیم کنید.
2. `PUBLIC_BASE_URL` و `CLIENT_ORIGIN` را دامنه واقعی قرار دهید.
3. `JWT_SECRET` و رمز ادمین را عوض کنید.
4. بکاپ منظم از `server/data/store.db` بگیرید.
5. پس از دریافت Merchant ID زرین‌پال، `IS_SANDBOX_MODE=false` و `ZARINPAL_MERCHANT_ID` را تنظیم کنید.
6. یک خرید با مبلغ کم انجام دهید و نتیجه Callback/Verify را از سفارش و پنل ادمین کنترل کنید.

## جزئیات محصول و تصاویر

- هر محصول صفحه اختصاصی قابل اشتراک با پارامتر `?product=<id>` دارد.
- صفحه محصول شامل گالری، موجودی، SKU، سازگاری خودرو، قیمت، تعداد، علاقه‌مندی و محصولات مرتبط است.
- ادمین از بخش محصولات می‌تواند برای هر محصول تا ۸ تصویر JPG/PNG/WEBP (هر فایل حداکثر ۵MB) آپلود کند و تصویر اصلی را انتخاب کند.
- فایل‌های آپلودی به‌صورت پیش‌فرض در `server/data/uploads` ذخیره می‌شوند. در سرور واقعی این مسیر باید روی دیسک پایدار/Volume قرار بگیرد و در صورت نیاز با `UPLOAD_DIR` تغییر داده شود.

## ورود مدیریت

هیچ ورودی جداگانه‌ای برای ادمین در حالت مهمان وجود ندارد. مدیر از همان فرم ورود کاربران وارد می‌شود و فقط پس از تشخیص نقش `admin`، گزینه «پنل مدیریت» در رابط کاربری نمایش داده می‌شود. کنترل دسترسی API نیز مستقل از رابط کاربری و سمت سرور انجام می‌شود.
