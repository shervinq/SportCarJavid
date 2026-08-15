import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { releaseExpiredOrders, seedDatabase } from './db.js';
import { optionalAuth } from './auth.js';
import { registerAuthRoutes } from './routes-auth.js';
import { registerStoreRoutes } from './routes-store.js';
import { registerPaymentRoutes } from './routes-payment.js';
import { registerAdminRoutes } from './routes-admin.js';

seedDatabase();
releaseExpiredOrders();
setInterval(() => { try { releaseExpiredOrders(); } catch (e) { console.error('Order cleanup failed', e); } }, 5 * 60 * 1000).unref();

const app = express();
if (config.isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(optionalAuth);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', (_req,res) => res.json({ status:'ok', mode: config.payment.isSandboxMode ? 'sandbox-bypass' : 'zarinpal', time:new Date().toISOString() }));
app.get('/api/config/public', (_req,res) => res.json({ isSandboxMode: config.payment.isSandboxMode, freeShippingThreshold: config.store.freeShippingThreshold }));
registerAuthRoutes(app, authLimiter);
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
  res.status(status).json({message, ...(config.isProduction?{}:{detail:err.message})});
});

app.listen(config.port,()=>console.log(`SportCarJavid API listening on ${config.port} (${config.payment.isSandboxMode?'sandbox-bypass':'zarinpal'})`));
