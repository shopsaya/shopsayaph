import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, FacebookAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, where, getDocs, updateDoc, onSnapshot, increment } from "firebase/firestore";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SITE_NAME = "ShopSaya";
const SITE_DOMAIN = "shopsayaph.com";
const SITE_EMAIL = "shopsayaph@gmail.com";
const MIN_WITHDRAWAL = 100;
const AFFILIATE_ID = "kashim1080";

// Master switch for the cashback/wallet/login system. We're launching with just the
// curated-deals + Ask ShopSaya experience (no accounts needed) while the site builds
// an audience. Nothing was deleted — flip this back to true once ready to relaunch
// cashback, and Login/Wallet/Withdraw/Cashback-claims all come back as they were.
const CASHBACK_LIVE = false;

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
const LOAD_NETWORKS = ["Globe","TM","Smart","TNT","DITO"];

// Shared wallet math — used by useAuth, AdminPage's creditCashback, and markPaid.
// "available" already nets out withdrawal/load requests the moment they're submitted
// (their amount is negative), so the same balance can't be redeemed twice while a
// payout is still pending. "withdrawn" only counts payouts an admin has actually
// marked as completed/paid.
const computeWallet = txs => {
  const pending = txs.filter(t=>t.type==="cashback" && t.status==="pending").reduce((a,t)=>a+(Number(t.amount)||0),0);
  const available = txs.filter(t=>t.type==="cashback" && t.status==="available").reduce((a,t)=>a+(Number(t.amount)||0),0)
                   + txs.filter(t=>t.type==="withdrawal").reduce((a,t)=>a+(Number(t.amount)||0),0);
  const totalEarned = txs.filter(t=>t.type==="cashback").reduce((a,t)=>a+(Number(t.amount)||0),0);
  const withdrawn = txs.filter(t=>t.type==="withdrawal" && t.status==="completed").reduce((a,t)=>a+Math.abs(Number(t.amount)||0),0);
  return { pending, available, totalEarned, withdrawn };
};

// Windowed pagination — shows first/last page plus a few around the current
// one, with "..." for gaps, instead of every single page number.
const getPageNumbers = (current, total) => {
  if (total <= 7) return Array.from({length:total}, (_,i)=>i+1);
  const pages = [1];
  const start = Math.max(2, current-2);
  const end = Math.min(total-1, current+2);
  if (start > 2) pages.push("...");
  for (let i=start;i<=end;i++) pages.push(i);
  if (end < total-1) pages.push("...");
  pages.push(total);
  return pages;
};

// Lightweight keyword match against the live catalog — used by the "Ask ShopSaya" assistant
// so common requests get an instant answer instead of waiting on a manual request.
const matchCatalog = (products, queryText) => {
  const tokens = queryText.toLowerCase().split(/\s+/).filter(t=>t.length>2);
  if (tokens.length===0) return [];
  return products
    .map(p => {
      const hay = (p.title+" "+p.category).toLowerCase();
      const score = tokens.reduce((a,t)=>a+(hay.includes(t)?1:0),0);
      return {p, score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score || getCashback(b.p)-getCashback(a.p))
    .slice(0,5)
    .map(x=>x.p);
};

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

const CATEGORIES = ["All","Electronics","Music","Stationery","Home & Living","Health & Beauty","Fashion","Grocery","Baby","Pet Supplies","Toys","Gadgets"];

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
      const txs = [...(prev.transactions||[]), {...tx, date: new Date().toISOString(), id: tx.id || Date.now()}];
      const wallet = computeWallet(txs);
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
  const VALID_PAGES = ["home","dashboard","howto","privacy","terms","sell","admin","ask"];
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
  const goHome = () => { setSearch(""); setCat("All"); setSort("commission"); setProdPage(1); setPage("home"); };
  const [toast, setToast] = useState(null);
  const [installEvent, setInstallEvent] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

  useEffect(() => {
    if (isStandalone || localStorage.getItem("ss_install_dismissed")) return;
    const onPrompt = (e) => { e.preventDefault(); setInstallEvent(e); setShowInstallBanner(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIOS) setShowInstallBanner(true); // iOS never fires beforeinstallprompt — show our own instructions instead
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismissInstallBanner = () => { setShowInstallBanner(false); localStorage.setItem("ss_install_dismissed", "1"); };
  const handleInstallClick = async () => {
    if (installEvent) {
      installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") showToast("Naidagdag sa Home Screen! 🎉");
      setShowInstallBanner(false);
      localStorage.setItem("ss_install_dismissed", "1");
    } else if (isIOS) {
      showToast("Tap ang Share icon ⬆️ sa Safari, tapos 'Add to Home Screen'", "success");
    }
  };
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

  const handleShop = async p => {
    window.open(p.affiliateLink, "_blank");
    if (!CASHBACK_LIVE) {
      // Cashback program is paused — just track anonymous popularity, no account needed.
      try { await updateDoc(doc(db, "products", p.id), { clickCount: increment(1) }); }
      catch (e) { console.error("Failed to log click:", e); }
      return;
    }
    if (user) {
      try {
        await addDoc(collection(db, "clicks"), {
          userId: user.id,
          userName: user.name,
          productId: p.id,
          productTitle: p.title,
          potentialCashback: getCashback(p),
          clickedAt: serverTimestamp(),
          credited: false,
        });
      } catch (e) {
        console.error("Failed to log click:", e);
      }
      showToast(`Link opened sa Shopee! I-complete ang order mo para makakuha ng cashback.`);
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

  // For links sourced manually by an admin (via the Shopee affiliate dashboard) to fulfill
  // an "Ask ShopSaya" request — not part of the regular `products` catalog, so it logs its
  // own click record using the offer's own price/commRate snapshot.
  const handleShopOffer = async (offer, requestId) => {
    window.open(offer.link, "_blank");
    if (!CASHBACK_LIVE) {
      try { await updateDoc(doc(db, "productRequests", requestId), { clickCount: increment(1) }); }
      catch (e) { console.error("Failed to log offer click:", e); }
      return;
    }
    if (user) {
      try {
        await addDoc(collection(db, "clicks"), {
          userId: user.id,
          userName: user.name,
          productId: `request_${requestId}_${offer.link}`,
          productTitle: offer.title,
          potentialCashback: getCashback({price:Number(offer.price)||0, commRate:Number(offer.commRate)||0}),
          clickedAt: serverTimestamp(),
          credited: false,
        });
      } catch (e) {
        console.error("Failed to log offer click:", e);
      }
      showToast(`Link opened sa Shopee! I-complete ang order mo para makakuha ng cashback.`);
    } else {
      setShowLogin(true);
    }
  };

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",minHeight:"100vh",background:LG,color:DK}}>
      {/* HEADER */}
      <header style={{background:WH,borderBottom:"1px solid #E5E7EB",position:"sticky",top:0,zIndex:200,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 20px",height:72,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div onClick={goHome} style={{display:"flex",alignItems:"center",gap:11,cursor:"pointer",flexShrink:0}}>
            <ShieldLogo size={46}/>
            <div>
              <div style={{fontWeight:800,fontSize:21,color:P,lineHeight:1}}>ShopSaya</div>
              <div style={{fontSize:10,color:GY,lineHeight:1,marginTop:2}}>Masaya mag-shop at kumita!</div>
            </div>
          </div>

          <nav style={{display:"flex",alignItems:"center",gap:8}}>
            {[["home","Deals"],["howto","How It Works"]].map(([id,label])=>(
              <button key={id} onClick={()=>id==="home"?goHome():setPage(id)} style={{background:page===id?PL:"none",color:page===id?P:GY,border:"none",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14,fontWeight:page===id?700:500}}>
                {label}
              </button>
            ))}
            <button onClick={()=>setPage("ask")} style={{background:page==="ask"?`linear-gradient(135deg, ${P} 0%, ${PD} 100%)`:PL,color:page==="ask"?WH:P,border:"none",borderRadius:22,padding:"8px 18px 8px 14px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,boxShadow:page==="ask"?`0 3px 10px ${P}55`:"none"}}>
              <span style={{fontSize:18,lineHeight:1}}>🤖</span> Ask ShopSaya
            </button>
            <button onClick={()=>setPage("sell")} style={{background:page==="sell"?AC:AL,color:page==="sell"?WH:AC,border:`1.5px solid ${AC}`,borderRadius:22,padding:"8px 18px 8px 14px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:18,lineHeight:1}}>🏪</span> Seller ka?
            </button>
            {CASHBACK_LIVE && (user ? (
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
            ))}
          </nav>
        </div>
      </header>

      {/* ADD TO HOME SCREEN BANNER */}
      {showInstallBanner && (
        <div style={{background:`linear-gradient(135deg, ${P} 0%, ${PD} 100%)`,color:WH,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <ShieldLogo size={28}/>
          <span style={{fontSize:13,fontWeight:600}}>
            {isIOS ? "I-add ang ShopSaya sa Home Screen mo para mas mabilis bumalik!" : "I-install ang ShopSaya bilang app sa phone mo — libre, walang download sa Play Store!"}
          </span>
          <button onClick={handleInstallClick} style={{background:WH,color:P,border:"none",borderRadius:20,padding:"6px 16px",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>
            {isIOS ? "Paano? 👆" : "📲 I-add sa Home Screen"}
          </button>
          <button onClick={dismissInstallBanner} style={{background:"none",border:"none",color:"rgba(255,255,255,.8)",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px",flexShrink:0}}>×</button>
        </div>
      )}

      {page==="home" && <HomePage filtered={filtered} paginated={paginated} prodPage={prodPage} setProdPage={v=>{setProdPage(v);}} totalPages={totalPages} search={search} setSearch={v=>{setSearch(v);setProdPage(1);}} cat={cat} setCat={v=>{setCat(v);setProdPage(1);}} sort={sort} setSort={setSort} handleShop={handleShop} handleCopy={handleCopy} copied={copied} user={user} setShowLogin={setShowLogin} setPage={setPage} showToast={showToast} products={products} />}
      {page==="dashboard" && CASHBACK_LIVE && user && <Dashboard user={user} updateUser={updateUser} addTransaction={addTransaction} showToast={showToast} setPage={setPage} goHome={goHome} handleShopOffer={handleShopOffer} />}
      {page==="howto" && <HowItWorks setPage={setPage} goHome={goHome} />}
      {page==="privacy" && <LegalPage type="privacy" setPage={setPage} goHome={goHome} />}
      {page==="terms" && <LegalPage type="terms" setPage={setPage} goHome={goHome} />}
      {page==="sell" && <SellerPage showToast={showToast} />}
      {page==="ask" && <AskShopSaya user={user} products={products} showToast={showToast} setShowLogin={setShowLogin} handleShop={handleShop} handleShopOffer={handleShopOffer} setPage={setPage} />}
      {page==="admin" && <AdminPage user={user} setShowLogin={setShowLogin} showToast={showToast} products={products} />}

      {showLogin && <LoginModal onLogin={handleLogin} onClose={()=>setShowLogin(false)} />}

      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#DC2626":DK,color:WH,padding:"12px 24px",borderRadius:24,fontWeight:600,fontSize:14,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,.25)",whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}

      <footer style={{background:DK,color:"#9CA3AF",textAlign:"center",padding:"28px 20px",fontSize:12,marginTop:48}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
          <ShieldLogo size={24}/>
          <strong style={{color:WH,fontSize:14}}>ShopSaya PH</strong>
          <span style={{color:"#4B5563"}}>·</span>
          <span>{SITE_DOMAIN}</span>
        </div>
        <div style={{marginBottom:10,color:"#6B7280"}}>ShopSaya PH — Masaya mag-shop at kumita!</div>
        <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap",marginBottom:12}}>
          {[["privacy","Privacy Policy"],["terms","Terms of Service"],["howto","How It Works"],["sell","Mga Seller"]].map(([pg,label])=>(
            <button key={pg} onClick={()=>setPage(pg)} style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",fontSize:12,textDecoration:"underline"}}>{label}</button>
          ))}
        </div>
        <div style={{color:"#374151"}}>{CASHBACK_LIVE && `Min withdrawal: ${fp(MIN_WITHDRAWAL)} · `}© {new Date().getFullYear()} ShopSaya PH</div>
      </footer>
    </div>
  );
}

// ─── LOGIN MODAL ──────────────────────────────────────────────────────────────
// ─── SHIELD LOGO (brand mark — used in header, footer, login modal) ─────────
function ShieldLogo({size=46}) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{flexShrink:0,filter:`drop-shadow(0 3px 8px ${P}66)`}}>
      <defs>
        <linearGradient id={`shieldGrad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={P}/>
          <stop offset="100%" stopColor={PD}/>
        </linearGradient>
      </defs>
      <path d="M256 22 L446 96 V250 C446 372 366 440 256 492 C146 440 66 372 66 250 V96 Z" fill={`url(#shieldGrad-${size})`} stroke="#FFFFFF" strokeWidth="14" strokeLinejoin="round"/>
      <text x="256" y="305" fontFamily="Arial, Helvetica, sans-serif" fontSize="168" fontWeight="900" fill="#FFFFFF" textAnchor="middle" letterSpacing="-2">SS</text>
    </svg>
  );
}

function LoginModal({onLogin, onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:WH,borderRadius:20,padding:32,maxWidth:380,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <ShieldLogo size={40}/>
          <div>
            <div style={{fontWeight:800,fontSize:18,color:DK}}>{CASHBACK_LIVE ? "Sumali sa ShopSaya" : "ShopSaya Admin"}</div>
            <div style={{fontSize:12,color:GY}}>{CASHBACK_LIVE ? "Masaya mag-shop at kumita! 😊" : "Login para sa pamamahala ng site."}</div>
          </div>
        </div>

        {CASHBACK_LIVE && (
          <div style={{background:PL,borderRadius:12,padding:16,marginBottom:20}}>
            {[["💰","Kumita ng cashback sa bawat Shopee order"],["🔒","Hindi kailangan ng GCash para mag-join"],["📊","I-track ang iyong kita sa ShopSaya wallet"],["💸","Mag-withdraw sa GCash anytime pag ₱100 na"]].map(([ic,txt],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<3?10:0,fontSize:13,color:DK}}>
                <span>{ic}</span> {txt}
              </div>
            ))}
          </div>
        )}

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
              {CASHBACK_LIVE ? "🇵🇭 SHOPEE PHILIPPINES · CASHBACK DEALS" : "🇵🇭 SHOPEE PHILIPPINES · LEGIT DEALS ONLY"}
            </div>
            {CASHBACK_LIVE ? (
              <>
                <h1 style={{fontSize:"clamp(26px,4vw,42px)",fontWeight:900,margin:"0 0 10px",lineHeight:1.15}}>
                  Mag-shop. Kumita. Masaya!
                  <span style={{color:"#A5F3FC"}}>ShopSaya ka!</span>
                </h1>
                <p style={{fontSize:15,opacity:.9,margin:"0 0 24px",lineHeight:1.7}}>
                  I-shop sa Shopee gamit ang aming links at kumita ng real cashback — auto-tracked sa iyong ShopSaya wallet. Mag-withdraw sa GCash pag ₱100 na!
                </p>
              </>
            ) : (
              <>
                <h1 style={{fontSize:"clamp(26px,4vw,42px)",fontWeight:900,margin:"0 0 10px",lineHeight:1.15}}>
                  Takot ka bang ma-scam?
                  <span style={{color:"#A5F3FC"}}> ShopSaya ka muna!</span>
                </h1>
                <p style={{fontSize:15,opacity:.9,margin:"0 0 24px",lineHeight:1.7}}>
                  Lahat ng deals dito legit at na-check namin — Preferred Sellers, maraming sold, walang gulo. I-type sa Ask ShopSaya ang hinahanap mo, o mag-browse sa mga curated deals dito. Walang account na kailangan.
                </p>
              </>
            )}
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              {(CASHBACK_LIVE
                ? [[products.length+"","Products"],["Up to 40%","Commission"],["₱"+total.toLocaleString(),"Cashback Pool"]]
                : [[products.length+"","Curated Deals"],["100%","Legit-Checked"],["🤖","AI Deal Finder"]]
              ).map(([n,l],i)=>(
                <div key={i} style={{background:"rgba(255,255,255,.12)",borderRadius:12,padding:"10px 16px",backdropFilter:"blur(8px)"}}>
                  <div style={{fontSize:18,fontWeight:800}}>{n}</div>
                  <div style={{fontSize:11,opacity:.8,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* WALLET CARD / TRUST CARD */}
          <div style={{background:WH,borderRadius:20,padding:24,width:260,boxShadow:"0 8px 40px rgba(0,0,0,.2)"}}>
            {CASHBACK_LIVE ? (
              user ? (
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
              )
            ) : (
              <>
                <div style={{textAlign:"center",marginBottom:14}}>
                  <div style={{width:52,height:52,borderRadius:16,background:PL,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:24}}>🛡️</div>
                  <div style={{fontWeight:700,fontSize:15,color:DK,marginBottom:4}}>Bakit ShopSaya?</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                  {[["✅","Preferred Sellers lang"],["🚫","Walang scam, walang gulo"],["🤖","AI maghahanap ng deal para sa'yo"]].map(([ic,txt],i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:DK}}>
                      <span style={{fontSize:15}}>{ic}</span>{txt}
                    </div>
                  ))}
                </div>
                <button onClick={()=>setPage("ask")} style={{width:"100%",background:P,color:WH,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  🤖 Ask ShopSaya
                </button>
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
              {CASHBACK_LIVE && <option value="cashback">Most Cashback</option>}
              <option value="discount">Biggest Discount</option>
              <option value="sold">Best Selling</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>
        </div>

        <div style={{fontSize:13,color:GY,marginBottom:14}}>
          Showing <strong style={{color:DK}}>{filtered.length}</strong> deals
          {CASHBACK_LIVE && !user && <span style={{color:P,marginLeft:8,fontSize:12,fontWeight:500}}>→ Mag-login para i-track ang cashback mo</span>}
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
            {getPageNumbers(prodPage, totalPages).map((p,i)=>(
              p==="..." ? (
                <span key={`e${i}`} style={{padding:"0 4px",color:"#9CA3AF",fontSize:13}}>···</span>
              ) : (
                <button key={p} onClick={()=>setProdPage(p)} style={{width:34,height:34,border:`1.5px solid ${prodPage===p?P:"#E5E7EB"}`,borderRadius:8,cursor:"pointer",background:prodPage===p?P:WH,color:prodPage===p?WH:DK,fontWeight:prodPage===p?700:400,fontSize:13}}>
                  {p}
                </button>
              )
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
        I-drop dito ang product name o Shopee link — hahanapan ka namin ng legit na deal at i-post within minutes!
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
  const [price, setPrice] = useState("");
  const [commRate, setCommRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const l = link.trim(), n = sellerName.trim();
    if (!l || !/^https?:\/\//i.test(l)) { showToast("I-paste ang buong Shopee product link (dapat magsimula sa https://)", "error"); return; }
    if (!n) { showToast("I-type ang pangalan ng shop mo", "error"); return; }
    if (!price || Number(price) <= 0) { showToast("I-type ang tamang price ng product mo", "error"); return; }
    if (!commRate || Number(commRate) <= 0) { showToast("I-type ang commission rate na inaalok mo", "error"); return; }
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
        price: Number(price),
        commRate: Number(commRate),
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
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:600,color:DK,display:"block",marginBottom:5}}>Price ₱ *</label>
              <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="hal. 299" style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:600,color:DK,display:"block",marginBottom:5}}>Commission % *</label>
              <input type="number" value={commRate} onChange={e=>setCommRate(e.target.value)} placeholder="hal. 10" style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5E7EB",borderRadius:10,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
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


// ─── ASK SHOPSAYA (AI-style deal finder chat) ────────────────────────────────
function AskShopSaya({user, products, showToast, setShowLogin, handleShop, handleShopOffer, setPage}) {
  const [messages, setMessages] = useState([
    {role:"assistant", kind:"intro"}
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef(null);

  // Load past requests + their fulfillment as conversation history for logged-in users
  useEffect(() => {
    if (!user) { setHistoryLoaded(true); return; }
    (async () => {
      try {
        const q = query(collection(db, "productRequests"), where("userId", "==", user.id));
        const snap = await getDocs(q);
        const past = snap.docs
          .map(d => ({id:d.id, ...d.data()}))
          .sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
        const hist = [];
        past.forEach(r => {
          hist.push({role:"user", text:r.text});
          if (r.status === "fulfilled") {
            hist.push({role:"assistant", kind:"fulfilled", text:r.text, dealNote:r.dealNote, offers:r.offers||[], requestId:r.id});
          } else {
            hist.push({role:"assistant", kind:"pending", text:r.text});
          }
        });
        setMessages(prev => [...prev, ...hist]);
      } catch (e) {
        console.error("Failed to load past requests:", e);
      }
      setHistoryLoaded(true);
    })();
  }, [user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior:"smooth"});
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    if (text.length > 300) { showToast("Pasensya, masyadong haba. Paikliin pa konti.", "error"); return; }
    setInput("");
    setMessages(prev => [...prev, {role:"user", text}]);
    setBusy(true);

    const matches = matchCatalog(products, text);
    if (matches.length > 0) {
      setMessages(prev => [...prev, {role:"assistant", kind:"catalog", matches}]);
      setBusy(false);
      return;
    }

    try {
      const ref = await addDoc(collection(db, "productRequests"), {
        text,
        userId: user?.id || null,
        userName: user?.name || "Guest",
        createdAt: serverTimestamp(),
        status: "pending",
      });
      setMessages(prev => [...prev, {role:"assistant", kind:"pending", text, requestId:ref.id}]);
    } catch (e) {
      console.error("Failed to submit request:", e);
      setMessages(prev => [...prev, {role:"assistant", kind:"error"}]);
    }
    setBusy(false);
  };

  return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"24px 16px",display:"flex",flexDirection:"column",height:"calc(100vh - 60px - 48px)"}}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:30,marginBottom:4}}>🤖</div>
        <div style={{fontWeight:800,fontSize:20,color:DK}}>Ask ShopSaya</div>
        <div style={{fontSize:12,color:GY,marginTop:2}}>Takot ka bang ma-scam? Legit deals lang, legit sellers lang — i-type lang ang hinahanap mo.</div>
      </div>

      <div ref={scrollRef} style={{flex:1,overflowY:"auto",background:WH,borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,.06)",marginBottom:12}}>
        {messages.map((m,i) => {
          if (m.role==="user") {
            return (
              <div key={i} style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                <div style={{background:P,color:WH,borderRadius:"14px 14px 2px 14px",padding:"10px 14px",fontSize:13,maxWidth:"75%"}}>{m.text}</div>
              </div>
            );
          }
          return (
            <div key={i} style={{display:"flex",gap:8,marginBottom:14,alignItems:"flex-start"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:PL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🤖</div>
              <div style={{flex:1,minWidth:0}}>
                {m.kind==="intro" && (
                  <div style={{background:LG,borderRadius:"2px 14px 14px 14px",padding:"10px 14px",fontSize:13,color:DK,maxWidth:"90%"}}>
                    Hi! Ako ang ShopSaya AI Deal Finder. Anong product hinahanap mo? (hal. "oven toaster", "wireless earbuds") Kung wala kami nito, hahanapan ka namin ng legit deal — i-post namin within minutes!
                  </div>
                )}
                {m.kind==="catalog" && (
                  <div style={{maxWidth:"95%"}}>
                    <div style={{background:LG,borderRadius:"2px 14px 14px 14px",padding:"10px 14px",fontSize:13,color:DK,marginBottom:8}}>
                      Heto ang mga legit na options na nakita ko para sa'yo:
                    </div>
                    {m.matches.map(p => (
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,background:WH,border:"1px solid #E5E7EB",borderRadius:10,padding:10,marginBottom:8}}>
                        {p.image ? <img src={p.image} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0}}/> : <div style={{width:44,height:44,borderRadius:8,background:LG,flexShrink:0}}/>}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:DK,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.title}</div>
                          <div style={{display:"flex",gap:6,alignItems:"baseline"}}>
                            <span style={{fontSize:13,fontWeight:700,color:RD}}>{fp(p.price)}</span>
                            {CASHBACK_LIVE ? <span style={{fontSize:11,color:AC,fontWeight:700}}>+{fp(getCashback(p))} cashback</span> : <span style={{fontSize:11,color:AC,fontWeight:700}}>✅ Legit</span>}
                          </div>
                        </div>
                        <button onClick={()=>handleShop(p)} style={{flexShrink:0,background:P,color:WH,border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>{CASHBACK_LIVE ? "Shop & Earn" : "Shop Now"}</button>
                      </div>
                    ))}
                  </div>
                )}
                {m.kind==="pending" && (
                  <div style={{background:LG,borderRadius:"2px 14px 14px 14px",padding:"10px 14px",fontSize:13,color:DK,maxWidth:"90%"}}>
                    Wala pa kasi kami nito ngayon, pero hahanapan ka namin ng legit na deal! I-check mo lang ulit dito sa loob ng ilang minuto.
                  </div>
                )}
                {m.kind==="fulfilled" && (
                  <div style={{maxWidth:"95%"}}>
                    <div style={{background:LG,borderRadius:"2px 14px 14px 14px",padding:"10px 14px",fontSize:13,color:DK,marginBottom:m.offers?.length?8:0}}>
                      Nahanap namin ito para sa "{m.text}"{m.dealNote?` — ${m.dealNote}`:"!"}
                    </div>
                    {m.offers?.map((o,oi)=><OfferMiniCard key={oi} offer={o} onShop={()=>handleShopOffer(o, m.requestId)} />)}
                  </div>
                )}
                {m.kind==="error" && (
                  <div style={{background:"#FEF2F2",borderRadius:"2px 14px 14px 14px",padding:"10px 14px",fontSize:13,color:"#991B1B",maxWidth:"90%"}}>
                    Sorry, may error. Subukan ulit.
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {busy && (
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:PL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🤖</div>
            <div style={{fontSize:12,color:GY}}>Naghahanap...</div>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:8}}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter") send();}}
          placeholder="hal. oven toaster, wireless earbuds..."
          style={{flex:1,padding:"12px 16px",border:"1.5px solid #E5E7EB",borderRadius:24,fontSize:13,outline:"none",boxSizing:"border-box"}}
        />
        <button onClick={send} disabled={busy} style={{background:P,color:WH,border:"none",borderRadius:24,padding:"12px 22px",cursor:busy?"default":"pointer",fontWeight:700,fontSize:13,opacity:busy?.7:1,flexShrink:0}}>
          Send
        </button>
      </div>
    </div>
  );
}

// ─── ADMIN PAGE ─────────────────────────────────────────────────────────────
const ADMIN_UID = "0QbPdrae5YTaURCqW4l6HEEH23l2";

function AdminPage({user, setShowLogin, showToast, products}) {
  const [submissions, setSubmissions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [clicks, setClicks] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [dealNotes, setDealNotes] = useState({});
  const [offerDrafts, setOfferDrafts] = useState({});
  const [creditAmts, setCreditAmts] = useState({});
  const [bulkJson, setBulkJson] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [imgFillProgress, setImgFillProgress] = useState(null);

  const isAdmin = user && user.id === ADMIN_UID;

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    (async () => {
      try {
        const subSnap = await getDocs(query(collection(db, "sellerSubmissions"), where("status", "==", "pending")));
        setSubmissions(subSnap.docs.map(d => ({id: d.id, ...d.data()})));
        const reqSnap = await getDocs(query(collection(db, "productRequests"), where("status", "==", "pending")));
        setRequests(reqSnap.docs.map(d => ({id: d.id, ...d.data()})));
        if (CASHBACK_LIVE) {
          const clickSnap = await getDocs(query(collection(db, "clicks"), where("credited", "==", false)));
          setClicks(clickSnap.docs.map(d => ({id: d.id, ...d.data()})));
          const payoutSnap = await getDocs(query(collection(db, "payoutRequests"), where("status", "==", "pending")));
          setPayouts(payoutSnap.docs.map(d => ({id: d.id, ...d.data()})));
        }
      } catch (e) {
        console.error("Failed to load admin data:", e);
      }
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!user) return (
    <div style={{padding:60,textAlign:"center"}}>
      <div style={{color:GY,marginBottom:14}}>Mag-login muna bilang admin.</div>
      <button onClick={()=>setShowLogin(true)} style={{background:"#1877F2",color:WH,border:"none",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:14,fontWeight:600}}>Login with Facebook</button>
    </div>
  );
  if (!isAdmin) return <div style={{padding:60,textAlign:"center",color:GY}}>Access denied.</div>;
  if (loading) return <div style={{padding:60,textAlign:"center",color:GY}}>Loading...</div>;

  const setDraft = (id, field, val) => setDrafts(prev => ({...prev, [id]: {...prev[id], [field]: val}}));

  const addOfferRow = (reqId) => setOfferDrafts(prev => {
    const rows = prev[reqId]||[];
    if (rows.length>=5) return prev;
    return {...prev, [reqId]: [...rows, {title:"",link:"",price:"",commRate:""}]};
  });
  const updateOfferRow = (reqId, idx, field, val) => setOfferDrafts(prev => {
    const rows = [...(prev[reqId]||[])];
    rows[idx] = {...rows[idx], [field]: val};
    return {...prev, [reqId]: rows};
  });
  const removeOfferRow = (reqId, idx) => setOfferDrafts(prev => {
    const rows = (prev[reqId]||[]).filter((_,i)=>i!==idx);
    return {...prev, [reqId]: rows};
  });

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

  const bulkAddProducts = async () => {
    let arr;
    try {
      arr = JSON.parse(bulkJson);
      if (!Array.isArray(arr)) throw new Error("not an array");
    } catch (e) {
      showToast("Invalid JSON — check the format and try again.", "error");
      return;
    }
    setBulkBusy(true);
    let added = 0;
    try {
      for (const p of arr) {
        if (!p.id || !p.title || !p.affiliateLink) continue;
        await setDoc(doc(db, "products", String(p.id)), p, { merge: true });
        added++;
      }
      showToast(`${added} products added/updated sa catalog!`);
      setBulkJson("");
    } catch (e) {
      console.error("Bulk add failed:", e);
      showToast("Bulk add failed. Check console.", "error");
    }
    setBulkBusy(false);
  };

  // Re-uses the existing fetchProductPreview Cloud Function (the one built for seller
  // submissions) to backfill images for products that came from a CSV export with no
  // image URL. Runs one at a time with a short pause between calls — gentle on Shopee's
  // anti-bot limits, and lets the progress counter update live.
  const backfillImages = async () => {
    const targets = products.filter(p => !p.image);
    if (targets.length === 0) { showToast("Lahat ng products may image na.", "error"); return; }
    setImgFillProgress({ done: 0, total: targets.length, found: 0 });
    let found = 0;
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      try {
        const res = await fetch("https://fetchproductpreview-1071825458706.asia-southeast1.run.app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: p.affiliateLink }),
        });
        const data = await res.json();
        if (data.image) {
          await updateDoc(doc(db, "products", String(p.id)), { image: data.image });
          found++;
        }
      } catch (e) {
        console.error("Image backfill failed for", p.id, e);
      }
      setImgFillProgress({ done: i + 1, total: targets.length, found });
      await new Promise(r => setTimeout(r, 400));
    }
    showToast(`Done! ${found}/${targets.length} images found.`);
    setImgFillProgress(null);
  };

  const approveSubmission = async (sub) => {
    const d = drafts[sub.id] || {};
    const price = Number(d.price ?? sub.price), commRate = Number(d.commRate ?? sub.commRate ?? 2), category = d.category;
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
    const rows = (offerDrafts[id]||[]).filter(o => o.title?.trim() && o.link?.trim());
    try {
      await updateDoc(doc(db, "productRequests", id), {
        status: "fulfilled",
        dealNote: dealNotes[id] || "",
        offers: rows.map(o => ({title:o.title.trim(), link:o.link.trim(), price:Number(o.price)||0, commRate:Number(o.commRate)||0})),
      });
      setRequests(prev => prev.filter(r => r.id !== id));
      setOfferDrafts(prev => { const next={...prev}; delete next[id]; return next; });
      showToast("Marked as fulfilled — user will see the notification.");
    } catch (e) { console.error(e); }
  };

  const creditCashback = async (click) => {
    const amount = Number(creditAmts[click.id] ?? click.potentialCashback);
    if (!amount || amount <= 0) { showToast("Invalid amount.", "error"); return; }
    try {
      const userRef = doc(db, "users", click.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) { showToast("User not found.", "error"); return; }
      const userData = userSnap.data();
      const txs = [...(userData.transactions||[]), {
        type: "cashback", amount, status: "available",
        product: click.productTitle, productId: click.productId,
        date: new Date().toISOString(), id: Date.now(),
      }];
      const wallet = computeWallet(txs);
      await setDoc(userRef, { transactions: txs, wallet }, { merge: true });
      await updateDoc(doc(db, "clicks", click.id), { credited: true });
      setClicks(prev => prev.filter(c => c.id !== click.id));
      showToast(`₱${amount} na-credit kay ${click.userName}!`);
    } catch (e) {
      console.error("Credit failed:", e);
      showToast("Failed to credit. Check console.", "error");
    }
  };

  const markPaid = async (req) => {
    try {
      const userRef = doc(db, "users", req.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) { showToast("User not found.", "error"); return; }
      const userData = userSnap.data();
      const txs = (userData.transactions||[]).map(t => t.id === req.txId ? {...t, status: "completed"} : t);
      const wallet = computeWallet(txs);
      await setDoc(userRef, { transactions: txs, wallet }, { merge: true });
      await updateDoc(doc(db, "payoutRequests", req.id), { status: "completed" });
      setPayouts(prev => prev.filter(p => p.id !== req.id));
      showToast(`Marked ${fp(req.amount)} ${req.method==="load"?"load":"GCash"} payout as sent!`);
    } catch (e) {
      console.error("Mark paid failed:", e);
      showToast("Failed to mark as paid. Check console.", "error");
    }
  };

  return (
    <div style={{maxWidth:1280,margin:"0 auto",padding:"32px 16px"}}>
      <div style={{fontWeight:800,fontSize:22,marginBottom:20}}>Admin</div>

      {products.length === 0 && (
        <div style={{background:PL,border:`1.5px solid ${P}`,borderRadius:12,padding:16,marginBottom:28}}>
          <div style={{fontSize:13,marginBottom:10}}>Walang products sa Firestore pa. I-seed ang original 20 products?</div>
          <button onClick={seedProducts} style={{background:P,color:WH,border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer"}}>Seed Initial Products</button>
        </div>
      )}

      {/* BULK ADD PRODUCTS — paste a JSON array (Claude will format this for you from your Shopee Batch Get Link exports) */}
      <div style={{background:WH,border:"1.5px solid #E5E7EB",borderRadius:12,padding:16,marginBottom:28}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📦 Bulk Add Products</div>
        <div style={{fontSize:12,color:GY,marginBottom:10}}>Paste mo lang dito ang JSON array na binigay ko galing sa Batch Get Link mo, then "Add to Catalog."</div>
        <textarea value={bulkJson} onChange={e=>setBulkJson(e.target.value)} placeholder='[{"id":"123","title":"...","price":499,"sold":120,"commRate":10,"discount":0,"category":"Electronics","affiliateLink":"https://s.shopee.ph/...","image":"https://..."}]'
          style={{width:"100%",minHeight:90,padding:10,border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:11,fontFamily:"monospace",boxSizing:"border-box",marginBottom:8,resize:"vertical"}}/>
        <button onClick={bulkAddProducts} disabled={bulkBusy||!bulkJson.trim()} style={{background:bulkBusy?"#9CA3AF":AC,color:WH,border:"none",borderRadius:8,padding:"8px 18px",fontWeight:700,fontSize:12,cursor:bulkBusy?"default":"pointer"}}>
          {bulkBusy?"Adding...":"Add to Catalog"}
        </button>

        <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #F3F4F6"}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🖼️ Backfill Missing Images</div>
          <div style={{fontSize:12,color:GY,marginBottom:10}}>
            Para sa products na walang image (galing CSV export). Gagamitin ang existing fetchProductPreview function mo — isa-isa, may delay, para gentle sa Shopee.
          </div>
          <button onClick={backfillImages} disabled={!!imgFillProgress} style={{background:imgFillProgress?"#9CA3AF":P,color:WH,border:"none",borderRadius:8,padding:"8px 18px",fontWeight:700,fontSize:12,cursor:imgFillProgress?"default":"pointer"}}>
            {imgFillProgress ? `Naghahanap... ${imgFillProgress.done}/${imgFillProgress.total} (${imgFillProgress.found} found)` : "Backfill Images"}
          </button>
        </div>
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:20,alignItems:"flex-start"}}>

        {/* COLUMN 1: SELLER SUBMISSIONS */}
        <div style={{flex:1,minWidth:320}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>Pending Seller Submissions ({submissions.length})</div>
          {submissions.length===0 && <div style={{color:GY,fontSize:13}}>Walang pending submissions.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {submissions.map(sub => (
            <div key={sub.id} style={{background:WH,border:"1px solid #E5E7EB",borderRadius:12,padding:16,display:"flex",gap:14}}>
              {sub.image ? <img src={sub.image} alt="" style={{width:60,height:60,borderRadius:8,objectFit:"cover",flexShrink:0}}/> : <div style={{width:60,height:60,borderRadius:8,background:LG,flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{sub.title || "(walang title na-fetch)"}</div>
                <div style={{fontSize:12,color:GY,marginBottom:8}}>Seller: {sub.sellerName} · {sub.contact || "no contact"} · <a href={sub.link} target="_blank" rel="noreferrer">link</a></div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  <input placeholder="Price ₱" type="number" defaultValue={sub.price || ""} onChange={e=>setDraft(sub.id,"price",e.target.value)} style={{width:75,padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:11}}/>
                  <input placeholder="Comm %" type="number" defaultValue={sub.commRate || 2} onChange={e=>setDraft(sub.id,"commRate",e.target.value)} style={{width:75,padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:11}}/>
                  <input placeholder="Discount %" type="number" onChange={e=>setDraft(sub.id,"discount",e.target.value)} style={{width:85,padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:11}}/>
                  <select onChange={e=>setDraft(sub.id,"category",e.target.value)} defaultValue="" style={{padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:11}}>
                    <option value="" disabled>Category</option>
                    {CATEGORIES.filter(c=>c!=="All").map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>approveSubmission(sub)} style={{background:AC,color:WH,border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:11,cursor:"pointer"}}>Approve & Publish</button>
                  <button onClick={()=>rejectSubmission(sub.id)} style={{background:"none",color:GY,border:"1px solid #E5E7EB",borderRadius:8,padding:"7px 14px",fontWeight:600,fontSize:11,cursor:"pointer"}}>Reject</button>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>

        {/* COLUMN 2: PRODUCT REQUESTS */}
        <div style={{flex:1,minWidth:320}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:12}}>Pending Product Requests ({requests.length})</div>
          {requests.length===0 && <div style={{color:GY,fontSize:13}}>Walang pending requests.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {requests.map(req => (
            <div key={req.id} style={{background:WH,border:"1px solid #E5E7EB",borderRadius:12,padding:16}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>"{req.text}"</div>
              <div style={{fontSize:12,color:GY,marginBottom:10}}>From: {req.userName || "Guest"}</div>

              {(offerDrafts[req.id]||[]).map((row,idx)=>(
                <div key={idx} style={{display:"flex",gap:4,marginBottom:6,flexWrap:"wrap"}}>
                  <input placeholder="Product title" value={row.title} onChange={e=>updateOfferRow(req.id,idx,"title",e.target.value)} style={{flex:"1 1 110px",padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:6,fontSize:11}}/>
                  <input placeholder="Shopee affiliate link" value={row.link} onChange={e=>updateOfferRow(req.id,idx,"link",e.target.value)} style={{flex:"1 1 130px",padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:6,fontSize:11}}/>
                  <input placeholder="Price" type="number" value={row.price} onChange={e=>updateOfferRow(req.id,idx,"price",e.target.value)} style={{width:60,padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:6,fontSize:11}}/>
                  <input placeholder="Comm%" type="number" value={row.commRate} onChange={e=>updateOfferRow(req.id,idx,"commRate",e.target.value)} style={{width:55,padding:"6px 8px",border:"1.5px solid #E5E7EB",borderRadius:6,fontSize:11}}/>
                  <button onClick={()=>removeOfferRow(req.id,idx)} style={{background:"none",border:"none",color:RD,cursor:"pointer",fontSize:14,padding:"0 4px"}}>×</button>
                </div>
              ))}
              {(offerDrafts[req.id]||[]).length<5 && (
                <button onClick={()=>addOfferRow(req.id)} style={{background:"none",border:"1px dashed #D1D5DB",color:GY,borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",marginBottom:8}}>
                  + Add link from Shopee dashboard ({(offerDrafts[req.id]||[]).length}/5)
                </button>
              )}

              <input placeholder="Optional note (e.g. 'check Electronics category')" onChange={e=>setDealNotes(prev=>({...prev,[req.id]:e.target.value}))} style={{width:"100%",padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12,marginBottom:8,boxSizing:"border-box"}}/>
              <button onClick={()=>fulfillRequest(req.id)} style={{background:AC,color:WH,border:"none",borderRadius:8,padding:"7px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Mark Fulfilled</button>
            </div>
          ))}
          </div>
        </div>

        {CASHBACK_LIVE && (
        <>
        {/* COLUMN 3: CASHBACK CLAIMS */}
        <div style={{flex:1,minWidth:320}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Pending Cashback Claims ({clicks.length})</div>
          <div style={{fontSize:12,color:GY,marginBottom:12}}>I-credit lang kung verified mo na talagang nag-checkout ang user sa Shopee.</div>
          {clicks.length===0 && <div style={{color:GY,fontSize:13}}>Walang pending claims.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {clicks.map(click => (
            <div key={click.id} style={{background:WH,border:"1px solid #E5E7EB",borderRadius:12,padding:16}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{click.userName}</div>
              <div style={{fontSize:12,color:GY,marginBottom:10}}>Clicked: {click.productTitle} · Suggested: ₱{click.potentialCashback}</div>
              <div style={{display:"flex",gap:8}}>
                <input type="number" defaultValue={click.potentialCashback} onChange={e=>setCreditAmts(prev=>({...prev,[click.id]:e.target.value}))} style={{width:80,padding:"7px 10px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12}}/>
                <button onClick={()=>creditCashback(click)} style={{background:AC,color:WH,border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Credit Cashback</button>
              </div>
            </div>
          ))}
          </div>
        </div>

        {/* COLUMN 4: PAYOUTS (GCash + Load) */}
        <div style={{flex:1,minWidth:320}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Pending Payouts ({payouts.length})</div>
          <div style={{fontSize:12,color:GY,marginBottom:12}}>I-mark as paid lang pagkatapos mo talagang ipadala ang GCash o load sa customer.</div>
          {payouts.length===0 && <div style={{color:GY,fontSize:13}}>Walang pending payouts.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {payouts.map(req => (
            <div key={req.id} style={{background:WH,border:"1px solid #E5E7EB",borderRadius:12,padding:16}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{req.userName} · {fp(req.amount)}</div>
              <div style={{fontSize:12,color:GY,marginBottom:10}}>
                {req.method==="load"
                  ? `📱 Load: ${req.mobileNumber} (${req.network})`
                  : `💸 GCash: ${req.gcash} · ${req.gcashName}`}
              </div>
              <button onClick={()=>markPaid(req)} style={{background:AC,color:WH,border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Mark as Paid</button>
            </div>
          ))}
          </div>
        </div>
        </>
        )}

        {/* COLUMN: TOP CLICKED (popularity insight while cashback is paused) */}
        <div style={{flex:1,minWidth:320}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>🔥 Top Clicked Products</div>
          <div style={{fontSize:12,color:GY,marginBottom:12}}>Anonymous click counts — useful para makita anong products ang pinaka-interesado ang mga tao.</div>
          {[...products].sort((a,b)=>(b.clickCount||0)-(a.clickCount||0)).slice(0,10).map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F3F4F6"}}>
              <div style={{fontSize:12,color:DK,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220}}>{p.title}</div>
              <div style={{fontSize:12,fontWeight:700,color:P,flexShrink:0}}>{p.clickCount||0} clicks</div>
            </div>
          ))}
          {products.every(p=>!p.clickCount) && <div style={{color:GY,fontSize:13}}>Walang clicks pa.</div>}
        </div>

      </div>
    </div>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({product:p, onShop, onCopy, copied, user}) {
  const cb = getCashback(p);
  const orig = p.discount ? Math.round(p.price/(1-p.discount/100)) : null;
  const [imgOk, setImgOk] = useState(!!p.image);
  const icons = {Music:"🎸",Electronics:"📱",Fashion:"👗","Health & Beauty":"💄",Sports:"⚽",Toys:"🧸",Stationery:"✏️","Home & Living":"🏠",Gadgets:"🔧",Grocery:"🛒",Baby:"🍼","Pet Supplies":"🐾"};

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

        {/* TOP-RIGHT PILL */}
        {CASHBACK_LIVE ? (
          <div style={{position:"absolute",top:8,right:8,background:AC,color:WH,fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20}}>
            +{fp(cb)}
          </div>
        ) : (
          <div style={{position:"absolute",top:8,right:8,background:AC,color:WH,fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20}}>
            ✅ Legit
          </div>
        )}
      </div>

      {/* BODY */}
      <div style={{padding:12,flex:1,display:"flex",flexDirection:"column",gap:6}}>
        <div style={{fontSize:10,fontWeight:600,color:P,textTransform:"uppercase",letterSpacing:.5}}>{p.category}</div>
        <div style={{fontSize:13,color:DK,lineHeight:1.45,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",minHeight:38}}>{p.title}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:17,fontWeight:800,color:RD}}>{fp(p.price)}</span>
          {orig && <span style={{fontSize:11,color:"#9CA3AF",textDecoration:"line-through"}}>{fp(orig)}</span>}
        </div>

        {CASHBACK_LIVE && (
          <div style={{display:"flex",gap:6}}>
            <div style={{flex:1,background:LG,borderRadius:6,padding:"4px 0",fontSize:11,color:GY,textAlign:"center"}}>{p.commRate}% comm</div>
            <div style={{flex:1,background:AL,borderRadius:6,padding:"4px 0",fontSize:11,color:AC,fontWeight:700,textAlign:"center"}}>+{fp(cb)} cashback</div>
          </div>
        )}

        <div style={{fontSize:10,color:"#9CA3AF"}}>{p.sold>=1000?`${(p.sold/1000).toFixed(1)}K`:p.sold} sold</div>

        <div style={{display:"flex",gap:8,marginTop:"auto"}}>
          <button onClick={onShop} style={{flex:1,background:P,color:WH,border:"none",borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12,transition:"background .15s"}}
            onMouseEnter={e=>e.target.style.background=PD}
            onMouseLeave={e=>e.target.style.background=P}>
            {CASHBACK_LIVE ? "Shop & Earn" : "Shop Now"}
          </button>
          <button onClick={onCopy} style={{background:copied?AL:LG,color:copied?AC:GY,border:"none",borderRadius:8,padding:"9px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>
            {copied?"✓":"Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── OFFER MINI CARD (admin-sourced links, not in the regular catalog) ───────
function OfferMiniCard({offer, onShop}) {
  const cb = getCashback({price:Number(offer.price)||0, commRate:Number(offer.commRate)||0});
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,background:WH,border:"1px solid #E5E7EB",borderRadius:10,padding:10,marginBottom:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:DK,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{offer.title}</div>
        <div style={{display:"flex",gap:6,alignItems:"baseline"}}>
          {Number(offer.price)>0 && <span style={{fontSize:13,fontWeight:700,color:RD}}>{fp(offer.price)}</span>}
          {CASHBACK_LIVE && cb>0 && <span style={{fontSize:11,color:AC,fontWeight:700}}>+{fp(cb)} cashback</span>}
          {!CASHBACK_LIVE && <span style={{fontSize:11,color:AC,fontWeight:700}}>✅ Legit</span>}
        </div>
      </div>
      <button onClick={()=>onShop(offer)} style={{flexShrink:0,background:P,color:WH,border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
        {CASHBACK_LIVE ? "Shop & Earn" : "Shop Now"}
      </button>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({user,updateUser,addTransaction,showToast,setPage,goHome,handleShopOffer}) {
  const [showW, setShowW] = useState(false);
  const [method, setMethod] = useState("gcash"); // "gcash" | "load"
  const [gcashNum, setGcashNum] = useState(user.gcash||"");
  const [gcashName, setGcashName] = useState("");
  const [mobileNum, setMobileNum] = useState(user.gcash||"");
  const [network, setNetwork] = useState(LOAD_NETWORKS[0]);
  const [amt, setAmt] = useState("");
  const [fulfilled, setFulfilled] = useState([]);
  const [myClicks, setMyClicks] = useState([]);

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
      try {
        const cq = query(collection(db, "clicks"), where("userId", "==", user.id), where("credited", "==", false));
        const csnap = await getDocs(cq);
        setMyClicks(csnap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch (e) {
        console.error("Failed to load projected cashback:", e);
      }
    })();
  }, [user.id]);

  const dismissRequest = async (id) => {
    setFulfilled(prev => prev.filter(r => r.id !== id));
    try { await updateDoc(doc(db, "productRequests", id), { seen: true }); } catch (e) { console.error("Failed to mark seen:", e); }
  };

  const handleWithdraw = async () => {
    const n = parseFloat(amt);
    if(!n || isNaN(n) || n<MIN_WITHDRAWAL){showToast(`Minimum redemption is ${fp(MIN_WITHDRAWAL)}`,"error");return;}
    if(n>(user.wallet?.available||0)){showToast("Insufficient balance","error");return;}

    let details = {};
    if(method==="gcash"){
      if(!gcashNum||gcashNum.length<11){showToast("Enter a valid GCash number","error");return;}
      if(!gcashName){showToast("Enter your GCash account name","error");return;}
      updateUser({gcash:gcashNum});
      details = {gcash:gcashNum, gcashName};
    } else {
      if(!mobileNum||mobileNum.length<11){showToast("Enter a valid mobile number","error");return;}
      details = {mobileNumber:mobileNum, network};
    }

    const txId = Date.now();
    addTransaction({id:txId, type:"withdrawal", method, amount:-n, status:"processing", ...details});
    try {
      await addDoc(collection(db, "payoutRequests"), {
        userId: user.id, userName: user.name, method, amount: n, ...details,
        status: "pending", txId, requestedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to log payout request:", e);
    }

    showToast(method==="gcash"
      ? `✅ Withdrawal of ${fp(n)} submitted! Processing within 24 hours.`
      : `✅ ${fp(n)} load redemption submitted! Processing within 24 hours.`);
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
            <div style={{fontSize:13,color:GY,lineHeight:1.6,marginBottom:r.offers?.length?10:0}}>
              We found {r.offers?.length>1?"some deals":"a deal"} for "<strong>{r.text}</strong>"{r.dealNote ? ` — ${r.dealNote}` : !r.offers?.length ? ". Check the Deals page!" : ""}
            </div>
            {r.offers?.map((o,i)=><OfferMiniCard key={i} offer={o} onShop={()=>handleShopOffer(o, r.id)} />)}
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

      {/* PROJECTED CASHBACK */}
      {myClicks.length > 0 && (
        <div style={{background:"#FFFBEB",border:"1.5px solid #FDE68A",borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,color:"#92400E",marginBottom:4}}>🔍 Projected Cashback (₱{myClicks.reduce((a,c)=>a+c.potentialCashback,0)})</div>
          <div style={{fontSize:12,color:"#92400E",marginBottom:10,lineHeight:1.5}}>
            Hindi pa ito guaranteed cashback — makikita lang dito ang mga na-click mo. Kapag na-confirm naming na-checkout mo talaga ang order sa Shopee, ililipat ito sa "Pending" o "Available" sa wallet mo.
          </div>
          {myClicks.map(c => (
            <div key={c.id} style={{fontSize:12,color:"#78350F",padding:"6px 0",borderTop:"1px solid #FDE68A"}}>
              {c.productTitle} — <strong>₱{c.potentialCashback}</strong>
            </div>
          ))}
        </div>
      )}

      {/* WITHDRAW */}
      <div style={{marginBottom:14}}>
        {!showW ? (
          <button onClick={()=>setShowW(true)} disabled={(user.wallet?.available||0)<MIN_WITHDRAWAL}
            style={{width:"100%",background:(user.wallet?.available||0)>=MIN_WITHDRAWAL?P:"#E5E7EB",color:(user.wallet?.available||0)>=MIN_WITHDRAWAL?WH:"#9CA3AF",border:"none",borderRadius:12,padding:"13px",cursor:(user.wallet?.available||0)>=MIN_WITHDRAWAL?"pointer":"default",fontWeight:700,fontSize:14}}>
            {(user.wallet?.available||0)>=MIN_WITHDRAWAL?`💸 Redeem Cashback`:`Need ${fp(Math.max(0,MIN_WITHDRAWAL-(user.wallet?.available||0)))} more to redeem`}
          </button>
        ) : (
          <div style={{background:WH,borderRadius:14,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:14,color:DK}}>💸 Redeem Cashback</div>

            {/* METHOD TOGGLE */}
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {[["gcash","💸 GCash"],["load","📱 Load"]].map(([m,label])=>(
                <button key={m} onClick={()=>setMethod(m)}
                  style={{flex:1,padding:"9px 0",borderRadius:8,border:method===m?`1.5px solid ${P}`:"1.5px solid #E5E7EB",background:method===m?PL:WH,color:method===m?P:GY,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {label}
                </button>
              ))}
            </div>

            {method==="gcash" ? (
              [["GCash Number","09XXXXXXXXX",gcashNum,setGcashNum,"tel"],["GCash Account Name","Full name on GCash",gcashName,setGcashName,"text"]].map(([label,ph,val,setter,type],i)=>(
                <div key={i} style={{marginBottom:12}}>
                  <label style={{fontSize:12,color:GY,fontWeight:600,display:"block",marginBottom:5}}>{label}</label>
                  <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph} type={type}
                    style={{width:"100%",padding:"10px 14px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
                </div>
              ))
            ) : (
              <>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:12,color:GY,fontWeight:600,display:"block",marginBottom:5}}>Mobile Number</label>
                  <input value={mobileNum} onChange={e=>setMobileNum(e.target.value)} placeholder="09XXXXXXXXX" type="tel"
                    style={{width:"100%",padding:"10px 14px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:12,color:GY,fontWeight:600,display:"block",marginBottom:5}}>Network</label>
                  <select value={network} onChange={e=>setNetwork(e.target.value)}
                    style={{width:"100%",padding:"10px 14px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,boxSizing:"border-box",outline:"none"}}>
                    {LOAD_NETWORKS.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </>
            )}

            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,color:GY,fontWeight:600,display:"block",marginBottom:5}}>Amount</label>
              <input value={amt} onChange={e=>setAmt(e.target.value)} placeholder={`Min ${fp(MIN_WITHDRAWAL)}`} type="number"
                style={{width:"100%",padding:"10px 14px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,boxSizing:"border-box",outline:"none"}}/>
            </div>

            <div style={{background:"#F0F9FF",borderRadius:8,padding:12,marginBottom:14,fontSize:12,color:"#0369A1"}}>
              ℹ️ {method==="gcash" ? "Your GCash number is only used for this withdrawal and is stored securely." : "Load will be sent to this number within 24–72 hours after verification."}
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
            <button onClick={goHome} style={{background:P,color:WH,border:"none",borderRadius:20,padding:"8px 20px",cursor:"pointer",fontWeight:600,fontSize:13}}>Tingnan ang Deals</button>
          </div>
        ) : txs.map(tx=>(
          <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #F3F4F6"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:DK,marginBottom:2}}>
                {tx.type==="cashback"?"💰 Cashback":tx.method==="load"?"📱 Load":"💸 Withdrawal"}
                {tx.product&&<span style={{fontWeight:400,color:GY}}> · {tx.product.substring(0,28)}...</span>}
              </div>
              <div style={{fontSize:11,color:GY,marginBottom:4}}>{new Date(tx.date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</div>
              <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,
                background:tx.status==="pending"?"#FEF3C7":tx.status==="available"?AL:tx.status==="processing"?"#DBEAFE":tx.status==="completed"?AL:LG,
                color:tx.status==="pending"?"#D97706":tx.status==="available"?AC:tx.status==="processing"?"#1D4ED8":tx.status==="completed"?AC:GY}}>
                {tx.status==="completed"?"Paid":tx.status?.charAt(0).toUpperCase()+tx.status?.slice(1)}
              </span>
            </div>
            <div style={{fontSize:15,fontWeight:800,color:tx.amount>0?AC:RD}}>
              {Number.isFinite(Number(tx.amount)) ? `${tx.amount>0?"+":""}${fp(Math.abs(tx.amount))}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────────
function HowItWorks({setPage, goHome}) {
  const steps = CASHBACK_LIVE
    ? [["👤","Login with Facebook","One click. We only access your name and photo — nothing else."],["🔍","Browse deals","Find a product you want. Every card shows your exact cashback amount."],["🛒","Shop & Earn","Click the button — you're redirected to Shopee with our tracking link."],["📦","Buy normally","Pay however you like on Shopee. COD, GCash, card — anything works."],["⏳","Tracked automatically","Cashback appears in your ShopSaya wallet as Pending right away."],["💸","Withdraw to GCash","Once you hit ₱100 available, request a payout. Done in 24 hours."]]
    : [["🤖","Ask ShopSaya anything","I-type ang product na hinahanap mo sa Ask ShopSaya — kahit hindi pa nakikita sa site namin, o mag-browse sa curated deals."],["⚡","May match agad?","Kung meron sa catalog namin, makikita mo agad ang legit options — instant, walang hintay."],["🔍","Walang match? Magpa-request ka","Hahanapan ka namin ng totoong legit deal mula sa mga Preferred Sellers sa Shopee — at i-post namin within minutes, hindi araw-araw na hintay."],["🛒","Shop directly on Shopee","Click 'Shop Now' — diretso ka sa totoong Shopee listing. Bayad at checkout gaya ng dati, walang account na kailangan."]];
  const faqs = CASHBACK_LIVE
    ? [["How much cashback will I get?","About 2–20% of the product price — roughly half of what we earn from Shopee's affiliate commission. The exact amount is shown on every product card."],["When will I receive my cashback?","Cashback moves from Pending to Available within 15–45 days after your order is delivered and confirmed."],["What if my order gets cancelled?","Cancelled or returned orders don't generate any commission for us — so no cashback is paid. Only completed orders count."],["Is my GCash number safe?","Absolutely. We only ask for your GCash number when you request a withdrawal. It's stored encrypted and never shared with anyone."],["Do I need to do anything after buying?","No. Just make sure you click our 'Shop & Earn' button before buying. The rest is automatic."]]
    : [["Is ShopSaya legit, or is this a scam?","We only list products from Shopee's Preferred Sellers with strong sold counts and ratings — every listing links to the real Shopee page, where you pay and check out directly."],["Do I need to create an account?","No. Browse and use Ask ShopSaya freely — no login, no personal info required."],["How does ShopSaya make money?","We earn a small commission from Shopee when you buy through our links, at no extra cost to you — same price as buying directly."],["What if you don't have what I'm looking for?","I-type lang sa Ask ShopSaya o i-drop sa request box ang product name o Shopee link — hahanapan ka namin ng legit na deal at i-post namin ito within minutes, hindi kailangan maghintay ng buong araw."],["Is a cashback/rewards program coming?","Yes — we're focused on building a trustworthy deals catalog first. Rewards are planned for the future!"]];

  return (
    <div style={{maxWidth:780,margin:"0 auto",padding:"40px 20px"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8,color:DK}}>Paano gumagana ang ShopSaya?</h2>
        <p style={{fontSize:15,color:GY,lineHeight:1.7,maxWidth:480,margin:"0 auto"}}>
          {CASHBACK_LIVE ? `"Masaya mag-shop at kumita!" — earn real peso cashback on every Shopee order you make through our links.` : `"Takot ka bang ma-scam?" — legit deals lang, legit sellers lang. Wala kang account na kailangan, basta i-type lang o i-browse.`}
        </p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:32}}>
        {steps.map(([ic,t,d],i)=>(
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
        {faqs.map(([q,a],i,arr)=>(
          <div key={i} style={{marginBottom:i<arr.length-1?16:0,paddingBottom:i<arr.length-1?16:0,borderBottom:i<arr.length-1?`1px solid ${P}22`:"none"}}>
            <div style={{fontWeight:600,fontSize:13,color:DK,marginBottom:4}}>{q}</div>
            <div style={{fontSize:13,color:GY,lineHeight:1.6}}>{a}</div>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center",marginTop:28}}>
        <button onClick={()=>CASHBACK_LIVE?goHome():setPage("ask")} style={{background:P,color:WH,border:"none",borderRadius:24,padding:"13px 32px",cursor:"pointer",fontWeight:700,fontSize:14}}>
          {CASHBACK_LIVE ? "Mag-ShopSaya na →" : "Ask ShopSaya →"}
        </button>
      </div>
    </div>
  );
}

// ─── LEGAL PAGES ──────────────────────────────────────────────────────────────
function LegalPage({type, setPage, goHome}) {
  const isPrivacy = type==="privacy";

  const privacyLive = [
    ["Who We Are",`ShopSaya (${SITE_DOMAIN}) is a cashback and deals platform in the Philippines that connects users to Shopee Philippines products through the Shopee Affiliate Program. For privacy concerns: ${SITE_EMAIL}`],
    ["What We Collect","From Facebook Login: your public name and profile photo only. We do NOT collect your email, friends list, or messages. From Withdrawals: your GCash number and account name — collected only when you request a withdrawal, never at signup."],
    ["How We Use It","To create and manage your account, track cashback earnings, process GCash withdrawals, and verify commissions with Shopee. We do not use your data for advertising or share it with third parties."],
    ["Your Rights (RA 10173)","You have the right to access, correct, and delete your data at any time. Email us at "+SITE_EMAIL+" with subject 'Data Privacy Request'. We respond within 15 business days."],
    ["Security","GCash numbers are stored in masked format after your first withdrawal. We use encrypted storage for all personal data."],
    ["Contact NPC","If you believe your privacy rights have been violated, contact the National Privacy Commission at www.privacy.gov.ph or (02) 8234-2228."]
  ];
  const privacyPaused = [
    ["Who We Are",`ShopSaya (${SITE_DOMAIN}) is a curated Shopee Philippines deals platform, connecting shoppers to vetted products through the Shopee Affiliate Program. For privacy concerns: ${SITE_EMAIL}`],
    ["What We Collect","No account or login is required to browse ShopSaya. If you use 'Ask ShopSaya' to request a product, we only collect the text you type — no name, email, or contact details are required. We also keep anonymous click counts per product (no personal identifiers attached) purely to see which deals people find useful."],
    ["How We Use It","To find and curate relevant deals in response to your requests, and to understand which products are most popular so we can feature better deals. We do not sell or share any data with third parties."],
    ["Your Rights (RA 10173)","Since browsing doesn't require an account, there's generally no personal data tied to you to access or delete. If you included identifying details in a product request and want it removed, email "+SITE_EMAIL+" with subject 'Data Privacy Request' and we'll remove it within 15 business days."],
    ["Security","All data is stored using encrypted, access-controlled infrastructure (Firebase/Google Cloud)."],
    ["Contact NPC","If you believe your privacy rights have been violated, contact the National Privacy Commission at www.privacy.gov.ph or (02) 8234-2228."],
    ["Future Features","We plan to introduce an optional cashback rewards program in the future. This policy will be updated and re-presented to users before any account-based or rewards features launch."]
  ];

  const termsLive = [
    ["About ShopSaya",`ShopSaya is a cashback affiliate platform. We earn commission from Shopee when you buy through our links and share half with you as cashback. ShopSaya is NOT officially affiliated with Shopee Philippines.`],
    ["Eligibility","Must be 18+, a Philippine resident, with a valid Facebook account and GCash. One account per person. Multiple accounts will result in permanent ban and forfeiture of all cashback."],
    ["How Cashback Works","Earned when you click our link and complete a Shopee purchase. Cancelled or returned orders get no cashback. Cashback amounts shown are estimates and may change."],
    ["Withdrawals",`Minimum: ${fp(MIN_WITHDRAWAL)}. GCash only. Processed within 24–72 business hours. Cashback earnings are subject to Philippine taxes.`],
    ["Prohibited","Creating multiple accounts, placing orders with intent to cancel, using bots, or any form of fraud. Violations result in immediate account suspension."],
    ["Limitation of Liability","ShopSaya is not responsible for product quality, delivery, or Shopee disputes. Contact Shopee directly for order issues. Our maximum liability is your current wallet balance."],
    ["Contact",`Email: ${SITE_EMAIL} · Response: within 2 business days`]
  ];
  const termsPaused = [
    ["About ShopSaya",`ShopSaya is a curated deals platform. We earn a small commission from Shopee when you purchase through our links — at no extra cost to you, same price as buying directly. ShopSaya is NOT officially affiliated with Shopee Philippines.`],
    ["Eligibility","Open to everyone — no account, signup, or login required to browse deals or use Ask ShopSaya."],
    ["How Purchases Work","All payments and checkout happen entirely on Shopee's platform. ShopSaya never collects, processes, or stores any payment information — we simply link you to the real Shopee listing."],
    ["Ask ShopSaya Requests","Submitting a product request is free and optional. We do our best to find a relevant, legitimately-sold option but cannot guarantee a match for every request, or any specific timeframe."],
    ["Prohibited","Spamming Ask ShopSaya with abusive, illegal, or unrelated content; scraping or republishing site content without permission; any attempt to disrupt the site."],
    ["Limitation of Liability","ShopSaya is not responsible for product quality, delivery, pricing changes, or any disputes arising from a Shopee purchase — these are between you and Shopee/the seller. We make a good-faith effort to feature reputable sellers but cannot guarantee any individual transaction."],
    ["Future Features","An optional cashback rewards program is planned for the future. These Terms will be updated before that launches."],
    ["Contact",`Email: ${SITE_EMAIL} · Response: within 2 business days`]
  ];

  const sections = isPrivacy ? (CASHBACK_LIVE ? privacyLive : privacyPaused) : (CASHBACK_LIVE ? termsLive : termsPaused);

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"32px 20px"}}>
      <button onClick={goHome} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:20,padding:"6px 14px",cursor:"pointer",fontSize:13,color:GY,marginBottom:24}}>← Back to Deals</button>
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
