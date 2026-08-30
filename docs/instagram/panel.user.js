// ==UserScript==
// @name         Panel de Instagram
// @description  Seguidores, historias, sin respuesta, estadísticas y estrategia — desde tu iPhone.
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @run-at       document-idle
// @version      1.0.0
// ==/UserScript==

(() => {
  "use strict";

  // El botón flotante: lo único que corre solo al entrar a instagram.com.
  // El userscript manager no tiene un "tocar el ícono para correr"
  // propio (ver instrucciones arriba), así que se arma acá. Sin esto,
  // el panel se abriría encima del feed cada vez que abrís Instagram —
  // molesto ya la segunda vez.
  if (document.getElementById("igpp-fab")) return;   // ya está puesto

  let abriendo = false;

  const fab = document.createElement("button");
  fab.id = "igpp-fab";
  fab.setAttribute("aria-label", "Abrir el Panel de Instagram");
  fab.textContent = "◐";
  fab.style.cssText = [
    "position:fixed", "z-index:2147483000",
    "right:14px", "bottom:calc(14px + env(safe-area-inset-bottom))",
    "width:46px", "height:46px",
    "border-radius:50%",
    "background:#000", "border:2px solid #CCFF00", "color:#CCFF00",
    "font-size:20px", "font-family:ui-monospace,monospace",
    "display:flex", "align-items:center", "justify-content:center",
    "box-shadow:0 2px 14px rgba(0,0,0,.45)",
    "opacity:.88",
  ].join(";");

  fab.addEventListener("click", () => {
    const yaEsta = document.getElementById("igpp-root");
    if (yaEsta) { yaEsta.remove(); return; }   // segundo toque: se cierra
    if (abriendo) return;
    abriendo = true;
    Promise.resolve(IGPanelPro()).catch(e => {
      alert("No se pudo abrir el panel: " + (e && e.message ? e.message : e));
    }).finally(() => { abriendo = false; });
  });

  document.documentElement.appendChild(fab);

async function IGPanelPro(){
  if(document.getElementById('igpp-root')){ return; }
  // El panel llama a la API de www.instagram.com. Si se abre en otro subdominio
  // (ads., business., l., help.instagram.com…) esas llamadas fallan y todo queda
  // en "no respondió". Por eso se exige la app web principal, no cualquier *.instagram.com.
  var IGHOST=location.hostname;
  if(!/(^|\.)instagram\.com$/.test(IGHOST)){
    alert('Abrí esto estando en una pestaña de instagram.com con tu sesión iniciada.');
    return;
  }
  if(IGHOST!=='www.instagram.com' && IGHOST!=='instagram.com'){
    if(confirm('Estás en '+IGHOST+', una sección de Instagram donde el panel no funciona.\n\n¿Te llevo a www.instagram.com? (después volvé a tocar el marcador para abrirlo ahí)')){
      location.href='https://www.instagram.com/';
    }
    return;
  }

  // ============ CONFIGURACIÓN ============
  // Instagram bloquea toda salida de datos desde su página, así que el panel no envía
  // nada y esto queda vacío. Ver el comentario en "registro de actividad" más abajo.
  var TELEMETRY_URL='';
  // Página de instalación. El pie del panel lleva un enlace acá con el usuario en la
  // dirección: abrir un enlace es una navegación, y las navegaciones no las bloquea la
  // CSP. Es la única vía que funciona, y solo si la persona decide tocarlo.
  var PAGINA='https://nook-a01.github.io/panel/instagram/';
  var BUILD='1.2';
  // =======================================

  var gc=function(n){var m=document.cookie.match('(^|;)\\s*'+n+'\\s*=\\s*([^;]+)');return m?m[2]:null;};
  var uid=gc('ds_user_id'), csrf=gc('csrftoken');
  if(!uid){ alert('No encuentro tu sesión. Iniciá sesión en Instagram y reintentá.'); return; }
  var APPID='936619743392459';
  var headers={'x-ig-app-id':APPID}; if(csrf) headers['x-csrftoken']=csrf;
  // Instagram exige en las ESCRITURAS (dejar de seguir) un token 'www-claim' que
  // manda en un encabezado de respuesta de las LECTURAS. Lo capturamos de cualquier
  // respuesta y lo reenviamos al dejar de seguir; sin esto, la baja suele fallar.
  var wwwClaim=null;
  function capClaim(r){ try{ var c=r&&r.headers&&r.headers.get('x-ig-set-www-claim'); if(c) wwwClaim=c; }catch(e){} }
  var QUERY_HASH='3dec7e2c57367ef3da3d987d89f9dbc8'; // edge_follow: lista de seguidos CON el dato follows_viewer

  var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
  // fetch con tiempo máximo: si Instagram cuelga la conexión y no responde nunca, el
  // pedido se corta solo y falla (para que el reintento actúe), en vez de congelarse.
  function fetchT(url,opts,ms){
    ms=ms||20000;
    if(typeof AbortController==='undefined') return fetch(url,opts);
    var ac=new AbortController();
    var t=setTimeout(function(){ ac.abort(); }, ms);
    var o=Object.assign({},opts||{},{signal:ac.signal});
    return fetch(url,o).then(function(r){ clearTimeout(t); return r; },
                             function(e){ clearTimeout(t); throw e; });
  }
  function fmt(ms){ if(ms<0)ms=0; var s=Math.floor(ms/1000); var m=Math.floor(s/60); s=s%60; return m+':'+String(s).padStart(2,'0'); }
  function timeAgo(ms){ var s=Math.floor((Date.now()-ms)/1000); if(s<60) return 'recién'; var m=Math.floor(s/60); if(m<60) return 'hace '+m+' min'; var h=Math.floor(m/60); if(h<24) return 'hace '+h+' h'; var d=Math.floor(h/24); return 'hace '+d+' día'+(d>1?'s':''); }

  // ---------------- almacenamiento ----------------
  var LS={ cache:'igpp_cache_'+uid, wl:'igpp_wl_'+uid, q:'igpp_q_'+uid, sv:'igpp_sv_'+uid, counts:'igpp_counts_'+uid, hist:'igpp_hist_'+uid, week:'igpp_week_'+uid, svlog:'igpp_svlog_'+uid,
    pendScan:'igpp_pscan_'+uid, pendUnf:'igpp_punf_'+uid,
    flwrs:'igpp_flwrs_'+uid,   // última foto de tu lista de seguidores {users:[], ts}
    lost:'igpp_lost_'+uid };   // historial de quién te dejó de seguir [{u, ts}]
  function lsGet(k,fb){ try{ var v=JSON.parse(localStorage.getItem(k)); return v===null||v===undefined?fb:v; }catch(e){ return fb; } }
  function lsSet(k,v){ try{ if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function loadWL(){ return new Set(lsGet(LS.wl,[])); }
  function saveWL(s){ lsSet(LS.wl,Array.from(s)); }

  // ---------------- registro de actividad ----------------
  // Manda: el usuario de Instagram, un id aleatorio de esta instalación, el evento,
  // la hora local, la versión, y si es móvil o escritorio.
  // NUNCA manda listas, mensajes, historias, contenido de la cuenta ni la contraseña.
  // No se envía NADA hasta que la persona acepta el aviso (ver pedirPermiso más abajo).
  function installId(){
    var k='igpp_install_id', v=null;
    try{ v=localStorage.getItem(k); }catch(e){ return null; }
    if(!v){
      try{ v=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('x'+Date.now().toString(36)+Math.random().toString(36).slice(2,10)); }
      catch(e){ v='x'+Date.now().toString(36); }
      try{ localStorage.setItem(k,v); }catch(e){ return null; }
    }
    return v;
  }
  // Tres estados a propósito: '' significa que todavía no decidió, y mientras esté
  // así NO se envía absolutamente nada. Solo 'si' habilita el envío.
  function teleEstado(){ try{ return localStorage.getItem('igpp_tele')||''; }catch(e){ return 'no'; } }
  function teleSet(v){ try{ localStorage.setItem('igpp_tele',v); }catch(e){} }
  function teleOn(){ return teleEstado()==='si'; }
  var teleSent={};
  function ping(ev,once){
    if(!TELEMETRY_URL||!teleOn()) return;
    if(once){ if(teleSent[ev]) return; teleSent[ev]=1; }
    var id=installId(); if(!id) return;
    var datos={
      id:id, ev:ev, v:BUILD,
      p:(window.innerWidth<700?'movil':'escritorio'),
      u:(state.counts&&state.counts.username)||'',
      h:new Date().getHours(),
      tz:-(new Date().getTimezoneOffset())
    };
    // Va por POST en el cuerpo para que el usuario no quede escrito en la dirección
    // (las direcciones quedan en registros intermedios; los cuerpos no).
    // El tipo text/plain evita la petición previa de permiso, que la CSP de
    // Instagram bloquea. Si aun así falla, se cae al pixel de imagen.
    var cayo=false;
    function respaldo(){
      if(cayo) return; cayo=true;
      try{
        var qs=[];
        for(var k in datos){ if(Object.prototype.hasOwnProperty.call(datos,k)) qs.push(k+'='+encodeURIComponent(datos[k])); }
        var i=new Image(); i.referrerPolicy='no-referrer';
        i.src=TELEMETRY_URL+'/ping?'+qs.join('&')+'&t='+Date.now();
      }catch(e){}
    }
    try{
      var p=fetch(TELEMETRY_URL+'/ping',{
        method:'POST', mode:'cors', keepalive:true, referrerPolicy:'no-referrer',
        headers:{'content-type':'text/plain'}, body:JSON.stringify(datos)
      });
      if(p&&p.then){ p.then(function(r){ if(!r||!r.ok) respaldo(); }).catch(respaldo); } else respaldo();
    }catch(e){ respaldo(); }
  }

  // ---------------- estilos ----------------
  var css=''+
  '#igpp-root{position:fixed;inset:0;z-index:2147483647;background:rgba(5,5,10,.82);backdrop-filter:blur(6px);font-family:system-ui,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;padding:18px}'+
  '#igpp-root *{box-sizing:border-box;font-family:inherit}'+
  '.igpp-panel{background:linear-gradient(180deg,#12121c,#0c0c14);color:#f4f4f8;width:min(920px,97vw);max-height:95vh;border-radius:22px;border:1px solid #26263a;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.7);font-size:16px}'+
  '.igpp-head{padding:16px 22px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #232336;background:rgba(255,255,255,.02)}'+
  '.igpp-logo{display:flex;align-items:center;gap:12px;font-weight:800;font-size:1.25rem}'+
  '.igpp-logodot{width:30px;height:30px;border-radius:9px;background:linear-gradient(45deg,#405de6,#c13584,#f56040);box-shadow:0 3px 14px rgba(193,53,132,.5)}'+
  '.igpp-close{background:rgba(255,255,255,.06);color:#fff;border:1px solid #2a2a40;border-radius:11px;width:40px;height:40px;cursor:pointer;font-size:1.2rem}'+
  '.igpp-close:hover{background:rgba(255,60,100,.2)}'+
  '.igpp-tabs{display:flex;gap:6px;padding:12px 18px;border-bottom:1px solid #232336;overflow-x:auto}'+
  '.igpp-tab{background:none;border:1px solid transparent;color:#8f8fa3;padding:11px 18px;cursor:pointer;font-weight:700;font-size:1rem;border-radius:12px;white-space:nowrap;transition:all .15s}'+
  '.igpp-tab:hover{color:#ddd}'+
  // Al hacer clic no se marca el foco (era el anillo blanco que molestaba), pero al
  // navegar con el teclado sí: sin eso, quien no usa mouse no sabe dónde está parado.
  '.igpp-tab:focus,.igpp-btn:focus,.igpp-close:focus,.igpp-primary:focus,.igpp-danger:focus{outline:none}'+
  '.igpp-tab:focus-visible,.igpp-btn:focus-visible,.igpp-close:focus-visible,'+
  '.igpp-primary:focus-visible,.igpp-danger:focus-visible,.igpp-pill:focus-visible,'+
  '.igpp-cb:focus-visible,.igpp-input:focus-visible,.igpp-user:focus-visible'+
  '{outline:3px solid #b98cff;outline-offset:2px;border-radius:10px}'+
  '.igpp-tab.on{color:#fff;background:linear-gradient(45deg,rgba(64,93,230,.25),rgba(193,53,132,.25));border-color:#3a3a55}'+
  '.igpp-body{padding:20px 24px;overflow:auto;flex:1;font-size:1rem}'+
  '.igpp-chip{display:inline-flex;align-items:center;gap:7px;background:#1a1a28;border:1px solid #2a2a40;border-radius:999px;padding:7px 14px;font-size:.9rem;color:#c9c9d8}'+
  '.igpp-btn{background:#1c1c2b;color:#f4f4f8;border:1px solid #2c2c44;border-radius:12px;padding:11px 17px;cursor:pointer;font-size:.98rem;font-weight:600;transition:filter .12s}'+
  '.igpp-btn:hover:not(:disabled){filter:brightness(1.25)}'+
  '.igpp-btn:disabled{opacity:.45;cursor:default}'+
  '.igpp-primary{width:100%;padding:16px;border:none;border-radius:14px;font-weight:800;font-size:1.15rem;cursor:pointer;color:#fff;background:linear-gradient(45deg,#405de6,#c13584,#f56040);box-shadow:0 6px 22px rgba(193,53,132,.3)}'+
  '.igpp-danger{width:100%;padding:16px;border:none;border-radius:14px;font-weight:800;font-size:1.15rem;cursor:pointer;color:#fff;background:linear-gradient(45deg,#e0245e,#ff5e3a)}'+
  '.igpp-danger:disabled,.igpp-primary:disabled{opacity:.4;cursor:default}'+
  '.igpp-card{background:#0d0d16;border:1px solid #232336;border-radius:16px;padding:16px}'+
  '.igpp-row{display:flex;align-items:center;gap:14px;padding:11px 14px;border:1px solid #20202f;border-radius:15px;background:#0d0d16;transition:border-color .12s}'+
  '.igpp-row:hover{border-color:#35354f}'+
  '.igpp-av{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#1c1c2b;padding:2px}'+
  '.igpp-av.nf{border:2px solid #ff3b6b}.igpp-av.fb{border:2px solid #2ee6a8}'+
  '.igpp-avfb{width:52px;height:52px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.2rem;background:linear-gradient(45deg,#405de6,#c13584,#f56040)}'+
  '.igpp-user{color:#f4f4f8;text-decoration:none;font-weight:700;font-size:1.05rem}.igpp-user:hover{text-decoration:underline}'+
  '.igpp-meta{display:block;color:#8f8fa3;font-size:.85rem;margin-top:2px}'+
  '.igpp-cb{width:21px;height:21px;cursor:pointer;flex:0 0 auto;accent-color:#c13584}'+
  '.igpp-input{padding:12px 15px;border-radius:12px;border:1px solid #2a2a40;background:#0d0d16;color:#f4f4f8;font-size:1rem;outline:none}'+
  '.igpp-input:focus{border-color:#c13584}'+
  '.igpp-progresswrap{background:#1a1a28;border-radius:999px;height:10px;overflow:hidden;margin:10px 0}'+
  '.igpp-progress{height:100%;background:linear-gradient(90deg,#405de6,#c13584,#f56040);border-radius:999px;transition:width .4s;position:relative}'+
  '.igpp-badge{background:#1c1c2b;color:#e8e8f0;padding:5px 12px;border-radius:999px;font-size:.85rem;font-weight:700;white-space:nowrap;border:1px solid #2a2a40}'+
  '.igpp-body ul{list-style:disc;padding-left:1.35rem;margin:12px 0 0}'+
  '.igpp-body ul li{list-style:disc;display:list-item;margin:7px 0;line-height:1.5}'+
  '.igpp-stat{background:linear-gradient(180deg,#12121e,#0c0c14);border:1px solid #26263a;border-radius:18px;padding:22px 14px;text-align:center;display:flex;flex-direction:column;justify-content:center;min-height:104px}'+
  '.igpp-statnum{font-size:2rem;font-weight:800;background:linear-gradient(45deg,#c4ceff,#ffb0e2);-webkit-background-clip:text;background-clip:text;color:transparent}'+
  '.igpp-statlbl{color:#8f8fa3;font-size:.88rem;margin-top:4px}'+
  '.igpp-note{font-size:.94rem;color:#9a9ab0;margin:12px 0;padding:13px 15px;border:1px solid #232336;border-radius:13px;background:#0d0d16}'+
  '.igpp-pill{padding:10px 18px;border-radius:999px;cursor:pointer;font-weight:700;font-size:.98rem;border:1px solid transparent}'+
  '.igpp-pill.on{background:linear-gradient(45deg,#c13584,#e0446e);color:#fff}'+
  '.igpp-pill.off{background:#1a1a28;color:#8f8fa3;border-color:#2a2a40}'+
  '.igpp-flab{display:flex;align-items:center;gap:8px;background:#1a1a28;border:1px solid #2a2a40;padding:10px 15px;border-radius:12px;font-size:.95rem;cursor:pointer;user-select:none}'+
  '@keyframes igppshimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}'+
  '.igpp-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#17172a;color:#fff;border:1px solid #34344e;padding:14px 24px;border-radius:14px;font-size:1rem;z-index:2147483647;box-shadow:0 10px 40px rgba(0,0,0,.5)}'+
  '.igpp-statgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:12px 0}'+
  '.igpp-scrolllist{display:grid;gap:10px;max-height:430px;overflow:auto}'+
  '.igpp-foot{padding:9px 16px;border-top:1px solid #1c1c2b;background:rgba(0,0,0,.25);font-size:.72rem;color:#5f5f74;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}'+
  '.igpp-foot a{color:#8f8fa3;cursor:pointer;text-decoration:underline}'+
  // ---- celular ----
  '@media (max-width:760px){'+
    '#igpp-root{padding:0;align-items:stretch}'+
    '.igpp-panel{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border:none;font-size:15px}'+
    '.igpp-head{padding:11px 13px}'+
    '.igpp-logo{font-size:1rem;gap:8px}'+
    '.igpp-logodot{width:24px;height:24px;border-radius:7px}'+
    // 44px es el mínimo para que un dedo acierte sin errarle al botón de al lado.
    '.igpp-close{width:44px;height:44px;font-size:1.3rem}'+
    '.igpp-tabs{padding:8px 10px;gap:6px;-webkit-overflow-scrolling:touch}'+
    '.igpp-tab{padding:11px 14px;font-size:.9rem;border-radius:10px;min-height:44px}'+
    '.igpp-body{padding:14px 13px}'+
    '.igpp-statgrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'+
    '.igpp-stat{padding:15px 8px;min-height:84px;border-radius:14px}'+
    '.igpp-statnum{font-size:1.5rem}'+
    '.igpp-statlbl{font-size:.78rem}'+
    '.igpp-scrolllist{max-height:none;gap:9px}'+
    '.igpp-row{gap:10px;padding:10px 11px;border-radius:13px}'+
    '.igpp-av,.igpp-avfb{width:44px;height:44px}'+
    '.igpp-user{font-size:.98rem}'+
    '.igpp-meta{font-size:.8rem}'+
    '.igpp-cb{width:25px;height:25px}'+
    '.igpp-btn{padding:12px 15px;font-size:.93rem;min-height:44px}'+
    '.igpp-primary,.igpp-danger{padding:15px 12px;font-size:1rem;line-height:1.3}'+
    '.igpp-input{padding:13px 14px;font-size:16px}'+  // 16px evita que iOS haga zoom al enfocar
    '.igpp-flab{padding:12px 14px;font-size:.92rem;min-height:44px}'+
    '.igpp-pill{padding:12px 18px;font-size:.93rem;min-height:44px;display:inline-flex;align-items:center}'+
    '.igpp-user{padding:3px 0;display:inline-block}'+
    '.igpp-note{font-size:.88rem;padding:12px}'+
    '.igpp-card{padding:14px;border-radius:14px}'+
  '}';
  css+=''+  // piel afiche
  /* ── el fondo detrás del panel ── */
  '#igpp-root{background:rgba(0,0,0,.9);backdrop-filter:blur(3px)}'+

  /* ── la ventana ── */
  '.igpp-panel{background:#000;border:2px solid #fff;border-radius:0;box-shadow:none;color:#fff}'+

  /* ── la cabecera ── */
  '.igpp-head{background:#000;border-bottom:3px solid #fff;padding:14px 18px}'+
  '.igpp-logo{font-weight:900;text-transform:uppercase;letter-spacing:-.02em;font-size:1.1rem}'+
  '.igpp-logodot{background:#CCFF00;border-radius:0;box-shadow:none;width:22px;height:22px}'+
  '.igpp-close{background:#000;border:2px solid #fff;border-radius:0;color:#fff;font-weight:900}'+
  '.igpp-close:hover{background:#CCFF00;color:#000;border-color:#CCFF00}'+

  /* ── las solapas ── */
  '.igpp-tabs{background:#000;border-bottom:2px solid #333;gap:0}'+
  '.igpp-tab{background:#000;border:0;border-bottom:3px solid transparent;border-radius:0;'+
    'color:#8b8b8b;font-weight:800;text-transform:uppercase;letter-spacing:.02em;font-size:.8rem}'+
  '.igpp-tab:hover{background:#0d0d0d;color:#fff}'+
  '.igpp-tab.on{background:#000;color:#CCFF00;border-bottom-color:#CCFF00}'+

  /* ── el cuerpo ── */
  '.igpp-body{background:#000}'+
  '.igpp-card{background:#000;border:2px solid #fff;border-radius:0;box-shadow:none}'+
  '.igpp-row{background:#000;border:1px solid #2a2a2a;border-radius:0}'+
  '.igpp-row:hover{background:#0d0d0d;border-color:#CCFF00}'+
  '.igpp-note{background:#0d0d0d;border:2px solid #fff;border-left:8px solid #CCFF00;border-radius:0;color:#fff}'+

  /* ── botones ── */
  '.igpp-btn{background:#000;border:2px solid #fff;border-radius:0;color:#fff;'+
    'font-weight:800;text-transform:uppercase;letter-spacing:.03em;transition:background .11s linear,color .11s linear}'+
  '.igpp-btn:hover:not(:disabled){background:#CCFF00;color:#000;border-color:#CCFF00}'+
  '.igpp-primary{background:#CCFF00;border:2px solid #CCFF00;border-radius:0;color:#000;'+
    'font-weight:900;text-transform:uppercase}'+
  '.igpp-primary:hover:not(:disabled){background:#fff;border-color:#fff;color:#000}'+
  '.igpp-danger{background:#000;border:2px solid #FF2D7A;border-radius:0;color:#FF2D7A;'+
    'font-weight:900;text-transform:uppercase}'+
  '.igpp-danger:hover:not(:disabled){background:#FF2D7A;color:#000}'+

  /* ── píldoras y etiquetas ── */
  '.igpp-pill{background:#000;border:2px solid #fff;border-radius:0;color:#fff;font-weight:700}'+
  '.igpp-pill.on{background:#CCFF00;border-color:#CCFF00;color:#000}'+
  '.igpp-chip{background:#0d0d0d;border:1px solid #444;border-radius:0;color:#c9c9c9}'+
  '.igpp-badge{background:#CCFF00;border-radius:0;color:#000;font-weight:900}'+
  '.igpp-flab{background:#000;border:2px solid #333;border-radius:0;color:#fff}'+
  '.igpp-flab.on{border-color:#CCFF00;color:#CCFF00}'+

  /* ── campos ── */
  '.igpp-input{background:#0d0d0d;border:2px solid #333;border-radius:0;color:#fff}'+
  '.igpp-input:focus{border-color:#CCFF00;outline:none;box-shadow:none}'+

  /* ── barra de avance ── */
  '.igpp-progresswrap{background:#171717;border:1px solid #333;border-radius:0}'+
  '.igpp-progress{background:#CCFF00;border-radius:0}'+

  /* ── números grandes ── */
  '.igpp-stat{background:#000;border:2px solid #fff;border-radius:0;box-shadow:none}'+
  '.igpp-statnum{color:#CCFF00;font-weight:900}'+
  '.igpp-statlbl{color:#8b8b8b;text-transform:uppercase;letter-spacing:.08em;font-size:.62rem}'+

  /* ── las fotos de perfil siguen redondas: son caras, no cajas ── */
  '.igpp-av,.igpp-avfb{border-radius:50%;border:2px solid #333}'+
  '.igpp-av.nf{border-color:#FF2D7A}'+

  /* ── el usuario, en ácido ── */
  '.igpp-user{color:#fff;font-weight:700}'+
  '.igpp-meta{color:#8b8b8b}'+
  '';

  var styleEl=document.createElement('style'); styleEl.id='igpp-style'; styleEl.textContent=css; document.head.appendChild(styleEl);

  // ---------------- estructura ----------------
  var root=document.createElement('div'); root.id='igpp-root';
  var panel=document.createElement('div'); panel.className='igpp-panel';
  root.appendChild(panel); document.body.appendChild(root);
  // En celular, si no se bloquea, el feed de Instagram sigue moviéndose detrás del panel.
  var scrollPrevio=document.body.style.overflow;
  document.body.style.overflow='hidden';

  var head=document.createElement('div'); head.className='igpp-head';
  var logo=document.createElement('div'); logo.className='igpp-logo';
  logo.innerHTML='<span class="igpp-logodot"></span> Panel de <span style="background:linear-gradient(45deg,#c13584,#f56040);-webkit-background-clip:text;background-clip:text;color:transparent">Instagram</span> <span style="font-size:.68rem;opacity:.55;font-weight:400;margin-left:6px">v'+BUILD+'</span>';
  var closeBtn=document.createElement('button'); closeBtn.className='igpp-close'; closeBtn.textContent='✕';
  closeBtn.setAttribute('aria-label','Cerrar el panel'); closeBtn.title='Cerrar el panel';
  closeBtn.onclick=function(){
    root.remove();
    var st=document.getElementById('igpp-style'); if(st) st.remove();
    document.body.style.overflow=scrollPrevio;
    try{ window.removeEventListener('message',onSyncMsg); }catch(e){}
  };
  var syncBtn=document.createElement('button'); syncBtn.className='igpp-close'; syncBtn.textContent='🔄';
  syncBtn.setAttribute('aria-label','Sincronizar dispositivos'); syncBtn.title='Sincronizar dispositivos';
  syncBtn.style.marginRight='8px';
  syncBtn.onclick=function(){ abrirSyncOverlay(); };
  var headBtns=document.createElement('div'); headBtns.style.cssText='display:flex;align-items:center';
  headBtns.appendChild(syncBtn); headBtns.appendChild(closeBtn);
  head.appendChild(logo); head.appendChild(headBtns); panel.appendChild(head);

  var tabsBar=document.createElement('div'); tabsBar.className='igpp-tabs';
  var tabDefs=[['analysis','👥 Seguidores'],['lost','💔 Te dejaron'],['dms','💬 Sin respuesta'],['stories','👁️ Historias'],['stats','📈 Estadísticas'],['strategy','🎯 Estrategia']];
  var tabBtns={};
  tabDefs.forEach(function(td){
    var b=document.createElement('button'); b.className='igpp-tab'; b.textContent=td[1];
    b.onclick=function(){ switchTab(td[0]); };
    tabBtns[td[0]]=b; tabsBar.appendChild(b);
  });
  panel.appendChild(tabsBar);
  var body=document.createElement('div'); body.className='igpp-body'; panel.appendChild(body);

  // pie: se saca el enlace de avisar, porque ahora el aviso pasa por la puerta de
  // entrada. La frase queda acotada a lo que sigue siendo cierto: las listas, los
  // mensajes y las fotos nunca salen del navegador.
  var pintarPie=function(){};
  if(PAGINA){
    var foot=document.createElement('div'); foot.className='igpp-foot';
    var footTxt=document.createElement('div');
    footTxt.innerHTML='🔒 Tus listas, mensajes y fotos se procesan solo en tu navegador.';
    foot.appendChild(footTxt); panel.appendChild(foot);
  }

  // Los escaneos y las bajas NO abren pestaña: se anotan acá en silencio y viajan
  // pegados a la próxima pestaña que se abre igual (cuando la persona entra). Así el
  // dato llega en la apertura siguiente, sin ninguna pestaña extra.
  function sumarEscaneo(){
    lsSet(LS.pendScan,(lsGet(LS.pendScan,0)||0)+1);
  }
  // De cada baja se guarda el nombre de la cuenta, no solo un número.
  function agregarBaja(u){
    if(!u) return;
    var l=lsGet(LS.pendUnf,[]); if(!Array.isArray(l)) l=[];
    l.push(u); if(l.length>500) l=l.slice(-500); // techo por si algo se desmadra
    lsSet(LS.pendUnf,l);
  }

  // ---------------- SINCRONIZACIÓN entre dispositivos ----------------
  // Instagram bloquea que el panel hable con el servidor, pero la pestaña de la página
  // de instalación (github) sí puede. El panel le pasa sus datos por mensajería entre
  // ventanas (postMessage, que la CSP NO bloquea); esa pestaña los fusiona con el
  // servidor y devuelve el resultado. Dos dispositivos con la misma "clave de sync"
  // comparten así lista blanca, historial de bajas y curva de crecimiento.
  var ORIGEN_PAGINA=(function(){ try{ return new URL(PAGINA).origin; }catch(e){ return 'https://nook-a01.github.io'; } })();
  var LS_SYNCKEY='igpp_synckey', LS_LASTSYNC='igpp_lastsync';
  function syncKey(){ try{ return localStorage.getItem(LS_SYNCKEY)||''; }catch(e){ return ''; } }
  function setSyncKey(k){ try{ if(k) localStorage.setItem(LS_SYNCKEY,k); else localStorage.removeItem(LS_SYNCKEY); }catch(e){} }
  function nuevaSyncKey(){
    var k=''; try{ k=(crypto.randomUUID?crypto.randomUUID():'').replace(/-/g,''); }catch(e){}
    if(k.length<16) k='k'+Date.now().toString(36)+Math.random().toString(36).slice(2,16);
    setSyncKey(k); return k;
  }
  function datosSync(){ return { wl:Array.from(state.whitelist), lost:lsGet(LS.lost,[]), growth:lsGet(LS.hist,[]) }; }
  function adoptarSync(m){
    if(!m||typeof m!=='object') return;
    if(Array.isArray(m.wl)){ state.whitelist=new Set(m.wl); saveWL(state.whitelist); }
    if(Array.isArray(m.lost)) lsSet(LS.lost,m.lost);
    if(Array.isArray(m.growth)) lsSet(LS.hist,m.growth);
    try{ localStorage.setItem(LS_LASTSYNC,String(Date.now())); }catch(e){}
  }
  // Escucha a cualquier pestaña de instalación que abramos: cuando avisa que está lista
  // le mandamos nuestros datos; cuando responde con los fusionados, los adoptamos. Así
  // el sync viaja pegado a la pestaña de "Entrar", sin abrir ninguna pestaña extra.
  function onSyncMsg(e){
    if(e.origin!==ORIGEN_PAGINA) return;
    var d=e.data||{};
    if(d.type==='igpp-sync-ready'){
      var k=syncKey();
      if(k && e.source){ try{ e.source.postMessage({type:'igpp-sync-push', clave:k, data:datosSync()}, ORIGEN_PAGINA); }catch(err){} }
    } else if(d.type==='igpp-sync-pull'){
      if(d.data){ adoptarSync(d.data); toast('🔄 Sincronizado'); renderActiveTab(); }
      else if(d.error){ toast('Sync: '+String(d.error).slice(0,40)); }
    }
  }
  window.addEventListener('message',onSyncMsg);
  function sincronizarAhora(){
    if(!syncKey()){ toast('Primero emparejá este dispositivo'); return; }
    try{ window.open(PAGINA+'?sync=1','_blank'); }catch(e){ toast('El navegador bloqueó la pestaña'); }
  }
  function abrirSyncOverlay(){
    var prev=document.getElementById('igpp-sync-ov'); if(prev) prev.remove();
    var ov=document.createElement('div'); ov.id='igpp-sync-ov';
    ov.style.cssText='position:absolute;inset:0;background:rgba(6,6,12,.93);z-index:10;display:flex;align-items:center;justify-content:center;padding:18px';
    var box=document.createElement('div');
    box.style.cssText='background:#12121c;border:1px solid #2a2a40;border-radius:16px;max-width:430px;width:100%;padding:22px';
    var k=syncKey(), last='';
    try{ var t=+localStorage.getItem(LS_LASTSYNC); if(t) last=' · última vez '+timeAgo(t); }catch(e){}
    var h='<div style="font-weight:800;font-size:1.15rem;margin-bottom:8px">🔄 Sincronizar dispositivos</div>';
    if(!k){
      h+='<div style="color:#c9c9d8;font-size:.92rem;line-height:1.55;margin-bottom:16px">Para que la compu y el teléfono compartan lista blanca, bajas e historial:<br>Paso 1 — en <b>este</b> dispositivo generá un código.<br>Paso 2 — en el <b>otro</b>, pegá ese mismo código.</div>'+
        '<button class="igpp-primary" id="igpp-gen" style="margin-bottom:14px">Generar código en este dispositivo</button>'+
        '<div style="text-align:center;color:#6a6a80;font-size:.85rem;margin:4px 0 10px">— o si ya tenés un código —</div>'+
        '<input class="igpp-input" id="igpp-pair" placeholder="Pegá el código del otro dispositivo" style="width:100%;margin-bottom:10px">'+
        '<button class="igpp-btn" id="igpp-pairbtn" style="width:100%">Emparejar con ese código</button>';
    } else {
      h+='<div style="color:#2ee6a8;font-size:.93rem;margin-bottom:12px">✅ Emparejado'+last+'</div>'+
        '<div style="color:#9a9ab0;font-size:.85rem;margin-bottom:6px">Tu código (pegalo en el otro dispositivo):</div>'+
        '<div style="display:flex;gap:8px;margin-bottom:16px"><input class="igpp-input" id="igpp-code" readonly value="'+k+'" style="flex:1;font-size:.78rem"><button class="igpp-btn" id="igpp-copy">Copiar</button></div>'+
        '<button class="igpp-primary" id="igpp-now" style="margin-bottom:10px">Sincronizar ahora</button>'+
        '<button class="igpp-btn" id="igpp-unpair" style="width:100%">Desemparejar este dispositivo</button>';
    }
    h+='<div style="text-align:center;margin-top:14px"><a id="igpp-syncclose" style="color:#8f8fa3;cursor:pointer;text-decoration:underline;font-size:.9rem">Cerrar</a></div>';
    box.innerHTML=h; ov.appendChild(box); root.appendChild(ov);
    var cerrar=function(){ ov.remove(); };
    document.getElementById('igpp-syncclose').onclick=cerrar;
    var gen=document.getElementById('igpp-gen'); if(gen) gen.onclick=function(){ nuevaSyncKey(); abrirSyncOverlay(); };
    var pb=document.getElementById('igpp-pairbtn'); if(pb) pb.onclick=function(){
      var v=((document.getElementById('igpp-pair').value)||'').trim();
      if(!/^[A-Za-z0-9_-]{16,64}$/.test(v)){ toast('Ese código no tiene el formato correcto'); return; }
      setSyncKey(v); cerrar(); sincronizarAhora();
    };
    var cp=document.getElementById('igpp-copy'); if(cp) cp.onclick=function(){ try{ navigator.clipboard.writeText(k); toast('Código copiado'); }catch(e){ toast('Copialo a mano'); } };
    var now=document.getElementById('igpp-now'); if(now) now.onclick=function(){ cerrar(); sincronizarAhora(); };
    var up=document.getElementById('igpp-unpair'); if(up) up.onclick=function(){ if(confirm('¿Desemparejar? Este dispositivo dejará de sincronizar (no borra nada de lo que ya tenés).')){ setSyncKey(null); abrirSyncOverlay(); } };
  }

  // Único canal de salida: abrir la página de instalación en una pestaña, con los
  // datos en la dirección. Instagram bloquea cualquier otro envío, pero no las
  // navegaciones. La pestaña se cierra sola (lo hace la propia página).
  // Arrastra los escaneos y las bajas acumuladas. Los nombres que no entren en el
  // largo máximo del enlace quedan guardados para la próxima apertura.
  function avisar(){
    if(!PAGINA) return;
    var u=(state.counts&&state.counts.username)||'';
    if(!u) return;
    var url=PAGINA+'?u='+encodeURIComponent(u)+'&b='+encodeURIComponent(BUILD);
    var ps=lsGet(LS.pendScan,0)||0;
    if(ps>0) url+='&s='+ps;

    var lista=lsGet(LS.pendUnf,[]); if(!Array.isArray(lista)) lista=[];
    var resto=lista.slice(), envio=[], largo=url.length+4;
    while(resto.length){
      var cand=encodeURIComponent(resto[0]);
      if(largo+cand.length+1>1600) break; // enlaces demasiado largos fallan
      largo+=cand.length+1; envio.push(resto.shift());
    }
    if(envio.length) url+='&fu='+envio.map(encodeURIComponent).join(',');

    try{
      window.open(url,'_blank');
      lsSet(LS.pendScan,null);                       // escaneos: enviados
      lsSet(LS.pendUnf, resto.length?resto:null);    // bajas: guardo lo que no entró
    }catch(e){}
  }

  // Puerta de entrada: se muestra SIEMPRE, en cada apertura del panel.
  // Devuelve true si puede pasar, false si quedó esperando el toque.
  //
  // Se deja pasar igual si no hay página configurada o si no se pudo leer la cuenta:
  // sin usuario no habría nada que registrar, y no tiene sentido trabar a nadie.
  function exigirRegistro(){
    if(!PAGINA) return true;
    var u=(state.counts&&state.counts.username)||'';
    if(!u) return true;

    tabsBar.style.display='none';
    body.innerHTML='';
    var c=document.createElement('div');
    c.style.cssText='text-align:center;padding:44px 22px;max-width:440px;margin:0 auto';
    // line-height:1 en el emoji: sin eso, la caja de una línea de 2.6rem se estira
    // por debajo del dibujo y lo empuja contra el nombre.
    c.innerHTML='<div style="font-size:2.6rem;line-height:1;margin:0 0 22px" aria-hidden="true">👋</div>'+
      '<div style="font-size:1.3rem;font-weight:800;margin:0 0 30px">Hola, @'+u+'</div>';
    var b=document.createElement('button');
    b.className='igpp-primary'; b.textContent='Entrar';
    b.onclick=function(){
      avisar('registro');
      tabsBar.style.display='';
      switchTab('analysis');
    };
    c.appendChild(b);
    body.appendChild(c);
    b.focus();
    return false;
  }

  // Aviso previo: se muestra una sola vez, antes de mandar nada, y con el usuario
  // de Instagram a la vista para que la persona sepa exactamente qué se envía.
  function pedirPermiso(){
    if(!TELEMETRY_URL || teleEstado()) return;
    var quien=(state.counts&&state.counts.username)?('@'+state.counts.username):'tu usuario de Instagram';
    var c=document.createElement('div'); c.id='igpp-consent';
    c.style.cssText='padding:16px 20px;border-bottom:1px solid #3a2a44;background:linear-gradient(180deg,rgba(193,53,132,.16),rgba(193,53,132,.04))';
    c.innerHTML='<div style="font-weight:800;font-size:1.02rem;margin-bottom:7px">Antes de empezar</div>'+
      '<div style="font-size:.93rem;color:#d5d5e2;line-height:1.55">'+
      'Este panel le avisa a quien lo creó <b>que vos lo estás usando</b>: <b>'+quien+'</b>, '+
      'la fecha y hora de cada vez que lo abrís, y qué secciones mirás.<br>'+
      'No se envían tus listas de seguidores, mensajes, historias ni ningún contenido de tu cuenta, '+
      'y tu contraseña no se pide nunca. Podés cambiar de idea cuando quieras desde el pie del panel.'+
      '</div>';
    var fila=document.createElement('div'); fila.style.cssText='display:flex;gap:9px;margin-top:14px;flex-wrap:wrap';
    var si=document.createElement('button'); si.className='igpp-btn'; si.textContent='Aceptar';
    si.style.cssText+=';background:linear-gradient(45deg,#405de6,#c13584);border-color:transparent;color:#fff';
    var no=document.createElement('button'); no.className='igpp-btn'; no.textContent='No, gracias';
    si.onclick=function(){ teleSet('si'); c.remove(); pintarPie(); ping('open'); };
    no.onclick=function(){ teleSet('no'); c.remove(); pintarPie(); };
    fila.appendChild(si); fila.appendChild(no); c.appendChild(fila);
    panel.insertBefore(c,tabsBar);
  }

  function toast(msg){
    var t=document.createElement('div'); t.className='igpp-toast'; t.textContent=msg;
    document.body.appendChild(t); setTimeout(function(){t.remove();},2200);
  }

  // ---------------- estado ----------------
  var cache=lsGet(LS.cache,null); // {users:[], cursor:'', complete:bool, ts:number, total:number, mode:'gql'|'api'}
  var state={
    scanning:false, scanStatus:'', scanPct:0, scanErr:'',
    filters:{nonFollowers:true, followers:false, verified:true, private:true},
    tab:'nonwl', search:'', page:0, pageSize:30, selected:new Set(), whitelist:loadWL(),
    activeTab:'analysis', dmsResults:null, dmsSelected:new Set(),
    counts:lsGet(LS.counts,null)
  };
  function users(){ return (cache&&cache.users)||[]; }

  function switchTab(k){
    state.activeTab=k;
    Object.keys(tabBtns).forEach(function(kk){ tabBtns[kk].className='igpp-tab'+(kk===k?' on':''); });
    ping('tab_'+k,true);
    renderActiveTab();
  }
  function renderActiveTab(){
    if(state.activeTab==='analysis') renderAnalysisTab();
    else if(state.activeTab==='lost') renderLostTab();
    else if(state.activeTab==='dms') renderDmsTab();
    else if(state.activeTab==='stories') renderStoriesTab();
    else if(state.activeTab==='strategy') renderStrategyTab();
    else renderStatsTab();
  }

  // ---------------- banner de cuenta ----------------
  var accountBanner=document.createElement('div');
  accountBanner.style.cssText='font-size:.95rem;color:#9a9ab0;margin-bottom:14px';
  accountBanner.textContent='Verificando cuenta…';
  async function checkAccount(){
    try{
      var r=await fetch('https://www.instagram.com/api/v1/users/'+uid+'/info/',{headers:headers,credentials:'include'});
      capClaim(r);
      if(r.status===401 || r.status===403){
        pintarBanner('⚠️ Tu sesión de Instagram venció o se cerró. Volvé a iniciar sesión en instagram.com y reabrí el panel.');
        return;
      }
      var j=await r.json();
      var u=j&&j.user;
      if(u){
        state.counts={followers:u.follower_count, following:u.following_count, username:u.username, ts:Date.now()};
        lsSet(LS.counts,state.counts);
        // registro histórico: 1 punto por día para la curva de evolución
        var hist=lsGet(LS.hist,[]);
        if(!hist.length || (Date.now()-hist[hist.length-1].ts)>12*3600*1000){
          hist.push({ts:Date.now(), f:u.follower_count, g:u.following_count});
          if(hist.length>400) hist=hist.slice(-400);
          lsSet(LS.hist,hist);
        }
        accountBanner.innerHTML='✅ Sesión detectada: <b style="color:#2ee6a8">@'+u.username+'</b> · '+u.follower_count+' seguidores · '+u.following_count+' seguidos';
        var live=document.getElementById('igpp-banner'); if(live){ live.innerHTML=accountBanner.innerHTML; }
      } else {
        // Respondió, pero sin los datos esperados: probablemente Instagram cambió algo.
        pintarBanner('⚠️ Instagram cambió algo por dentro y esta herramienta puede necesitar una actualización. Avisale a quien te pasó el panel. (No es un problema de tu cuenta.)');
      }
    }catch(e){ pintarBanner('No se pudo verificar la cuenta (seguimos con la sesión activa).'); }
  }
  function pintarBanner(txt){
    accountBanner.textContent=txt;
    var live=document.getElementById('igpp-banner'); if(live){ live.textContent=txt; }
  }

  // ---------------- ESCÁNER (resumible, con memoria) ----------------
  // Método principal: GraphQL edge_follow — cada seguido trae follows_viewer (si te sigue de vuelta).
  // Solo se recorre UNA lista. Progreso guardado tras cada página.
  function newCache(mode){ return {users:[], cursor:'', complete:false, ts:Date.now(), total:0, mode:mode||'gql'}; }

  async function gqlPage(cursor){
    var vars={id:uid, include_reel:true, fetch_mutual:true, first:50};
    if(cursor) vars.after=cursor;
    var url='https://www.instagram.com/graphql/query/?query_hash='+QUERY_HASH+'&variables='+encodeURIComponent(JSON.stringify(vars));
    var res=await fetchT(url,{headers:headers,credentials:'include'});
    capClaim(res);
    if(!res.ok) throw {kind:res.status===429?'limit':'http', status:res.status};
    var j=await res.json();
    var ef=j&&j.data&&j.data.user&&j.data.user.edge_follow;
    if(!ef||!ef.edges) throw {kind:'shape'};
    return {
      total:ef.count,
      next:(ef.page_info&&ef.page_info.has_next_page)?ef.page_info.end_cursor:'',
      users:ef.edges.map(function(e){ var n=e.node; return {
        id:String(n.id), username:n.username, full_name:n.full_name||'',
        is_private:!!n.is_private, is_verified:!!n.is_verified,
        profile_pic_url:n.profile_pic_url||'', follows_viewer:!!n.follows_viewer
      };})
    };
  }

  // Respaldo si GraphQL dejara de existir: API v1 (dos listas). Misma resiliencia.
  async function apiPage(type,cursor){
    var url='https://www.instagram.com/api/v1/friendships/'+uid+'/'+type+'/?count=100'+(cursor?('&max_id='+encodeURIComponent(cursor)):'');
    var res=await fetchT(url,{headers:headers,credentials:'include'});
    capClaim(res);
    if(!res.ok) throw {kind:res.status===429?'limit':'http', status:res.status};
    var j=await res.json();
    if(!j||j.status==='fail'||!Array.isArray(j.users)) throw {kind:'shape'};
    return { next:j.next_max_id||'',
      users:j.users.map(function(u){ return {
        id:String(u.pk||u.id), username:u.username, full_name:u.full_name||'',
        is_private:!!u.is_private, is_verified:!!u.is_verified,
        profile_pic_url:u.profile_pic_url||''
      };})
    };
  }

  var scanAbort=false;
  async function runScan(fresh){
    if(state.scanning) return;
    state.scanning=true; scanAbort=false; state.scanErr='';
    if(fresh||!cache||cache.complete) cache=newCache('gql');
    var backoffs=[8000,15000,30000,60000,120000], failStreak=0, pageN=0;

    while(!scanAbort){
      var got=null;
      try{
        if(cache.mode==='gql'){ got=await gqlPage(cache.cursor); }
        else {
          var phase=cache.apiPhase||'following';
          var r=await apiPage(phase,cache.cursor);
          got={ total:cache.total, next:r.next, users:r.users, apiPhase:phase };
        }
      }catch(err){
        // "Estructural" = Instagram devolvió algo con una forma que no esperábamos, o
        // el endpoint ya no existe (404). Eso pasa cuando Instagram cambia algo por
        // dentro; reintentar no sirve. Distinto de un bloqueo temporal (429) o un
        // corte de red, donde sí conviene esperar y reintentar.
        var estructural = err && (err.kind==='shape' || (err.kind==='http' && err.status===404));

        // Sesión vencida o cerrada (401/403): reintentar no sirve, hay que volver a
        // iniciar sesión. Se avisa claro y se frena.
        if(err && err.kind==='http' && (err.status===401 || err.status===403)){
          state.scanErr='Tu sesión de Instagram venció o se cerró. Abrí instagram.com, volvé a iniciar sesión, y reintentá. Lo escaneado hasta ahora ('+cache.users.length+' cuentas) quedó guardado.';
          break;
        }

        // Primer intento estructural con GraphQL: probar el método alternativo una vez.
        if(cache.mode==='gql' && estructural && cache.users.length===0){
          cache=newCache('api'); cache.apiPhase='following'; cache.apiFollowers=[];
          setScanStatus('Cambiando a método alternativo…',0);
          continue;
        }
        // Si el alternativo TAMBIÉN falla por estructura, Instagram cambió algo:
        // mensaje claro y frenar, sin gastar reintentos inútiles.
        if(estructural){
          state.scanErr='Parece que Instagram cambió algo por dentro y esta herramienta necesita una actualización. No es un bloqueo de tu cuenta ni algo que hiciste mal — avisale a quien te pasó el panel.';
          break;
        }

        failStreak++;
        if(failStreak>backoffs.length){
          state.scanErr='Instagram no responde tras varios intentos. Se guardaron '+cache.users.length+' cuentas: podés continuar más tarde desde donde quedó (botón "Continuar escaneo"). Si sigue fallando, abrí instagram.com normalmente y fijate si te pide confirmar algo.';
          break;
        }
        var motivo = (err && err.kind==='limit') ? 'Instagram limitó las peticiones' : 'Instagram no respondió';
        var wait=backoffs[failStreak-1];
        for(var w=wait; w>0 && !scanAbort; w-=1000){
          setScanStatus('⏳ '+motivo+'. Reintento '+failStreak+'/'+backoffs.length+' en '+fmt(w)+'…', pctNow());
          await sleep(1000);
        }
        continue;
      }
      failStreak=0;

      if(cache.mode==='gql'){
        cache.users=cache.users.concat(got.users);
        if(got.total) cache.total=got.total;
        cache.cursor=got.next;
        if(!got.next){ cache.complete=true; }
      } else {
        if(cache.apiPhase==='following'){
          cache.users=cache.users.concat(got.users);
          cache.cursor=got.next;
          if(!got.next){ cache.apiPhase='followers'; cache.cursor=''; }
        } else {
          cache.apiFollowers=(cache.apiFollowers||[]).concat(got.users.map(function(u){return u.username.toLowerCase();}));
          cache.cursor=got.next;
          if(!got.next){
            var fset={}; cache.apiFollowers.forEach(function(un){fset[un]=true;});
            cache.users.forEach(function(u){ u.follows_viewer=!!fset[u.username.toLowerCase()]; });
            cache.complete=true;
          }
        }
      }
      cache.ts=Date.now();
      lsSet(LS.cache,cache); // progreso guardado en cada página
      pageN++;
      setScanStatus(scanLabel(), pctNow());
      if(cache.complete) break;

      await sleep(1000+Math.floor(Math.random()*700));
      if(pageN%8===0){ setScanStatus('😴 Pausa breve de seguridad…',pctNow()); await sleep(6000); }
      if(pageN%30===0){ setScanStatus('😴 Pausa larga para no llamar la atención de Instagram…',pctNow()); await sleep(20000); }
    }
    state.scanning=false;
    if(state.activeTab==='analysis') renderAnalysisTab();
    if(cache.complete){
      sumarEscaneo();
      // Limpiar la lista blanca: sacar a quienes ya no seguís (no aparecen en el
      // escaneo completo de tus seguidos). Guarda anti-escaneo-corto: solo si la
      // cantidad leída es creíble, para no vaciarla por una lista incompleta.
      var quitadosWL=0;
      if(state.whitelist.size && (!cache.total || cache.users.length>=Math.floor(cache.total*0.9))){
        var siguiendo={}; cache.users.forEach(function(u){ siguiendo[u.username]=1; });
        Array.from(state.whitelist).forEach(function(un){ if(!siguiendo[un]){ state.whitelist.delete(un); quitadosWL++; } });
        if(quitadosWL){ saveWL(state.whitelist); if(state.activeTab==='analysis') renderAnalysisTab(); }
      }
      toast('✅ Escaneo completo: '+cache.users.length+' cuentas'+(quitadosWL?(' · '+quitadosWL+' salieron de la lista blanca (ya no los seguís)'):''));
    }
  }
  function pctNow(){
    if(!cache) return 0;
    if(cache.mode==='api'){ return cache.complete?100:(cache.apiPhase==='followers'?60:30); }
    if(!cache.total) return 0;
    return Math.min(100,Math.floor(cache.users.length/cache.total*100));
  }
  function scanLabel(){
    if(cache.mode==='api'){
      return cache.apiPhase==='followers' ? 'Leyendo seguidores (método alternativo)… '+(cache.apiFollowers||[]).length : 'Leyendo seguidos (método alternativo)… '+cache.users.length;
    }
    return 'Escaneando seguidos… '+cache.users.length+(cache.total?(' de '+cache.total):'')+' cuentas';
  }
  function setScanStatus(txt,pct){
    state.scanStatus=txt; state.scanPct=pct;
    var st=document.getElementById('igpp-scan-status'); if(st) st.textContent=txt;
    var pb=document.getElementById('igpp-scan-bar'); if(pb) pb.style.width=pct+'%';
    var pc=document.getElementById('igpp-scan-pct'); if(pc) pc.textContent=pct+'%';
  }

  // ---------------- PESTAÑA SEGUIDORES ----------------
  function pool(){
    return users().map(function(u){ return Object.assign({},u,{followsBack:!!u.follows_viewer}); });
  }
  function filteredPool(){
    var wl=state.whitelist;
    var p=pool().filter(function(u){ return state.tab==='wl' ? wl.has(u.username) : !wl.has(u.username); });
    p=p.filter(function(u){
      if(u.followsBack && !state.filters.followers) return false;
      if(!u.followsBack && !state.filters.nonFollowers) return false;
      if(u.is_verified && !state.filters.verified) return false;
      if(u.is_private && !state.filters.private) return false;
      return true;
    });
    if(state.search){
      var q=state.search.toLowerCase();
      p=p.filter(function(u){ return u.username.toLowerCase().indexOf(q)>-1 || (u.full_name||'').toLowerCase().indexOf(q)>-1; });
    }
    p.sort(function(a,b){ return a.username.toLowerCase()<b.username.toLowerCase()?-1:1; });
    return p;
  }

  function bannerEl(){
    var b=document.createElement('div'); b.id='igpp-banner';
    b.style.cssText=accountBanner.style.cssText; b.innerHTML=accountBanner.innerHTML||accountBanner.textContent;
    return b;
  }

  function renderAnalysisTab(){
    body.innerHTML=''; body.appendChild(bannerEl());

    // --- zona de escaneo ---
    var scanCard=document.createElement('div'); scanCard.className='igpp-card'; scanCard.style.marginBottom='16px';
    if(state.scanning){
      scanCard.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><b>🔎 Escaneando…</b><span id="igpp-scan-pct" class="igpp-badge">'+state.scanPct+'%</span></div>'+
        '<div class="igpp-progresswrap"><div id="igpp-scan-bar" class="igpp-progress" style="width:'+state.scanPct+'%"></div></div>'+
        '<div id="igpp-scan-status" style="color:#9a9ab0;font-size:.92rem">'+(state.scanStatus||'Comenzando…')+'</div>'+
        '<div style="color:#6a6a80;font-size:.83rem;margin-top:8px">El progreso se guarda solo: si se corta, se retoma donde quedó. Podés seguir mirando los resultados parciales abajo.</div>';
      var stopB=document.createElement('button'); stopB.className='igpp-btn'; stopB.style.marginTop='10px'; stopB.textContent='⏸ Pausar escaneo';
      stopB.onclick=function(){ scanAbort=true; };
      scanCard.appendChild(stopB);
    } else if(!cache || (!cache.users.length && !cache.complete)){
      scanCard.style.textAlign='center'; scanCard.style.padding='30px 20px';
      scanCard.innerHTML='<div style="font-size:2.2rem;margin-bottom:8px">🔎</div><div style="margin-bottom:16px;color:#c9c9d8">Todavía no hay ningún escaneo guardado.</div>';
      var b=document.createElement('button'); b.className='igpp-primary'; b.style.maxWidth='340px'; b.textContent='Escanear ahora';
      b.onclick=function(){ runScan(true); renderAnalysisTab(); };
      scanCard.appendChild(b);
    } else if(!cache.complete){
      scanCard.innerHTML='<b>⏸ Escaneo interrumpido</b> — se guardaron <b>'+cache.users.length+'</b>'+(cache.total?(' de '+cache.total):'')+' cuentas ('+timeAgo(cache.ts)+').'+
        (state.scanErr?('<div style="color:#ffb020;font-size:.9rem;margin-top:8px">'+state.scanErr+'</div>'):'');
      var wrap=document.createElement('div'); wrap.style.cssText='display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
      var cont=document.createElement('button'); cont.className='igpp-primary'; cont.style.width='auto'; cont.style.padding='13px 24px'; cont.textContent='▶ Continuar escaneo donde quedó';
      cont.onclick=function(){ runScan(false); renderAnalysisTab(); };
      var restart=document.createElement('button'); restart.className='igpp-btn'; restart.textContent='🔄 Empezar de cero';
      restart.onclick=function(){ if(confirm('¿Descartar el progreso guardado y escanear desde cero?')){ runScan(true); renderAnalysisTab(); } };
      wrap.appendChild(cont); wrap.appendChild(restart); scanCard.appendChild(wrap);
    } else {
      var nb=pool().filter(function(u){return !u.followsBack;}).length;
      scanCard.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
        '<div>✅ <b>'+cache.users.length+'</b> seguidos analizados · <b style="color:#ff3b6b">'+nb+'</b> no te siguen de vuelta'+
        '<div style="color:#6a6a80;font-size:.85rem;margin-top:3px">Último escaneo: '+timeAgo(cache.ts)+' · guardado en este navegador</div></div></div>';
      var re=document.createElement('button'); re.className='igpp-btn'; re.textContent='🔄 Reescanear';
      re.onclick=function(){ if(users().length===0||confirm('¿Reescanear ahora? El escaneo actual se reemplaza al terminar.')){ runScan(true); renderAnalysisTab(); } };
      scanCard.firstChild.appendChild(re);
    }
    body.appendChild(scanCard);

    if(!users().length){ return; }

    // --- verificador puntual ---
    var lookupWrap=document.createElement('div'); lookupWrap.style.cssText='display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center';
    var lookupInput=document.createElement('input'); lookupInput.className='igpp-input'; lookupInput.style.cssText+='flex:1;min-width:180px'; lookupInput.placeholder='Verificar un usuario puntual (sin @)…';
    var lookupBtn=document.createElement('button'); lookupBtn.className='igpp-btn'; lookupBtn.textContent='🔍 Verificar';
    var lookupResult=document.createElement('div'); lookupResult.style.cssText='width:100%;font-size:.92rem;color:#c9c9d8';
    lookupBtn.onclick=function(){
      var q=lookupInput.value.trim().toLowerCase().replace(/^@/,'');
      if(!q) return;
      var found=pool().find(function(u){ return u.username.toLowerCase()===q; });
      if(!found){ lookupResult.innerHTML='No seguís a <b>@'+q+'</b> (no está en tu lista de seguidos escaneada).'; return; }
      lookupResult.innerHTML='<b>@'+found.username+'</b> → '+(found.followsBack?'<b style="color:#2ee6a8">TE SIGUE</b>':'<b style="color:#ff3b6b">NO te sigue</b>')+' (dato directo de Instagram)';
    };
    lookupInput.addEventListener('keydown',function(e){ if(e.key==='Enter') lookupBtn.click(); });
    lookupWrap.appendChild(lookupInput); lookupWrap.appendChild(lookupBtn); lookupWrap.appendChild(lookupResult);
    body.appendChild(lookupWrap);

    // --- toolbar ---
    var toolbar=document.createElement('div'); toolbar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 10px';
    var copyBtn=document.createElement('button'); copyBtn.className='igpp-btn'; copyBtn.textContent='📋 Copiar lista';
    copyBtn.onclick=function(){
      var list=filteredPool(); var txt=list.map(function(u){return '@'+u.username;}).join('\n');
      navigator.clipboard.writeText(txt).then(function(){ toast('Lista copiada ('+list.length+')'); });
    };
    var search=document.createElement('input'); search.className='igpp-input'; search.style.cssText+='flex:1;min-width:170px'; search.placeholder='🔎 Buscar usuario…'; search.value=state.search;
    search.oninput=function(){ state.search=search.value.trim(); state.page=0; renderList(); };
    toolbar.appendChild(copyBtn); toolbar.appendChild(search);
    body.appendChild(toolbar);

    // --- pestañas lista blanca ---
    var wlTabs=document.createElement('div'); wlTabs.style.cssText='display:flex;gap:8px;margin-bottom:10px';
    [['nonwl','Normal'],['wl','⭐ Lista blanca ('+state.whitelist.size+')']].forEach(function(kv){
      // botón y no div: así se puede llegar con Tab y activar con Enter
      var t=document.createElement('button'); t.type='button'; t.textContent=kv[1];
      t.setAttribute('aria-pressed', state.tab===kv[0]?'true':'false');
      t.className='igpp-pill '+(state.tab===kv[0]?'on':'off');
      t.onclick=function(){ state.tab=kv[0]; state.page=0; state.selected.clear(); renderAnalysisTab(); };
      wlTabs.appendChild(t);
    });
    body.appendChild(wlTabs);

    // --- filtros ---
    var filt=document.createElement('div'); filt.style.cssText='display:flex;gap:9px;flex-wrap:wrap;margin-bottom:10px';
    [['nonFollowers','No te siguen'],['followers','Te siguen'],['verified','Verificados'],['private','Privados']].forEach(function(fd){
      var lab=document.createElement('label'); lab.className='igpp-flab';
      var cb=document.createElement('input'); cb.type='checkbox'; cb.className='igpp-cb'; cb.style.width='18px'; cb.style.height='18px'; cb.checked=state.filters[fd[0]];
      cb.onchange=function(){ state.filters[fd[0]]=cb.checked; state.page=0; renderList(); };
      lab.appendChild(cb); lab.appendChild(document.createTextNode(fd[1])); filt.appendChild(lab);
    });
    body.appendChild(filt);

    // --- seleccionar / contador ---
    var row2=document.createElement('div'); row2.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:.95rem;color:#8f8fa3;flex-wrap:wrap;gap:8px';
    var selAllLab=document.createElement('label'); selAllLab.style.cssText='display:flex;align-items:center;gap:8px;cursor:pointer';
    var selAllCb=document.createElement('input'); selAllCb.type='checkbox'; selAllCb.className='igpp-cb'; selAllCb.style.width='18px'; selAllCb.style.height='18px';
    selAllCb.onchange=function(){ visiblePage().forEach(function(u){ if(selAllCb.checked) state.selected.add(u.id); else state.selected.delete(u.id); }); renderList(); };
    selAllLab.appendChild(selAllCb); selAllLab.appendChild(document.createTextNode('Seleccionar mostrados'));
    var selAllFiltBtn=document.createElement('button'); selAllFiltBtn.className='igpp-btn'; selAllFiltBtn.style.padding='7px 12px'; selAllFiltBtn.style.fontSize='.85rem'; selAllFiltBtn.textContent='Seleccionar TODOS los filtrados';
    selAllFiltBtn.onclick=function(){ filteredPool().forEach(function(u){ state.selected.add(u.id); }); renderList(); };
    var countInfo=document.createElement('div');
    var leftGrp=document.createElement('div'); leftGrp.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    leftGrp.appendChild(selAllLab); leftGrp.appendChild(selAllFiltBtn);
    row2.appendChild(leftGrp); row2.appendChild(countInfo);
    body.appendChild(row2);

    var listEl=document.createElement('div'); listEl.id='igpp-list'; listEl.className='igpp-scrolllist'; body.appendChild(listEl);

    var pager=document.createElement('div'); pager.style.cssText='display:flex;justify-content:center;align-items:center;gap:18px;margin:14px 0;color:#8f8fa3';
    var prevBtn=document.createElement('button'); prevBtn.className='igpp-btn'; prevBtn.textContent='‹';
    var pageLabel=document.createElement('span');
    var nextBtn=document.createElement('button'); nextBtn.className='igpp-btn'; nextBtn.textContent='›';
    prevBtn.onclick=function(){ if(state.page>0){ state.page--; renderList(); } };
    nextBtn.onclick=function(){ state.page++; renderList(); };
    pager.appendChild(prevBtn); pager.appendChild(pageLabel); pager.appendChild(nextBtn);
    body.appendChild(pager);

    var queueArea=document.createElement('div'); queueArea.id='igpp-queue-area'; body.appendChild(queueArea);

    var footer=document.createElement('div'); footer.style.cssText='margin-top:12px';
    var unfBtn=document.createElement('button'); unfBtn.className='igpp-danger'; unfBtn.id='igpp-unfollow-btn';
    unfBtn.onclick=function(){ openConfirm(); };
    footer.appendChild(unfBtn); body.appendChild(footer);

    function visiblePage(){
      var p=filteredPool(); var start=state.page*state.pageSize;
      return p.slice(start,start+state.pageSize);
    }
    function renderList(){
      var p=filteredPool();
      var totalPages=Math.max(1,Math.ceil(p.length/state.pageSize));
      if(state.page>=totalPages) state.page=totalPages-1;
      var vis=visiblePage();
      listEl.innerHTML='';
      if(!vis.length){ listEl.innerHTML='<div style="text-align:center;color:#8f8fa3;padding:26px">Sin resultados con estos filtros.</div>'; }
      vis.forEach(function(u){
        var row=document.createElement('div'); row.className='igpp-row';
        var av;
        if(u.profile_pic_url){
          av=document.createElement('img'); av.src=u.profile_pic_url; av.loading='lazy';
          av.className='igpp-av '+(u.followsBack?'fb':'nf');
          av.onerror=function(){ var d=document.createElement('div'); d.className='igpp-avfb'; d.textContent=(u.username[0]||'?').toUpperCase(); av.replaceWith(d); };
        } else { av=document.createElement('div'); av.className='igpp-avfb'; av.textContent=(u.username[0]||'?').toUpperCase(); }
        var mid=document.createElement('div'); mid.style.cssText='flex:1;min-width:0';
        var a=document.createElement('a'); a.className='igpp-user'; a.textContent='@'+u.username; a.href='https://www.instagram.com/'+u.username; a.target='_blank';
        var meta=document.createElement('small'); meta.className='igpp-meta';
        var tags=[]; tags.push(u.followsBack?'✅ te sigue':'🚫 no te sigue');
        if(u.is_private) tags.push('privada'); if(u.is_verified) tags.push('✔ verificada');
        meta.textContent=(u.full_name?u.full_name+' · ':'')+tags.join(' · ');
        mid.appendChild(a); mid.appendChild(meta);
        var wlBtn=document.createElement('button'); wlBtn.className='igpp-btn'; wlBtn.style.padding='9px 13px';
        var enLista=state.whitelist.has(u.username);
        wlBtn.textContent=enLista?'★':'☆';
        wlBtn.title='Lista blanca (protegido: nunca aparece para dejar de seguir)';
        wlBtn.setAttribute('aria-label',(enLista?'Quitar a @':'Proteger a @')+u.username+' de la lista blanca');
        wlBtn.setAttribute('aria-pressed',enLista?'true':'false');
        wlBtn.onclick=function(){
          var prevScroll=listEl.scrollTop;
          if(state.whitelist.has(u.username)) state.whitelist.delete(u.username); else state.whitelist.add(u.username);
          saveWL(state.whitelist);
          renderAnalysisTab();
          var nl=document.getElementById('igpp-list'); if(nl) nl.scrollTop=prevScroll;
        };
        var cb=document.createElement('input'); cb.type='checkbox'; cb.className='igpp-cb'; cb.checked=state.selected.has(u.id);
        cb.onchange=function(){ if(cb.checked) state.selected.add(u.id); else state.selected.delete(u.id); updateFooter(); };
        row.appendChild(av); row.appendChild(mid); row.appendChild(wlBtn); row.appendChild(cb);
        listEl.appendChild(row);
      });
      countInfo.textContent='Mostrados: '+vis.length+' · Total filtrado: '+p.length;
      pageLabel.textContent=(state.page+1)+' / '+totalPages;
      prevBtn.disabled=state.page<=0; nextBtn.disabled=state.page>=totalPages-1;
      updateFooter();
    }
    function updateFooter(){
      unfBtn.textContent='🚫 Dejar de seguir ('+state.selected.size+')'+(window.innerWidth<760?'':' — tandas de 5, pausa de 5 min');
      unfBtn.disabled=state.selected.size===0;
    }
    renderList();
    renderQueueUI(queueArea);
  }

  // ---------------- COLA DE DEJAR DE SEGUIR (tandas de 5, 5 min entre tandas) ----------------
  var BATCH_SIZE=5, BATCH_GAP_MS=5*60*1000;
  var timerHandle=null, qBusy=false;
  function loadQ(){ return lsGet(LS.q,null); }
  function saveQ(q){ lsSet(LS.q,q); }

  function openConfirm(){
    var ids=Array.from(state.selected);
    if(!ids.length) return;
    var sel=pool().filter(function(u){ return state.selected.has(u.id); });
    var batches=Math.ceil(sel.length/BATCH_SIZE);
    var estMin=Math.max(0,batches-1)*5;
    var ok=confirm('Vas a poner en cola '+sel.length+' cuenta(s).\n\n• Se procesan en tandas de 5 (con pausas cortas entre cada una)\n• 5 minutos de espera entre tanda y tanda\n• Tiempo estimado: ~'+estMin+' min\n• Se pausa sola si Instagram bloquea la acción\n• La pestaña de Instagram debe seguir abierta (minimizada sirve)\n\n¿Continuar?');
    if(!ok) return;
    var q=loadQ();
    var newItems=sel.map(function(u){ return {id:u.id, username:u.username}; });
    if(q && q.queue){
      q.queue=q.queue.concat(newItems); q.status='running'; q.avisado=false;
      if(!q.nextRunAt||q.nextRunAt<Date.now()) q.nextRunAt=Date.now();
    } else {
      q={queue:newItems, index:0, status:'running', nextRunAt:Date.now(), log:[], hechos:0, avisado:false};
    }
    saveQ(q);
    state.selected.clear();
    renderAnalysisTab();
    startTimerLoop();
  }

  function startTimerLoop(){ if(timerHandle) return; tickCheck(); timerHandle=setInterval(tickCheck,1000); }
  function stopTimerLoop(){ if(timerHandle){ clearInterval(timerHandle); timerHandle=null; } }
  function refreshQueueUI(){ if(state.activeTab==='analysis'){ var c=document.getElementById('igpp-queue-area'); if(c) renderQueueUI(c); } }

  async function unfollowOne(item){
    try{
      // IMPORTANTE: se usa el endpoint WEB de Instagram, no el de la app móvil.
      //   web/friendships/{id}/unfollow/  → responde {status:'ok'}  ✅
      //   friendships/destroy/{id}/       → devuelve el HTML de la app (muerto para web) ❌
      // Diagnosticado en vivo contra la sesión real. Las escrituras piden csrf, app-id,
      // marcarse como AJAX y el asbd-id; el cuerpo va vacío.
      var hdrs=Object.assign({
        'content-type':'application/x-www-form-urlencoded',
        'x-requested-with':'XMLHttpRequest',
        'x-asbd-id':'129477'
      },headers);
      if(wwwClaim) hdrs['x-ig-www-claim']=wwwClaim;
      var r=await fetchT('https://www.instagram.com/api/v1/web/friendships/'+item.id+'/unfollow/',{
        method:'POST', headers:hdrs, credentials:'include', body:''
      });
      var txt=''; try{ txt=await r.text(); }catch(e){}
      var j=null; try{ j=JSON.parse(txt); }catch(e){}
      if(r.ok && j && j.status==='ok'){ return {ok:true}; }
      if(r.status===401 || r.status===403){ return {ok:false, blocked:true, note:'Tu sesión venció — iniciá sesión de nuevo en instagram.com'}; }
      if(r.status===429 || (j&&j.spam) || (j&&(j.status==='fail'||j.feedback_required))){ return {ok:false, blocked:true, note:'Instagram limitó/bloqueó la acción — pará un rato'}; }
      // Motivo real, para poder diagnosticar en vez de "fallo desconocido".
      var detalle = (j&&(j.message||j.status)) ? String(j.message||j.status) : (txt?txt.slice(0,80):'sin respuesta');
      return {ok:false, blocked:false, note:'Instagram respondió HTTP '+r.status+' ('+detalle+')'};
    }catch(e){ return {ok:false, blocked:true, note:'Error de red — revisá tu conexión'}; }
  }

  // La cola terminó: se marca hecha y se avisa UNA sola vez, con cuántas cuentas
  // se dejó de seguir en esta tanda. El flag q.avisado evita repetir el aviso si
  // el reloj vuelve a pasar por acá con la cola ya vacía.
  function colaTerminada(q){
    q.status='done'; // las bajas ya se anotaron una por una al concretarse
  }

  async function tickCheck(){
    if(qBusy){ return; }
    var q=loadQ();
    if(!q||q.status!=='running'){ refreshQueueUI(); return; }
    if(q.index>=q.queue.length){ colaTerminada(q); saveQ(q); stopTimerLoop(); refreshQueueUI(); return; }
    if(Date.now()<q.nextRunAt){ refreshQueueUI(); return; }
    qBusy=true;
    try{
      var processed=0;
      while(processed<BATCH_SIZE && q.index<q.queue.length){
        var item=q.queue[q.index];
        var result=await unfollowOne(item);
        q.log.unshift({u:item.username, ok:result.ok, t:Date.now(), note:result.note});
        q.log=q.log.slice(0,60);
        if(result.ok){
          agregarBaja(item.username); // se anota el nombre en el momento de la baja
          // si estaba en la lista blanca, se saca: ya no lo seguís, no tiene sentido protegerlo
          if(state.whitelist.has(item.username)){ state.whitelist.delete(item.username); saveWL(state.whitelist); }
          // sacar de la lista escaneada para que el panel quede al día
          if(cache&&cache.users){ cache.users=cache.users.filter(function(u){return u.id!==item.id;}); lsSet(LS.cache,cache); }
        }
        if(result.ok||!result.blocked){ q.index++; processed++; }
        if(result.blocked){ q.status='paused'; saveQ(q); refreshQueueUI(); break; }
        saveQ(q); refreshQueueUI();
        if(processed<BATCH_SIZE && q.index<q.queue.length){ await sleep(4000+Math.floor(Math.random()*5000)); }
      }
      if(q.status==='running'){
        if(q.index>=q.queue.length){ colaTerminada(q); }
        else { q.nextRunAt=Date.now()+BATCH_GAP_MS; }
        saveQ(q);
      }
      refreshQueueUI();
    } finally { qBusy=false; }
  }

  function renderQueueUI(container){
    if(!container) return;
    var q=loadQ();
    container.innerHTML='';
    if(!q||!q.queue||!q.queue.length) return;
    var box=document.createElement('div'); box.className='igpp-card'; box.style.marginTop='14px';
    var top=document.createElement('div'); top.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px';
    var statusLabel=q.status==='running'?'▶ En proceso':(q.status==='paused'?'⏸ Pausado':(q.status==='done'?'✅ Completado':'⏹ Detenido'));
    var left=document.createElement('div'); left.innerHTML='<b>'+statusLabel+'</b> · '+q.index+'/'+q.queue.length+' procesados';
    top.appendChild(left);
    var btns=document.createElement('div'); btns.style.cssText='display:flex;gap:6px';
    if(q.status==='running'){
      var pauseB=document.createElement('button'); pauseB.className='igpp-btn'; pauseB.textContent='⏸ Pausar';
      pauseB.onclick=function(){ q.status='paused'; saveQ(q); renderQueueUI(container); }; btns.appendChild(pauseB);
    } else if(q.status==='paused'){
      var resB=document.createElement('button'); resB.className='igpp-btn'; resB.textContent='▶ Reanudar';
      resB.onclick=function(){ q.status='running'; q.nextRunAt=Date.now()+2000; saveQ(q); startTimerLoop(); renderQueueUI(container); }; btns.appendChild(resB);
    }
    if(q.status!=='done'){
      var stopB=document.createElement('button'); stopB.className='igpp-btn'; stopB.textContent='⏹ Detener y borrar';
      stopB.onclick=function(){ if(confirm('¿Borrar la cola pendiente?')){ saveQ(null); stopTimerLoop(); renderQueueUI(container); } }; btns.appendChild(stopB);
    } else {
      var clearB=document.createElement('button'); clearB.className='igpp-btn'; clearB.textContent='🗑️ Limpiar';
      clearB.onclick=function(){ saveQ(null); renderQueueUI(container); }; btns.appendChild(clearB);
    }
    top.appendChild(btns); box.appendChild(top);

    var totalQ=q.queue.length;
    var pw=document.createElement('div'); pw.className='igpp-progresswrap';
    pw.innerHTML='<div class="igpp-progress" style="width:'+Math.floor(q.index/totalQ*100)+'%"></div>';
    box.appendChild(pw);

    if(q.status==='running' && q.index<q.queue.length){
      var remaining=totalQ-q.index;
      var thisBatch=Math.min(BATCH_SIZE,remaining);
      var next=document.createElement('div'); next.style.cssText='font-size:.95rem;color:#8f8fa3;margin-bottom:10px';
      var msLeft=q.nextRunAt-Date.now();
      next.textContent= msLeft>2000
        ? '⏱ Próxima tanda de '+thisBatch+' cuenta(s) en '+fmt(msLeft)+' · Quedan '+remaining+' en cola'
        : 'Procesando tanda de '+thisBatch+' cuenta(s)… · Quedan '+remaining+' en cola';
      box.appendChild(next);
    }
    if(q.log&&q.log.length){
      var logWrap=document.createElement('div'); logWrap.style.cssText='max-height:150px;overflow:auto;font-size:.9rem;color:#c9c9d8';
      q.log.forEach(function(l){
        var d=document.createElement('div'); d.style.cssText='padding:3px 0;border-bottom:1px solid #1c1c2b';
        d.textContent=(l.ok?'✅ ':'⚠️ ')+'@'+l.u+' · '+new Date(l.t).toLocaleTimeString()+(l.note?(' · '+l.note):'');
        logWrap.appendChild(d);
      });
      box.appendChild(logWrap);
    }
    container.appendChild(box);
  }

  // ---------------- PESTAÑA HISTORIAS ----------------
  function loadSV(){ return lsGet(LS.sv,{}); }
  function saveSV(o){ lsSet(LS.sv,o); }
  function mkPersonRow(u,extraLabel){
    var row=document.createElement('div'); row.className='igpp-row';
    var av=document.createElement('img'); av.className='igpp-av'; av.src=u.profile_pic_url||''; av.loading='lazy';
    av.onerror=function(){ var d=document.createElement('div'); d.className='igpp-avfb'; d.textContent=(u.username[0]||'?').toUpperCase(); av.replaceWith(d); };
    var mid=document.createElement('div'); mid.style.cssText='flex:1;min-width:0';
    var a=document.createElement('a'); a.className='igpp-user'; a.textContent='@'+u.username; a.href='https://www.instagram.com/'+u.username; a.target='_blank';
    var meta=document.createElement('small'); meta.className='igpp-meta'; meta.textContent=u.full_name||'';
    mid.appendChild(a); mid.appendChild(meta);
    row.appendChild(av); row.appendChild(mid);
    if(extraLabel){ var badge=document.createElement('div'); badge.className='igpp-badge'; badge.textContent=extraLabel; row.appendChild(badge); }
    return row;
  }
  function renderStoryLeaderboard(){
    var sv=loadSV();
    var arr=Object.keys(sv).map(function(k){ return Object.assign({username:k},sv[k]); });
    if(!arr.length) return;
    arr.sort(function(a,b){ return b.count-a.count; });
    var h=document.createElement('div'); h.style.cssText='margin-top:22px;font-weight:800;font-size:1.15rem'; h.textContent='🏆 Top espectadores de tus Historias (acumulado)';
    body.appendChild(h);
    var sub=document.createElement('div'); sub.style.cssText='color:#8f8fa3;font-size:.88rem;margin:6px 0 12px';
    sub.textContent='Se acumula cada vez que abrís esta pestaña con una Historia activa. Cuenta desde que empezaste a usar el panel.';
    body.appendChild(sub);
    var list=document.createElement('div'); list.className='igpp-scrolllist';
    arr.slice(0,25).forEach(function(u,idx){
      list.appendChild(mkPersonRow(u,(idx+1)+'º · '+u.count+'x · '+timeAgo(u.last_ts||Date.now())));
    });
    body.appendChild(list);
  }
  async function renderStoriesTab(){
    body.innerHTML=''; body.appendChild(bannerEl());
    var note=document.createElement('div'); note.className='igpp-note';
    note.innerHTML='ℹ️ Instagram no ofrece "quién visita mi perfil". Lo real: quién vio tus <b>Historias activas</b> + ranking acumulado.';
    body.appendChild(note);
    var status=document.createElement('div'); status.textContent='Buscando tus Historias activas…'; status.style.cssText='padding:16px;text-align:center;color:#8f8fa3';
    body.appendChild(status);
    try{
      var r1=await fetch('https://www.instagram.com/api/v1/feed/user/'+uid+'/story/',{headers:headers,credentials:'include'});
      var j1=await r1.json();
      var items=(j1&&j1.reel&&j1.reel.items)||(j1&&j1.items)||[];
      if(!items.length){
        status.textContent='No tenés ninguna Historia activa ahora. (El ranking acumulado sigue abajo.)';
      } else {
        var merged={};
        for(var i=0;i<items.length;i++){
          status.textContent='Cargando espectadores… Historia '+(i+1)+' de '+items.length;
          var mediaId=items[i].id||items[i].pk;
          try{
            var r2=await fetch('https://www.instagram.com/api/v1/media/'+mediaId+'/list_reel_media_viewer/?count=100',{headers:headers,credentials:'include'});
            var j2=await r2.json();
            (((j2&&j2.users)||[])).forEach(function(u){ merged[u.username]=u; });
          }catch(e){}
          await sleep(700+Math.floor(Math.random()*600));
        }
        status.remove();
        var viewers=Object.keys(merged).map(function(k){return merged[k];});
        var h2=document.createElement('div'); h2.style.cssText='font-weight:800;font-size:1.12rem;margin-bottom:10px';
        h2.textContent='👁️ Vieron tu(s) Historia(s) activa(s) ('+viewers.length+')';
        body.appendChild(h2);
        if(!viewers.length){
          var empty=document.createElement('div'); empty.style.cssText='text-align:center;color:#8f8fa3;padding:20px'; empty.textContent='Aún nadie vio tu Historia.'; body.appendChild(empty);
        } else {
          var list=document.createElement('div'); list.className='igpp-scrolllist';
          viewers.forEach(function(u){ list.appendChild(mkPersonRow(u)); });
          body.appendChild(list);
        }
        var sv=loadSV();
        viewers.forEach(function(u){
          var rec=sv[u.username]||{count:0, full_name:'', profile_pic_url:''};
          rec.count+=1; rec.last_ts=Date.now();
          rec.full_name=u.full_name||rec.full_name; rec.profile_pic_url=u.profile_pic_url||rec.profile_pic_url;
          sv[u.username]=rec;
        });
        saveSV(sv);
        // registro para "mejores horarios" de la pestaña Estrategia
        if(viewers.length){
          var svl=lsGet(LS.svlog,[]);
          svl.push({ts:Date.now(), n:viewers.length});
          if(svl.length>300) svl=svl.slice(-300);
          lsSet(LS.svlog,svl);
        }
      }
    }catch(e){ status.textContent='No se pudo obtener tu Historia (quizás no hay ninguna activa, o Instagram cambió su API).'; }
    renderStoryLeaderboard();
  }

  // ---------------- PESTAÑA DMS ----------------
  async function verifyNeverReplied(threadId,otherId){
    var cursor='', page=0, MAX=5;
    do{
      var url='https://www.instagram.com/api/v1/direct_v2/threads/'+threadId+'/?visual_message_return_type=unseen&limit=40'+(cursor?('&cursor='+encodeURIComponent(cursor)):'');
      var json=null;
      try{ var res=await fetch(url,{headers:headers,credentials:'include'}); json=await res.json(); }
      catch(e){ return false; }
      var thread=json&&json.thread;
      var items=(thread&&thread.items)||[];
      for(var i=0;i<items.length;i++){ if(String(items[i].user_id)===String(otherId)) return false; }
      cursor=(thread&&thread.has_older)?thread.oldest_cursor:'';
      page++;
      if(cursor) await sleep(500+Math.floor(Math.random()*400));
    } while(cursor&&page<MAX);
    return true;
  }
  async function fetchDmThreads(statusEl){
    var candidates=[], cursor='', page=0, MAX_PAGES=8;
    do{
      var url='https://www.instagram.com/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&persistentBadging=true&limit=20'+(cursor?('&cursor='+encodeURIComponent(cursor)):'');
      var json=null;
      try{ var res=await fetch(url,{headers:headers,credentials:'include'}); json=await res.json(); }
      catch(e){ if(statusEl) statusEl.textContent='Reintentando bandeja…'; await sleep(3500); continue; }
      var inbox=json&&json.inbox;
      var threads=(inbox&&inbox.threads)||[];
      threads.forEach(function(th){
        var others=(th.users||[]).filter(function(u){ return String(u.pk||u.id)!==String(uid); });
        if(others.length!==1) return;
        var other=others[0];
        var item=(th.items&&th.items[0])||th.last_permanent_item;
        if(!item) return;
        if(String(item.user_id)!==String(uid)) return;
        var ts=Number(item.timestamp||0)/1000;
        var typeLabels={media_share:'[publicación compartida]',reel_share:'[reel compartido]',story_share:'[historia compartida]',like:'❤️',placeholder:'[mensaje]',media:'[foto/video]',clip:'[clip]',voice_media:'[audio]'};
        var preview=item.text||typeLabels[item.item_type]||'[mensaje]';
        candidates.push({username:other.username, full_name:other.full_name||'', profile_pic_url:other.profile_pic_url||'', threadId:th.thread_id, otherId:String(other.pk||other.id), preview:preview, ts:ts});
      });
      cursor=(inbox&&inbox.has_older)?inbox.oldest_cursor:'';
      page++;
      if(statusEl) statusEl.textContent='Revisando tu bandeja… '+candidates.length+' candidatos';
      await sleep(1200+Math.floor(Math.random()*800));
      if(page%4===0){ if(statusEl) statusEl.textContent='Pausa breve…'; await sleep(5000); }
    } while(cursor&&page<MAX_PAGES);
    var results=[];
    for(var i=0;i<candidates.length;i++){
      var c=candidates[i];
      if(statusEl) statusEl.textContent='Verificando historial completo… '+(i+1)+'/'+candidates.length+' ('+results.length+' confirmados)';
      var never=await verifyNeverReplied(c.threadId,c.otherId);
      if(never) results.push(c);
      await sleep(900+Math.floor(Math.random()*600));
      if((i+1)%10===0){ if(statusEl) statusEl.textContent='Pausa breve…'; await sleep(4000); }
    }
    results.sort(function(a,b){ return a.ts-b.ts; });
    return results;
  }
  async function deleteThread(threadId){
    try{
      var r=await fetch('https://www.instagram.com/api/v1/direct_v2/threads/'+threadId+'/hide/',{
        method:'POST', headers:Object.assign({'content-type':'application/x-www-form-urlencoded'},headers),
        credentials:'include', body:''
      });
      var j=null; try{ j=await r.json(); }catch(e){}
      return r.ok&&j&&j.status==='ok';
    }catch(e){ return false; }
  }
  async function renderDmsTab(){
    body.innerHTML=''; body.appendChild(bannerEl());
    var note=document.createElement('div'); note.className='igpp-note';
    note.innerHTML='ℹ️ Chats <b>1 a 1</b> donde la otra persona <b>jamás</b> contestó (se revisa el historial completo). "Eliminar" saca el chat solo de <b>tu</b> bandeja.';
    body.appendChild(note);

    if(!state.dmsResults){
      var msg=document.createElement('div'); msg.style.cssText='text-align:center;padding:24px';
      msg.innerHTML='<div style="font-size:2rem;margin-bottom:8px">💬</div><div style="margin-bottom:14px;color:#c9c9d8">Todavía no escaneaste tus mensajes.</div>';
      var b=document.createElement('button'); b.className='igpp-primary'; b.style.maxWidth='320px'; b.textContent='Escanear DMs';
      b.onclick=async function(){
        b.disabled=true; b.textContent='Escaneando…';
        var status=document.createElement('div'); status.style.cssText='color:#c9c9d8;font-size:.98rem;margin:14px 0;text-align:center'; msg.appendChild(status);
        state.dmsResults=await fetchDmThreads(status);
        state.dmsSelected.clear();
        renderDmsTab();
      };
      msg.appendChild(b); body.appendChild(msg); return;
    }

    var toolbar=document.createElement('div'); toolbar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px';
    var refreshBtn=document.createElement('button'); refreshBtn.className='igpp-btn'; refreshBtn.textContent='🔄 Reescanear';
    refreshBtn.onclick=async function(){
      refreshBtn.disabled=true; refreshBtn.textContent='Escaneando…';
      var status=document.createElement('div'); status.style.cssText='color:#c9c9d8;font-size:.95rem'; toolbar.appendChild(status);
      state.dmsResults=await fetchDmThreads(status);
      state.dmsSelected.clear();
      renderDmsTab();
    };
    var count=document.createElement('div'); count.className='igpp-chip'; count.textContent=state.dmsResults.length+' chat(s) sin ninguna respuesta';
    toolbar.appendChild(refreshBtn); toolbar.appendChild(count);
    body.appendChild(toolbar);

    if(!state.dmsResults.length){
      var empty=document.createElement('div'); empty.style.cssText='text-align:center;color:#8f8fa3;padding:26px'; empty.textContent='🎉 No hay chats donde te hayan ignorado por completo.'; body.appendChild(empty); return;
    }

    var row2=document.createElement('div'); row2.style.cssText='display:flex;align-items:center;gap:9px;margin-bottom:10px;font-size:.95rem;color:#8f8fa3';
    var selAllCb=document.createElement('input'); selAllCb.type='checkbox'; selAllCb.className='igpp-cb'; selAllCb.style.width='18px'; selAllCb.style.height='18px';
    selAllCb.onchange=function(){ state.dmsResults.forEach(function(d){ if(selAllCb.checked) state.dmsSelected.add(d.threadId); else state.dmsSelected.delete(d.threadId); }); renderList(); };
    var selAllLab=document.createElement('label'); selAllLab.style.cssText='display:flex;align-items:center;gap:9px;cursor:pointer';
    selAllLab.appendChild(selAllCb); selAllLab.appendChild(document.createTextNode('Seleccionar todos'));
    row2.appendChild(selAllLab);
    body.appendChild(row2);

    var listEl=document.createElement('div'); listEl.className='igpp-scrolllist'; body.appendChild(listEl);
    var footer=document.createElement('div'); footer.style.cssText='margin-top:14px';
    var delBtn=document.createElement('button'); delBtn.className='igpp-danger';
    delBtn.onclick=async function(){
      var ids=Array.from(state.dmsSelected);
      if(!ids.length) return;
      var ok=confirm('Vas a eliminar '+ids.length+' chat(s) de TU bandeja (no de la otra persona). No se puede deshacer desde acá.\n\n¿Continuar?');
      if(!ok) return;
      delBtn.disabled=true;
      var done=0;
      for(var i=0;i<ids.length;i++){
        var okDel=await deleteThread(ids[i]);
        if(okDel){
          state.dmsResults=state.dmsResults.filter(function(d){ return d.threadId!==ids[i]; });
          state.dmsSelected.delete(ids[i]);
        }
        done++;
        delBtn.textContent='🗑️ Eliminando… ('+done+'/'+ids.length+')';
        renderList(); updateDelFooter();
        if(i<ids.length-1) await sleep(2000+Math.floor(Math.random()*2000));
      }
      toast('Listo: '+done+' chat(s) procesados');
    };
    footer.appendChild(delBtn); body.appendChild(footer);

    function renderList(){
      listEl.innerHTML='';
      state.dmsResults.forEach(function(d){
        var row=document.createElement('div'); row.className='igpp-row';
        var av=document.createElement('img'); av.className='igpp-av'; av.src=d.profile_pic_url||''; av.loading='lazy'; av.style.cursor='pointer';
        av.onerror=function(){ var dd=document.createElement('div'); dd.className='igpp-avfb'; dd.textContent=(d.username[0]||'?').toUpperCase(); av.replaceWith(dd); };
        av.onclick=function(){ window.open('https://www.instagram.com/direct/t/'+d.threadId+'/','_blank'); };
        var mid=document.createElement('div'); mid.style.cssText='flex:1;min-width:0;cursor:pointer';
        mid.onclick=function(){ window.open('https://www.instagram.com/direct/t/'+d.threadId+'/','_blank'); };
        var name=document.createElement('div'); name.textContent='@'+d.username; name.style.cssText='font-weight:700;font-size:1.02rem';
        var prev=document.createElement('small'); prev.className='igpp-meta'; prev.style.cssText+=';white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        prev.textContent='Vos: '+d.preview;
        mid.appendChild(name); mid.appendChild(prev);
        var badge=document.createElement('div'); badge.className='igpp-badge'; badge.textContent=timeAgo(d.ts);
        var cb=document.createElement('input'); cb.type='checkbox'; cb.className='igpp-cb'; cb.checked=state.dmsSelected.has(d.threadId);
        cb.onchange=function(){ if(cb.checked) state.dmsSelected.add(d.threadId); else state.dmsSelected.delete(d.threadId); updateDelFooter(); };
        row.appendChild(av); row.appendChild(mid); row.appendChild(badge); row.appendChild(cb);
        listEl.appendChild(row);
      });
      updateDelFooter();
    }
    function updateDelFooter(){
      delBtn.textContent='🗑️ Eliminar seleccionados ('+state.dmsSelected.size+')';
      delBtn.disabled=state.dmsSelected.size===0;
    }
    renderList();
  }

  // ---------------- PESTAÑA ESTADÍSTICAS ----------------
  // ---------------- PESTAÑA "TE DEJARON DE SEGUIR" ----------------
  // Instagram no avisa quién te deja de seguir ni cuándo. La única forma real es
  // guardar tu lista de seguidores y compararla entre escaneos: quien estaba antes
  // y ya no está, te dejó de seguir. La fecha/hora es la de DETECCIÓN (cuando
  // escaneaste), no el momento exacto — eso no existe para ninguna app.
  var lostState={ scanning:false, abort:false, status:'', pct:0, err:'', verTodo:false };

  function setLostStatus(txt,pct){
    lostState.status=txt; lostState.pct=pct;
    var s=document.getElementById('igpp-lost-status'); if(s) s.textContent=txt;
    var b=document.getElementById('igpp-lost-bar'); if(b) b.style.width=pct+'%';
    var p=document.getElementById('igpp-lost-pct'); if(p) p.textContent=pct+'%';
  }
  function fechaHoraLocal(ms){
    var d=new Date(ms);
    return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+' '+
           ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  }

  // Recorre TODA tu lista de seguidores. Devuelve {complete, users:[usernames]}.
  // Solo si complete=true se puede comparar; un recorrido a medias daría falsos
  // positivos (marcaría como "te dejó de seguir" a quien no llegamos a leer).
  async function scanFollowers(){
    var out=[], vistos={}, cursor='', backoffs=[8000,15000,30000,60000,120000], fail=0, pageN=0;
    var total=(state.counts&&state.counts.followers)||0;
    while(true){
      if(lostState.abort) return {complete:false, users:out};
      var r=null;
      try{ r=await apiPage('followers',cursor); }
      catch(err){
        if(err && err.kind==='http' && (err.status===401||err.status===403)){
          lostState.err='Tu sesión de Instagram venció o se cerró. Volvé a iniciar sesión en instagram.com y reintentá.';
          return {complete:false, users:out};
        }
        fail++;
        if(fail>backoffs.length){
          lostState.err='Instagram no respondió tras varios intentos. No se pudo completar la lista, así que no se comparó (para no marcar a nadie por error). Reintentá más tarde.';
          return {complete:false, users:out};
        }
        var motivo=(err&&err.kind==='limit')?'Instagram limitó las peticiones':'Instagram no respondió';
        var wait=backoffs[fail-1];
        for(var w=wait; w>0 && !lostState.abort; w-=1000){
          setLostStatus('⏳ '+motivo+'. Reintento '+fail+'/'+backoffs.length+' en '+fmt(w)+'…', lostState.pct);
          await sleep(1000);
        }
        continue;
      }
      fail=0;
      r.users.forEach(function(u){ var un=(u.username||'').toLowerCase(); if(un&&!vistos[un]){ vistos[un]=1; out.push(un); } });
      cursor=r.next;
      pageN++;
      var pct=total?Math.min(99,Math.floor(out.length/total*100)):0;
      setLostStatus('Leyendo tus seguidores… '+out.length+(total?(' de '+total):''), pct);
      if(!cursor) return {complete:true, users:out};
      await sleep(1000+Math.floor(Math.random()*700));
      if(pageN%8===0){ setLostStatus('😴 Pausa breve de seguridad…',pct); await sleep(6000); }
      if(pageN%30===0){ setLostStatus('😴 Pausa larga para no llamar la atención de Instagram…',pct); await sleep(20000); }
    }
  }

  async function runLostScan(){
    if(lostState.scanning) return;
    lostState.scanning=true; lostState.abort=false; lostState.err='';
    renderLostTab();
    var res=await scanFollowers();
    lostState.scanning=false;

    // Control anti-lista-incompleta: Instagram a veces corta la lista antes de tiempo.
    // Si la cantidad leída quedó muy por debajo de los seguidores que dice el perfil,
    // la lista NO es confiable: NO se compara ni se pisa la foto buena, para no marcar
    // por error a decenas de personas que en realidad siguen ahí.
    var esperado=(state.counts&&state.counts.followers)||0;
    var confiable = res.complete && (!esperado || res.users.length>=Math.floor(esperado*0.9));

    if(res.complete && !confiable){
      lostState.err='La lista de seguidores volvió incompleta ('+res.users.length+' de ~'+esperado+'). No se comparó para no marcar a nadie por error. Reintentá en un rato.';
      renderLostTab(); return;
    }

    if(confiable){
      var prev=lsGet(LS.flwrs,null);
      var ahoraSet={}; res.users.forEach(function(u){ ahoraSet[u]=1; });
      var primeraVez=!(prev && Array.isArray(prev.users) && prev.users.length);
      if(!primeraVez){
        var perdidos=prev.users.filter(function(u){ return !ahoraSet[u]; });
        if(perdidos.length){
          // Historial PERMANENTE: nunca se poda al guardar. Los 30 días son solo una
          // vista (se filtran al mostrar). Así nada se pierde y queda el histórico total.
          var hist=lsGet(LS.lost,[]); if(!Array.isArray(hist)) hist=[];
          var yaLost={}; hist.forEach(function(x){ yaLost[x.u]=1; });
          var ts=Date.now(), nuevos=0;
          perdidos.forEach(function(u){ if(!yaLost[u]){ hist.push({u:u, ts:ts}); nuevos++; } });
          lsSet(LS.lost,hist);
          if(nuevos) toast('💔 '+nuevos+' cuenta'+(nuevos>1?'s':'')+' te dejó de seguir');
        } else { toast('✅ Nadie nuevo te dejó de seguir'); }
      } else {
        toast('✅ Guardé tu lista base ('+res.users.length+' seguidores). La próxima vez te muestro quién se fue.');
      }
      lsSet(LS.flwrs,{users:res.users, ts:Date.now()});
    }
    renderLostTab();
  }

  function renderLostTab(){
    body.innerHTML=''; body.appendChild(bannerEl());
    var snap=lsGet(LS.flwrs,null);
    // Historial completo permanente (nunca se poda en disco). Los 30 días son un filtro.
    var histTotal=lsGet(LS.lost,[]); if(!Array.isArray(histTotal)) histTotal=[];
    histTotal=histTotal.slice().sort(function(a,b){ return b.ts-a.ts; });
    var corte=Date.now()-30*86400000;
    var hist30=histTotal.filter(function(x){ return x.ts>=corte; });
    var hist=lostState.verTodo?histTotal:hist30;   // vista activa

    // --- tarjeta de escaneo ---
    var card=document.createElement('div'); card.className='igpp-card'; card.style.marginBottom='14px';
    if(lostState.scanning){
      card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><b>🔎 Revisando tus seguidores…</b><span id="igpp-lost-pct" class="igpp-badge">'+lostState.pct+'%</span></div>'+
        '<div class="igpp-progresswrap"><div id="igpp-lost-bar" class="igpp-progress" style="width:'+lostState.pct+'%"></div></div>'+
        '<div id="igpp-lost-status" style="color:#9a9ab0;font-size:.92rem">'+(lostState.status||'Comenzando…')+'</div>';
      var stop=document.createElement('button'); stop.className='igpp-btn'; stop.style.marginTop='10px'; stop.textContent='⏸ Pausar';
      stop.onclick=function(){ lostState.abort=true; };
      card.appendChild(stop);
    } else {
      var info=snap? ('Última revisión: '+timeAgo(snap.ts)+' · '+((snap.users&&snap.users.length)||0)+' seguidores guardados.')
                   : 'Todavía no revisaste tu lista de seguidores.';
      card.innerHTML='<div style="color:#c9c9d8;margin-bottom:12px">'+info+'</div>'+
        (lostState.err?('<div style="color:#ffb020;font-size:.9rem;margin-bottom:10px">'+lostState.err+'</div>'):'');
      var b=document.createElement('button'); b.className='igpp-primary'; b.style.maxWidth='340px';
      b.textContent=snap?'🔄 Revisar de nuevo':'Revisar mis seguidores ahora';
      b.onclick=function(){ runLostScan(); };
      card.appendChild(b);
    }
    body.appendChild(card);

    // --- explicación honesta ---
    var nota=document.createElement('div'); nota.className='igpp-note';
    nota.innerHTML='La fecha y hora es <b>cuándo lo detectamos</b> (cuando revisaste), no el minuto exacto en que la persona te dejó de seguir — eso Instagram no lo da. Cuanto más seguido revises, más precisa es. Revisá cada 1–2 días para un buen historial.';
    body.appendChild(nota);

    if(!snap){ return; }

    // --- selector de vista: 30 días / histórico completo ---
    var selector=document.createElement('div'); selector.style.cssText='display:flex;gap:8px;margin:16px 0 8px;flex-wrap:wrap';
    [[false,'Últimos 30 días ('+hist30.length+')'],[true,'Histórico completo ('+histTotal.length+')']].forEach(function(o){
      var t=document.createElement('div'); t.textContent=o[1];
      t.className='igpp-pill '+(lostState.verTodo===o[0]?'on':'off');
      t.onclick=function(){ lostState.verTodo=o[0]; renderLostTab(); };
      selector.appendChild(t);
    });
    body.appendChild(selector);

    if(!hist.length){
      var vacio=document.createElement('div'); vacio.style.cssText='text-align:center;color:#8f8fa3;padding:22px';
      vacio.textContent = histTotal.length
        ? 'Nadie te dejó de seguir en los últimos 30 días. 🎉 (Tocá "Histórico completo" para ver todo.)'
        : (snap.users?'Nadie te dejó de seguir desde la última revisión. 🎉':'Revisá de nuevo en unos días para empezar a ver el historial.');
      body.appendChild(vacio); return;
    }

    // agrupar por momento de detección
    var grupos=[], gmap={};
    hist.forEach(function(x){
      var k=String(x.ts);
      if(!gmap[k]){ gmap[k]={ts:x.ts, items:[]}; gmap[k]._i=grupos.push(gmap[k])-1; }
      gmap[k].items.push(x.u);
    });
    var resumen=document.createElement('div'); resumen.style.cssText='color:#8f8fa3;font-size:.9rem;margin-bottom:10px';
    resumen.textContent=hist.length+' cuenta'+(hist.length!==1?'s':'')+(lostState.verTodo?' en total (toda la cuenta).':' en los últimos 30 días.');
    body.appendChild(resumen);

    var lista=document.createElement('div'); lista.className='igpp-scrolllist'; body.appendChild(lista);
    grupos.forEach(function(g){
      var cab=document.createElement('div'); cab.style.cssText='color:#c4ceff;font-size:.82rem;font-weight:700;margin:8px 2px 2px';
      cab.textContent='Detectado el '+fechaHoraLocal(g.ts);
      lista.appendChild(cab);
      g.items.forEach(function(un){
        var row=document.createElement('div'); row.className='igpp-row';
        var av=document.createElement('div'); av.className='igpp-avfb'; av.textContent=(un[0]||'?').toUpperCase();
        var mid=document.createElement('div'); mid.style.cssText='flex:1;min-width:0';
        var a=document.createElement('a'); a.className='igpp-user'; a.textContent='@'+un;
        a.href='https://www.instagram.com/'+un; a.target='_blank';
        var meta=document.createElement('small'); meta.className='igpp-meta'; meta.textContent='dejó de seguirte';
        mid.appendChild(a); mid.appendChild(meta);
        row.appendChild(av); row.appendChild(mid);
        lista.appendChild(row);
      });
    });
  }

  function renderStatsTab(){
    body.innerHTML=''; body.appendChild(bannerEl());
    var haveScan=users().length>0;
    var c=state.counts||{};
    var followers=(typeof c.followers==='number')?c.followers:null;
    var following=haveScan?users().length:((typeof c.following==='number')?c.following:null);
    if(followers===null&&!haveScan){
      var msg=document.createElement('div'); msg.style.cssText='text-align:center;padding:24px;color:#8f8fa3';
      msg.textContent='Escaneá primero en la pestaña "Seguidores" para ver estadísticas completas.';
      body.appendChild(msg); return;
    }
    var mutual=haveScan?pool().filter(function(u){return u.followsBack;}).length:null;
    var notBack=haveScan?(users().length-mutual):null;
    var ratio=(followers!==null&&following)?(followers/following).toFixed(2):'—';
    var followBackRate=(mutual!==null&&users().length)?Math.round(mutual/users().length*100):null;

    var grid=document.createElement('div'); grid.className='igpp-statgrid';
    [['Seguidores',followers!==null?followers:'—'],
     ['Siguiendo',following!==null?following:'—'],
     ['Mutuos',mutual!==null?mutual:'— (escaneá)'],
     ['Ratio seg/sig',ratio],
     ['No te siguen',notBack!==null?notBack:'—'],
     ['% te siguen de vuelta',followBackRate!==null?(followBackRate+'%'):'—']
    ].forEach(function(s){
      var d=document.createElement('div'); d.className='igpp-stat';
      d.innerHTML='<div class="igpp-statnum">'+s[1]+'</div><div class="igpp-statlbl">'+s[0]+'</div>';
      grid.appendChild(d);
    });
    body.appendChild(grid);

    if(state.counts&&state.counts.ts){
      var upd=document.createElement('div'); upd.style.cssText='color:#6a6a80;font-size:.82rem;margin-bottom:8px';
      upd.textContent='Seguidores/Siguiendo: dato en vivo de tu perfil'+(haveScan?(' · Mutuos y "no te siguen": del escaneo de '+timeAgo(cache.ts)):'');
      body.appendChild(upd);
    }

    var link=document.createElement('div'); link.className='igpp-note'; link.style.marginTop='14px';
    link.innerHTML='💡 Tu curva de crecimiento, los mejores horarios para publicar y las ideas para crecer están en la pestaña <b>🎯 Estrategia</b>.';
    body.appendChild(link);
  }

  // ---------------- PESTAÑA ESTRATEGIA ----------------
  // Consejos: los primeros salen de los datos reales de la cuenta, el resto son fijos.
  function growthTips(){
    var t=[];
    if(users().length){
      var total=users().length;
      var mutual=pool().filter(function(u){return u.followsBack;}).length;
      var notBack=total-mutual;
      var rate=Math.round(mutual/total*100);
      var priv=users().filter(function(u){return u.is_private;}).length;
      if(rate<40) t.push('Tu tasa de correspondencia es baja ('+rate+'%). Seguí cuentas afines a tu nicho: devuelven el follow mucho más.');
      if(notBack>50) t.push('Tenés '+notBack+' cuentas que no te siguen de vuelta. Limpialas de a poco desde la pestaña Seguidores.');
      if(priv/total>0.4) t.push('Seguís muchas cuentas privadas ('+priv+'); interactúan menos con tu contenido público.');
    }
    t.push('Reels con constancia: sigue siendo el formato con más alcance orgánico.');
    t.push('Respondé comentarios y DMs en la primera hora: el algoritmo premia la interacción temprana.');
    t.push('3 a 5 hashtags específicos de tu nicho rinden más que los genéricos masivos.');
    t.push('Colaborá con cuentas de tamaño parecido para llegar a audiencias afines.');
    t.push('Evitá el follow/unfollow masivo constante: Instagram penaliza los patrones de bot.');
    return t;
  }
  function weekKey(){ var d=new Date(); var start=new Date(d.getFullYear(),0,1); return d.getFullYear()+'-s'+Math.ceil((((d-start)/86400000)+1)/7); }
  function renderStrategyTab(){
    body.innerHTML=''; body.appendChild(bannerEl());
    var hist=lsGet(LS.hist,[]);

    // --- evolución de seguidores ---
    var evo=document.createElement('div'); evo.className='igpp-card'; evo.style.marginBottom='14px';
    var evoTitle='<b>📈 Evolución de seguidores</b>';
    if(hist.length<2){
      evo.innerHTML=evoTitle+'<div style="color:#8f8fa3;font-size:.92rem;margin-top:8px">El panel guarda un registro automático de tus seguidores cada día que lo abrís (llevás '+hist.length+' registro'+(hist.length===1?'':'s')+'). Abrilo seguido y acá vas a ver la curva de crecimiento y cuánto ganaste o perdiste por semana.</div>';
    } else {
      var vals=hist.map(function(h){return h.f;});
      var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals);
      var padN=Math.max(1,Math.round((max-min)*0.15));
      var lo=min-padN, hi=max+padN;
      var W=600,H=150;
      var pts=hist.map(function(h,i){
        var x=(i/(hist.length-1))*(W-20)+10;
        var y=H-10-((h.f-lo)/(hi-lo))*(H-30);
        return [x,y];
      });
      var path=pts.map(function(p,i){return (i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' ');
      var area=path+' L'+pts[pts.length-1][0].toFixed(1)+' '+(H-6)+' L'+pts[0][0].toFixed(1)+' '+(H-6)+' Z';
      var last=hist[hist.length-1];
      function deltaSince(days){
        var target=Date.now()-days*86400000, base=null;
        for(var i=hist.length-1;i>=0;i--){ if(hist[i].ts<=target){ base=hist[i]; break; } }
        if(!base && hist[0].ts<=target) base=hist[0];
        if(!base) return null;
        return last.f-base.f;
      }
      var d7=deltaSince(7), d30=deltaSince(30), dAll=last.f-hist[0].f;
      function fdelta(v){ if(v===null) return '<span style="color:#6a6a80">sin datos aún</span>'; var c=v>0?'#2ee6a8':(v<0?'#ff3b6b':'#8f8fa3'); return '<b style="color:'+c+'">'+(v>0?'+':'')+v+'</b>'; }
      evo.innerHTML=evoTitle+
        '<div style="display:flex;gap:18px;flex-wrap:wrap;margin:10px 0;font-size:.95rem;color:#c9c9d8">'+
        '<span>7 días: '+fdelta(d7)+'</span><span>30 días: '+fdelta(d30)+'</span><span>Desde el inicio ('+timeAgo(hist[0].ts)+'): '+fdelta(dAll)+'</span></div>'+
        '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+
        '<defs><linearGradient id="igppg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c13584" stop-opacity=".45"/><stop offset="1" stop-color="#c13584" stop-opacity="0"/></linearGradient></defs>'+
        '<path d="'+area+'" fill="url(#igppg)"/>'+
        '<path d="'+path+'" fill="none" stroke="#e05fa8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+
        '<circle cx="'+pts[pts.length-1][0].toFixed(1)+'" cy="'+pts[pts.length-1][1].toFixed(1)+'" r="4" fill="#fff"/>'+
        '<text x="10" y="14" fill="#6a6a80" font-size="11">'+max+'</text>'+
        '<text x="10" y="'+(H-2)+'" fill="#6a6a80" font-size="11">'+min+'</text></svg>'+
        '<div style="color:#6a6a80;font-size:.8rem;margin-top:6px">'+hist.length+' registros · se agrega uno por día cuando abrís el panel</div>';
    }
    body.appendChild(evo);

    // --- horarios de tu audiencia ---
    var aud=document.createElement('div'); aud.className='igpp-card'; aud.style.marginBottom='14px';
    var hours=new Array(24).fill(0), weight=0;
    var sv=loadSV();
    Object.keys(sv).forEach(function(k){ var r=sv[k]; if(r.last_ts){ hours[new Date(r.last_ts).getHours()]+=1; weight+=1; } });
    lsGet(LS.svlog,[]).forEach(function(e){ hours[new Date(e.ts).getHours()]+=(e.n||0); weight+=(e.n||0); });
    if(weight<5){
      aud.innerHTML='<b>⏰ Horarios de tu audiencia</b><div style="color:#8f8fa3;font-size:.92rem;margin-top:8px">Todavía no hay suficientes datos. Cada vez que abras la pestaña <b>Historias</b> con una Historia activa, el panel registra a qué hora te está viendo la gente. Con unos días de uso, acá aparecen tus mejores horarios para publicar.</div>';
    } else {
      var hmax=Math.max.apply(null,hours);
      var best=hours.map(function(v,h){return [h,v];}).sort(function(a,b){return b[1]-a[1];}).slice(0,3).filter(function(x){return x[1]>0;});
      var bars='';
      for(var h=0;h<24;h++){
        var bh=hmax?(hours[h]/hmax*70):0;
        var isBest=best.some(function(b){return b[0]===h;});
        bars+='<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px">'+
          '<div style="width:70%;height:'+Math.max(2,Math.round(bh))+'px;border-radius:4px 4px 0 0;background:'+(isBest?'linear-gradient(180deg,#f56040,#c13584)':'#2a2a40')+'"></div>'+
          (h%3===0?('<span style="font-size:.62rem;color:#6a6a80">'+h+'</span>'):'<span style="font-size:.62rem;visibility:hidden">.</span>')+'</div>';
      }
      aud.innerHTML='<b>⏰ Horarios de tu audiencia</b>'+
        '<div style="color:#c9c9d8;font-size:.95rem;margin:8px 0">Tus mejores horas (según cuándo ven tus Historias): '+best.map(function(b){return '<b style="color:#ffb0e2">'+b[0]+':00</b>';}).join(' · ')+'</div>'+
        '<div style="display:flex;align-items:flex-end;height:95px;gap:2px">'+bars+'</div>'+
        '<div style="color:#6a6a80;font-size:.8rem;margin-top:6px">Dato aproximado: se registra al abrir la pestaña Historias con una Historia activa. Cuanto más uses el panel, más preciso se vuelve.</div>';
    }
    body.appendChild(aud);

    // --- plan semanal ---
    var plan=document.createElement('div'); plan.className='igpp-card';
    var wk=lsGet(LS.week,null);
    var key=weekKey();
    if(!wk||wk.key!==key){ wk={key:key, done:{}}; lsSet(LS.week,wk); }
    var tasks=[
      ['reels','Publicar 3 Reels esta semana (el formato con más alcance orgánico)'],
      ['stories','Subir Historias al menos 5 días, con encuesta o pregunta para generar interacción'],
      ['responder','Responder comentarios y DMs en menos de 1 hora después de publicar'],
      ['comentar','Dejar 10 comentarios genuinos en cuentas grandes de tu nicho (te descubren sus seguidores)'],
      ['colab','Proponer 1 colaboración o post conjunto con una cuenta de tamaño similar'],
      ['limpiar','Limpiar no-followers con la cola (máximo 1-2 tandas por día, sin abusar)'],
      ['analizar','Mirar qué publicación rindió mejor esta semana y hacer otra parecida']
    ];
    var doneN=tasks.filter(function(t){return wk.done[t[0]];}).length;
    var planHead=document.createElement('div');
    planHead.innerHTML='<b>✅ Plan de la semana</b> <span class="igpp-badge" style="margin-left:8px">'+doneN+'/'+tasks.length+'</span>'+
      '<div class="igpp-progresswrap"><div class="igpp-progress" style="width:'+Math.round(doneN/tasks.length*100)+'%"></div></div>'+
      '<div style="color:#6a6a80;font-size:.8rem;margin-bottom:10px">Se reinicia cada semana. Esta constancia manual es la estrategia que de verdad hace crecer cuentas — no los bots.</div>';
    plan.appendChild(planHead);
    tasks.forEach(function(t){
      var lab=document.createElement('label'); lab.style.cssText='display:flex;align-items:flex-start;gap:10px;padding:9px 4px;cursor:pointer;border-bottom:1px solid #1c1c2b';
      var cb=document.createElement('input'); cb.type='checkbox'; cb.className='igpp-cb'; cb.style.marginTop='2px'; cb.checked=!!wk.done[t[0]];
      var span=document.createElement('span'); span.textContent=t[1];
      span.style.cssText='font-size:.95rem;'+(wk.done[t[0]]?'color:#6a6a80;text-decoration:line-through':'color:#e8e8f0');
      cb.onchange=function(){ wk.done[t[0]]=cb.checked; lsSet(LS.week,wk); renderStrategyTab(); };
      lab.appendChild(cb); lab.appendChild(span); plan.appendChild(lab);
    });
    body.appendChild(plan);

    // --- ideas para crecer ---
    var tips=document.createElement('div'); tips.className='igpp-card'; tips.style.marginTop='14px';
    tips.innerHTML='<b>💡 Ideas para crecer</b><ul style="margin:12px 0 0;padding-left:1.3rem;font-size:.95rem;color:#c9c9d8">'+
      growthTips().map(function(t){return '<li style="margin:6px 0">'+t+'</li>';}).join('')+'</ul>';
    body.appendChild(tips);
  }

  // ---------------- init ----------------
  // Primero se lee la cuenta: así el aviso puede mostrar el usuario real que se
  // enviaría, y no se manda nada hasta saber qué respondió la persona.
  // La pestaña se pinta recién cuando se sabe quién es, porque de eso depende si
  // hay que mostrar la puerta de entrada o el panel directamente.
  checkAccount().then(function(){
    if(exigirRegistro()) switchTab('analysis');
  });
  var existingQ=loadQ();
  if(existingQ&&existingQ.status==='running'){ startTimerLoop(); }
}
})();
