import { db, audit, releaseExpiredOrders, transaction } from './db.js';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import { cleanText, normalizePhone, orderCode, toInt } from './utils.js';
import { calculateCoupon, getOrderForUser, productDto } from './store-service.js';

export function registerStoreRoutes(app) {
app.get('/api/products', (req,res) => {
  const q = cleanText(req.query.q,100);
  const category = cleanText(req.query.category,50);
  const featured = req.query.featured === 'true';
  const where = ['is_active=1']; const params=[];
  if (category && category !== 'all') { where.push('category=?'); params.push(category); }
  if (q) { where.push('(title LIKE ? OR description LIKE ? OR sku LIKE ?)'); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (featured) where.push('featured=1');
  const rows = db.prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY featured DESC, id DESC`).all(...params);
  res.json({ products: rows.map(productDto) });
});
app.get('/api/products/:id', (req,res) => {
  const row = db.prepare('SELECT * FROM products WHERE id=? AND is_active=1').get(toInt(req.params.id));
  if (!row) return res.status(404).json({ message:'محصول پیدا نشد.' });
  res.json({ product: productDto(row) });
});

app.post('/api/orders/quote', requireAuth, (req,res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ message:'سبد خرید خالی است.' });
  let subtotal=0;
  for (const item of items) {
    const p = db.prepare('SELECT id,price,stock,is_active FROM products WHERE id=?').get(toInt(item.productId));
    const qty = Math.max(1,toInt(item.quantity,1));
    if (!p || !p.is_active || p.stock < qty) return res.status(409).json({ message:'موجودی یکی از کالاها کافی نیست.' });
    subtotal += Number(p.price)*qty;
  }
  const {discount} = calculateCoupon(cleanText(req.body?.couponCode,50),subtotal);
  const shippingMethod=cleanText(req.body?.shippingMethod || 'post',40);
  const shipping = shippingMethod==='pickup' || subtotal-discount >= config.store.freeShippingThreshold ? 0 : config.store.defaultShippingCost;
  res.json({ subtotal, discount, shipping, total: subtotal-discount+shipping });
});

app.post('/api/orders', requireAuth, (req,res) => {
  releaseExpiredOrders();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 50) return res.status(400).json({ message:'سبد خرید معتبر نیست.' });
  const receiverName=cleanText(req.body?.receiverName,100), receiverPhone=normalizePhone(req.body?.receiverPhone), province=cleanText(req.body?.province,80), city=cleanText(req.body?.city,80), address=cleanText(req.body?.address,500), postalCode=cleanText(req.body?.postalCode,20), shippingMethod=cleanText(req.body?.shippingMethod || 'post',40), notes=cleanText(req.body?.notes,500), couponCode=cleanText(req.body?.couponCode,50);
  if (receiverName.length<2 || receiverPhone.length<10 || address.length<8 || !city) return res.status(400).json({ message:'اطلاعات گیرنده، شهر، آدرس و موبایل را کامل کنید.' });

  const created = transaction(() => {
    const normalized=[]; let subtotal=0;
    for (const item of items) {
      const id=toInt(item.productId), qty=Math.max(1,Math.min(20,toInt(item.quantity,1)));
      const p=db.prepare('SELECT * FROM products WHERE id=? AND is_active=1').get(id);
      if (!p || Number(p.stock)<qty) throw Object.assign(new Error(`موجودی «${p?.title || 'محصول'}» کافی نیست.`),{status:409});
      normalized.push({p,qty}); subtotal += Number(p.price)*qty;
    }
    const {discount,coupon}=calculateCoupon(couponCode,subtotal);
    const shipping=shippingMethod==='pickup' || subtotal-discount >= config.store.freeShippingThreshold ? 0 : config.store.defaultShippingCost;
    const total=subtotal-discount+shipping;
    const code=orderCode();
    const expiresAt=new Date(Date.now()+config.store.pendingOrderExpiryMinutes*60_000).toISOString();
    const orderRes=db.prepare(`INSERT INTO orders(order_code,user_id,subtotal,discount,shipping,total,coupon_code,receiver_name,receiver_phone,province,city,address,postal_code,shipping_method,notes,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code,req.user.id,subtotal,discount,shipping,total,coupon?.code || '',receiverName,receiverPhone,province,city,address,postalCode,shippingMethod,notes,expiresAt);
    const orderId=Number(orderRes.lastInsertRowid);
    const itemStmt=db.prepare('INSERT INTO order_items(order_id,product_id,sku,title,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?,?)');
    const stockStmt=db.prepare('UPDATE products SET stock=stock-?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>=?');
    for (const {p,qty} of normalized) {
      const changed=stockStmt.run(qty,p.id,qty);
      if (Number(changed.changes)!==1) throw Object.assign(new Error(`موجودی «${p.title}» تغییر کرده؛ دوباره تلاش کنید.`),{status:409});
      itemStmt.run(orderId,p.id,p.sku,p.title,p.price,qty,Number(p.price)*qty);
    }
    audit(req.user.id,'create','order',orderId,{orderCode:code,total});
    return {id:orderId,orderCode:code,total,expiresAt};
  });
  res.status(201).json({ order:created });
});


app.get('/api/orders/my', requireAuth, (req,res) => {
  releaseExpiredOrders();
  const rows=db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({orders:rows.map(o=>({...o,id:Number(o.id),total:Number(o.total)}))});
});
app.get('/api/orders/:id', requireAuth, (req,res) => {
  const order=getOrderForUser(toInt(req.params.id),req.user);
  if(!order)return res.status(404).json({message:'سفارش پیدا نشد.'});
  res.json({order});
});
}
