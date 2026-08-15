import React, { useEffect, useMemo, useState } from 'react';
import { Search, ShoppingBag, Heart, ArrowLeft, Star, ShieldCheck, Truck, Car, Headphones, SlidersHorizontal, Minus, Plus, Trash2, Eye, Share2, CheckCircle2, PackageCheck, ChevronLeft, RefreshCw } from 'lucide-react';
import { api, cats, toman } from './shared.js';

export function Home({products,go,setCat,add,fav,setFav,openProduct}){
  const featured=products.filter(p=>p.featured).slice(0,4);
  return <main>
    <section className="hero"><div className="hero-copy"><span className="eyebrow">از خیابان تا پیست، متفاوت باش</span><h1>خودروت رو از<br/><em>معمولی بودن</em> نجات بده.</h1><p>تجهیزات اسپرت و اکسسوری خودرو با ضمانت اصالت، نصب تخصصی و ارسال سریع.</p><div><button className="primary" onClick={()=>go('shop')}>مشاهده محصولات <ArrowLeft/></button><button className="ghost" onClick={()=>go('services')}>رزرو نصب حضوری</button></div><div className="hero-stats"><span><b>خرید امن</b> پرداخت درگاه</span><span><b>موجودی واقعی</b> کنترل لحظه‌ای</span><span><b>پشتیبانی</b> قبل و بعد خرید</span></div></div><div className="hero-art"><div className="speed-lines"></div><div className="car-art">🏎️</div><span className="float-tag"><b>نصب تخصصی</b><small>توسط تیم اسپرت جاوید</small></span></div></section>
    <section className="benefits"><div><ShieldCheck/><span><b>ضمانت اصالت</b><small>کالای اصل و تست‌شده</small></span></div><div><Truck/><span><b>ارسال سریع</b><small>تحویل فوری در قم</small></span></div><div><Car/><span><b>نصب حرفه‌ای</b><small>در فروشگاه حضوری</small></span></div><div><Headphones/><span><b>مشاوره تخصصی</b><small>قبل و بعد از خرید</small></span></div></section>
    <section className="section"><Heading kicker="انتخاب سریع" title="برای ماشینت چی می‌خوای؟" action={()=>go('shop')}/><div className="cat-grid">{cats.slice(1).map(c=><button key={c[1]} onClick={()=>{setCat(c[1]);go('shop')}}><span>{c[2]}</span><b>{c[0]}</b><small>مشاهده محصولات</small><ArrowLeft/></button>)}</div></section>
    <section className="section hot"><Heading kicker="پیشنهادهای داغ" title="انتخاب حرفه‌ای‌ها" action={()=>go('shop')}/><div className="products">{featured.map(p=><Product key={p.id} p={p} add={add} fav={fav} setFav={setFav} openProduct={openProduct}/>)}</div></section>
    <section className="cta"><span>خدمات نصب در قم</span><h2>خریدت رو بسپار دست حرفه‌ای‌ها</h2><p>نصب هدلایت، لنز، دودی، سیستم امنیتی و تجهیزات اسپرت با ابزار تخصصی و ضمانت اجرا.</p><button onClick={()=>go('services')}>مشاهده خدمات <ArrowLeft/></button></section>
  </main>;
}

export function Heading({kicker,title,action}){return <div className="heading"><div><span>{kicker}</span><h2>{title}</h2></div><button onClick={action}>مشاهده همه <ArrowLeft/></button></div>}

export function Product({p,add,fav,setFav,openProduct}){
  const liked=fav.includes(p.id);
  return <article className="product">
    <div className="p-img product-open" onClick={()=>openProduct(p.id)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&openProduct(p.id)}>
      {p.badge&&<span className="badge">{p.badge}</span>}
      <button aria-label="علاقه‌مندی" onClick={e=>{e.stopPropagation();setFav(f=>liked?f.filter(x=>x!==p.id):[...f,p.id])}} className={liked?'liked':''}><Heart fill={liked?'currentColor':'none'}/></button>
      {p.imageUrl?<img src={p.imageUrl} alt={p.title} loading="lazy"/>:<div>{p.emoji}</div>}
      <span className="view-detail"><Eye/> مشاهده محصول</span>
    </div>
    <small>{p.compat}</small>
    <button className="product-title-link" onClick={()=>openProduct(p.id)}><h3>{p.title}</h3></button>
    <p>{p.desc}</p>
    <div className="rating"><Star fill="currentColor"/> {p.rating} <span>• {p.stock>0?`موجودی ${p.stock}`:'ناموجود'}</span></div>
    <div className="price">{p.oldPrice&&<del>{toman(p.oldPrice)}</del>}<b>{toman(p.price)}</b></div>
    <div className="product-actions"><button className="detail-btn" onClick={()=>openProduct(p.id)}><Eye/> جزئیات</button><button className="add" disabled={p.stock<=0} onClick={()=>add(p)}><ShoppingBag/> {p.stock>0?'افزودن':'ناموجود'}</button></div>
  </article>;
}

export function Shop({cat,setCat,query,setQuery,items,add,fav,setFav,openProduct}){
  const [sort,setSort]=useState('default');
  const sorted=useMemo(()=>{
    const list=[...items];
    if(sort==='cheap') list.sort((a,b)=>a.price-b.price);
    if(sort==='expensive') list.sort((a,b)=>b.price-a.price);
    if(sort==='stock') list.sort((a,b)=>b.stock-a.stock);
    if(sort==='rating') list.sort((a,b)=>b.rating-a.rating);
    return list;
  },[items,sort]);
  return <main className="inner"><div className="page-title"><span>فروشگاه تخصصی</span><h1>تجهیزات اسپرت خودرو</h1><p>محصول مناسب خودرویت را سریع و مطمئن پیدا کن.</p></div><div className="shop-tools"><div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="نام محصول یا SKU..."/></div><div className="chips">{cats.map(c=><button key={c[1]} className={cat===c[1]?'active':''} onClick={()=>setCat(c[1])}>{c[0]}</button>)}</div></div><div className="result"><span>{sorted.length} محصول پیدا شد</span><label className="sort-control"><SlidersHorizontal/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="default">پیشنهادی</option><option value="rating">بالاترین امتیاز</option><option value="cheap">ارزان‌ترین</option><option value="expensive">گران‌ترین</option><option value="stock">بیشترین موجودی</option></select></label></div><div className="products store">{sorted.map(p=><Product key={p.id} p={p} add={add} fav={fav} setFav={setFav} openProduct={openProduct}/>)}</div>{!sorted.length&&<div className="empty"><Search/><h2>محصولی پیدا نشد</h2><p>عبارت جستجو یا دسته‌بندی را تغییر بده.</p></div>}</main>;
}

export function ProductDetail({productId,products,add,fav,setFav,go,openProduct,notify}){
  const [product,setProduct]=useState(null),[loading,setLoading]=useState(true),[qty,setQty]=useState(1),[activeImage,setActiveImage]=useState('');
  useEffect(()=>{
    let alive=true;setLoading(true);setQty(1);
    api(`/api/products/${productId}`).then(d=>{if(!alive)return;setProduct(d.product);setActiveImage(d.product.images?.[0]||d.product.imageUrl||'')}).catch(e=>{if(alive)notify(e.message)}).finally(()=>alive&&setLoading(false));
    return()=>{alive=false};
  },[productId]);
  if(loading)return <main className="inner product-detail-loading"><RefreshCw className="spin"/> در حال دریافت محصول...</main>;
  if(!product)return <main className="inner empty"><PackageCheck/><h2>محصول در دسترس نیست</h2><button className="primary" onClick={()=>go('shop')}>بازگشت به فروشگاه</button></main>;
  const liked=fav.includes(product.id);
  const images=product.images?.length?product.images:(product.imageUrl?[product.imageUrl]:[]);
  const related=products.filter(p=>p.id!==product.id&&p.category===product.category).slice(0,4);
  const categoryTitle=cats.find(c=>c[1]===product.category)?.[0]||'محصولات';
  const share=async()=>{const url=location.href;try{if(navigator.share)await navigator.share({title:product.title,text:product.desc,url});else{await navigator.clipboard.writeText(url);notify('لینک محصول کپی شد')}}catch{}};
  return <main className="inner product-detail-page">
    <nav className="breadcrumb"><button onClick={()=>go('home')}>خانه</button><ChevronLeft/><button onClick={()=>go('shop')}>فروشگاه</button><ChevronLeft/><span>{product.title}</span></nav>
    <section className="product-detail-grid">
      <div className="product-gallery">
        <div className="product-main-image">{activeImage?<img src={activeImage} alt={product.title}/>:<span>{product.emoji}</span>}{product.badge&&<b>{product.badge}</b>}</div>
        {images.length>1&&<div className="product-thumbs">{images.map((img,i)=><button key={img} className={activeImage===img?'active':''} onClick={()=>setActiveImage(img)}><img src={img} alt={`${product.title} ${i+1}`}/></button>)}</div>}
      </div>
      <div className="product-info">
        <div className="product-meta-top"><span>{categoryTitle}</span><span>SKU: {product.sku}</span></div>
        <h1>{product.title}</h1>
        <div className="product-rating"><Star fill="currentColor"/> <b>{product.rating}</b><span>امتیاز محصول</span></div>
        <p className="product-description">{product.desc||'برای دریافت مشخصات تکمیلی این محصول با فروشگاه تماس بگیرید.'}</p>
        <div className="product-specs"><div><Car/><span><small>سازگاری</small><b>{product.compat}</b></span></div><div><PackageCheck/><span><small>موجودی</small><b className={product.stock<=3?'low-stock-text':''}>{product.stock>0?`${product.stock} عدد`:'ناموجود'}</b></span></div><div><ShieldCheck/><span><small>تضمین</small><b>اصالت کالا</b></span></div><div><Truck/><span><small>ارسال</small><b>سریع و قابل پیگیری</b></span></div></div>
        <div className="detail-price">{product.oldPrice&&<del>{toman(product.oldPrice)}</del>}<strong>{toman(product.price)}</strong>{product.oldPrice>product.price&&<span>{Math.round((product.oldPrice-product.price)/product.oldPrice*100)}٪ تخفیف</span>}</div>
        {product.stock>0&&product.stock<=3&&<div className="stock-warning">فقط {product.stock} عدد باقی مانده؛ موجودی هنگام ثبت سفارش مجدداً بررسی می‌شود.</div>}
        <div className="detail-buy-row"><div className="detail-qty"><button disabled={qty<=1} onClick={()=>setQty(q=>Math.max(1,q-1))}><Minus/></button><span>{qty}</span><button disabled={qty>=product.stock} onClick={()=>setQty(q=>Math.min(product.stock,q+1))}><Plus/></button></div><button className="primary detail-add" disabled={product.stock<=0} onClick={()=>add(product,qty)}><ShoppingBag/> {product.stock>0?'افزودن به سبد خرید':'ناموجود'}</button></div>
        <div className="detail-secondary"><button className={liked?'liked':''} onClick={()=>setFav(f=>liked?f.filter(x=>x!==product.id):[...f,product.id])}><Heart fill={liked?'currentColor':'none'}/> {liked?'حذف از علاقه‌مندی':'افزودن به علاقه‌مندی'}</button><button onClick={share}><Share2/> اشتراک محصول</button></div>
        <div className="purchase-trust"><CheckCircle2/><span><b>قیمت و موجودی سمت سرور تأیید می‌شود</b><small>اطلاعات سبد خرید به تنهایی مبنای محاسبه پرداخت نیست.</small></span></div>
      </div>
    </section>
    {related.length>0&&<section className="related-products"><Heading kicker="محصولات مرتبط" title="شاید این‌ها هم مناسب ماشینت باشند" action={()=>go('shop')}/><div className="products">{related.map(p=><Product key={p.id} p={p} add={add} fav={fav} setFav={setFav} openProduct={openProduct}/>)}</div></section>}
  </main>;
}

export function Cart({cart,setCart,go,openProduct}){
  const total=cart.reduce((a,b)=>a+b.price*b.qty,0);
  const qty=(id,d)=>setCart(c=>c.map(i=>i.id===id?{...i,qty:Math.max(1,Math.min(i.stock,i.qty+d))}:i));
  return <main className="inner cart-page"><div className="page-title"><span>سبد خرید</span><h1>سفارش شما</h1></div>{!cart.length?<div className="empty"><ShoppingBag/><h2>سبد خریدت خالیه</h2><button className="primary" onClick={()=>go('shop')}>رفتن به فروشگاه</button></div>:<div className="cart-layout"><div className="cart-list">{cart.map(i=><div className="cart-item" key={i.id}><button className="mini mini-link" onClick={()=>openProduct?.(i.id)}>{i.imageUrl?<img src={i.imageUrl} alt=""/>:i.emoji}</button><div><button className="cart-title-link" onClick={()=>openProduct?.(i.id)}><h3>{i.title}</h3></button><small>{i.compat}</small><b>{toman(i.price)}</b></div><div className="quantity"><button onClick={()=>qty(i.id,-1)}><Minus/></button><span>{i.qty}</span><button onClick={()=>qty(i.id,1)}><Plus/></button></div><button className="remove" onClick={()=>setCart(c=>c.filter(x=>x.id!==i.id))}><Trash2/></button></div>)}</div><aside className="summary"><h3>خلاصه سفارش</h3><p><span>جمع کالاها</span><b>{toman(total)}</b></p><p><span>ارسال</span><b>در تسویه محاسبه می‌شود</b></p><hr/><p className="sum"><span>جمع فعلی</span><b>{toman(total)}</b></p><button className="primary" onClick={()=>go('checkout')}>ادامه و پرداخت <ArrowLeft/></button><small><ShieldCheck/> مبلغ نهایی سمت سرور و بر اساس موجودی واقعی محاسبه می‌شود</small></aside></div>}</main>;
}
