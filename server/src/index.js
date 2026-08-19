import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { db, releaseExpiredOrders, seedDatabase } from './db.js';
import { optionalAuth, requireAdmin } from './auth.js';
import { registerAuthRoutes } from './routes-auth.js';
import { registerStoreRoutes } from './routes-store.js';
import { registerPaymentRoutes } from './routes-payment.js';
import { registerAdminRoutes } from './routes-admin.js';
import { smsPublicStatus } from './sms.js';
import { ensureSmsSchema } from './sms-store.js';
import { registerSmsHooks } from './sms-hooks.js';

seedDatabase();
ensureSmsSchema();
releaseExpiredOrders();
setInterval(() => { try { releaseExpiredOrders(); } catch (e) { console.error('Order cleanup failed', e); } }, 5 * 60 * 1000).unref();

const app = express();
fs.mkdirSync(config.uploadDir, { recursive: true });
if (config.isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(optionalAuth);
registerSmsHooks(app);
app.use('/uploads', express.static(config.uploadDir, { maxAge: config.isProduction ? '7d' : 0, immutable: false }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const smsLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message:'تعداد درخواست پیامک زیاد است. چند دقیقه بعد دوباره تلاش کنید.' } });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', (_req,res) => res.json({ status:'ok', mode: config.payment.isSandboxMode ? 'sandbox-bypass' : 'zarinpal', sms:smsPublicStatus(), time:new Date().toISOString() }));
app.get('/api/config/public', (_req,res) => res.json({ isSandboxMode: config.payment.isSandboxMode, freeShippingThreshold: config.store.freeShippingThreshold, sms:smsPublicStatus() }));
app.get('/api/admin/sms/logs', requireAdmin, (_req,res) => {
  const logs=db.prepare('SELECT id,kind,mobile,status,provider_message_id,error,entity_id,created_at FROM sms_logs ORDER BY id DESC LIMIT 200').all();
  const stats=db.prepare("SELECT status,COUNT(*) AS count FROM sms_logs GROUP BY status").all();
  res.json({sms:smsPublicStatus(),adminMobilesConfigured:config.sms.adminMobiles.length,stats,logs});
});
registerAuthRoutes(app, authLimiter, smsLimiter);
registerStoreRoutes(app);
registerPaymentRoutes(app, asyncRoute);
registerAdminRoutes(app);

const distPath=path.resolve(config.serverRoot,'..','dist');
if(fs.existsSync(distPath)){
  app.use(express.static(distPath));
  app.use((req,res,next)=> req.path.startsWith('/api/') ? next() : res.sendFile(path.join(distPath,'index.html')));
}

app.use((err,req,res,_next)=>{
  console.error(err);
  const status=Number(err.status)||500;
  const message=status>=500 ? 'خطای داخلی سرور رخ داد.' : err.message;
  res.status(status).json({message, ...(err.retryAfter?{retryAfter:err.retryAfter}:{}), ...(config.isProduction?{}:{detail:err.message})});
});

app.listen(config.port,()=>console.log(`SportCarJavid API listening on ${config.port} (${config.payment.isSandboxMode?'sandbox-bypass':'zarinpal'})`));
