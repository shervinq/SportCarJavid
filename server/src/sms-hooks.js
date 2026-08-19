import { db } from './db.js';
import { notifyOrderCreated, notifyOrderStatus, notifyPaymentSuccess } from './sms.js';

const safe = promise => Promise.resolve(promise).catch(error => console.error('SMS hook failed', error));

function orderById(id) {
  return db.prepare('SELECT id,order_code,receiver_name,receiver_phone,total,created_at FROM orders WHERE id=?').get(Number(id));
}

async function afterJson(req, body) {
  if (req.method === 'POST' && req.path === '/api/orders' && body?.order?.id) {
    const order=orderById(body.order.id); if(order) await safe(notifyOrderCreated(order));
    return;
  }
  if (req.method === 'POST' && req.path === '/api/payments/start' && body?.success && body?.refId && !body?.alreadyPaid) {
    const order=orderById(body.orderId); if(order) await safe(notifyPaymentSuccess(order,body.refId));
    return;
  }
  const statusMatch=req.path.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
  if (req.method === 'PATCH' && statusMatch && body?.success && req.body?.status) {
    const order=orderById(statusMatch[1]); if(order) await safe(notifyOrderStatus(order,req.body.status));
  }
}

async function beforeRedirect(req, location) {
  if (req.method !== 'GET' || req.path !== '/api/payments/zarinpal/callback') return;
  let url;
  try { url=new URL(location); } catch { return; }
  if (url.searchParams.get('payment') !== 'success') return;
  const orderId=url.searchParams.get('order'),ref=url.searchParams.get('ref') || '';
  const order=orderById(orderId); if(order) await safe(notifyPaymentSuccess(order,ref));
}

export function registerSmsHooks(app) {
  app.use((req,res,next)=>{
    const originalJson=res.json.bind(res), originalRedirect=res.redirect.bind(res);
    res.json=body=>{
      if(res.statusCode>=400)return originalJson(body);
      let finished=false;
      safe(afterJson(req,body)).finally(()=>{if(!finished){finished=true;originalJson(body)}});
      return res;
    };
    res.redirect=(...args)=>{
      const location=args.length===1?args[0]:args[1];
      let finished=false;
      safe(beforeRedirect(req,location)).finally(()=>{if(!finished){finished=true;originalRedirect(...args)}});
      return res;
    };
    next();
  });
}
