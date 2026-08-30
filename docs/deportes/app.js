import { marcadores, detallePartido, fichaJugador, detalleGP, carteleraUFC, infoTorneo,
         historialPeleador, jugadasRugby, formaReciente,
         fichaPiloto, accionesPelea } from "./api.js?v=13";
import { banderaDePiloto as banderaPorNacionalidad,
         colorDeEscuderia as colorPorEscuderia } from "./f1-datos.js?v=13";

let DATOS = null, EXTRA = null;

// Marcadores en directo, indexados por el id de ESPN del evento.
let VIVOS = {};
let TZ = "America/Argentina/Buenos_Aires";
let seccion = "inicio";
let pestana = "calendario";
let relojId = null;

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// La tipografía de píxeles no tiene glifos acentuados: donde cae, el
// navegador cambia de fuente y la letra desentona. Para esas etiquetas
// en mayúsculas sacamos las tildes.
const rotulo = s => String(s == null ? "" : s)
  .normalize("NFD")
  .split("")
  .filter(c => { const n = c.charCodeAt(0); return n < 0x300 || n > 0x36f; })
  .join("")
  .toUpperCase();

/* ---------- fechas, siempre en la zona configurada ---------- */
const partes = iso => {
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", weekday:"short", hour12:false,
  }).formatToParts(new Date(iso));
  const o = {}; for (const p of f) o[p.type] = p.value;
  return o;
};
const claveMes = iso => { const p = partes(iso); return p.year + "-" + p.month; };
const claveDia = iso => { const p = partes(iso); return p.year + "-" + p.month + "-" + p.day; };
const hoyClave  = () => claveDia(new Date().toISOString());

function mostrarAviso(html, tipo, ms) {
  const a = $("#aviso");
  a.className = tipo || "";
  a.innerHTML = html;
  a.hidden = false;
  clearTimeout(a._t);
  const dur = ms === undefined ? 7000 : ms;
  if (dur) a._t = setTimeout(() => { a.hidden = true; }, dur);
}

// Saca la pantalla de carga. El desvanecido es sólo estético: después
// se la esconde con display:none, que no depende de que la transición
// llegue a terminar. Si dependiera, un fallo la dejaría tapando la app.
function ocultarCarga() {
  const c = $("#cargando");
  if (!c || c.dataset.listo) return;
  c.dataset.listo = "1";
  setTimeout(() => c.classList.add("fuera"), 600);
  setTimeout(() => { c.style.display = "none"; }, 1400);
}

// Si la carga de datos se cuelga, igual sacamos la pantalla a los 8 s
// para que se vea el mensaje de error en vez de un cartel eterno.
setTimeout(ocultarCarga, 8000);

/* ================= CARGA ================= */
async function cargar() {
  const pedir = async (archivo) => {
    const r = await fetch(archivo + "?v=" + Date.now());
    if (!r.ok) throw new Error(archivo);
    return r.json();
  };

  try {
    DATOS = await pedir("data/events.json");
    TZ = DATOS.timezone || TZ;
  } catch {
    ocultarCarga();
    $("#vista").innerHTML = '<p class="vacio">No se pudieron cargar los datos.<br>Revisá tu conexión.</p>';
    return;
  }

  // Los extras son opcionales: si fallan, el calendario funciona igual.
  try { EXTRA = await pedir("data/extras.json"); } catch { EXTRA = { feeds: {} }; }

  const act = new Date(DATOS.actualizado);
  const min = Math.round((Date.now() - act) / 60000);
  const hace = min < 60 ? `hace ${min} min`
             : min < 1440 ? `hace ${Math.round(min/60)} h`
             : `hace ${Math.round(min/1440)} días`;
  $("#pie-txt").textContent =
    `Datos actualizados ${hace} · horarios de ${TZ.split("/").pop().replace(/_/g," ")}`;

  armarTicker();
  armarAnillo();
  rutear();
  ocultarCarga();
  arrancarVivos();
}

const feedsActivos = () => (DATOS?.feeds || []);
const feedPorId    = id => feedsActivos().find(f => f.id === id);

// Escudo real del equipo. Si la imagen falla, se esconde y aparece el
// emoji que quedó debajo, así nunca se ve un hueco.
function escudo(feed, clase) {
  if (!feed) return "";
  const emoji = `<span class="emoji-resp">${feed.emoji || ""}</span>`;
  if (!feed.escudo) return emoji;
  // El emoji se ve desde el primer momento y se oculta recién cuando la
  // imagen llegó. Sin esto, al abrir la app quedan 89 cajas vacías.
  return `<span class="escudo ${clase || ""}"><img src="${esc(feed.escudo)}" alt=""
    loading="lazy" decoding="async"
    onload="this.parentNode.classList.add('cargado')"
    onerror="this.parentNode.classList.add('sin-img');this.remove()">${emoji}</span>`;
}
const escudoDe = (id, clase) => escudo(feedPorId(id), clase);
const extraDe      = id => (EXTRA?.feeds || {})[id] || {};

const eventosDe = id =>
  (DATOS?.eventos || []).filter(e => !id || e.feedId === id);

// Un evento sigue contando como "próximo" hasta 2 h después de empezar.
const futurosDe = id => {
  const ahora = Date.now();
  return eventosDe(id).filter(e => new Date(e.inicio).getTime() > ahora - 2 * 3600e3);
};

/* ================= CINTA DE TITULARES ================= */
function armarTicker() {
  const trozos = [];

  const prox = futurosDe(null).slice(0, 5);
  for (const e of prox) {
    const t = partes(e.inicio);
    trozos.push(`<b>${esc(e.emoji)}</b> ${esc(e.titulo)} — ${t.weekday} ${t.day}/${t.month} ${t.hour}:${t.minute}`);
  }

  const jugados = eventosDe(null).filter(e => e.finalizado && e.marcador).slice(-4);
  for (const e of jugados) trozos.push(`<b>FINAL</b> ${esc(e.titulo)} ${esc(e.marcador)}`);

  for (const f of feedsActivos()) {
    const p = extraDe(f.id).posiciones;
    const mio = p?.filas?.find(x => x.mio);
    if (mio) trozos.push(`<b>${esc(f.emoji)}</b> ${esc(f.label)} va ${mio.pos}° con ${esc(mio.pts)} pts`);
  }

  if (!trozos.length) trozos.push("SIN DATOS TODAVIA");

  // Dos copias idénticas: la animación desplaza exactamente la mitad,
  // así el bucle no tiene ni saltos ni huecos.
  const copia = `<span>${trozos.join(" ✦ ")} ✦ </span>`;
  $("#ticker-pista").innerHTML = copia + copia;
}

/* ================= NAVEGACIÓN ================= */
function armarAnillo() {
  $("#anillo").innerHTML = feedsActivos().map(f => `
    <button class="ficha" data-id="${f.id}" style="--c:var(--${f.sport})">
      ${escudo(f, "em")}
      <span class="nom">${esc(rotulo(f.label))}</span>
      ${f.proximos ? `<span class="cnt">${f.proximos}</span>` : ""}
    </button>`).join("");

  $$("#anillo .ficha").forEach(b =>
    b.onclick = () => irA(b.dataset.id));
}

function irA(id) {
  location.hash = id === "inicio" ? "" : "#/" + id;
}

function rutear() {
  const h = location.hash;

  // Detalle de un evento concreto
  if (h.startsWith("#/e/")) { verEvento(decodeURIComponent(h.slice(4))); return; }

  // Piloto de F1: #/p/<anio>/<driverId>
  if (h.startsWith("#/p/")) {
    const [anio, driverId] = h.slice(4).split("/");
    verPiloto(anio, driverId);
    return;
  }

  // Torneo: #/t/<deporte>/<liga>
  if (h.startsWith("#/t/")) {
    const [ruta, liga] = h.slice(4).split("/");
    verTorneo(ruta, liga);
    return;
  }

  // Ficha de un jugador: #/j/<deporte>/<liga>/<id>
  if (h.startsWith("#/j/")) {
    const [ruta, liga, id] = h.slice(4).split("/");
    verJugador(ruta, liga, id);
    return;
  }

  const m = h.match(/^#\/([\w-]+)(?:\/(\w+))?/);
  seccion = m && feedPorId(m[1]) ? m[1] : "inicio";
  pestana = (m && m[2]) || "calendario";

  $$("#anillo .ficha").forEach(b =>
    b.classList.toggle("activa", b.dataset.id === seccion));

  aplicarTema(seccion);

  window.transicion(() => {
    $("#vista").innerHTML = seccion === "inicio" ? htmlInicio() : htmlSeccion(seccion);
    conectar();
    window.revelar($("#vista"));
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}

addEventListener("hashchange", rutear);

/* ================= TEMA ================= */

// Convierte "#f2c400" en "242,196,0", para poder armar transparencias.
function aRGB(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "91,140,255";
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(",");
}

let temaActual = null;

// Pinta toda la página con el color del equipo (o del deporte, si el
// equipo no tiene uno propio). El fondo se tiñe apenas: lo justo para
// que se note de qué sección venís sin arruinar la lectura.
function aplicarTema(feedId) {
  const f = feedPorId(feedId);
  const color = f?.color
             || (f ? getComputedStyle(document.documentElement)
                       .getPropertyValue("--" + f.sport).trim() : "")
             || "#5b8cff";

  // Marca el equipo en la raíz del documento: el CSS engancha de ahí
  // para cambiar papel, bordes, tramas y tipografía por club.
  document.documentElement.dataset.equipo = feedId || "inicio";
  document.documentElement.dataset.deporte = f?.sport || "";

  if (color === temaActual) return;
  const primero = temaActual === null;
  temaActual = color;

  const rgb = aRGB(color);
  const raiz = document.documentElement.style;
  raiz.setProperty("--tema", color);
  raiz.setProperty("--tema-brillo", `rgba(${rgb},.16)`);
  // El fondo apenas teñido: 7% del color sobre el negro de siempre.
  raiz.setProperty("--tema-fondo", `rgb(${rgb.split(",").map(v =>
    Math.round(+v * .07 + 5)).join(",")})`);

  // Barrido del color nuevo, salvo la primera vez.
  if (!primero) {
    const d = $("#destello");
    if (d) { d.classList.remove("pasa"); void d.offsetWidth; d.classList.add("pasa"); }
  }

  // La barra del navegador y del sistema también acompañan.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}

/* ================= EN VIVO ================= */

// Un evento cuenta como "en curso" si ESPN lo dice, o si ya pasó su
// horario hace menos de 3 h y todavía no figura como terminado.
function estaEnCurso(e) {
  const v = VIVOS[e.idEspn];
  if (v) return v.enVivo;
  const t = new Date(e.inicio).getTime();
  const ahora = Date.now();
  return t <= ahora && ahora - t < 3 * 3600e3 && !e.finalizado;
}

// Qué ligas hay que consultar: sólo las que tienen eventos de hoy.
function ligasDeHoy() {
  const hoy = hoyClave();
  const pares = new Map();
  for (const e of (DATOS?.eventos || [])) {
    if (!e.liga || !e.ruta) continue;
    if (claveDia(e.inicio) !== hoy) continue;
    pares.set(e.ruta + "|" + e.liga, { ruta: e.ruta, liga: e.liga });
  }
  return [...pares.values()];
}

let vivoTimer = null;

async function refrescarVivos({ repintar = true } = {}) {
  const ligas = ligasDeHoy();
  if (!ligas.length) return;

  const lotes = await Promise.all(
    ligas.map(l => marcadores(l.ruta, l.liga).catch(() => ({})))
  );
  const nuevo = Object.assign({}, ...lotes);

  // Sólo repintamos si de verdad cambió algo, para no cortar animaciones
  // ni el scroll mientras estás leyendo.
  const cambio = JSON.stringify(nuevo) !== JSON.stringify(VIVOS);
  VIVOS = nuevo;
  if (cambio && repintar && seccion === "inicio" && !location.hash.startsWith("#/e/")) rutear();
  return cambio;
}

function arrancarVivos() {
  clearInterval(vivoTimer);
  refrescarVivos();
  vivoTimer = setInterval(() => {
    if (!document.hidden) refrescarVivos();
  }, 45000);
  // Al volver a la app, actualizamos enseguida.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refrescarVivos();
  });
}

/* ================= PORTADA ================= */
function htmlInicio() {
  const lista = futurosDe(null);
  const enCurso = lista.filter(e => estaEnCurso(e));
  const prox = lista.find(e => !estaEnCurso(e));

  let out = "";

  // Lo que se está jugando ahora, con el marcador en directo.
  for (const e of enCurso) out += tarjetaEnVivo(e);

  // El próximo que todavía no empezó, con cuenta regresiva.
  if (prox) {
    const t = partes(prox.inicio);
    out += `
    <section class="destacado rev" style="--c:var(--${prox.sport})">
      <div class="etiqueta">▶ LO QUE VIENE</div>
      <button class="destacado-link" data-ev="${esc(prox.id)}">
        <h2>${escudoDe(prox.feedId, "grande")} <span>${esc(prox.titulo)}</span></h2>
      </button>
      <p class="meta">${t.weekday} ${t.day}/${t.month} · ${t.hour}:${t.minute}<br>
        ${esc(prox.competicion || prox.feedLabel)}${prox.sede ? " · " + esc(prox.sede) : ""}</p>
      <div class="odometro" id="odo" data-inicio="${prox.inicio}"></div>
    </section>`;
  }

  // Agenda completa: todo lo que viene, de todos los deportes.
  const pendientes = lista.filter(e => !estaEnCurso(e) && e.id !== prox?.id);
  out += `
  <section class="ventana rev" style="--c:var(--acento)">
    <div class="ventana-barra">
      <span class="tit">AGENDA COMPLETA</span>
      <span class="bolas"><i></i><i></i><i></i></span>
    </div>
    <div class="ventana-cuerpo">${
      pendientes.length ? listaPorMes(pendientes)
                        : '<p class="vacio">No hay más eventos programados.</p>'
    }</div>
  </section>`;

  return out;
}

// Tarjeta de un evento que se está jugando en este momento.
function tarjetaEnVivo(e) {
  const v = VIVOS[e.idEspn] || {};
  const marcador = (v.golesLocal != null && v.golesVisitante != null)
    ? `<div class="vivo-marcador">
         <span class="vm-eq">${esc(v.local || e.local || "")}</span>
         <b>${esc(v.golesLocal)}</b><i>–</i><b>${esc(v.golesVisitante)}</b>
         <span class="vm-eq">${esc(v.visitante || e.visitante || "")}</span>
       </div>`
    : "";

  return `
  <section class="destacado envivo rev" style="--c:var(--${e.sport})">
    <div class="etiqueta"><span class="punto-vivo"></span> EN VIVO ${esc(v.detalle || v.reloj || "")}</div>
    <button class="destacado-link" data-ev="${esc(e.id)}">
      <h2>${escudoDe(e.feedId, "grande")} <span>${esc(e.titulo)}</span></h2>
    </button>
    ${marcador}
    <p class="meta">${esc(e.competicion || e.feedLabel)}${e.sede ? " · " + esc(e.sede) : ""}</p>
    <p class="toca">Tocá para ver goles, cambios y estadísticas →</p>
  </section>`;
}

// Agrupa por SEMANA, de lunes a domingo: así se ve de un vistazo qué
// toca esta semana en vez de un bloque de treinta días.
function listaPorMes(lista) {
  const hoy = hoyClave();

  // Lunes de la semana a la que pertenece una fecha, en tu zona horaria.
  const lunesDe = iso => {
    const p = partes(iso);
    const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
    const dia = (d.getUTCDay() + 6) % 7;            // lunes = 0
    d.setUTCDate(d.getUTCDate() - dia);
    return d;
  };
  const clave = d => d.toISOString().slice(0, 10);

  const lunesEstaSemana = clave(lunesDe(new Date().toISOString()));
  const lunesProxima = clave(new Date(lunesDe(new Date().toISOString()).getTime() + 7 * 86400e3));

  const grupos = new Map();
  for (const e of lista) {
    const k = clave(lunesDe(e.inicio));
    if (!grupos.has(k)) grupos.set(k, { lunes: lunesDe(e.inicio), eventos: [] });
    grupos.get(k).eventos.push(e);
  }

  let out = "";
  for (const [k, g] of grupos) {
    const dom = new Date(g.lunes.getTime() + 6 * 86400e3);
    const dd = d => String(d.getUTCDate()).padStart(2, "0");
    const mm = d => rotulo(MESES[d.getUTCMonth()]).slice(0, 3);

    const etiqueta = k === lunesEstaSemana ? "ESTA SEMANA"
                   : k === lunesProxima    ? "PROXIMA SEMANA"
                   : `${dd(g.lunes)} ${mm(g.lunes)} - ${dd(dom)} ${mm(dom)}`;

    out += `<div class="semana ${k === lunesEstaSemana ? "actual" : ""}">
      <span class="sem-tit">${etiqueta}</span>
      <span class="sem-cant">${g.eventos.length} ${g.eventos.length === 1 ? "evento" : "eventos"}</span>
    </div>`;
    for (const e of g.eventos) out += filaEvento(e, hoy);
  }
  return out;
}

/* ================= SECCIÓN DE UN DEPORTE ================= */
function htmlSeccion(id) {
  const f = feedPorId(id), x = extraDe(id);
  if (!f) return '<p class="vacio">Sección desconocida.</p>';

  const disponibles = [
    ["calendario", "CALENDARIO", true],
    ["tabla",      f.id === "f1" ? "CAMPEONATO" : "POSICIONES", !!x.posiciones],
    ["plantel",    "PLANTEL",    !!x.plantel],
    ["resultados", "RESULTADOS", !!x.resultados],
    ["peleadores", "PELEADORES", !!x.peleadores],
    ["noticias",   "NOTICIAS",   !!x.noticias],
  ].filter(p => p[2]);

  if (!disponibles.some(p => p[0] === pestana)) pestana = "calendario";

  // Cada competencia es un botón que abre la información de ese torneo.
  const comp = (x.compitiendo || []).length
    ? `<div class="compite"><span>Compite en:</span>${
        x.compitiendo.map(c => {
          const nombre = typeof c === "string" ? c : c.nombre;
          const puede = typeof c === "object" && c.liga && c.ruta;
          return puede
            ? `<button class="torneo-chip" data-torneo="${esc(c.ruta)}/${esc(c.liga)}">${esc(nombre)} →</button>`
            : `<span class="torneo-plano">${esc(nombre)}</span>`;
        }).join("")
      }</div>`
    : "";

  let cuerpo = "";
  if (pestana === "calendario")  cuerpo = htmlCalendario(id);
  if (pestana === "tabla")       cuerpo = htmlTabla(x.posiciones, f);
  if (pestana === "plantel")     cuerpo = htmlPlantel(x.plantel);
  if (pestana === "resultados")  cuerpo = htmlResultados(x.resultados);
  if (pestana === "peleadores")  cuerpo = htmlPeleadores(x.peleadores);
  if (pestana === "noticias")    cuerpo = htmlNoticias(x.noticias);

  return `
  <section class="ventana rev" style="--c:var(--${f.sport})">
    <div class="ventana-barra">
      <span class="tit">${escudo(f, "chico")} ${esc(rotulo(f.label))}.EXE</span>
      <span class="bolas"><i></i><i></i><i></i></span>
    </div>
    <div class="pestanas">
      ${disponibles.map(([k, n]) =>
        `<button class="pest ${k === pestana ? "on" : ""}" data-p="${k}">${n}</button>`).join("")}
    </div>
    <div class="ventana-cuerpo">${comp}${cuerpo}</div>
  </section>`;
}

/* ---------- calendario ---------- */
function htmlCalendario(id) {
  const lista = futurosDe(id);
  const jugados = eventosDe(id).filter(e => e.finalizado).slice(-5).reverse();

  if (!lista.length && !jugados.length)
    return enObra("Todavia no hay partidos programados",
                  "Aparecen solos acá apenas la federación publique el fixture.");

  let out = "";
  if (lista.length) {
    // La misma agrupación por semanas que usa la agenda de la portada:
    // antes acá quedaba un bloque por mes y no coincidían entre sí.
    out += listaPorMes(lista);
  } else {
    out += `<p class="vacio">Sin próximos partidos.</p>`;
  }

  if (jugados.length) {
    out += `<div class="semana"><span class="sem-tit">ULTIMOS RESULTADOS</span>
      <span class="sem-cant">${jugados.length}</span></div>`;
    for (const e of jugados) out += filaEvento(e, "");
  }
  return out;
}

function filaEvento(e, hoy) {
  const t = partes(e.inicio);
  const esHoy = claveDia(e.inicio) === hoy;
  const v = VIVOS[e.idEspn];
  const enVivo = v?.enVivo;

  // Escudo del rival: el que juega contra mi equipo.
  const mio = feedPorId(e.feedId);
  const rival = escudoRival(e, v);

  // Qué mostramos a la derecha: marcador si hay, si no la hora.
  let derecha;
  if (enVivo && v.golesLocal != null) {
    derecha = `<div class="marc vivo">${esc(v.golesLocal)}–${esc(v.golesVisitante)}
      <small>${esc(v.detalle || v.reloj || "")}</small></div>`;
  } else if ((v?.terminado || e.finalizado) && (e.marcador || v?.golesLocal != null)) {
    const m = e.marcador || `${v.golesLocal} - ${v.golesVisitante}`;
    derecha = `<div class="marc">${esc(m)}</div>`;
  } else {
    derecha = `<div class="hora">${t.hour}:${t.minute}</div>`;
  }

  return `
  <button class="ev rev ${e.finalizado || v?.terminado ? "jugado" : ""} ${esHoy ? "hoy" : ""} ${
    enVivo ? "envivo" : ""}" data-ev="${esc(e.id)}">
    <div class="dia"><b>${t.day}</b><i>${rotulo(t.weekday)}</i></div>
    <div class="escudos">${escudoDe(e.feedId, "mini")}${rival}</div>
    <div class="cuerpo">
      <div class="t"><span>${esc(e.titulo)}</span></div>
      <div class="s">${esc(e.competicion || e.feedLabel)}${e.sede ? " · " + esc(e.sede) : ""}</div>
    </div>
    ${derecha}
  </button>`;
}

// El escudo del equipo contrario. Sale del marcador en vivo si está,
// y si no de lo que guardamos al bajar el calendario.
function escudoRival(e, v) {
  const logoLocal = v?.logoLocal || e.logoLocal;
  const logoVisita = v?.logoVisitante || e.logoVisitante;
  if (!logoLocal || !logoVisita) return "";

  // El lado de mi equipo se decidió al bajar el calendario, comparando
  // identificadores. Comparar nombres fallaba: Los Pumas figuran como
  // "Argentina" y podían quedar como su propio rival.
  const logo = e.miLado === "local" ? logoVisita
             : e.miLado === "visitante" ? logoLocal
             : null;
  if (!logo) return "";

  // Igual que el escudo propio: hasta que la imagen llega se ve una
  // silueta, no un hueco en blanco.
  return `<span class="escudo mini rival"><img src="${esc(logo)}" alt=""
    loading="lazy" decoding="async"
    onload="this.parentNode.classList.add('cargado')"
    onerror="this.parentNode.remove()"><span class="emoji-resp">🛡️</span></span>`;
}

/* ---------- tabla ---------- */
function htmlTabla(pos, f) {
  if (!pos) return enObra("Sin tabla de posiciones",
                          "La fuente no publica una tabla para esta competencia.");

  const esF1 = pos.tipo === "f1";
  const anio = new Date().getFullYear();
  const fila = r => `
    <tr class="${r.mio ? "mio" : ""}${r.driverId ? " clicable" : ""}"${
      r.driverId ? ` data-piloto="${anio}/${esc(r.driverId)}"` : ""}>
      <td class="num">${r.pos}</td>
      <td><div class="eq">
        ${r.foto ? `<img class="cara" src="${esc(r.foto)}" alt="" loading="lazy"
          onerror="this.remove()">` : ""}
        ${r.bandera ? `<img class="bandera" src="${esc(r.bandera)}" alt="" loading="lazy">` : ""}
        ${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ""}
        <span>${esc(r.equipo)}</span></div>
        ${r.detalle ? `<small class="escuderia">${
          r.color ? `<i class="pastilla" style="background:${esc(r.color)}"></i>` : ""
        }${esc(r.detalle)}</small>` : ""}</td>
      ${esF1 ? "" : `<td class="num">${esc(r.pj ?? "—")}</td>`}
      <td class="pts">${esc(r.pts ?? "—")}</td>
    </tr>`;

  let out = `<p style="font-family:var(--pixel);font-size:8px;margin-bottom:10px">${esc(pos.titulo)}</p>
  <table class="tabla"><thead><tr>
    <th class="num">#</th><th>${esF1 ? "PILOTO" : "EQUIPO"}</th>
    ${esF1 ? "" : "<th class='num'>PJ</th>"}<th style="text-align:right">PTS</th>
  </tr></thead><tbody>${pos.filas.map(fila).join("")}</tbody></table>`;

  if (esF1 && pos.escuderias?.length) {
    out += `<div class="grupo-pos">ESCUDERIAS</div>
    <table class="tabla"><thead><tr>
      <th class="num">#</th><th>EQUIPO</th><th style="text-align:right">PTS</th>
    </tr></thead><tbody>${pos.escuderias.map(r => `
      <tr><td class="num">${r.pos}</td>
      <td><div class="eq">
        <i class="pastilla grande" style="background:${esc(r.color || "#888")}"></i>
        <span>${esc(r.equipo)}</span></div></td>
      <td class="pts">${esc(r.pts)}</td></tr>`).join("")}</tbody></table>`;
  }
  return out;
}

/* ---------- plantel ---------- */
function htmlPlantel(plantel) {
  if (!plantel) return enObra("Sin plantel disponible",
                              "La fuente no publica la lista de jugadores de este equipo.");

  const NOMBRES = { G:"ARQUEROS", D:"DEFENSORES", M:"MEDIOCAMPISTAS", F:"DELANTEROS" };
  const grupos = new Map();
  for (const j of plantel) {
    const k = NOMBRES[j.posCorta] || (j.posicion || "OTROS").toUpperCase();
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(j);
  }

  let out = `<p style="font-family:var(--pixel);font-size:8px;margin-bottom:6px">${plantel.length} JUGADORES</p>`;
  for (const [k, js] of grupos) {
    out += `<div class="grupo-pos">${esc(rotulo(k))}</div><div class="plantel">`;
    for (const j of js) {
      // El deporte y la liga salen de la ficha del equipo, no de sus
      // partidos: la Selección no tiene ninguno programado y así sus
      // jugadores quedaban sin poder abrirse.
      const eq = feedPorId(seccion);
      const ruta = eq?.ruta, liga = eq?.liga;
      const clic = (j.id && ruta && liga)
        ? ` data-jug="${esc(ruta)}/${esc(liga)}/${esc(j.id)}"` : "";
      out += `
      <button class="jug rev ${j.lesionado ? "lesionado" : ""}"${clic}>
        ${j.foto
          ? `<img class="jug-foto" src="${esc(j.foto)}" alt="" loading="lazy"
               onerror="this.remove()">`
          : `<div class="dor">${esc(j.dorsal || "–")}</div>`}
        <div class="info">
          <b>${esc(j.nombre)}</b>
          <span>${j.bandera ? `<img class="bandera" src="${esc(j.bandera)}" alt="" loading="lazy">` : ""}${
            esc([j.edad ? j.edad + " años" : "", j.pais].filter(Boolean).join(" · "))}</span>
        </div>
      </button>`;
    }
    out += `</div>`;
  }
  return out;
}

/* ---------- resultados ---------- */
function htmlResultados(res) {
  if (!res) return enObra("Sin resultados", "Todavía no hay eventos disputados.");
  return res.map(r => {
    const t = partes(r.fecha);
    return `
    <article class="ev rev jugado">
      <div class="dia"><b>${t.day}</b><i>${t.month}</i></div>
      <div class="cuerpo"><div class="t">${esc(r.titulo)}</div>
        <div class="s">${esc(r.sede || "")}</div></div>
      ${r.marcador ? `<div class="marc">${esc(r.marcador)}</div>` : ""}
    </article>`;
  }).join("");
}

/* ---------- peleadores ---------- */
function htmlPeleadores(lista) {
  if (!lista) return enObra("Sin peleadores", "Todavía no hay carteleras cargadas.");

  let out = `<p class="nota-fuente" style="margin:0 0 12px;border:none;padding:0">
    ESPN publica un ranking libra por libra, pero está congelado alrededor de
    2021 (da a Usman y Ngannou como campeones y no trae fecha). Esta lista se
    arma con los peleadores que de verdad aparecieron en las carteleras del
    año, ordenados por victorias.</p>
    <div class="peleadores">`;

  lista.forEach((p, i) => {
    out += `
    <button class="pf" data-jug="mma/ufc/${esc(p.id)}">
      <span class="pf-pos">${i + 1}</span>
      ${p.bandera ? `<img class="pf-bandera" src="${esc(p.bandera)}" alt="" loading="lazy">` : ""}
      <span class="pf-info">
        <b>${esc(p.nombre)}</b>
        <small>${esc(p.categoria)}</small>
      </span>
      <span class="pf-rec">${esc(p.record)}
        <small>${p.gano}/${p.peleas} este año</small></span>
    </button>`;
  });
  return out + `</div>`;
}

/* ---------- noticias ---------- */
function htmlNoticias(notas) {
  if (!notas) return enObra("Sin noticias", "La fuente no publica notas de esta categoría.");
  return notas.map(n => {
    const f = n.fecha ? partes(n.fecha) : null;
    return `
    <a class="nota rev" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">
      <b>${esc(n.titulo)}</b>
      ${n.resumen ? `<p>${esc(n.resumen)}</p>` : ""}
      ${f ? `<time>${f.day}/${f.month}/${f.year}</time>` : ""}
    </a>`;
  }).join("");
}

/* ---------- cartel de "en construcción" ---------- */
function enObra(titulo, detalle) {
  return `
  <div class="obra rev">
    <div class="cartel">
      <div class="icono">🚧</div>
      <b>${esc(titulo)}</b>
      <span>${esc(detalle)}</span>
    </div>
  </div>`;
}


/* ================= DETALLE DE UN EVENTO ================= */

const eventoPorId = id => (DATOS?.eventos || []).find(e => e.id === id);

function marcoDetalle(titulo, color, cuerpo, volverA) {
  return `
  <button class="volver" data-volver="${esc(volverA || "")}">← volver</button>
  <section class="ventana rev" style="--c:var(--${color || "acento"})">
    <div class="ventana-barra">
      <span class="tit">${esc(rotulo(titulo))}</span>
      <span class="bolas"><i></i><i></i><i></i></span>
    </div>
    <div class="ventana-cuerpo" id="cuerpo-detalle">${cuerpo}</div>
  </section>`;
}

const cargandoHTML = txt =>
  `<div class="cargando-caja"><span class="spin"></span> ${esc(txt || "Buscando datos…")}</div>`;

async function verEvento(id) {
  const e = eventoPorId(id);
  if (!e) { location.hash = ""; return; }

  seccion = e.feedId;
  $$("#anillo .ficha").forEach(b => b.classList.toggle("activa", b.dataset.id === e.feedId));
  aplicarTema(e.feedId);

  $("#vista").innerHTML = marcoDetalle(e.titulo, e.sport, cargandoHTML(), "#/" + e.feedId);
  conectar();
  window.revelar($("#vista"));
  window.scrollTo({ top: 0, behavior: "instant" });

  const destino = $("#cuerpo-detalle");
  try {
    if (e.sport === "f1")        destino.innerHTML = await htmlDetalleGP(e);
    else if (e.sport === "ufc")  destino.innerHTML = await htmlCartelera(e);
    else                         destino.innerHTML = await htmlDetallePartido(e);
  } catch (err) {
    destino.innerHTML = `<p class="vacio">No se pudo cargar el detalle.<br><small>${esc(err.message)}</small></p>`;
  }
  conectar();
  window.revelar(destino);
}

/* ---------- partido de fútbol o rugby ---------- */
async function htmlDetallePartido(e) {
  if (!e.idEspn || !e.liga || !e.ruta)
    return '<p class="vacio">Este evento no tiene detalle disponible.</p>';

  const d = await detallePartido(e.ruta, e.liga, e.idEspn);
  if (!d) return '<p class="vacio">La fuente no publica el detalle de este partido.</p>';

  // En rugby el summary no trae jugadas: están en la API núcleo, y se
  // resuelven contra la alineación que ya tenemos, sin pedidos extra.
  if (e.ruta === "rugby" && !d.jugadas.length) {
    const mapa = {};
    for (const f of d.formaciones)
      for (const j of f.jugadores)
        if (j.id) mapa[j.id] = { nombre: j.nombre, equipo: f.equipo };
    try { d.jugadas = await jugadasRugby(e.liga, e.idEspn, mapa); } catch { /* sin jugadas */ }
  }

  const v = VIVOS[e.idEspn];
  const yaJugo = !!(v?.terminado || e.finalizado || d.local?.goles != null);

  // ESPN manda el estado en inglés ("Sat, September 5th at 3:30 PM EDT").
  // Si el partido no empezó, mostramos la fecha en tu formato y tu zona.
  let estado;
  if (v?.enVivo) {
    estado = `<span class="chip-vivo"><span class="punto-vivo"></span>${esc(v.detalle || "EN VIVO")}</span>`;
  } else if (yaJugo) {
    estado = `<span class="chip">${esc(v?.detalle || d.detalleEstado || "Final")}</span>`;
  } else {
    const t = partes(e.inicio);
    estado = `<span class="chip">${t.weekday} ${t.day}/${t.month} · ${t.hour}:${t.minute}</span>`;
  }

  const lado = (t, goles) => `
    <div class="mp-lado">
      ${t?.logo ? `<img class="mp-logo" src="${esc(t.logo)}" alt="" loading="lazy">` : ""}
      <span class="mp-nom">${esc(t?.nombre || "")}</span>
    </div>`;

  let out = `
  <div class="marcador-partido">
    ${lado(d.local)}
    <div class="mp-cifras">
      <b>${esc(d.local?.goles ?? "-")}</b><i>–</i><b>${esc(d.visitante?.goles ?? "-")}</b>
      <div class="mp-estado">${estado}</div>
    </div>
    ${lado(d.visitante)}
  </div>`;

  out += goleadoresHTML(d);

  const ficha = [
    d.fecha && `${esc(fechaLarga(d.fecha))}`,
    d.sede && `Estadio: <b>${esc(d.sede)}</b>`,
    d.publico && `Público: <b>${esc(d.publico)}</b>`,
    d.arbitros.length && `Árbitro: <b>${esc(d.arbitros[0])}</b>`,
  ].filter(Boolean);
  if (ficha.length) out += `<p class="ficha-partido">${ficha.join(" · ")}</p>`;

  // --- goles, tarjetas y cambios ---
  if (d.jugadas.length) {
    out += `<div class="grupo-pos">LO QUE PASO</div><ol class="jugadas">`;
    for (const j of d.jugadas) {
      const icono = j.esTry ? "🏉" : j.esGol ? (e.sport === "rugby" ? "🎯" : "⚽")
                  : j.esRoja ? "🟥" : j.esAmarilla ? "🟨" : j.esCambio ? "🔁" : "•";
      const clase = j.esGol ? "gol" : j.esCambio ? "cambio" : "";
      out += `
      <li class="jugada ${clase}">
        <span class="j-min">${esc(j.minuto)}</span>
        <span class="j-ico">${icono}</span>
        <span class="j-txt"><b>${esc(j.quien || j.tipo)}</b>${
          j.quien ? ` <small>${esc(j.tipo)}</small>` : ""}</span>
        ${botonVideo(j, e)}
        ${j.marcador ? `<span class="j-marc">${esc(j.marcador)}</span>` : ""}
      </li>`;
    }
    out += `</ol>`;
  } else if (yaJugo) {
    out += `<div class="grupo-pos">LO QUE PASO</div>
      <p class="vacio">La fuente no publicó las jugadas de este partido.</p>`;
  }
  // Si todavía no se jugó no mostramos nada: no hay nada que haya pasado.

  // --- estadísticas comparadas ---
  const ea = d.estadisticas[0], eb = d.estadisticas[1];
  if (ea?.datos.length && eb?.datos.length) {
    // Los 28 nombres que ESPN devuelve para fútbol y rugby, traducidos.
    // Cualquiera que no esté acá se oculta en vez de mostrarse en inglés.
    const NOMBRES = {
      accurateCrosses: "Centros buenos",
      accurateLongBalls: "Pelotazos buenos",
      accuratePasses: "Pases buenos",
      blockedShots: "Remates bloqueados",
      crossPct: "Precisión de centro",
      effectiveClearance: "Rechazos buenos",
      effectiveTackles: "Quites buenos",
      foulsCommitted: "Faltas",
      interceptions: "Intercepciones",
      longballPct: "Precisión de pelotazo",
      offsides: "Offsides",
      passPct: "Precisión de pase",
      penaltyKickGoals: "Goles de penal",
      penaltyKickShots: "Penales pateados",
      possessionPct: "Posesión",
      redCards: "Rojas",
      saves: "Atajadas",
      shotPct: "Efectividad de remate",
      shotsOnTarget: "Al arco",
      tacklePct: "Precisión de quite",
      totalClearance: "Rechazos",
      totalCrosses: "Centros",
      totalLongBalls: "Pelotazos",
      totalPasses: "Pases",
      totalShots: "Remates",
      totalTackles: "Quites",
      wonCorners: "Córners",
      yellowCards: "Amarillas",
      // rugby
      tries: "Tries",
      conversions: "Conversiones",
      penaltyGoals: "Penales",
      // por si aparecen en otras vistas
      goalDifference: "Diferencia de gol",
      goalsConceded: "Goles recibidos",
      assists: "Asistencias",
      goals: "Goles",
      points: "Puntos",
      wins: "Ganados",
      losses: "Perdidos",
      ties: "Empatados",
      gamesPlayed: "Jugados",
      appearances: "Partidos",
      subIns: "Ingresos desde el banco",
      ownGoals: "En contra",
      shotsFaced: "Remates recibidos",
      cleanSheet: "Vallas invictas",
    };
    // Los porcentajes vienen como fracción (0.8) en algunos campos.
    const comoTexto = (nombre, valor) =>
      /Pct$/.test(nombre) && parseFloat(valor) <= 1
        ? (parseFloat(valor) * 100).toFixed(0) + "%"
        : /possessionPct/.test(nombre) ? valor + "%" : valor;
    // Antes de jugarse, lo que devuelve ESPN son totales de la temporada,
    // no del partido. Se rotula distinto para no confundir.
    out += `<div class="grupo-pos">${yaJugo ? "ESTADISTICAS DEL PARTIDO" : "ASI VIENEN EN LA TEMPORADA"}</div>
      <div class="stats-comp">`;
    for (const a of ea.datos) {
      const b = eb.datos.find(x => x.nombre === a.nombre);
      if (!b) continue;
      // Si no lo sabemos decir en español, no lo mostramos: es preferible
      // una fila menos que una palabra en inglés en el medio.
      if (!NOMBRES[a.nombre]) continue;
      const na = parseFloat(a.valor) || 0, nb = parseFloat(b.valor) || 0;
      // Con valores negativos (la diferencia de gol puede ser -1) la
      // proporción se iba de rango: 4/(4-1) daba 133% y la barra se
      // salía de la pantalla. Se corre todo a positivo primero.
      const piso = Math.min(0, na, nb);
      const pa = na - piso, pb = nb - piso;
      const tot = (pa + pb) || 1;
      const porc = Math.max(0, Math.min(100, pa / tot * 100));
      out += `
      <div class="sc-fila">
        <span class="sc-a">${esc(comoTexto(a.nombre, a.valor))}</span>
        <span class="sc-nom">${esc(NOMBRES[a.nombre])}</span>
        <span class="sc-b">${esc(comoTexto(b.nombre, b.valor))}</span>
        <span class="sc-barra"><i style="width:${porc.toFixed(1)}%"></i></span>
      </div>`;
    }
    out += `</div>`;
  }

  // --- videos del partido ---
  const sueltos = (d.videos || []).filter(v =>
    !d.jugadas.some(j => j.video === v.link));
  if (sueltos.length) {
    out += `<div class="grupo-pos">VIDEOS</div><div class="clips">`;
    for (const v of sueltos) {
      out += `<a class="clip" href="${esc(v.link)}" target="_blank" rel="noopener noreferrer">
        <span class="clip-play">▶</span>
        <span class="clip-txt">${esc(v.titulo)}</span>
      </a>`;
    }
    out += `</div>`;
  }

  // --- cómo llegan los dos equipos ---
  try {
    const forma = await formaReciente(e.ruta, e.liga, e.idEspn);
    if (forma.length) {
      out += `<div class="grupo-pos">COMO LLEGAN</div><div class="formas">`;
      for (const g of forma) {
        out += `<div class="forma">
          <div class="forma-eq">${g.logo ? `<img src="${esc(g.logo)}" alt="" loading="lazy">` : ""}
            <b>${esc(g.equipo)}</b></div>
          <div class="forma-bolas">${g.partidos.map(p =>
            `<span class="fb ${p.resultado === "W" ? "g" : p.resultado === "L" ? "p" : "e"}"
               title="${esc(p.rival)} ${esc(p.marcador)}">${esc(p.resultado || "-")}</span>`).join("")}</div>
          <ul class="forma-lista">${g.partidos.map(p =>
            `<li><span>${esc(p.rival)}</span><b>${esc(p.marcador)}</b></li>`).join("")}</ul>
        </div>`;
      }
      out += `</div>`;
    }
  } catch { /* si falla, el detalle se muestra igual */ }

  // --- formaciones ---
  // Antes de jugarse no hay alineación: se dibujaban los títulos de los
  // dos equipos con nada debajo.
  for (const f of d.formaciones.filter(x => x.jugadores.length)) {
    let titulares = f.jugadores.filter(j => j.titular);
    let banca = f.jugadores.filter(j => !j.titular);

    // ESPN no marca titulares en rugby. El dorsal sí lo dice: del 1 al 15
    // arrancan y del 16 al 23 son el banco (en fútbol, del 1 al 11).
    if (!titulares.length) {
      const corte = e.sport === "rugby" ? 15 : 11;
      const con = n => { const v = parseInt(n, 10); return Number.isFinite(v) ? v : 999; };
      titulares = f.jugadores.filter(j => con(j.dorsal) <= corte);
      banca     = f.jugadores.filter(j => con(j.dorsal) >  corte);
      // Si tampoco hay dorsales útiles, mostramos todo junto.
      if (!titulares.length) { titulares = f.jugadores; banca = []; }
    }
    out += `<div class="grupo-pos">${esc(rotulo(f.equipo))}${f.formacion ? " · " + esc(f.formacion) : ""}</div>`;

    // Si sabemos en qué puesto juega cada uno, se los para en una cancha.
    // Si no —pasa en rugby, y en partidos que todavía no arrancaron—,
    // queda la lista de siempre, que sigue sirviendo.
    const puedeCancha = e.sport !== "rugby" && titulares.filter(j => j.lugar > 0).length >= 7;
    if (puedeCancha) out += canchaHTML(titulares, e);
    else {
      out += `<div class="once">`;
      for (const j of titulares) out += fichaJugadorMini(j, e);
      out += `</div>`;
    }

    if (banca.length) {
      out += `<p class="sub-rotulo">Suplentes</p><div class="once banca">`;
      for (const j of banca) out += fichaJugadorMini(j, e);
      out += `</div>`;
    }
    out += cambiosHTML(f);
  }

  out += posicionesPartidoHTML(d);
  return out;
}


/* ═══════════════ el detalle del partido, por partes ═══════════════ */

// La fecha del partido, escrita como la decís.
function fechaLarga(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return "";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(t);
}

// Quién hizo los goles, de cada lado, como en la ficha de un diario.
// Si uno hizo varios, van juntos en un renglón: "Messi 40', 52', 83'"
// en vez de tres renglones con el mismo apellido.
function goleadoresHTML(d) {
  const goles = (d.jugadas || []).filter(j => j.esGol);
  if (!goles.length) return "";

  const armar = equipo => {
    const mios = goles.filter(g => g.equipo === equipo);
    if (!mios.length) return "";
    const porJugador = new Map();
    for (const g of mios) {
      const enContra = /own goal/i.test(g.texto || "");
      const quien = (g.quien || "").split(",")[0].trim() || "gol";
      const clave = quien + (enContra ? " (e/c)" : "");
      if (!porJugador.has(clave)) porJugador.set(clave, []);
      if (g.minuto) porJugador.get(clave).push(g.minuto);
    }
    return [...porJugador].map(([quien, minutos]) =>
      `<li><b>${esc(quien)}</b>${minutos.length ? ` <span>${esc(minutos.join(", "))}</span>` : ""}</li>`
    ).join("");
  };

  const a = armar(d.local?.nombre), b = armar(d.visitante?.nombre);
  if (!a && !b) return "";
  return `
  <div class="goleadores">
    <ul>${a}</ul>
    <span class="gol-ico" aria-hidden="true">⚽</span>
    <ul class="der">${b}</ul>
  </div>`;
}

// En qué línea juega, leído del puesto que manda la fuente.
//   G                → arquero
//   RB, LB, CD-R, D  → defensa
//   CM, RM, LM, DM   → medio
//   F, LF, RF, ST    → delantero
function lineaDe(puesto) {
  const p = (puesto || "").toUpperCase();
  if (/^G/.test(p)) return 0;
  if (/^(C?D|[LRC]?B)/.test(p)) return 1;
  if (/M/.test(p)) return 2;
  return 3;
}

// Dónde se para a lo ancho. El lateral va más afuera que el central,
// por eso son cinco valores y no tres: sin esa diferencia los dos
// centrales y los dos laterales se mezclaban y quedaban en cualquier
// orden dentro de la línea.
function costadoDe(puesto) {
  const p = (puesto || "").toUpperCase();
  if (/^L/.test(p)) return -2;
  if (/^R/.test(p)) return 2;
  if (/-L$/.test(p)) return -1;
  if (/-R$/.test(p)) return 1;
  return 0;
}

// La cancha, mirada desde atrás del arco propio: el arquero abajo y los
// delanteros arriba, como se ve por televisión.
function canchaHTML(titulares, e) {
  const lineas = [[], [], [], []];
  for (const j of titulares) lineas[lineaDe(j.posicion)].push(j);

  // Si algún equipo juega sin delanteros netos, la línea vacía no se
  // dibuja: quedaría una franja de pasto sola en el medio.
  const conGente = lineas.filter(l => l.length);

  let dentro = "";
  // Se recorre al revés para que el arquero quede abajo de todo.
  for (const linea of [...conGente].reverse()) {
    linea.sort((a, b) => costadoDe(a.posicion) - costadoDe(b.posicion) || a.lugar - b.lugar);
    dentro += `<div class="c-linea">${linea.map(j => jugadorEnCancha(j, e)).join("")}</div>`;
  }

  return `<div class="cancha" style="--lineas:${conGente.length}">
    <div class="c-dibujo" aria-hidden="true"></div>
    ${dentro}
  </div>`;
}

// Cada jugador: la cara si la fuente la tiene, y si no las iniciales.
// No se inventa una foto: en un partido cualquiera hay foto de cinco de
// cada veinte, y un muñeco genérico repetido once veces es peor que una
// letra.
function jugadorEnCancha(j, e) {
  const clic = j.id ? ` data-jug="${esc(e.ruta)}/${esc(e.liga)}/${esc(j.id)}"` : "";

  const iniciales = (j.nombre || "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(p => p[0]).join("").toUpperCase();

  const cara = j.foto
    ? `<img src="${esc(j.foto)}" alt="" loading="lazy">`
    : `<span class="cj-ini">${esc(iniciales || "?")}</span>`;

  // Las marcas del partido: goles, en contra, amarilla y roja.
  let marcas = "";
  if (j.goles > 0) marcas += `<i class="m-gol">⚽${j.goles > 1 ? j.goles : ""}</i>`;
  if (j.enContra > 0) marcas += `<i class="m-ec" title="En contra">⚽</i>`;
  if (j.rojas > 0) marcas += `<i class="m-roja"></i>`;
  else if (j.amarillas > 0) marcas += `<i class="m-amar"></i>`;
  if (j.salio) marcas += `<i class="m-sale" title="Salió">▼</i>`;

  return `
  <button class="cj"${clic} title="${esc(j.nombre)}${j.posicion ? " · " + esc(j.posicion) : ""}">
    <span class="cj-cara">${cara}<span class="cj-dor">${esc(j.dorsal || "–")}</span></span>
    <span class="cj-nom">${esc(apellidoDe(j.nombre))}${j.capitan ? " ©" : ""}</span>
    ${marcas ? `<span class="cj-marcas">${marcas}</span>` : ""}
  </button>`;
}

// En la cancha no entra el nombre completo: se muestra el apellido, que
// es como se lo nombra igual.
function apellidoDe(nombre) {
  const partes = (nombre || "").trim().split(/\s+/);
  return partes.length > 1 ? partes.slice(1).join(" ") : (partes[0] || "");
}

// Los cambios, con el minuto y por quién entró cada uno.
function cambiosHTML(f) {
  const entraron = (f.jugadores || []).filter(j => j.entro && j.cambioCon);
  if (!entraron.length) return "";

  const orden = j => {
    const m = parseInt(j.minutoCambio, 10);
    return Number.isFinite(m) ? m : 999;
  };
  entraron.sort((a, b) => orden(a) - orden(b));

  return `<p class="sub-rotulo">Cambios</p>
  <ul class="cambios">${entraron.map(j => `
    <li>
      <span class="cb-min">${esc(j.minutoCambio || "")}</span>
      <span class="cb-entra">▲ ${esc(j.nombre)}</span>
      <span class="cb-sale">▼ ${esc(j.cambioCon)}</span>
    </li>`).join("")}</ul>`;
}

// La tabla del torneo, con los dos equipos del partido resaltados para
// encontrarlos sin leer los quince renglones.
function posicionesPartidoHTML(d) {
  const grupos = d.posiciones || [];
  if (!grupos.length) return "";

  const mios = [d.local?.nombre, d.visitante?.nombre].filter(Boolean);
  const esMio = nombre => mios.some(m =>
    m === nombre || m.includes(nombre) || nombre.includes(m));

  let out = "";
  for (const g of grupos) {
    // El título viene en inglés desde la fuente ("MLS Standings",
    // "Premier League Table"). No hace falta traducirlo: estando
    // adentro del partido ya se sabe de qué torneo es la tabla.
    out += `<div class="grupo-pos">${rotulo("Posiciones")}${
      grupos.length > 1 && g.titulo ? " · " + esc(g.titulo) : ""}</div>
    <div class="tabla-scroll"><table class="tabla-pos">
      <thead><tr>
        <th></th><th class="tp-eq">Equipo</th>
        <th>PJ</th><th>G</th><th>E</th><th>P</th><th class="tp-dg">DG</th><th>PTS</th>
      </tr></thead><tbody>`;
    for (const r of g.filas) {
      out += `<tr class="${esMio(r.equipo) ? "tp-mio" : ""}">
        <td class="tp-n">${esc(r.puesto)}</td>
        <td class="tp-eq">${esc(r.equipo)}</td>
        <td>${esc(r.pj)}</td><td>${esc(r.g)}</td><td>${esc(r.e)}</td>
        <td>${esc(r.p)}</td><td class="tp-dg">${esc(r.dg)}</td><td><b>${esc(r.pts)}</b></td>
      </tr>`;
    }
    out += `</tbody></table></div>`;
  }
  return out;
}

// Botón para ver la jugada. Si ESPN tiene el clip, va directo. Si no
// —rugby y la liga argentina no tienen derechos ahí— abre una búsqueda
// en YouTube con el nombre del que la hizo y los dos equipos.
function botonVideo(j, e) {
  if (j.video) {
    return `<a class="j-video" href="${esc(j.video)}" target="_blank"
      rel="noopener noreferrer" title="Ver la jugada">▶</a>`;
  }
  if (!j.esGol && !j.esTry) return "";

  const que = j.esTry ? "try" : "gol";
  const consulta = [j.quien, que, e.titulo].filter(Boolean).join(" ");
  const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(consulta);
  return `<a class="j-video buscar" href="${url}" target="_blank"
    rel="noopener noreferrer" title="Buscar el ${que} en YouTube">⌕</a>`;
}

function fichaJugadorMini(j, e) {
  const clic = j.id ? ` data-jug="${esc(e.ruta)}/${esc(e.liga)}/${esc(j.id)}"` : "";
  return `
  <button class="jm${j.entro ? " entro" : ""}${j.salio ? " salio" : ""}"${clic}>
    <span class="jm-dor">${esc(j.dorsal || "–")}</span>
    <span class="jm-nom">${esc(j.nombre)}</span>
    <span class="jm-pos">${esc(j.posicion)}${j.capitan ? " ©" : ""}${
      j.entro ? " ▲" : ""}${j.salio ? " ▼" : ""}</span>
  </button>`;
}

/* ---------- gran premio ---------- */
async function htmlDetalleGP(e) {
  if (!e.anio || !e.ronda)
    return '<p class="vacio">Este evento no tiene detalle disponible.</p>';

  const g = await detalleGP(e.anio, e.ronda);
  if (!g) return '<p class="vacio">Todavía no hay datos de este Gran Premio.</p>';

  let out = `<p class="ficha-partido"><b>${esc(g.circuito)}</b>${g.lugar ? " · " + esc(g.lugar) : ""}</p>`;

  if (g.resultados.length) {
    out += `<div class="grupo-pos">RESULTADO DE LA CARRERA</div>
    <table class="tabla"><thead><tr>
      <th class="num">#</th><th>PILOTO</th><th class="num">GRILLA</th>
      <th>TIEMPO</th><th style="text-align:right">PTS</th>
    </tr></thead><tbody>`;
    for (const r of g.resultados) {
      out += `<tr>
        <td class="num">${esc(r.pos)}</td>
        <td><b>${esc(r.piloto)}</b>${r.vueltaRapida ? ' <span class="vr">VR</span>' : ""}
          <small style="display:block;color:#666">${esc(r.equipo)}</small></td>
        <td class="num">${esc(r.grilla)}</td>
        <td class="mono">${esc(r.tiempo)}</td>
        <td class="pts">${esc(r.puntos)}</td>
      </tr>`;
    }
    out += `</tbody></table>`;
  }

  if (g.clasificacion.length) {
    out += `<div class="grupo-pos">CLASIFICACION</div>
    <table class="tabla"><thead><tr>
      <th class="num">#</th><th>PILOTO</th><th>Q1</th><th>Q2</th><th>Q3</th>
    </tr></thead><tbody>`;
    for (const q of g.clasificacion) {
      out += `<tr>
        <td class="num">${esc(q.pos)}</td>
        <td><b>${esc(q.piloto)}</b><small style="display:block;color:#666">${esc(q.equipo)}</small></td>
        <td class="mono">${esc(q.q1 || "—")}</td>
        <td class="mono">${esc(q.q2 || "—")}</td>
        <td class="mono">${esc(q.q3 || "—")}</td>
      </tr>`;
    }
    out += `</tbody></table>`;
  }

  if (!g.resultados.length && !g.clasificacion.length)
    out += '<p class="vacio">La carrera todavía no se corrió.</p>';

  return out;
}

/* ---------- cartelera de UFC ---------- */
async function htmlCartelera(e) {
  if (!e.idEspn) return '<p class="vacio">Este evento no tiene detalle disponible.</p>';

  const fecha = e.inicio.slice(0, 10).replace(/-/g, "");
  const c = await carteleraUFC({ id: e.idEspn, fecha });
  if (!c || !c.peleas.length)
    return '<p class="vacio">Todavía no se publicó la cartelera de este evento.</p>';

  let out = c.sede ? `<p class="ficha-partido"><b>${esc(c.sede)}</b></p>` : "";

  // Las primeras peleas son el plato fuerte; el resto, la preliminar.
  const PRINCIPALES = 5;
  const bloques = [
    ["EVENTO PRINCIPAL", c.peleas.slice(0, 1)],
    ["CARTELERA ESTELAR", c.peleas.slice(1, PRINCIPALES)],
    ["PRELIMINARES", c.peleas.slice(PRINCIPALES)],
  ];

  for (const [titulo, peleas] of bloques) {
    if (!peleas.length) continue;
    out += `<div class="grupo-pos">${titulo}</div>`;
    for (const f of peleas) {
      const [a, b] = f.peleadores;
      const pel = p => `
        <button class="pel ${p?.gana ? "gana" : ""}"${
          p?.id ? ` data-jug="mma/ufc/${esc(p.id)}"` : ""}>
          ${p?.bandera ? `<img class="pel-bandera" src="${esc(p.bandera)}" alt="" loading="lazy">` : ""}
          <span class="pel-nom">${esc(p?.nombre || "?")}</span>
          <span class="pel-rec">${esc(p?.record || "")}</span>
        </button>`;
      out += `
      <div class="pelea ${f.orden === 0 ? "estelar" : ""}">
        <div class="pelea-cat">${esc(f.categoria)}${f.rounds ? ` · ${f.rounds} asaltos` : ""}</div>
        <div class="pelea-cuerpo">
          ${pel(a)}<span class="pelea-vs">VS</span>${pel(b)}
        </div>
        ${f.terminado
          ? `<div class="pelea-res">Ganó <b>${esc(f.peleadores.find(x => x.gana)?.nombre || "—")}</b>${
              f.metodo ? " por " + esc(f.metodo) : ""}</div>`
          : `<div class="pelea-res pendiente">${esc(f.estado || "Por disputarse")}</div>`}
      </div>`;
    }
  }
  return out;
}

/* ================= PILOTO DE F1 ================= */
async function verPiloto(anio, driverId) {
  $("#vista").innerHTML = marcoDetalle("Piloto", "f1", cargandoHTML("Buscando la ficha…"), "#/f1/tabla");
  conectar();
  window.revelar($("#vista"));
  window.scrollTo({ top: 0, behavior: "instant" });

  const destino = $("#cuerpo-detalle");
  try {
    const p = await fichaPiloto(anio, driverId);
    if (!p) { destino.innerHTML = '<p class="vacio">No encontré la ficha de este piloto.</p>'; return; }

    $(".ventana-barra .tit").textContent = rotulo(p.nombre);

    const bandera = banderaPorNacionalidad(p.nacionalidad);
    const color = colorPorEscuderia(p.equipo);

    // La foto sale de la tabla del campeonato, que ya la trae.
    const enTabla = (EXTRA?.feeds?.f1?.posiciones?.filas || [])
      .find(x => x.driverId === driverId);
    const foto = enTabla?.foto || null;

    let out = `
    <div class="ficha-cabeza">
      ${foto
        ? `<img class="fc-foto" src="${esc(foto)}" alt="" loading="lazy" onerror="this.remove()">`
        : `<div class="fc-dorsal" style="background:${esc(color)};color:#fff">${esc(p.numero || p.codigo || "–")}</div>`}
      <div class="fc-datos">
        <h3>${esc(p.nombre)}</h3>
        <p class="fc-sub">
          ${bandera ? `<img class="fc-bandera" src="${esc(bandera)}" alt="" loading="lazy">` : ""}
          ${esc(p.nacionalidad)}
        </p>
        ${p.equipo ? `<p class="fc-eq"><i class="pastilla" style="background:${esc(color)}"></i>${esc(p.equipo)}</p>` : ""}
      </div>
    </div>

    <div class="grupo-pos">TEMPORADA ${anio}</div>
    <div class="datos-grilla">
      <div class="dg"><span>Puntos</span><b>${p.puntos}</b></div>
      <div class="dg"><span>Carreras</span><b>${p.carreras.length}</b></div>
      <div class="dg"><span>Victorias</span><b>${p.victorias}</b></div>
      <div class="dg"><span>Podios</span><b>${p.podios}</b></div>
      <div class="dg"><span>Abandonos</span><b>${p.abandonos}</b></div>
      ${p.nacimiento ? `<div class="dg"><span>Nacimiento</span><b>${esc(p.nacimiento)}</b></div>` : ""}
    </div>`;

    if (p.carreras.length) {
      out += `<div class="grupo-pos">CARRERA POR CARRERA</div>
      <table class="tabla"><thead><tr>
        <th class="num">R</th><th>GRAN PREMIO</th>
        <th class="num">SALE</th><th class="num">LLEGA</th>
        <th style="text-align:right">PTS</th>
      </tr></thead><tbody>`;
      for (const c of p.carreras) {
        const gano = +c.grilla - +c.posicion;
        out += `<tr class="${+c.posicion === 1 ? "mio" : ""}">
          <td class="num">${esc(c.ronda)}</td>
          <td><b>${esc(c.gp)}</b>
            <small style="display:block;color:#777">${esc(c.estado)}</small></td>
          <td class="num">${esc(c.grilla)}</td>
          <td class="num">${esc(c.posicion)}
            ${gano ? `<small class="${gano > 0 ? "sube" : "baja"}">${gano > 0 ? "▲" : "▼"}${Math.abs(gano)}</small>` : ""}</td>
          <td class="pts">${esc(c.puntos)}</td>
        </tr>`;
      }
      out += `</tbody></table>`;
    }

    destino.innerHTML = out;
    conectar();
    window.revelar(destino);
  } catch (err) {
    destino.innerHTML = `<p class="vacio">No se pudo cargar la ficha.<br><small>${esc(err.message)}</small></p>`;
  }
}

/* ================= TORNEO ================= */
async function verTorneo(ruta, liga) {
  // Nombre lindo: el que ya tenemos en el calendario para esa liga.
  const ev = (DATOS?.eventos || []).find(e => e.liga === liga);
  const titulo = ev?.competicion || liga;
  const volverA = ev ? "#/" + ev.feedId : "";

  $("#vista").innerHTML = marcoDetalle(titulo, ev?.sport, cargandoHTML("Buscando el torneo…"), volverA);
  conectar();
  window.revelar($("#vista"));
  window.scrollTo({ top: 0, behavior: "instant" });

  const destino = $("#cuerpo-detalle");
  try {
    const t = await infoTorneo(ruta, liga);
    let out = "";

    if (t.grupos.length) {
      out += `<p class="ficha-partido">${t.grupos.length === 1 ? "Tabla de posiciones"
        : t.grupos.length + " zonas"}</p>`;

      for (const g of t.grupos) {
        out += `<div class="grupo-pos">${esc(rotulo(g.nombre))}</div>
        <table class="tabla"><thead><tr>
          <th class="num">#</th><th>EQUIPO</th><th class="num">PJ</th>
          <th class="num">DG</th><th style="text-align:right">PTS</th>
        </tr></thead><tbody>`;
        for (const f of g.filas) {
          // Resaltamos a los equipos que seguís.
          const mio = (DATOS?.eventos || []).some(e =>
            e.liga === liga && (e.local === f.equipo || e.visitante === f.equipo) &&
            feedPorId(e.feedId));
          const esMio = misEquipos().some(n => f.equipo.includes(n));
          out += `<tr class="${esMio ? "mio" : ""}">
            <td class="num">${f.pos}</td>
            <td><div class="eq">${f.logo ? `<img src="${esc(f.logo)}" alt="" loading="lazy">` : ""}
              <span>${esc(f.equipo)}</span></div></td>
            <td class="num">${esc(f.pj ?? "—")}</td>
            <td class="num">${esc(f.dg ?? "—")}</td>
            <td class="pts">${esc(f.pts ?? "—")}</td>
          </tr>`;
        }
        out += `</tbody></table>`;
      }
    }

    // Sin tabla = eliminación directa. Mostramos los partidos que tenemos.
    const partidos = (DATOS?.eventos || [])
      .filter(e => e.liga === liga)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));

    if (!t.grupos.length) {
      out += `<p class="ficha-partido">Es una copa de eliminación directa:
        la fuente no publica tabla, así que va el fixture.</p>`;
    }
    if (partidos.length) {
      out += `<div class="grupo-pos">${t.grupos.length ? "TUS PARTIDOS" : "FIXTURE"}</div>`;
      out += listaPorMes(partidos);
    } else if (!t.grupos.length) {
      out += '<p class="vacio">Todavía no hay partidos de este torneo.</p>';
    }

    destino.innerHTML = out;
    conectar();
    window.revelar(destino);
  } catch (err) {
    destino.innerHTML = `<p class="vacio">No se pudo cargar el torneo.<br><small>${esc(err.message)}</small></p>`;
  }
}

// Nombres de los equipos que seguís, para resaltarlos en cualquier tabla.
function misEquipos() {
  return feedsActivos()
    .map(f => f.label)
    .filter(n => n && n.length > 3)
    .map(n => n.replace(/^Selección\s+/i, ""));
}

/* ================= FICHA DE JUGADOR ================= */
async function verJugador(ruta, liga, id) {
  $("#vista").innerHTML = marcoDetalle("Jugador", "acento", cargandoHTML("Buscando la ficha…"), "");
  conectar();
  window.revelar($("#vista"));
  window.scrollTo({ top: 0, behavior: "instant" });

  const destino = $("#cuerpo-detalle");
  try {
    const f = await fichaJugador(ruta, liga, id);
    if (!f) { destino.innerHTML = '<p class="vacio">No encontré la ficha de este jugador.</p>'; return; }

    $(".ventana-barra .tit").textContent = rotulo(f.nombre);

    // ESPN no manda foto en la ficha individual, pero el plantel sí la
    // trae (y le sumamos las de Wikipedia). La buscamos ahí.
    const guardada = Object.values(EXTRA?.feeds || {})
      .flatMap(x => x.plantel || [])
      .find(j => String(j.id) === String(id))?.foto;
    const retrato = f.foto || guardada || null;

    let out = `
    <div class="ficha-cabeza">
      ${retrato ? `<img class="fc-foto" src="${esc(retrato)}" alt="" loading="lazy"
                     onerror="this.remove()">`
                : `<div class="fc-dorsal">${esc(f.dorsal || "–")}</div>`}
      <div class="fc-datos">
        <h3>${esc(f.nombre)}</h3>
        <p class="fc-sub">
          ${f.bandera ? `<img class="fc-bandera" src="${esc(f.bandera)}" alt="" loading="lazy">` : ""}
          ${esc([f.pais, f.posicion].filter(Boolean).join(" · "))}
        </p>
        ${f.equipo ? `<p class="fc-eq">${esc(f.equipo)}</p>` : ""}
      </div>
    </div>`;

    const bio = [
      f.dorsal && ["Dorsal", "#" + f.dorsal],
      f.edad && ["Edad", f.edad + " años"],
      f.nacimiento && ["Nacimiento", f.nacimiento],
      f.altura && ["Altura", f.altura],
      f.peso && ["Peso", f.peso],
      f.estado && ["Estado", f.estado],
    ].filter(Boolean);
    if (bio.length) {
      out += `<div class="grupo-pos">DATOS</div><div class="datos-grilla">`;
      for (const [k, v] of bio) out += `<div class="dg"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
      out += `</div>`;
    }

    if (f.record.length) {
      out += `<div class="grupo-pos">RECORD</div><div class="datos-grilla">`;
      for (const r of f.record) out += `<div class="dg"><span>${esc(r.nombre)}</span><b>${esc(r.valor)}</b></div>`;
      out += `</div>`;
    }

    if (f.estadisticas.length) {
      out += `<div class="grupo-pos">TEMPORADA</div><div class="datos-grilla">`;
      for (const st of f.estadisticas)
        out += `<div class="dg"><span>${esc(st.nombre)}</span><b>${esc(st.valor)}</b></div>`;
      out += `</div>`;
    } else {
      out += `<p class="nota-fuente">ESPN no publica estadísticas de este jugador todavía.</p>`;
    }

    // Los peleadores de UFC sí tienen historial: ESPN lo guarda en
    // "eventsMap" dentro de la ficha del atleta.
    if (ruta === "mma") {
      try {
        const h = await historialPeleador(id);
        if (h?.peleas.length) {
          out += `<div class="grupo-pos">HISTORIAL · ${esc(h.resumen)}</div>
            <p class="ficha-partido">${h.peleas.length} peleas registradas${
              h.porTitulo ? ` · ${h.porTitulo} por el título` : ""}</p>
            <ol class="historial">`;
          for (const p of h.peleas) {
            const f = p.fecha ? partes(p.fecha) : null;
            out += `
            <li class="hp ${p.resultado === "W" ? "gano" : p.resultado === "L" ? "perdio" : ""}">
              <span class="hp-res">${esc(p.resultado || "?")}</span>
              <span class="hp-rival">${esc(p.rival)}${
                p.porTitulo ? ' <b class="hp-titulo">TITULO</b>' : ""}</span>
              <span class="hp-ev">${esc(p.evento)}</span>
              <span class="hp-fecha">${f ? f.day + "/" + f.month + "/" + f.year : ""}</span>
            </li>`;
          }
          out += `</ol>`;
        }
      } catch { /* si falla, la ficha se muestra igual sin historial */ }
    } else {
      out += `<p class="nota-fuente">La fuente no publica el palmarés ni los títulos ganados.</p>`;
    }

    destino.innerHTML = out;
    conectar();
    window.revelar(destino);
  } catch (err) {
    destino.innerHTML = `<p class="vacio">No se pudo cargar la ficha.<br><small>${esc(err.message)}</small></p>`;
  }
}

/* ================= INTERACCIÓN ================= */
function conectar() {
  $$("#vista .tarjeta").forEach(b => b.onclick = () => irA(b.dataset.id));

  // Abrir el detalle de un evento
  $$("#vista [data-ev]").forEach(b =>
    b.onclick = () => { location.hash = "#/e/" + encodeURIComponent(b.dataset.ev); });

  // Abrir la ficha de un jugador
  $$("#vista [data-jug]").forEach(b =>
    b.onclick = () => { location.hash = "#/j/" + b.dataset.jug; });

  // Abrir la ficha de un piloto de F1
  $$("#vista [data-piloto]").forEach(b =>
    b.onclick = () => { location.hash = "#/p/" + b.dataset.piloto; });

  // Abrir la información de un torneo
  $$("#vista [data-torneo]").forEach(b =>
    b.onclick = () => { location.hash = "#/t/" + b.dataset.torneo; });

  // Volver
  $$("#vista [data-volver]").forEach(b =>
    b.onclick = () => { location.hash = b.dataset.volver || ""; });
  $$("#vista .pest").forEach(b => b.onclick = () => {
    location.hash = "#/" + seccion + "/" + b.dataset.p;
  });

  clearInterval(relojId);
  const odo = $("#odo");
  if (odo) { pintarOdometro(odo); relojId = setInterval(() => pintarOdometro(odo), 1000); }
}

function pintarOdometro(el) {
  let s = Math.floor((new Date(el.dataset.inicio).getTime() - Date.now()) / 1000);

  // Ya empezó: mostramos que se está jugando en vez de un 00:00:00 muerto.
  if (s <= 0) {
    el.innerHTML = `<span class="jugando">● JUGANDOSE AHORA</span>`;
    return;
  }

  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600);  s %= 3600;
  const m = Math.floor(s / 60);    s %= 60;

  const grupo = (v, lbl) =>
    `<span class="odo-grupo">${String(v).padStart(2,"0").split("")
      .map(c => `<i class="odo-d">${c}</i>`).join("")}</span>`;

  el.innerHTML =
    (d > 0 ? grupo(d) + `<span class="odo-sep">:</span>` : "") +
    grupo(h) + `<span class="odo-sep">:</span>` +
    grupo(m) + `<span class="odo-sep">:</span>` + grupo(s) +
    `<span class="odo-lbl">${d > 0 ? "DIAS : HS : MIN : SEG" : "HS : MIN : SEG"}</span>`;
}

$("#btn-inicio").onclick = () => irA("inicio");

/* ================= NOTIFICACIONES ================= */
const b64aBytes = b64 => {
  const s = (b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const enStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

async function estadoNoti() {
  const btn = $("#btn-noti"), txt = $("#noti-txt");

  if (esIOS() && !enStandalone()) {
    txt.textContent = "INSTALAR";
    btn.onclick = () => mostrarAviso(
      "<b>Para recibir avisos en el iPhone</b>" +
      "Tocá Compartir en Safari → <b>Agregar a pantalla de inicio</b>. " +
      "Después abrí la app desde su ícono y volvé a tocar 🔔.", "", 14000);
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    txt.textContent = "N/D"; btn.disabled = true; return;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (sub && Notification.permission === "granted") {
    btn.classList.add("on");
    txt.textContent = "ACTIVOS";
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(sub));
        mostrarAviso("<b>Suscripción copiada</b>Sólo hace falta si querés reconfigurarla.", "ok");
      } catch {
        mostrarAviso("<b>Avisos activos</b>Te aviso 1 día antes, 1 hora antes, y los domingos el resumen de la semana.", "ok");
      }
    };
    return;
  }
  txt.textContent = "AVISOS";
  btn.onclick = activarNoti;
}

async function activarNoti() {
  const btn = $("#btn-noti");
  try {
    btn.disabled = true;
    if (await Notification.requestPermission() !== "granted") {
      mostrarAviso("<b>Permiso denegado</b>Habilitá las notificaciones en Ajustes.", "err");
      btn.disabled = false; return;
    }
    const key = await fetch("data/vapid-public.json?v=" + Date.now())
      .then(r => r.ok ? r.json() : null).catch(() => null);
    if (!key?.publicKey) {
      mostrarAviso("<b>Falta configurar el servidor</b>Ejecutá <code>npm run keys</code>.", "err", 12000);
      btn.disabled = false; return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: b64aBytes(key.publicKey),
    });
    let copiado = false;
    try { await navigator.clipboard.writeText(JSON.stringify(sub)); copiado = true; } catch {}
    mostrarAviso("<b>✅ Avisos activados</b>" + (copiado
      ? "Copié tu suscripción. Pegala en el secreto <code>PUSH_SUBSCRIPTION</code> de GitHub."
      : "Tocá 🔔 otra vez para copiar tu suscripción."), "ok", 15000);
    btn.disabled = false;
    estadoNoti();
  } catch (e) {
    mostrarAviso("<b>No se pudo activar</b>" + esc(e.message), "err", 10000);
    btn.disabled = false;
  }
}

/* ================= ARRANQUE ================= */
if ("serviceWorker" in navigator) {
  // Se registra con la versión en la URL: al cambiar, el navegador ve
  // un script distinto y lo instala enseguida, en vez de esperar a que
  // venza la caché. Así una publicación nueva llega sin trucos.
  const VERSION = (document.querySelector('script[src*="app.js?v="]')?.src
    .match(/v=(\d+)/) || [])[1] || "1";

  navigator.serviceWorker.register("../sw.js?v=" + VERSION, { scope: "../" }).then(reg => {
    estadoNoti();

    // Si publiqué una versión nueva, el service worker viejo seguiría
    // sirviendo la copia guardada. Al detectar el recambio, avisamos.
    reg.addEventListener("updatefound", () => {
      const nuevo = reg.installing;
      if (!nuevo) return;
      nuevo.addEventListener("statechange", () => {
        if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
          mostrarAviso(
            "<b>Hay una versión nueva</b>" +
            'Tocá <a href="#" id="recargar" style="color:#c1006e;font-weight:700">acá</a> para actualizar.',
            "ok", 0);
          const a = document.getElementById("recargar");
          if (a) a.onclick = e => { e.preventDefault(); location.reload(); };
        }
      });
    });

    // Revisa si hay versión nueva al abrir y al volver a la app.
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => { $("#noti-txt").textContent = "N/D"; });
} else {
  estadoNoti();
}
cargar();
