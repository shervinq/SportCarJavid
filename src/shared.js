export const cats = [
  ['همه','all','✦'],['چراغ و هدلایت','light','◉'],['دودی و شیشه','tint','◐'],
  ['بال و بدنه','body','⌁'],['کف‌پوش و کابین','cabin','▦'],['اگزوز','exhaust','◎'],
  ['امنیت و GPS','security','⌖'],['اکسسوری','accessory','◇']
];
export const toman = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0)) + ' تومان';
export const dateFa = value => value ? new Intl.DateTimeFormat('fa-IR', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : '—';
export const statusFa = {
  pending_payment:'در انتظار پرداخت', processing:'در حال پردازش', shipped:'ارسال شده', delivered:'تحویل شده',
  cancelled:'لغو شده', payment_failed:'پرداخت ناموفق', pending:'در انتظار', paid:'پرداخت شده', failed:'ناموفق', refunded:'مرجوع'
};
export async function api(path, options = {}) {
  const res = await fetch(path, { credentials:'include', headers:{ 'Content-Type':'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'خطا در ارتباط با سرور');
  return data;
}
