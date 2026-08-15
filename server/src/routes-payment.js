import { config } from './config.js';
import { db, audit, releaseExpiredOrders, restoreOrderStock, transaction } from './db.js';
import { requireAuth } from './auth.js';
import { requestZarinPalPayment, verifyZarinPalPayment } from './payment.js';
import { cleanText, toInt } from './utils.js';
import { getOrderForUser } from './store-service.js';

export function registerPaymentRoutes(app, asyncRoute) {
app.post('/api/payments/start', requireAuth, asyncRoute(async (req,res) => {
  releaseExpiredOrders();
  const order=getOrderForUser(toInt(req.body?.orderId),req.user);
  if(!order)return res.status(404).json({message:'سفارش پیدا نشد.'});
  if(order.payment_status==='paid')return res.json({success:true,alreadyPaid:true,orderId:order.id,orderCode:order.order_code});
  if(order.status!=='pending_payment')return res.status(409).json({message:'این سفارش دیگر قابل پرداخت نیست.'});

  if(config.payment.isSandboxMode){
    const result=transaction(()=>{
      const current=db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
      if(!current)throw Object.assign(new Error('سفارش پیدا نشد.'),{status:404});
      if(current.payment_status==='paid'){
        const paid=db.prepare("SELECT ref_id FROM payments WHERE order_id=? AND status='paid' ORDER BY id DESC LIMIT 1").get(order.id);
        return {alreadyPaid:true,refId:paid?.ref_id || ''};
      }
      if(current.status!=='pending_payment')throw Object.assign(new Error('این سفارش دیگر قابل پرداخت نیست.'),{status:409});
      const ref=`TEST-${Date.now()}`;
      db.prepare("INSERT INTO payments(order_id,provider,authority,ref_id,amount,status,is_sandbox,raw_response) VALUES(?,?,?,?,?,'paid',1,?)").run(order.id,'sandbox',`SANDBOX-${order.order_code}`,ref,order.total,JSON.stringify({bypass:true}));
      db.prepare("UPDATE orders SET payment_status='paid',status='processing',expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
      if(order.coupon_code)db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE code=? COLLATE NOCASE').run(order.coupon_code);
      audit(req.user.id,'sandbox_payment_success','order',order.id,{ref});
      return {alreadyPaid:false,refId:ref};
    });
    return res.json({success:true,alreadyPaid:result.alreadyPaid,mode:'sandbox',orderId:order.id,orderCode:order.order_code,refId:result.refId});
  }

  if(!config.payment.merchantId)return res.status(503).json({message:'مرچنت زرین‌پال هنوز تنظیم نشده است.'});
  const existing=db.prepare("SELECT * FROM payments WHERE order_id=? AND status='pending' AND authority IS NOT NULL ORDER BY id DESC LIMIT 1").get(order.id);
  if(existing){
    const { ZarinPal } = await import('zarinpal-node-sdk');
    const zp=new ZarinPal({merchantId:config.payment.merchantId,sandbox:false});
    return res.json({success:true,redirectUrl:zp.payments.getRedirectUrl(existing.authority),authority:existing.authority});
  }

  const result=await requestZarinPalPayment({amount:order.total,orderCode:order.order_code,mobile:order.receiver_phone,email:req.user.email});
  db.prepare("INSERT INTO payments(order_id,provider,authority,amount,status,is_sandbox,raw_response) VALUES(?,?,?,?, 'pending',0,?)")
    .run(order.id,'zarinpal',result.authority,order.total,JSON.stringify(result.response));
  audit(req.user.id,'payment_requested','order',order.id,{authority:result.authority});
  res.json({success:true,redirectUrl:result.redirectUrl,authority:result.authority});
}));

app.get('/api/payments/zarinpal/callback', asyncRoute(async (req,res) => {
  const authority=cleanText(req.query.Authority || req.query.authority,100), status=cleanText(req.query.Status || req.query.status,20);
  const payment=db.prepare("SELECT p.*,o.order_code,o.coupon_code,o.stock_reserved FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.authority=? ORDER BY p.id DESC LIMIT 1").get(authority);
  if(!payment)return res.redirect(`${config.clientOrigin}/?payment=failed&reason=not-found`);
  if(payment.status==='paid')return res.redirect(`${config.clientOrigin}/?payment=success&order=${payment.order_id}&ref=${encodeURIComponent(payment.ref_id || '')}`);
  if(status!=='OK'){
    restoreOrderStock(payment.order_id);
    db.prepare("UPDATE payments SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(payment.id);
    db.prepare("UPDATE orders SET status='payment_failed',payment_status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(payment.order_id);
    return res.redirect(`${config.clientOrigin}/?payment=failed&order=${payment.order_id}`);
  }
  const verified=await verifyZarinPalPayment({authority,amount:Number(payment.amount)});
  if(!verified.ok){
    db.prepare('UPDATE payments SET raw_response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(JSON.stringify(verified.response),payment.id);
    return res.redirect(`${config.clientOrigin}/?payment=failed&order=${payment.order_id}&code=${verified.code}`);
  }
  transaction(()=>{
    db.prepare("UPDATE payments SET status='paid',ref_id=?,raw_response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(verified.refId,JSON.stringify(verified.response),payment.id);
    db.prepare("UPDATE orders SET payment_status='paid',status='processing',expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(payment.order_id);
    if(payment.coupon_code)db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE code=? COLLATE NOCASE').run(payment.coupon_code);
  });
  res.redirect(`${config.clientOrigin}/?payment=success&order=${payment.order_id}&ref=${encodeURIComponent(verified.refId)}`);
}));
}
