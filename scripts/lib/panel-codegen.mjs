// Lo que la extensión de Chrome y el userscript de iPhone necesitan por
// igual: sacar el panel de docs/instagram/index.html y, si hace falta,
// cambiarle una función entera.
//
// Estaba duplicado en extension.mjs. Dos copias de lo mismo es la clase
// de bug que ya nos mordió en este proyecto: alguien toca una y la otra
// queda atrás sin que nadie lo note hasta que un generador produce algo
// roto. Mejor un solo lugar.

// Saca la función IGPanelPro completa de un HTML, contando llaves.
// Hay que saltear las que viven adentro de textos, de comentarios y de
// plantillas: el panel tiene CSS en cadenas llenas de llaves, y contarlas
// a lo bruto cortaba la función por la mitad.
export function extraerPanel(html) {
  const marca = "async function IGPanelPro(){";
  const desde = html.indexOf(marca);
  if (desde < 0) throw new Error("no encontré 'async function IGPanelPro('");

  let i = desde + marca.length - 1;   // parado en la llave que abre
  let nivel = 0;
  let dentro = null;                  // ' " ` // /*
  let escapa = false;

  for (; i < html.length; i++) {
    const c = html[i], sig = html[i + 1];

    if (escapa) { escapa = false; continue; }
    if (dentro === "\\") { escapa = true; continue; }

    if (dentro) {
      if (dentro === "//" && c === "\n") dentro = null;
      else if (dentro === "/*" && c === "*" && sig === "/") { dentro = null; i++; }
      else if ((dentro === "'" || dentro === '"' || dentro === "`") && c === "\\") escapa = true;
      else if (c === dentro && dentro !== "//" && dentro !== "/*") dentro = null;
      continue;
    }

    if (c === "'" || c === '"' || c === "`") { dentro = c; continue; }
    if (c === "/" && sig === "/") { dentro = "//"; i++; continue; }
    if (c === "/" && sig === "*") { dentro = "/*"; i++; continue; }

    if (c === "{") nivel++;
    else if (c === "}") {
      nivel--;
      if (nivel === 0) return html.slice(desde, i + 1);
    }
  }
  throw new Error("la función no cierra: revisá el HTML");
}

// La función avisar() reescrita para que mande los datos DIRECTO al
// contador, sin abrir la pestaña puente.
//
// El original abre la página de instalación en una pestaña con los datos
// en la dirección, porque adentro de Instagram el panel no puede hablar
// con nadie. La extensión y el userscript sí pueden —cada uno por su
// camino— así que ahí esa pestaña sobra y sólo molesta.
//
// El envío se hace con fetch(); quien la use tiene que haber declarado
// antes un fetch propio que sepa llegar al contador.
export const AVISAR_DIRECTO = `function avisar(){
    var u=(state.counts&&state.counts.username)||'';
    if(!u) return;

    var eventos=[{ev:'open'},{ev:'registro'}];
    var ps=lsGet(LS.pendScan,0)||0;
    for(var i=0;i<Math.min(ps,300);i++) eventos.push({ev:'scan_ok'});
    var bajas=lsGet(LS.pendUnf,[]);
    if(Array.isArray(bajas)) bajas.slice(0,120).forEach(function(n){ eventos.push({ev:'unfollow', d:n}); });

    // El identificador es por navegador, igual que en la versión del
    // marcador, así que las dos cuentan como la misma persona.
    var id='';
    try{
      id=localStorage.getItem('panel_visitante')||'';
      if(!id){ id=(crypto.randomUUID?crypto.randomUUID():('x'+Date.now().toString(36)+Math.random().toString(36).slice(2,10))); localStorage.setItem('panel_visitante',id); }
    }catch(e){ return; }

    var esMovil=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    fetch(TELEMETRY_URL+'/ping',{
      method:'POST', headers:{'content-type':'text/plain'},
      body:JSON.stringify({
        id:id, u:u, v:BUILD+'-'+CANAL,
        p:(esMovil?'movil':'escritorio'),
        h:new Date().getHours(), tz:-(new Date().getTimezoneOffset()),
        eventos:eventos
      })
    }).then(function(){
      lsSet(LS.pendScan,null);
      lsSet(LS.pendUnf,null);
    },function(){});
  }`;

// Cambia una función entera por otra, buscando dónde cierra con el mismo
// conteo de llaves. Devuelve null si no la encuentra, para que quien
// llama pueda cortar en vez de seguir con algo a medias.
export function reemplazarFuncion(fuente, firma, nueva) {
  const desde = fuente.indexOf(firma);
  if (desde < 0) return null;

  let i = desde + firma.length - 1;
  let nivel = 0, dentro = null, escapa = false;

  for (; i < fuente.length; i++) {
    const c = fuente[i], sig = fuente[i + 1];
    if (escapa) { escapa = false; continue; }
    if (dentro) {
      if (dentro === "//" && c === "\n") dentro = null;
      else if (dentro === "/*" && c === "*" && sig === "/") { dentro = null; i++; }
      else if ((dentro === "'" || dentro === '"' || dentro === "`") && c === "\\") escapa = true;
      else if (c === dentro && dentro !== "//" && dentro !== "/*") dentro = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { dentro = c; continue; }
    if (c === "/" && sig === "/") { dentro = "//"; i++; continue; }
    if (c === "/" && sig === "*") { dentro = "/*"; i++; continue; }
    if (c === "{") nivel++;
    else if (c === "}") { nivel--; if (nivel === 0) return fuente.slice(0, desde) + nueva + fuente.slice(i + 1); }
  }
  return null;
}
