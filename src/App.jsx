import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, FacebookAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, where, getDocs, updateDoc, onSnapshot } from "firebase/firestore";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SITE_NAME = "ShopSaya";
const SITE_DOMAIN = "shopsayaph.com";
const SITE_EMAIL = "shopsayaph@gmail.com";
const MIN_WITHDRAWAL = 100;
const AFFILIATE_ID = "kashim1080";

// ─── FIREBASE ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAz5t9kQ3-wyQ-kWO2EjTMUwspxe-gUq5k",
  authDomain: "shopsayaph-63818.firebaseapp.com",
  projectId: "shopsayaph-63818",
  storageBucket: "shopsayaph-63818.firebasestorage.app",
  messagingSenderId: "1071825458706",
  appId: "1:1071825458706:web:35d2d059011144b872eacb",
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const fbProvider = new FacebookAuthProvider();
// We only request the default "public_profile" scope (name + photo) — no email, no friends list.

// ─── CLEAN MODERN PALETTE ─────────────────────────────────────────────────────
const P  = "#EE4D2D";   // Shopee orange — primary brand color
const PL = "#FFF3F0";   // Shopee orange light bg
const PD = "#D43F21";   // Shopee orange dark hover
const AC = "#00C48C";   // accent green — cashback/money
const AL = "#E6FAF5";   // green light
const RD = "#FF4D4F";   // red — prices/discounts
const YL = "#FAAD14";   // yellow — badges
const DK = "#111827";   // near black
const GY = "#6B7280";   // gray text
const LG = "#F3F4F6";   // light gray bg
const WH = "#FFFFFF";

const fp = n => "₱" + Number(n).toLocaleString("en-PH");
const getCashback = p => Math.floor((p.price * p.commRate) / 100 / 2);

// ─── SEED PRODUCTS (used once to migrate into Firestore via Admin page) ───────
const SEED_PRODUCTS = [
  {id:"10225333379",title:"RJ Gigline - Skycaster Electric Guitar (Stratocaster)",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98t-lm8fghjny55b4e.webp",price:10999,sold:84,commRate:5,discount:0,category:"Music",affiliateLink:"https://s.shopee.ph/110YjIhQC8"},
  {id:"50957597615",title:"800VA 480W UPS Uninterruptible Power Supply Smart LCD",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-81ztl-mm6x0t9lqznz2c.webp",price:1758,sold:28,commRate:9,discount:67,category:"Electronics",affiliateLink:"https://s.shopee.ph/8pjQ3hLRC7"},
  {id:"27757777092",title:"DITO Home WiFi Pro w/ 15 Days UNLI 5G Data",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-820la-mpgqynipt89a6d.webp",price:1490,sold:10000,commRate:12,discount:25,category:"Electronics",affiliateLink:"https://s.shopee.ph/AKYDqSTGoK"},
  {id:"28271711817",title:"24/36/48/60/80 Double-headed Marker Pen Set Oily Colors Art",image:"https://down-bs-ph.img.susercontent.com/cn-11134207-7ras8-mberyuyfeon9a6.webp",price:329,sold:34,commRate:40,discount:0,category:"Stationery",affiliateLink:"https://s.shopee.ph/3g1Jajee8c"},
  {id:"26336892291",title:"4G Pocket WiFi 3000mAh Openline Router Hotspot",image:"https://down-bs-ph.img.susercontent.com/ph-11134207-820la-mp23jcsc4a321b.webp",price:809,sold:4,commRate:8,discount:51,category:"Electronics",affiliateLink:"https://s.shopee.ph/110YPpfegV"},
  {id:"41761689361",title:"DITO Home Prepaid Unlimited 5G free unli data 1 month",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-81zto-mmcx95e4z1tufe.webp",price:1480,sold:9,commRate:8,discount:0,category:"Electronics",affiliateLink:"https://s.shopee.ph/30lcnW4lRj"},
  {id:"99912345601",title:"NSS 300w 80000mAh Large Capacity Power Station",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-nsspower.webp",price:4170,sold:7000,commRate:16,discount:45,category:"Electronics",affiliateLink:"https://s.shopee.ph/181E2DetB"},
  {id:"99912345602",title:"Infinix XPAD 20 Pro 5G+ WiFi 8+256GB 11 inch 90Hz",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-xpad20.webp",price:5059,sold:970,commRate:11,discount:41,category:"Electronics",affiliateLink:"https://s.shopee.ph/8ATix2vd7w"},
  {id:"99912345603",title:"YAMY Wifi Router with SIM Slot 300Mbps 4G/5G",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-yamy1.webp",price:1133,sold:616,commRate:10,discount:48,category:"Electronics",affiliateLink:"https://s.shopee.ph/6L24lgGMIF"},
  {id:"99912345604",title:"Hard Copy Natural Bond Paper A4 Short Long 500 sheets",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-hardcopy.webp",price:200,sold:3000,commRate:10,discount:0,category:"Stationery",affiliateLink:"https://s.shopee.ph/6L24lgtTV2"},
  {id:"99912345605",title:"MEEVIDA Strong Exhaust Fan Mute Ceiling Standard",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-meevida.webp",price:421,sold:1000,commRate:15,discount:0,category:"Home & Living",affiliateLink:"https://s.shopee.ph/7VE29nuRn7"},
  {id:"99912345606",title:"Tagima TW-73 Electric Bass 4-String",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-tagima.webp",price:12899,sold:32,commRate:5,discount:0,category:"Music",affiliateLink:"https://s.shopee.ph/8V6ZLeVTWc"},
  {id:"99912345607",title:"ZoeRax 1U 19 Inch Rack Mount Cable Management All Metal",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-zoerax.webp",price:836,sold:72,commRate:14,discount:0,category:"Electronics",affiliateLink:"https://s.shopee.ph/AAEnKgkUf6"},
  {id:"99912345609",title:"Kexcelled K5 PLA Matte 3D Printer Filament 1.75mm 1KG",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-kexcelled.webp",price:885,sold:1000,commRate:10,discount:0,category:"Gadgets",affiliateLink:"https://s.shopee.ph/3LOTC8X3Vw"},
  {id:"99912345610",title:"Sire V3 4-string JB Bass 2023",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-sirev3.webp",price:26949,sold:7,commRate:5,discount:0,category:"Music",affiliateLink:"https://s.shopee.ph/4AxaBfiJtI"},
  {id:"99912345611",title:"Tp-link Archer AX12 AX1500 Wi-Fi 6 Router",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-tplink.webp",price:2180,sold:35,commRate:2,discount:27,category:"Electronics",affiliateLink:"https://s.shopee.ph/9fIWjmZ030"},
  {id:"99912345614",title:"CANARY IG-66 Super Stratocaster Electric Guitar",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-canary.webp",price:9800,sold:5,commRate:6,discount:0,category:"Music",affiliateLink:"https://s.shopee.ph/70HlYtNEKw"},
  {id:"99912345630",title:"Cetaphil Gentle Skin Cleanser 500ml",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-cetaphil.webp",price:499,sold:5600,commRate:20,discount:15,category:"Health & Beauty",affiliateLink:"https://s.shopee.ph/110YPpfegV"},
  {id:"99912345631",title:"Vitamin C + Zinc 1000mg Tablet 100 capsules",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-vitc.webp",price:299,sold:8900,commRate:25,discount:0,category:"Health & Beauty",affiliateLink:"https://s.shopee.ph/30lcnW4lRj"},
  {id:"99912345632",title:"Cosrx Advanced Snail 96 Mucin Power Essence 100ml",image:"https://down-ws-ph.img.susercontent.com/ph-11134207-7r98o-cosrx.webp",price:899,sold:3200,commRate:18,discount:10,category:"Health & Beauty",affiliateLink:"https://s.shopee.ph/8pjQ3hLRC7"},
];

const CATEGORIES = ["All","Electronics","Music","Stationery","Home & Living","Health & Beauty","Gadgets"];

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setUser(null); setAuthLoading(false); return; }
      try {
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setUser({ id: fbUser.uid, ...snap.data(), email: fbUser.email });
        } else {
          const fresh = {
            name: fbUser.displayName || "ShopSaya Member",
            picture: fbUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fbUser.displayName||"User")}&background=EE4D2D&color=fff&size=80`,
            provider: "facebook",
            joinedAt: new Date().toISOString(),
            wallet: { pending:0, available:0, totalEarned:0, withdrawn:0 },
            transactions: [],
            gcash: "",
          };
          await setDoc(ref, fresh);
          setUser({ id: fbUser.uid, ...fresh, email: fbUser.email });
        }
      } catch (e) {
        console.error("Failed to load user profile:", e);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const login = () => signInWithPopup(auth, fbProvider);
  const logout = () => signOut(auth);

  const persist = (id, data) => setDoc(doc(db, "users", id), data, { merge: true }).catch(e => console.error("Save failed:", e));

  const updateUser = useCallback((upd) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...upd };
      persist(prev.id, upd);
      return next;
    });
  }, []);

  const addTransaction = useCallback((tx) => {
    setUser(prev => {
      if (!prev) return prev;
      const txs = [...(prev.transactions||[]), {...tx, date: new Date().toISOString(), id: Date.now()}];
      const pending   = txs.filter(t=>t.status==="pending").reduce((a,t)=>a+t.amount,0);
      const available = txs.filter(t=>t.status==="available").reduce((a,t)=>a+t.amount,0);
      const totalEarned = txs.filter(t=>t.type==="cashback").reduce((a,t)=>a+t.amount,0);
      const withdrawn = txs.filter(t=>t.type==="withdrawal").reduce((a,t)=>a+t.amount,0);
      const wallet = { pending, available, totalEarned, withdrawn };
      const next = { ...prev, transactions: txs, wallet };
      persist(prev.id, { transactions: txs, wallet });
      return next;
    });
  }, []);

  return { user, login, logout, updateUser, addTransaction, authLoading };
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, login, logout, updateUser, addTransaction, authLoading } = useAuth();
  const VALID_PAGES = ["home","dashboard","howto","privacy","terms","sell","admin"];
  const pageFromHash = () => {
    const h = window.location.hash.replace("#","");
    return VALID_PAGES.includes(h) ? h : "home";
  };
  const [page, setPageRaw] = useState(pageFromHash);
  const setPage = (p) => {
    setPageRaw(p);
    window.location.hash = p === "home" ? "" : p;
  };
  useEffect(() => {
    const onHashChange = () => setPageRaw(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("commission");
  const [prodPage, setProdPage] = useState(1);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [products, setProducts] = useState([]);
  const PER_PAGE = 20;

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => console.error("Failed to load products:", e));
    return unsub;
  }, []);

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null), 3500); };

  const handleLogin = async () => {
    try {
      await login();
      setShowLogin(false);
      showToast("👋 Maligayang pagdating sa ShopSaya!");
    } catch (err) {
      console.error("Login failed:", err);
      const cancelled = err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request";
      if (!cancelled) showToast("Hindi na-login. Subukan ulit.", "error");
    }
  };

  if (authLoading) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',system-ui,sans-serif",color:GY,fontSize:14}}>
        Loading ShopSaya...
      </div>
    );
  }

  const filtered = products.filter(p =>
    (cat==="All" || p.category===cat) &&
    (!search || p.title.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b) => {
    if(sort==="commission") return b.commRate-a.commRate;
    if(sort==="cashback") return getCashback(b)-getCashback(a);
    if(sort==="sold") return b.sold-a.sold;
    if(sort==="price_asc") return a.price-b.price;
    if(sort==="price_desc") return b.price-a.price;
    if(sort==="discount") return b.discount-a.discount;
    return 0;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((prodPage-1)*PER_PAGE, prodPage*PER_PAGE);

  const handleShop = p => {
    window.open(p.affiliateLink, "_blank");
    if (user) {
      addTransaction({ type:"cashback", amount:getCashback(p), status:"pending", product:p.title, productId:p.id });
      showToast(`✅ ${fp(getCashback(p))} cashback recorded! Complete your order to confirm.`);
    } else {
      setShowLogin(true);
    }
  };

  const handleCopy = p => {
    navigator.clipboard.writeText(p.affiliateLink);
    setCopied(p.id);
    showToast("🔗 Link copied!");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",minHeight:"100vh",background:LG,color:DK}}>
      {/* HEADER */}
      <header style={{background:WH,borderBottom:"1px solid #E5E7EB",position:"sticky",top:0,zIndex:200,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 20px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div onClick={()=>setPage("home")} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}}>
            <div style={{width:34,height:34,borderRadius:10,background:P,display:"flex",alignItems:"center",justifyContent:"center",color:WH,fontWeight:900,fontSize:13}}>SS</div>
            <div>
              <div style={{fontWeight:800,fontSize:18,color:P,lineHeight:1}}>ShopSaya</div>
              <div style={{fontSize:9,color:GY,lineHeight:1,marginTop:1}}>Masaya mag-shop at kumita!</div>
            </div>
          </div>

          <nav style={{display:"flex",alignItems:"center",gap:6}}>
            {[["home","Deals"],["howto","How It Works"]].map(([id,label])=>(
              <button key={id} onClick={()=>setPage(id)} style={{background:page===id?PL:"none",color:page===id?P:GY,border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,fontWeight:page===id?700:400}}>
                {label}
              </button>
            ))}
            <button onClick={()=>setPage("sell")} style={{background:page==="sell"?AC:AL,color:page==="sell"?WH:AC,border:`1.5px solid ${AC}`,borderRadius:20,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
              🏪 Seller ka?
            </button>
            {user ? (
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setPage("dashboard")} style={{background:page==="dashboard"?P:LG,color:page==="dashboard"?WH:DK,border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                  <img src={user.picture} style={{width:22,height:22,borderRadius:"50%"}} alt=""/>
                  Wallet
                  {user.wallet?.available>0 && <span style={{background:AC,color:WH,borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700}}>{fp(user.wallet.available)}</span>}
                </button>
                <button onClick={logout} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:12,color:GY}}>Logout</button>
              </div>
            ) : (
              <button onClick={()=>setShowLogin(true)} style={{background:"#1877F2",color:WH,border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Login
              </button>
            )}
          </nav>
        </div>
      </header>

      {page==="home" && <HomePage filtered={filtered} paginated={paginated} prodPage={prodPage} setProdPage={v=>{setProdPage(v);}} totalPages={totalPages} search={search} setSearch={v=>{setSearch(v);setProdPage(1);}} cat={cat} setCat={v=>{setCat(v);setProdPage(1);}} sort={sort} setSort={setSort} handleShop={handleShop} handleCopy={handleCopy} copied={copied} user={user} setShowLogin={setShowLogin} setPage={setPage} showToast={showToast} products={products} />}
      {page==="dashboard" && user && <Dashboard user={user} updateUser={updateUser} addTransaction={addTransaction} showToast={showToast} setPage={setPage} />}
      {page==="howto" && <HowItWorks setPage={setPage} />}
      {page==="privacy" && <LegalPage type="privacy" setPage={setPage} />}
      {page==="terms" && <LegalPage type="terms" setPage={setPage} />}
      {page==="sell" && <SellerPage showToast={showToast} />}
      {page==="admin" && <AdminPage user={user} showToast={showToast} products={products} />}

      {showLogin && <LoginModal onLogin={handleLogin} onClose={()=>setShowLogin(false)} />}

      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#DC2626":DK,color:WH,padding:"12px 24px",borderRadius:24,fontWeight:600,fontSize:14,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,.25)",whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}

      <footer style={{background:DK,color:"#9CA3AF",textAlign:"center",padding:"28px 20px",fontSize:12,marginTop:48}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
          <div style={{width:24,height:24,borderRadius:6,background:P,display:"flex",alignItems:"center",justifyContent:"center",color:WH,fontWeight:900,fontSize:12}}>P</div>
          <strong style={{color:WH,fontSize:14}}>ShopSaya PH</strong>
          <span style={{color:"#4B5563"}}>·</span>
          <span>{SITE_DOMAIN}</span>
        </div>
        <div style={{marginBottom:10,color:"#6B7280"}}>ShopSaya PH — Masaya mag-shop at kumita! · Shopee Affiliate: {AFFILIATE_ID}</div>
        <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap",marginBottom:12}}>
          {[["privacy","Privacy Policy"],["terms","Terms of Service"],["howto","How It Works"],["sell","Mga Seller"]].map(([pg,label])=>(
            <button key={pg} onClick={()=>setPage(pg)} style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",fontSize:12,textDecoration:"underline"}}>{label}</button>
          ))}
        </div>
        <div style={{color:"#374151"}}>Min withdrawal: {fp(MIN_WITHDRAWAL)} · © {new Date().getFullYear()} ShopSaya PH</div>
      </footer>
    </div>
  );
}

// ─── LOGIN MODAL ──────────────────────────────────────────────────────────────
function LoginModal({onLogin, onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:WH,borderRadius:20,padding:32,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{width:40,height:40,borderRadius:12,background:P,display:"flex",alignItems:"center",justifyContent:"center",color:WH,fontWeight:900,fontSize:13}}>SS</div>
          <div>
            <div style={{fontWeight:800,fontSize:18,color:DK}}>Sumali sa ShopSaya</div>
            <div style={{fontSize:12,color:GY}}>Masaya mag-shop at kumita! 😊</div>
          </div>
        </div>

        <div style={{background:PL,borderRadius:12,padding:16,marginBottom:20}}>
          {[["💰","Kumita ng cashback sa bawat Shopee order"],["🔒","Hindi kailangan ng GCash para mag-join"],["📊","I-track ang iyong kita sa ShopSaya wallet"],["💸","Mag-withdraw sa GCash anytime pag ₱100 na"]].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<3?10:0,fontSize:13,color:DK}}>
              <span>{ic}</span> {txt}
            </div>
          ))}
        </div>

        <button onClick={onLogin} style={{width:"100%",background:"#1877F2",color:WH,border:"none",borderRadius:12,padding:"13px",cursor:"pointer",fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:12}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Continue with Facebook
        </button>
        <div style={{fontSize:11,color:"#9CA3AF",textAlign:"center",lineHeight:1.5}}>We only access your name and photo. We never post to your Facebook.</div>
        <button onClick={onClose} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",color:GY,cursor:"pointer",fontSize:13}}>Mamaya na</button>
      </div>
    </div>
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({filtered,paginated,prodPage,setProdPage,totalPages,search,setSearch,cat,setCat,sort,setSort,handleShop,handleCopy,copied,user,setShowLogin,setPage,showToast,products}) {
  const total = products.reduce((a,p)=>a+getCashback(p),0);
  return (
    <>
      {/* HERO BANNER */}
      <div style={{background:`linear-gradient(135deg,#EE4D2D 0%,#FF6633 100%)`,color:WH,padding:"40px 20px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:24}}>
          <div style={{maxWidth:520}}>
            <div style={{display:"inline-block",background:"rgba(255,255,255,.15)",borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>
              🇵🇭 SHOPEE PHILIPPINES · CASHBACK DEALS
            </div>
            <h1 style={{fontSize:"clamp(26px,4vw,42px)",fontWeight:900,margin:"0 0 10px",lineHeight:1.15}}>
              Mag-shop. Kumita. Masaya!
              <span style={{color:"#A5F3FC"}}>ShopSaya ka!</span>
            </h1>
            <p style={{fontSize:15,opacity:.9,margin:"0 0 24px",lineHeight:1.7}}>
              I-shop sa Shopee gamit ang aming links at kumita ng real cashback — auto-tracked sa iyong ShopSaya wallet. Mag-withdraw sa GCash pag ₱100 na!
            </p>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              {[[products.length+"","Products"],["Up to 40%","Commission"],["₱"+total.toLocaleString(),"Cashback Pool"]].map(([n,l],i)=>(
                <div key={i} style={{background:"rgba(255,255,255,.12)",borderRadius:12,padding:"10px 16px",backdropFilter:"blur(8px)"}}>
                  <div style={{fontSize:18,fontWeight:800}}>{n}</div>
                  <div style={{fontSize:11,opacity:.8,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* WALLET CARD */}
          <div style={{background:WH,borderRadius:20,padding:24,width:260,boxShadow:"0 8px 40px rgba(0,0,0,.2)"}}>
            {user ? (
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <img src={user.picture} style={{width:42,height:42,borderRadius:"50%",border:`2px solid ${P}`}} alt=""/>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:DK}}>{user.name}</div>
                    <div style={{fontSize:11,color:P,fontWeight:600}}>ShopSaya Member ✓</div>
                  </div>
                </div>
                <div style={{background:PL,borderRadius:12,padding:14,marginBottom:12,textAlign:"center"}}>
                  <div style={{fontSize:11,color:P,fontWeight:600,marginBottom:4}}>💰 AVAILABLE CASHBACK</div>
                  <div style={{fontSize:28,fontWeight:900,color:P}}>{fp(user.wallet?.available||0)}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,background:LG,borderRadius:8,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:10,color:GY,marginBottom:2}}>Pending</div>
                    <div style={{fontSize:13,fontWeight:700,color:DK}}>{fp(user.wallet?.pending||0)}</div>
                  </div>
                  <div style={{flex:1,background:AL,borderRadius:8,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:10,color:AC,marginBottom:2}}>Earned</div>
                    <div style={{fontSize:13,fontWeight:700,color:AC}}>{fp(user.wallet?.totalEarned||0)}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{textAlign:"center",marginBottom:16}}>
                  <div style={{width:52,height:52,borderRadius:16,background:PL,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:24}}>💰</div>
                  <div style={{fontWeight:700,fontSize:15,color:DK,marginBottom:4}}>Ang iyong ShopSaya Wallet</div>
                  <div style={{fontSize:12,color:GY,lineHeight:1.5}}>Login to track earnings and withdraw to GCash</div>
                </div>
                <button onClick={()=>setShowLogin(true)} style={{width:"100%",background:"#1877F2",color:WH,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Login with Facebook
                </button>
                <div style={{textAlign:"center",marginTop:8,fontSize:11,color:"#9CA3AF"}}>Libre · Hindi kailangan ng GCash para sumali</div>
              </>
            )}
          </div>
        </div>
      </div>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"24px 16px"}}>
        {/* FILTERS */}
        <div style={{background:WH,borderRadius:14,padding:16,marginBottom:18,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          <input style={{width:"100%",padding:"10px 16px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:14,marginBottom:12,boxSizing:"border-box",outline:"none",transition:"border .2s"}}
            placeholder="Maghanap ng deals..."
            value={search} onChange={e=>setSearch(e.target.value)}
            onFocus={e=>e.target.style.borderColor=P}
            onBlur={e=>e.target.style.borderColor="#E5E7EB"} />
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {CATEGORIES.map(c=>(
                <button key={c} onClick={()=>setCat(c)} style={{background:cat===c?P:LG,color:cat===c?WH:GY,border:"none",borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:cat===c?600:400,transition:"all .15s"}}>
                  {c}
                </button>
              ))}
            </div>
            <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:"6px 12px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12,cursor:"pointer",background:WH,color:DK}}>
              <option value="commission">Highest Commission</option>
              <option value="cashback">Most Cashback</option>
              <option value="discount">Biggest Discount</option>
              <option value="sold">Best Selling</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>
        </div>

        <div style={{fontSize:13,color:GY,marginBottom:14}}>
          Showing <strong style={{color:DK}}>{filtered.length}</strong> deals
          {!user && <span style={{color:P,marginLeft:8,fontSize:12,fontWeight:500}}>→ Mag-login para i-track ang cashback mo</span>}
        </div>

        {/* GRID */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:14}}>
          {paginated.map(p=><ProductCard key={p.id} product={p} onShop={()=>handleShop(p)} onCopy={()=>handleCopy(p)} copied={copied===p.id} user={user} />)}
        </div>

        {filtered.length===0 && (
          <div style={{textAlign:"center",padding:"60px 20px",color:GY}}>
            <div style={{fontSize:40,marginBottom:10}}>🔍</div>
            <div style={{fontSize:15,fontWeight:600}}>No deals found</div>
            <div style={{fontSize:13,marginTop:4}}>Subukan ang ibang keyword o category</div>
          </div>
        )}

        {/* PAGINATION */}
        {totalPages>1 && (
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginTop:28,flexWrap:"wrap"}}>
            <button onClick={()=>setProdPage(p=>Math.max(1,p-1))} disabled={prodPage===1} style={{padding:"7px 14px",border:`1.5px solid ${prodPage===1?"#E5E7EB":P}`,borderRadius:8,cursor:prodPage===1?"default":"pointer",background:WH,color:prodPage===1?"#D1D5DB":P,fontWeight:600,fontSize:13}}>‹ Prev</button>
            {Array.from({length:totalPages},(_,i)=>(
              <button key={i} onClick={()=>setProdPage(i+1)} style={{width:34,height:34,border:`1.5px solid ${prodPage===i+1?P:"#E5E7EB"}`,borderRadius:8,cursor:"pointer",background:prodPage===i+1?P:WH,color:prodPage===i+1?WH:DK,fontWeight:prodPage===i+1?700:400,fontSize:13}}>
                {i+1}
              </button>
            ))}
            <button onClick={()=>setProdPage(p=>Math.min(totalPages,p+1))} disabled={prodPage===totalPages} style={{padding:"7px 14px",border:`1.5px solid ${prodPage===totalPages?"#E5E7EB":P}`,borderRadius:8,cursor:prodPage===totalPages?"default":"pointer",background:WH,color:prodPage===totalPages?"#D1D5DB":P,fontWeight:600,fontSize:13}}>Next ›</button>
          </div>
        )}

        <RequestItem user={user} showToast={showToast} />
      </main>
    </>
  );
}

// ─── REQUEST AN ITEM ────────────────────────────────────────────────────────
function RequestItem({user, showToast}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) { showToast("I-type muna ang product na hinahanap mo 🙂", "error"); return; }
    if (trimmed.length > 300) { showToast("Pasensya, masyadong haba. Paikliin pa konti.", "error"); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, "productRequests"), {
        text: trimmed,
        userId: user?.id || null,
        userName: user?.name || "Guest",
        createdAt: serverTimestamp(),
        status: "pending",
      });
      setText("");
      showToast("Salamat! Hahanapan ka namin ng deal para dito. 🎉");
    } catch (e) {
      console.error("Failed to submit request:", e);
      showToast("Hindi na-submit. Subukan ulit.", "error");
    }
    setBusy(false);
  };

  return (
    <div style={{marginTop:32,background:`linear-gradient(135deg,${PL} 0%,#FFF 100%)`,border:`1.5px dashed ${P}`,borderRadius:16,padding:"28px 24px",textAlign:"center"}}>
      <div style={{fontSize:28,marginBottom:8}}>🔍</div>
      <div style={{fontWeight:800,fontSize:17,color:DK,marginBottom:6}}>Hindi mo nakita ang hinahanap mo?</div>
      <div style={{fontSize:13,color:GY,marginBottom:18,maxWidth:440,margin:"0 auto 18px"}}>
        I-drop dito ang product name o Shopee link — at hahanapan ka namin ng magandang deal!
      </div>
      <div style={{display:"flex",gap:10,maxWidth:480,margin:"0 auto",flexWrap:"wrap"}}>
        <input
          value={text}
          onChange={e=>setText(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter") submit();}}
          placeholder="hal. wireless earbuds, o i-paste ang Shopee link..."
          style={{flex:1,minWidth:200,padding:"11px 16px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:13,outline:"none",boxSizing:"border-box"}}
        />
        <button onClick={submit} disabled={busy} style={{background:P,color:WH,border:"none",borderRadius:10,padding:"11px 22px",cursor:busy?"default":"pointer",fontWeight:700,fontSize:13,opacity:busy?.7:1}}>
          {busy ? "..." : "Magpa-request"}
        </button>
      </div>
    </div>
  );
}

// ─── SELLER PAGE ────────────────────────────────────────────────────────────
function SellerPage({showToast}) {
  const [link, setLink] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const l = link.trim(), n = sellerName.trim();
    if (!l || !/^https?:\/\//i.test(l)) { showToast("I-paste ang buong Shopee product link (dapat magsimula sa https://)", "error"); return; }
    if (!n) { showToast("I-type ang pangalan ng shop mo", "error"); return; }
    setBusy(true);

    let preview = { title: null, image: null };
    try {
      const res = await fetch("https://fetchproductpreview-1071825458706.asia-southeast1.run.app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: l }),
      });
      if (res.ok) preview = await res.json();
    } catch (e) {
      console.error("Preview fetch failed, continuing without it:", e);
    }

    try {
      await addDoc(collection(db, "sellerSubmissions"), {
        link: l,
        sellerName: n,
        contact: contact.trim() || null,
        title: preview.title || null,
        image: preview.image || null,
        createdAt: serverTimestamp(),
        status: "pending",
      });
      setDone(true);
    } catch (e) {
      console.error("Failed to submit product:", e);
      showToast("Hindi na-submit. Subukan ulit.", "error");
    }
    setBusy(false);
  };

  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"40px 20px"}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:36,marginBottom:8}}>🏪</div>
        <div style={{fontWeight:800,fontSize:22,color:DK,marginBottom:6}}>May Produkto Ka? Ilista Dito!</div>
        <div style={{fontSize:13,color:GY,maxWidth:420,margin:"0 auto"}}>
          I-submit ang Shopee product link mo. Kung qualified ang commission rate, ilalagay namin ito sa ShopSaya at ipopromote namin sa mga shopper — libre!
        </div>
      </div>

      {done ? (
        <div style={{background:AL,border:`1.5px solid ${AC}`,borderRadius:14,padding:24,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>✅</div>
          <div style={{fontWeight:700,fontSize:15,color:DK,marginBottom:6}}>Salamat sa pag-submit!</div>
          <div style={{fontSize:13,color:GY}}>Susuriin namin ang commission rate ng product mo within 1-2 business days. Makikita mo ito sa Deals page kapag na-approve.</div>
        </div>
      ) : (
        <div style={{background:WH,borderRadius:16,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:600,color:DK,display:"block",marginBottom:5}}>Shopee Product Link *</label>
            <input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://shopee.ph/product/..." style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:600,color:DK,display:"block",marginBottom:5}}>Pangalan ng Shop *</label>
            <input value={sellerName} onChange={e=>setSellerName(e.target.value)} placeholder="hal. Aling Marites Beauty Store" style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:600,color:DK,display:"block",marginBottom:5}}>Facebook o Contact Number (optional)</label>
            <input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Para makontak ka namin kung may tanong" style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button onClick={submit} disabled={busy} style={{width:"100%",background:AC,color:WH,border:"none",borderRadius:10,padding:"13px",cursor:busy?"default":"pointer",fontWeight:700,fontSize:14,opacity:busy?.7:1}}>
            {busy ? "Sending..." : "I-submit ang Produkto"}
          </button>
        </div>
      )}
    </div>
  );
}


// ─── ADMIN PAGE ─────────────────────────────────────────────────────────────
const ADMIN_UID = "0QbPdrae5YTaURCqW4l6HEEH23l2";

function AdminPage({user, showToast, products}) {
  const [submissions, setSubmissions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [dealNotes, setDealNotes] = useState({});

  const isAdmin = user && user.id === ADMIN_UID;

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    (async () => {
      try {
        const subSnap = await getDocs(query(collection(db, "sellerSubmissions"), where("status", "==", "pending")));
        setSubmissions(subSnap.docs.map(d => ({id: d.id, ...d.data()})));
        const reqSnap = await getDocs(query(collection(db, "productRequests"), where("status", "==", "pending")));
        setRequests(reqSnap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch (e) {
        console.error("Failed to load admin data:", e);
      }
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!user) return <div style={{padding:60,textAlign:"center",color:GY}}>Mag-login muna.</div>;
  if (!isAdmin) return <div style={{padding:60,textAlign:"center",color:GY}}>Access denied.</div>;
  if (loading) return <div style={{padding:60,textAlign:"center",color:GY}}>Loading...</div>;

  const setDraft = (id, field, val) => setDrafts(prev => ({...prev, [id]: {...prev[id], [field]: val}}));

  const seedProducts = async () => {
    if (products.length > 0) { showToast("May existing products na, hindi na kailangan i-seed ulit.", "error"); return; }
    try {
      for (const p of SEED_PRODUCTS) {
        await setDoc(doc(db, "products", String(p.id)), p);
      }
      showToast(`${SEED_PRODUCTS.length} products na-seed sa Firestore!`);
    } catch (e) {
      console.error("Seeding failed:", e);
      showToast("Seeding failed. Check console.", "error");
    }
  };

  const approveSubmission = async (sub) => {
    const d = drafts[sub.id] || {};
    const price = Number(d.price), commRate = Number(d.commRate ?? 2), category = d.category;
    if (!price || !commRate || !category) { showToast("Kumpletuhin lahat ng fields (price, commission, category).", "error"); return; }
    try {
      const newId = "seller_" + sub.id;
      await setDoc(doc(db, "products", newId), {
        id: newId,
        title: sub.title || sub.sellerName,
        image: sub.image || "",
        price,
        sold: 0,
        commRate,
        discount: Number(d.discount) || 0,
        category,
        affiliateLink: sub.link,
      });
      await updateDoc(doc(db, "sellerSubmissions", sub.id), { status: "approved" });
      setSubmissions(prev => prev.filter(s => s.id !== sub.id));
      showToast("Na-publish ang product!");
    } catch (e) {
      console.error("Approve failed:", e);
      showToast("Failed to approve. Check console.", "error");
    }
  };

  const rejectSubmission = async (id) => {
    try {
      await updateDoc(doc(db, "sellerSubmissions", id), { status: "rejected" });
      setSubmissions(prev => prev.filter(s => s.id !== id));
      showToast("Submission rejected.");
    } catch (e) { console.error(e); }
  };

  const fulfillRequest = async (id) => {
    try {
      await updateDoc(doc(db, "productRequests", id), { status: "fulfilled", dealNote: dealNotes[id] || "" });
      setRequests(prev => prev.filter(r => r.id !== id));
      showToast("Marked as fulfilled — user will see the notification.");
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{maxWidth:840,margin:"0 auto",padding:"32px 16px"}}>
      <div style={{fontWeight:800,fontSize:22,marginBottom:20}}>Admin</div>

      {products.length === 0 && (
        <div style={{background:PL,border:`1.5px solid ${P}`,borderRadius:12,padding:16,marginBottom:28}}>
          <div style={{fontSize:13,marginBottom:10}}>Walang products sa Firestore pa. I-seed ang original 20 products?</div>
          <button onClick={seedProducts} style={{background:P,color:WH,border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer"}}>Seed Initial Products</button>
        </div>
      )}

      <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>Pending Seller Submissions ({submissions.length})</div>
      {submissions.length===0 && <div style={{color:GY,fontSize:13,marginBottom:28}}>Walang pending submissions.</div>}
      {submissions.map(sub => (
        <div key={sub.id} style={{background:WH,border:"1px solid #E5E7EB",borderRadius:12,padding:16,marginBottom:12,display:"flex",gap:14}}>
          {sub.image ? <img src={sub.image} alt="" style={{width:70,height:70,borderRadius:8,objectFit:"cover",flexShrink:0}}/> : <div style={{width:70,height:70,borderRadius:8,background:LG,flexShrink:0}}/>}
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{sub.title || "(walang title na-fetch)"}</div>
            <div style={{fontSize:12,color:GY,marginBottom:8}}>Seller: {sub.sellerName} · {sub.contact || "no contact"} · <a href={sub.link} target="_blank" rel="noreferrer">link</a></div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
              <input placeholder="Price ₱" type="number" onChange={e=>setDraft(sub.id,"price",e.target.value)} style={{width:90,padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12}}/>
              <input placeholder="Commission %" type="number" defaultValue={2} onChange={e=>setDraft(sub.id,"commRate",e.target.value)} style={{width:110,padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12}}/>
              <input placeholder="Discount % (optional)" type="number" onChange={e=>setDraft(sub.id,"discount",e.target.value)} style={{width:140,padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12}}/>
              <select onChange={e=>setDraft(sub.id,"category",e.target.value)} defaultValue="" style={{padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12}}>
                <option value="" disabled>Category</option>
                {CATEGORIES.filter(c=>c!=="All").map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>approveSubmission(sub)} style={{background:AC,color:WH,border:"none",borderRadius:8,padding:"7px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Approve & Publish</button>
              <button onClick={()=>rejectSubmission(sub.id)} style={{background:"none",color:GY,border:"1px solid #E5E7EB",borderRadius:8,padding:"7px 16px",fontWeight:600,fontSize:12,cursor:"pointer"}}>Reject</button>
            </div>
          </div>
        </div>
      ))}

      <div style={{fontWeight:700,fontSize:16,margin:"28px 0 12px"}}>Pending Product Requests ({requests.length})</div>
      {requests.length===0 && <div style={{color:GY,fontSize:13}}>Walang pending requests.</div>}
      {requests.map(req => (
        <div key={req.id} style={{background:WH,border:"1px solid #E5E7EB",borderRadius:12,padding:16,marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>"{req.text}"</div>
          <div style={{fontSize:12,color:GY,marginBottom:10}}>From: {req.userName || "Guest"}</div>
          <input placeholder="Optional note (e.g. 'check Electronics category')" onChange={e=>setDealNotes(prev=>({...prev,[req.id]:e.target.value}))} style={{width:"100%",padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12,marginBottom:8,boxSizing:"border-box"}}/>
          <button onClick={()=>fulfillRequest(req.id)} style={{background:AC,color:WH,border:"none",borderRadius:8,padding:"7px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Mark Fulfilled</button>
        </div>
      ))}
    </div>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({product:p, onShop, onCopy, copied, user}) {
  const cb = getCashback(p);
  const orig = p.discount ? Math.round(p.price/(1-p.discount/100)) : null;
  const [imgOk, setImgOk] = useState(true);
  const icons = {Music:"🎸",Electronics:"📱",Fashion:"👗","Health & Beauty":"💄",Sports:"⚽",Toys:"🧸",Stationery:"✏️","Home & Living":"🏠",Gadgets:"🔧"};

  return (
    <div style={{background:WH,borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.07)",display:"flex",flexDirection:"column",transition:"transform .15s,box-shadow .15s"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.1)"}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.07)"}}>

      {/* IMAGE */}
      <div style={{position:"relative",height:180,background:LG,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        {imgOk
          ? <img src={p.image} alt={p.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setImgOk(false)}/>
          : <div style={{fontSize:48}}>{icons[p.category]||"📦"}</div>}

        {/* BADGES */}
        <div style={{position:"absolute",top:8,left:8,display:"flex",flexDirection:"column",gap:4}}>
          {p.discount>0 && <span style={{background:RD,color:WH,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6}}>{p.discount}% OFF</span>}
          {p.commRate>=15 && <span style={{background:YL,color:WH,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6}}>🔥 Hot</span>}
          {p.sold>=1000 && <span style={{background:AC,color:WH,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6}}>⭐ Top</span>}
        </div>

        {/* CASHBACK PILL */}
        <div style={{position:"absolute",top:8,right:8,background:AC,color:WH,fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20}}>
          +{fp(cb)}
        </div>
      </div>

      {/* BODY */}
      <div style={{padding:12,flex:1,display:"flex",flexDirection:"column",gap:6}}>
        <div style={{fontSize:10,fontWeight:600,color:P,textTransform:"uppercase",letterSpacing:.5}}>{p.category}</div>
        <div style={{fontSize:13,color:DK,lineHeight:1.45,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",minHeight:38}}>{p.title}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:17,fontWeight:800,color:RD}}>{fp(p.price)}</span>
          {orig && <span style={{fontSize:11,color:"#9CA3AF",textDecoration:"line-through"}}>{fp(orig)}</span>}
        </div>

        <div style={{display:"flex",gap:6}}>
          <div style={{flex:1,background:LG,borderRadius:6,padding:"4px 0",fontSize:11,color:GY,textAlign:"center"}}>{p.commRate}% comm</div>
          <div style={{flex:1,background:AL,borderRadius:6,padding:"4px 0",fontSize:11,color:AC,fontWeight:700,textAlign:"center"}}>+{fp(cb)} cashback</div>
        </div>

        <div style={{fontSize:10,color:"#9CA3AF"}}>{p.sold>=1000?`${(p.sold/1000).toFixed(1)}K`:p.sold} sold</div>

        <div style={{display:"flex",gap:8,marginTop:"auto"}}>
          <button onClick={onShop} style={{flex:1,background:P,color:WH,border:"none",borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12,transition:"background .15s"}}
            onMouseEnter={e=>e.target.style.background=PD}
            onMouseLeave={e=>e.target.style.background=P}>
            Shop & Earn
          </button>
          <button onClick={onCopy} style={{background:copied?AL:LG,color:copied?AC:GY,border:"none",borderRadius:8,padding:"9px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>
            {copied?"✓":"Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({user,updateUser,addTransaction,showToast,setPage}) {
  const [showW, setShowW] = useState(false);
  const [gcashNum, setGcashNum] = useState(user.gcash||"");
  const [gcashName, setGcashName] = useState("");
  const [amt, setAmt] = useState("");
  const [fulfilled, setFulfilled] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "productRequests"), where("userId", "==", user.id), where("status", "==", "fulfilled"));
        const snap = await getDocs(q);
        const unseen = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(r => !r.seen);
        setFulfilled(unseen);
      } catch (e) {
        console.error("Failed to load request notifications:", e);
      }
    })();
  }, [user.id]);

  const dismissRequest = async (id) => {
    setFulfilled(prev => prev.filter(r => r.id !== id));
    try { await updateDoc(doc(db, "productRequests", id), { seen: true }); } catch (e) { console.error("Failed to mark seen:", e); }
  };

  const handleWithdraw = () => {
    const n = parseFloat(amt);
    if(!gcashNum||gcashNum.length<11){showToast("Enter a valid GCash number","error");return;}
    if(!gcashName){showToast("Enter your GCash account name","error");return;}
    if(!n||n<MIN_WITHDRAWAL){showToast(`Minimum withdrawal is ${fp(MIN_WITHDRAWAL)}`,"error");return;}
    if(n>(user.wallet?.available||0)){showToast("Insufficient balance","error");return;}
    updateUser({gcash:gcashNum});
    addTransaction({type:"withdrawal",amount:-n,status:"processing",gcash:gcashNum,gcashName});
    showToast(`✅ Withdrawal of ${fp(n)} submitted! Processing within 24 hours.`);
    setShowW(false); setAmt("");
  };

  const txs = [...(user.transactions||[])].reverse();

  return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"24px 16px"}}>
      {/* FULFILLED REQUEST NOTIFICATIONS */}
      {fulfilled.map(r=>(
        <div key={r.id} style={{background:`linear-gradient(135deg,${PL} 0%,#FFF 100%)`,border:`1.5px solid ${P}`,borderRadius:14,padding:16,marginBottom:12,display:"flex",alignItems:"flex-start",gap:12}}>
          <div style={{fontSize:22}}>🎉</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14,color:DK,marginBottom:3}}>Good news, {user.name.split(" ")[0]}!</div>
            <div style={{fontSize:13,color:GY,lineHeight:1.6}}>
              We found a deal for "<strong>{r.text}</strong>"{r.dealNote ? ` — ${r.dealNote}` : ". Check the Deals page!"}
            </div>
          </div>
          <button onClick={()=>dismissRequest(r.id)} style={{background:"none",border:"none",color:GY,cursor:"pointer",fontSize:18,lineHeight:1,padding:4}}>×</button>
        </div>
      ))}

      {/* PROFILE */}
      <div style={{background:WH,borderRadius:14,padding:20,marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.06)",display:"flex",alignItems:"center",gap:14}}>
        <img src={user.picture} style={{width:52,height:52,borderRadius:"50%",border:`2px solid ${P}`}} alt=""/>
        <div>
          <div style={{fontWeight:700,fontSize:17,color:DK}}>{user.name}</div>
          <div style={{fontSize:12,color:GY}}>Member since {new Date(user.joinedAt).toLocaleDateString("en-PH",{month:"long",year:"numeric"})}</div>
          <div style={{fontSize:11,color:P,fontWeight:600,marginTop:2}}>✓ Facebook Verified · ShopSaya Member</div>
        </div>
      </div>

      {/* WALLET */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:14}}>
        {[["💰","Available",user.wallet?.available||0,P,PL],["⏳","Pending",user.wallet?.pending||0,"#D97706","#FEF3C7"],["🏆","Total Earned",user.wallet?.totalEarned||0,AC,AL],["💸","Withdrawn",user.wallet?.withdrawn||0,GY,LG]].map(([ic,label,val,col,bg],i)=>(
          <div key={i} style={{background:bg,borderRadius:12,padding:16,border:i===0?`1px solid ${P}22`:"none"}}>
            <div style={{fontSize:11,color:col,fontWeight:600,marginBottom:4}}>{ic} {label}</div>
            <div style={{fontSize:20,fontWeight:800,color:col}}>{fp(val)}</div>
          </div>
        ))}
      </div>

      {/* WITHDRAW */}
      <div style={{marginBottom:14}}>
        {!showW ? (
          <button onClick={()=>setShowW(true)} disabled={(user.wallet?.available||0)<MIN_WITHDRAWAL}
            style={{width:"100%",background:(user.wallet?.available||0)>=MIN_WITHDRAWAL?P:"#E5E7EB",color:(user.wallet?.available||0)>=MIN_WITHDRAWAL?WH:"#9CA3AF",border:"none",borderRadius:12,padding:"13px",cursor:(user.wallet?.available||0)>=MIN_WITHDRAWAL?"pointer":"default",fontWeight:700,fontSize:14}}>
            {(user.wallet?.available||0)>=MIN_WITHDRAWAL?`💸 Withdraw to GCash`:`Need ${fp(Math.max(0,MIN_WITHDRAWAL-(user.wallet?.available||0)))} more to withdraw`}
          </button>
        ) : (
          <div style={{background:WH,borderRadius:14,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:DK}}>💸 Withdraw to GCash</div>
            {[["GCash Number","09XXXXXXXXX",gcashNum,setGcashNum,"tel"],["GCash Account Name","Full name on GCash",gcashName,setGcashName,"text"],["Amount",`Min ${fp(MIN_WITHDRAWAL)}`,amt,setAmt,"number"]].map(([label,ph,val,setter,type],i)=>(
              <div key={i} style={{marginBottom:12}}>
                <label style={{fontSize:12,color:GY,fontWeight:600,display:"block",marginBottom:5}}>{label}</label>
                <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph} type={type}
                  style={{width:"100%",padding:"10px 14px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
              </div>
            ))}
            <div style={{background:"#F0F9FF",borderRadius:8,padding:12,marginBottom:14,fontSize:12,color:"#0369A1"}}>
              ℹ️ Your GCash number is only used for this withdrawal and is stored securely.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleWithdraw} style={{flex:1,background:P,color:WH,border:"none",borderRadius:8,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:13}}>Confirm</button>
              <button onClick={()=>setShowW(false)} style={{flex:1,background:LG,color:GY,border:"none",borderRadius:8,padding:"11px",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* HISTORY */}
      <div style={{background:WH,borderRadius:14,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16,color:DK}}>Transaction History</div>
        {txs.length===0 ? (
          <div style={{textAlign:"center",padding:"28px 0",color:GY}}>
            <div style={{fontSize:36,marginBottom:8}}>🛍️</div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>No transactions yet</div>
            <div style={{fontSize:12,marginBottom:14}}>Mag-ShopSaya na para kumita!</div>
            <button onClick={()=>setPage("home")} style={{background:P,color:WH,border:"none",borderRadius:20,padding:"8px 20px",cursor:"pointer",fontWeight:600,fontSize:13}}>Tingnan ang Deals</button>
          </div>
        ) : txs.map(tx=>(
          <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #F3F4F6"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:DK,marginBottom:2}}>
                {tx.type==="cashback"?"💰 Cashback":"💸 Withdrawal"}
                {tx.product&&<span style={{fontWeight:400,color:GY}}> · {tx.product.substring(0,28)}...</span>}
              </div>
              <div style={{fontSize:11,color:GY,marginBottom:4}}>{new Date(tx.date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</div>
              <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:tx.status==="pending"?"#FEF3C7":tx.status==="available"?AL:tx.status==="processing"?"#DBEAFE":LG,color:tx.status==="pending"?"#D97706":tx.status==="available"?AC:tx.status==="processing"?"#1D4ED8":GY}}>
                {tx.status?.charAt(0).toUpperCase()+tx.status?.slice(1)}
              </span>
            </div>
            <div style={{fontSize:15,fontWeight:800,color:tx.amount>0?AC:RD}}>
              {tx.amount>0?"+":""}{fp(Math.abs(tx.amount))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────────
function HowItWorks({setPage}) {
  return (
    <div style={{maxWidth:780,margin:"0 auto",padding:"40px 20px"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8,color:DK}}>Paano gumagana ang ShopSaya?</h2>
        <p style={{fontSize:15,color:GY,lineHeight:1.7,maxWidth:480,margin:"0 auto"}}>"Masaya mag-shop at kumita!" — earn real peso cashback on every Shopee order you make through our links.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:32}}>
        {[["👤","Login with Facebook","One click. We only access your name and photo — nothing else."],["🔍","Browse deals","Find a product you want. Every card shows your exact cashback amount."],["🛒","Shop & Earn","Click the button — you're redirected to Shopee with our tracking link."],["📦","Buy normally","Pay however you like on Shopee. COD, GCash, card — anything works."],["⏳","Tracked automatically","Cashback appears in your ShopSaya wallet as Pending right away."],["💸","Withdraw to GCash","Once you hit ₱100 available, request a payout. Done in 24 hours."]].map(([ic,t,d],i)=>(
          <div key={i} style={{background:WH,borderRadius:14,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)",position:"relative"}}>
            <div style={{position:"absolute",top:-10,left:12,width:26,height:26,background:P,color:WH,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12}}>{i+1}</div>
            <div style={{fontSize:30,marginBottom:10,marginTop:6}}>{ic}</div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:6,color:DK}}>{t}</div>
            <div style={{fontSize:12,color:GY,lineHeight:1.6}}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{background:PL,borderRadius:16,padding:24,border:`1px solid ${P}22`}}>
        <div style={{fontWeight:700,fontSize:15,color:P,marginBottom:16}}>Frequently Asked Questions</div>
        {[["How much cashback will I get?","About 2–20% of the product price — roughly half of what we earn from Shopee's affiliate commission. The exact amount is shown on every product card."],["When will I receive my cashback?","Cashback moves from Pending to Available within 15–45 days after your order is delivered and confirmed."],["What if my order gets cancelled?","Cancelled or returned orders don't generate any commission for us — so no cashback is paid. Only completed orders count."],["Is my GCash number safe?","Absolutely. We only ask for your GCash number when you request a withdrawal. It's stored encrypted and never shared with anyone."],["Do I need to do anything after buying?","No. Just make sure you click our 'Shop & Earn' button before buying. The rest is automatic."]].map(([q,a],i,arr)=>(
          <div key={i} style={{marginBottom:i<arr.length-1?16:0,paddingBottom:i<arr.length-1?16:0,borderBottom:i<arr.length-1?`1px solid ${P}22`:"none"}}>
            <div style={{fontWeight:600,fontSize:13,color:DK,marginBottom:4}}>{q}</div>
            <div style={{fontSize:13,color:GY,lineHeight:1.6}}>{a}</div>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center",marginTop:28}}>
        <button onClick={()=>setPage("home")} style={{background:P,color:WH,border:"none",borderRadius:24,padding:"13px 32px",cursor:"pointer",fontWeight:700,fontSize:14}}>
          Mag-ShopSaya na →
        </button>
      </div>
    </div>
  );
}

// ─── LEGAL PAGES ──────────────────────────────────────────────────────────────
function LegalPage({type, setPage}) {
  const isPrivacy = type==="privacy";
  const sections = isPrivacy ? [
    ["Who We Are",`ShopSaya (${SITE_DOMAIN}) is a cashback and deals platform in the Philippines that connects users to Shopee Philippines products through the Shopee Affiliate Program. For privacy concerns: ${SITE_EMAIL}`],
    ["What We Collect","From Facebook Login: your public name and profile photo only. We do NOT collect your email, friends list, or messages. From Withdrawals: your GCash number and account name — collected only when you request a withdrawal, never at signup."],
    ["How We Use It","To create and manage your account, track cashback earnings, process GCash withdrawals, and verify commissions with Shopee. We do not use your data for advertising or share it with third parties."],
    ["Your Rights (RA 10173)","You have the right to access, correct, and delete your data at any time. Email us at "+SITE_EMAIL+" with subject 'Data Privacy Request'. We respond within 15 business days."],
    ["Security","GCash numbers are stored in masked format after your first withdrawal. We use encrypted storage for all personal data."],
    ["Contact NPC","If you believe your privacy rights have been violated, contact the National Privacy Commission at www.privacy.gov.ph or (02) 8234-2228."]
  ] : [
    ["About ShopSaya",`ShopSaya is a cashback affiliate platform. We earn commission from Shopee when you buy through our links and share half with you as cashback. ShopSaya is NOT officially affiliated with Shopee Philippines.`],
    ["Eligibility","Must be 18+, a Philippine resident, with a valid Facebook account and GCash. One account per person. Multiple accounts will result in permanent ban and forfeiture of all cashback."],
    ["How Cashback Works","Earned when you click our link and complete a Shopee purchase. Cancelled or returned orders get no cashback. Cashback amounts shown are estimates and may change."],
    ["Withdrawals",`Minimum: ${fp(MIN_WITHDRAWAL)}. GCash only. Processed within 24–72 business hours. Cashback earnings are subject to Philippine taxes.`],
    ["Prohibited","Creating multiple accounts, placing orders with intent to cancel, using bots, or any form of fraud. Violations result in immediate account suspension."],
    ["Limitation of Liability","ShopSaya is not responsible for product quality, delivery, or Shopee disputes. Contact Shopee directly for order issues. Our maximum liability is your current wallet balance."],
    ["Contact",`Email: ${SITE_EMAIL} · Response: within 2 business days`]
  ];

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"32px 20px"}}>
      <button onClick={()=>setPage("home")} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:20,padding:"6px 14px",cursor:"pointer",fontSize:13,color:GY,marginBottom:24}}>← Back to Deals</button>
      <div style={{background:WH,borderRadius:16,padding:32,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div style={{width:40,height:40,borderRadius:12,background:PL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{isPrivacy?"🔒":"📄"}</div>
          <div>
            <div style={{fontWeight:800,fontSize:20,color:DK}}>{isPrivacy?"Privacy Policy":"Terms of Service"}</div>
            <div style={{fontSize:11,color:GY}}>ShopSaya PH · {SITE_DOMAIN} · Effective {new Date().toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})}</div>
          </div>
        </div>
        <div style={{background:PL,borderRadius:10,padding:12,marginBottom:24,fontSize:12,color:P,fontWeight:600,border:`1px solid ${P}22`}}>
          {isPrivacy?"This Privacy Policy complies with the Philippine Data Privacy Act of 2012 (RA 10173).":"By using ShopSaya, you agree to these Terms. Governed by Philippine law."}
        </div>
        {sections.map(([h,b],i)=>(
          <div key={i} style={{marginBottom:20,paddingBottom:20,borderBottom:i<sections.length-1?"1px solid #F3F4F6":"none"}}>
            <div style={{fontWeight:700,fontSize:14,color:DK,marginBottom:6}}>{i+1}. {h}</div>
            <div style={{fontSize:13,color:GY,lineHeight:1.8,whiteSpace:"pre-line"}}>{b}</div>
          </div>
        ))}
        <div style={{marginTop:20,padding:14,background:LG,borderRadius:10,fontSize:11,color:"#9CA3AF",textAlign:"center"}}>
          ShopSaya PH · {SITE_DOMAIN} · {SITE_EMAIL} · © {new Date().getFullYear()} · Powered by: MSB IT Solutions
        </div>
      </div>
    </div>
  );
}
