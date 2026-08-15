import { db, audit, releaseExpiredOrders, restoreOrderStock } from './db.js';
import { requireAdmin } from './auth.js';
import { cleanText, toInt } from './utils.js';
import { bool, getOrderForUser, productDto } from './store-service.js';

export function registerAdminRoutes(app) {
app.get('/api/admin/dashboard', requireAdmin, (_req,res) => {
  releaseExpiredOrders();
  const revenue=Number(db.prepare("SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE payment_status='paid'").get().v);
  const todayRevenue=Number(db.prepare("SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE payment_status='paid' AND date(created_at)=date('now')").get().v);
  const orders=Number(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c);
  const customers=Number(db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='customer'").get().c);
  const products=Number(db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active=1').get().c);
  const lowStock=db.prepare('SELECT id,title,sku,stock FROM products WHERE is_active=1 AND stock<=5 ORDER BY stock ASC,id DESC LIMIT 10').all();
  const recentOrders=db.prepare('SELECT id,order_code,status,payment_status,total,receiver_name,created_at FROM orders ORDER BY id DESC LIMIT 8').all();
  const dailySales=db.prepare("SELECT date(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE payment_status='paid' AND created_at>=datetime('now','-29 days') GROUP BY date(created_at) ORDER BY day").all();
  res.json({stats:{revenue,todayRevenue,orders,customers,products},lowStock,recentOrders,dailySales});
});

app.get('/api/admin/products', requireAdmin, (_req,res) => res.json({products:db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(productDto)}));
app.post('/api/admin/products', requireAdmin, (req,res) => {
  const p=req.body||{}; const sku=cleanText(p.sku,60).toUpperCase(),title=cleanText(p.title,160),category=cleanText(p.category,50),price=toInt(p.price,-1),stock=toInt(p.stock,-1);
  if(!sku||title.length<2||!category||price<0||stock<0)return res.status(400).json({message:'SKU، عنوان، دسته، قیمت و موجودی معتبر لازم است.'});
  try{
    const r=db.prepare(`INSERT INTO products(sku,title,category,price,old_price,stock,badge,emoji,image_url,compatibility,description,rating,featured,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sku,title,category,price,p.oldPrice==null?null:toInt(p.oldPrice),stock,cleanText(p.badge,80),cleanText(p.emoji,20)||'🛞',cleanText(p.imageUrl,500),cleanText(p.compat,200),cleanText(p.desc,1000),Number(p.rating||5),bool(p.featured)?1:0,p.active===false?0:1);
    audit(req.user.id,'create','product',Number(r.lastInsertRowid),{sku});
    res.status(201).json({product:productDto(db.prepare('SELECT * FROM products WHERE id=?').get(Number(r.lastInsertRowid)))});
  }catch(e){if(String(e.message).includes('UNIQUE'))return res.status(409).json({message:'SKU تکراری است.'});throw e;}
});
app.patch('/api/admin/products/:id', requireAdmin, (req,res) => {
  const id=toInt(req.params.id),current=db.prepare('SELECT * FROM products WHERE id=?').get(id); if(!current)return res.status(404).json({message:'محصول پیدا نشد.'});
  const p={...productDto(current),...req.body};
  db.prepare(`UPDATE products SET sku=?,title=?,category=?,price=?,old_price=?,stock=?,badge=?,emoji=?,image_url=?,compatibility=?,description=?,rating=?,featured=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(cleanText(p.sku,60).toUpperCase(),cleanText(p.title,160),cleanText(p.category,50),Math.max(0,toInt(p.price)),p.oldPrice==null?null:Math.max(0,toInt(p.oldPrice)),Math.max(0,toInt(p.stock)),cleanText(p.badge,80),cleanText(p.emoji,20)||'🛞',cleanText(p.imageUrl,500),cleanText(p.compat,200),cleanText(p.desc,1000),Number(p.rating||5),bool(p.featured)?1:0,p.active===false?0:1,id);
  audit(req.user.id,'update','product',id,{sku:p.sku});
  res.json({product:productDto(db.prepare('SELECT * FROM products WHERE id=?').get(id))});
});
app.delete('/api/admin/products/:id', requireAdmin, (req,res) => {
  const id=toInt(req.params.id); if(!db.prepare('SELECT id FROM products WHERE id=?').get(id))return res.status(404).json({message:'محصول پیدا نشد.'});
  db.prepare('UPDATE products SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id); audit(req.user.id,'archive','product',id); res.json({success:true});
});

app.get('/api/admin/orders', requireAdmin, (req,res) => {
  releaseExpiredOrders();
  const status=cleanText(req.query.status,30),q=cleanText(req.query.q,100); const where=['1=1'],params=[];
  if(status){where.push('o.status=?');params.push(status);} if(q){where.push('(o.order_code LIKE ? OR o.receiver_name LIKE ? OR o.receiver_phone LIKE ?)');params.push(`%${q}%`,`%${q}%`,`%${q}%`);}
  const rows=db.prepare(`SELECT o.*,u.email AS user_email,u.name AS user_name FROM orders o JOIN users u ON u.id=o.user_id WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 500`).all(...params);
  res.json({orders:rows.map(o=>({...o,id:Number(o.id),total:Number(o.total)}))});
});
app.patch('/api/admin/orders/:id/status', requireAdmin, (req,res) => {
  const id=toInt(req.params.id),status=cleanText(req.body?.status,30),allowed=['processing','shipped','delivered','cancelled'];
  if(!allowed.includes(status))return res.status(400).json({message:'وضعیت نامعتبر است.'});
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!order)return res.status(404).json({message:'سفارش پیدا نشد.'});
  if(status==='cancelled'&&order.payment_status!=='paid')restoreOrderStock(id);
  db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,id); audit(req.user.id,'status','order',id,{status}); res.json({success:true});
});
app.get('/api/admin/orders/:id', requireAdmin, (req,res) => {const order=getOrderForUser(toInt(req.params.id),req.user);if(!order)return res.status(404).json({message:'سفارش پیدا نشد.'});res.json({order});});

app.get('/api/admin/users', requireAdmin, (_req,res) => {const rows=db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.role,u.is_active,u.created_at,COUNT(o.id) AS order_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total ELSE 0 END),0) AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.id DESC`).all();res.json({users:rows});});

app.get('/api/admin/coupons', requireAdmin, (_req,res) => res.json({coupons:db.prepare('SELECT * FROM coupons ORDER BY id DESC').all()}));
app.post('/api/admin/coupons', requireAdmin, (req,res) => {
  const c=req.body||{},code=cleanText(c.code,50).toUpperCase(),type=c.type==='fixed'?'fixed':'percent',value=toInt(c.value),minTotal=Math.max(0,toInt(c.minTotal)),limit=c.usageLimit==null||c.usageLimit===''?null:Math.max(1,toInt(c.usageLimit)),expires=cleanText(c.expiresAt,40)||null;
  if(!code||value<=0||(type==='percent'&&value>100))return res.status(400).json({message:'اطلاعات کد تخفیف معتبر نیست.'});
  try{const r=db.prepare('INSERT INTO coupons(code,type,value,min_total,usage_limit,expires_at,is_active) VALUES(?,?,?,?,?,?,?)').run(code,type,value,minTotal,limit,expires,c.active===false?0:1);audit(req.user.id,'create','coupon',Number(r.lastInsertRowid),{code});res.status(201).json({success:true});}catch(e){if(String(e.message).includes('UNIQUE'))return res.status(409).json({message:'کد تخفیف تکراری است.'});throw e;}
});
app.patch('/api/admin/coupons/:id', requireAdmin, (req,res) => {const id=toInt(req.params.id),c=db.prepare('SELECT * FROM coupons WHERE id=?').get(id);if(!c)return res.status(404).json({message:'کد پیدا نشد.'});const b=req.body||{};db.prepare('UPDATE coupons SET is_active=?,expires_at=COALESCE(?,expires_at),usage_limit=COALESCE(?,usage_limit) WHERE id=?').run(b.active===false?0:1,cleanText(b.expiresAt,40)||null,b.usageLimit==null?null:Math.max(1,toInt(b.usageLimit)),id);audit(req.user.id,'update','coupon',id);res.json({success:true});});

app.get('/api/admin/reports/sales', requireAdmin, (req,res) => {
  const days=Math.max(1,Math.min(365,toInt(req.query.days,30)));
  const rows=db.prepare(`SELECT date(created_at) AS day,COUNT(*) AS orders,COALESCE(SUM(total),0) AS revenue,COALESCE(AVG(total),0) AS avg_order FROM orders WHERE payment_status='paid' AND created_at>=datetime('now',?) GROUP BY date(created_at) ORDER BY day`).all(`-${days-1} days`);
  const topProducts=db.prepare(`SELECT oi.product_id AS productId,oi.title,SUM(oi.quantity) AS quantity,SUM(oi.line_total) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.payment_status='paid' AND o.created_at>=datetime('now',?) GROUP BY oi.product_id,oi.title ORDER BY revenue DESC LIMIT 10`).all(`-${days-1} days`);
  res.json({days,rows,topProducts});
});

app.get('/api/admin/audit', requireAdmin, (_req,res) => res.json({logs:db.prepare('SELECT a.*,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200').all()}));
}
