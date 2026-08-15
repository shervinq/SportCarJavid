import { db } from './db.js';

export const bool = v => v === true || v === 1 || v === '1' || v === 'true';
export const productDto = p => ({ id:Number(p.id), sku:p.sku, title:p.title, category:p.category, price:Number(p.price), oldPrice:p.old_price == null ? null : Number(p.old_price), stock:Number(p.stock), badge:p.badge, emoji:p.emoji, imageUrl:p.image_url, compat:p.compatibility, desc:p.description, rating:Number(p.rating), featured:!!p.featured, active:!!p.is_active });

export function calculateCoupon(code, subtotal) {
  if (!code) return { discount:0, coupon:null };
  const coupon = db.prepare('SELECT * FROM coupons WHERE code=? COLLATE NOCASE AND is_active=1').get(code);
  if (!coupon) throw Object.assign(new Error('کد تخفیف معتبر نیست.'), { status:400 });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) throw Object.assign(new Error('کد تخفیف منقضی شده است.'), { status:400 });
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) throw Object.assign(new Error('ظرفیت استفاده از کد تخفیف تمام شده است.'), { status:400 });
  if (subtotal < coupon.min_total) throw Object.assign(new Error('مبلغ سفارش برای این کد تخفیف کافی نیست.'), { status:400 });
  const discount = coupon.type === 'percent' ? Math.floor(subtotal * Math.min(coupon.value,100) / 100) : Math.min(coupon.value, subtotal);
  return { discount, coupon };
}

export function getOrderForUser(id, user) {
  const row = user.role==='admin' ? db.prepare('SELECT * FROM orders WHERE id=?').get(id) : db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(id,user.id);
  if (!row) return null;
  const items=db.prepare('SELECT id,product_id AS productId,sku,title,unit_price AS unitPrice,quantity,line_total AS lineTotal FROM order_items WHERE order_id=?').all(row.id);
  return {...row,id:Number(row.id),subtotal:Number(row.subtotal),discount:Number(row.discount),shipping:Number(row.shipping),total:Number(row.total),items};
}
