import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShoppingBag, User, Sun, Moon, MapPin, Menu, X, CheckCircle2, RefreshCw } from 'lucide-react';
import './styles.css';
import './production.css';
import { api, toman } from './shared.js';
import { Home, Shop, Cart } from './store.jsx';
import { AuthModal, Checkout, PaymentResult, Account, InfoPage } from './account.jsx';
import { Admin } from './admin.jsx';

function App() {
  const [theme,setTheme] = useState(localStorage.theme || 'dark');
  const [page,setPage] = useState('home');
  const [cat,setCat] = useState('all');
  const [query,setQuery] = useState('');
  const [products,setProducts] = useState([]);
  const [cart,setCart] = useState(() => JSON.parse(localStorage.getItem('sj_cart') || '[]'));
  const [fav,setFav] = useState(() => JSON.parse(localStorage.getItem('sj_fav') || '[]'));
  const [menu,setMenu] = useState(false);
  const [toast,setToast] = useState('');
  const [user,setUser] = useState(null);
  const [authOpen,setAuthOpen] = useState(false);
  const [adminMode,setAdminMode] = useState(false);
  const [publicConfig,setPublicConfig] = useState({isSandboxMode:true,freeShippingThreshold:5000000});
  const [loading,setLoading] = useState(true);
  const [paymentResult,setPaymentResult] = useState(null);

  const notify = msg => { setToast(msg); clearTimeout(window.__sjToast); window.__sjToast=setTimeout(()=>setToast(''),2200); };
  const loadProducts = async () => { const d=await api('/api/products'); setProducts(d.products); };
  const refreshMe = async () => { const d=await api('/api/auth/me'); setUser(d.user); return d.user; };

  useEffect(() => {
    document.documentElement.dataset.theme=theme; localStorage.theme=theme;
  },[theme]);
  useEffect(() => localStorage.setItem('sj_cart',JSON.stringify(cart)),[cart]);
  useEffect(() => localStorage.setItem('sj_fav',JSON.stringify(fav)),[fav]);
  useEffect(() => { window.scrollTo({top:0,behavior:'smooth'}); },[page,adminMode]);
  useEffect(() => {
    (async()=>{
      try {
        const [p,c,m]=await Promise.all([api('/api/products'),api('/api/config/public'),api('/api/auth/me')]);
        setProducts(p.products); setPublicConfig(c); setUser(m.user);
      } catch(e) { notify(e.message); }
      finally { setLoading(false); }
    })();
    const q=new URLSearchParams(location.search);
    const payment=q.get('payment');
    if(payment){
      setPaymentResult({ok:payment==='success',order:q.get('order'),ref:q.get('ref') || '',reason:q.get('reason') || ''});
      setPage('payment-result');
      if(payment==='success') setCart([]);
      history.replaceState({},'',location.pathname);
    }
  },[]);

  const filtered = useMemo(() => products.filter(p => (cat==='all'||p.category===cat) && (!query || `${p.title} ${p.desc} ${p.sku}`.toLowerCase().includes(query.toLowerCase()))),[products,cat,query]);
  const add = p => {
    if(p.stock<=0) return notify('این کالا فعلاً ناموجود است');
    setCart(c=>{ const x=c.find(i=>i.id===p.id); return x ? c.map(i=>i.id===p.id?{...i,qty:Math.min(i.qty+1,p.stock)}:i) : [...c,{...p,qty:1}]; });
    notify('به سبد خرید اضافه شد');
  };
  const go = p => { setPage(p); setMenu(false); setAdminMode(false); };
  const logout = async () => { await api('/api/auth/logout',{method:'POST'}); setUser(null); setAdminMode(false); go('home'); notify('از حساب خارج شدید'); };
  const openAdmin = () => { setMenu(false); setAdminMode(true); };

  if(adminMode) return <Admin user={user} setUser={setUser} onExit={()=>setAdminMode(false)} notify={notify}/>;
  if(loading) return <div className="boot"><RefreshCw className="spin"/><b>اسپرت جاوید</b><span>در حال آماده‌سازی فروشگاه...</span></div>;

  return <div className="app">
    <div className="topbar"><span>ارسال رایگان سفارش‌های بالای {toman(publicConfig.freeShippingThreshold)}</span><span><MapPin size={14}/> قم، خیابان شهیدان حسنی، نبش ۱۸</span></div>
    <header>
      <button className="mobile" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button>
      <button className="brand" onClick={()=>go('home')}><b>SJ</b><span><strong>اسپرت جاوید</strong><small>SPORT CAR JAVID</small></span></button>
      <div className={'nav '+(menu?'open':'')}>
        <button onClick={()=>go('home')}>خانه</button><button onClick={()=>go('shop')}>فروشگاه</button><button onClick={()=>go('services')}>خدمات نصب</button><button onClick={()=>go('about')}>درباره ما</button><button onClick={()=>go('contact')}>تماس</button><button className="admin-link" onClick={openAdmin}>پنل مدیریت</button>
      </div>
      <div className="actions">
        <button onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="تغییر تم">{theme==='dark'?<Sun/>:<Moon/>}</button>
        <button onClick={()=>user?go('account'):setAuthOpen(true)} aria-label="حساب کاربری"><User/><span className="desktop-label">{user?.name?.split(' ')[0] || ''}</span></button>
        <button onClick={()=>go('cart')} className="cart"><ShoppingBag/><i>{cart.reduce((a,b)=>a+b.qty,0)}</i></button>
      </div>
    </header>

    {page==='home'&&<Home products={products} go={go} setCat={setCat} add={add} fav={fav} setFav={setFav}/>} 
    {page==='shop'&&<Shop cat={cat} setCat={setCat} query={query} setQuery={setQuery} items={filtered} add={add} fav={fav} setFav={setFav}/>} 
    {page==='cart'&&<Cart cart={cart} setCart={setCart} go={go}/>} 
    {page==='checkout'&&<Checkout cart={cart} user={user} onNeedAuth={()=>setAuthOpen(true)} publicConfig={publicConfig} onSuccess={r=>{setPaymentResult({ok:true,...r});setCart([]);setPage('payment-result')}} notify={notify}/>} 
    {page==='account'&&<Account user={user} setUser={setUser} logout={logout} onNeedAuth={()=>setAuthOpen(true)} notify={notify}/>} 
    {page==='payment-result'&&<PaymentResult result={paymentResult} go={go}/>} 
    {page==='services'&&<InfoPage type="services"/>}{page==='about'&&<InfoPage type="about"/>}{page==='contact'&&<InfoPage type="contact"/>}

    <footer>
      <div className="footer-brand"><div className="logo">SJ</div><h3>اسپرت جاوید</h3><p>تخصص، اصالت و هیجان برای خودروی شما</p></div>
      <div><h4>دسترسی سریع</h4><button onClick={()=>go('shop')}>فروشگاه</button><button onClick={()=>go('services')}>خدمات نصب</button><button onClick={openAdmin}>پنل مدیریت</button></div>
      <div><h4>تماس با ما</h4><p>قم، خیابان شهیدان حسنی، نبش ۱۸</p><p>۰۲۵-۳۲۵۰ ۱۸۱۸</p><p>شنبه تا پنجشنبه ۹ تا ۲۱</p></div>
      <div><h4>خرید مطمئن</h4><div className="trust"><span>ضمانت<br/>اصالت</span><span>پرداخت<br/>امن</span></div></div>
      <small className="copy">© ۱۴۰۵ اسپرت جاوید — فروشگاه آنلاین</small>
    </footer>
    {authOpen&&<AuthModal onClose={()=>setAuthOpen(false)} onAuthed={u=>{setUser(u);setAuthOpen(false);notify('خوش آمدید')}}/>}
    {toast&&<div className="toast"><CheckCircle2/> {toast}</div>}
  </div>;
}


createRoot(document.getElementById('root')).render(<App/>);
