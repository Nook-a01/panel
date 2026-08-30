/* ─────────────────────────────────────────────────────────────
   La portada del Panel.

   Hace tres cosas:
     1. la fecha de arriba
     2. el fondo que respira
     3. el dato vivo de cada tira (próximo partido, plata libre…)

   Regla que se respeta en todo el archivo: si algo falla, la tira
   se ve igual. Ningún dato de adorno puede dejar la página en blanco.
   ───────────────────────────────────────────────────────────── */

const QUIETO = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = s => document.querySelector(s);

/* ── 1. fecha ─────────────────────────────────────────────── */
{
  const hoy = new Date();
  const txt = new Intl.DateTimeFormat("es-AR", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(hoy);
  $("#fecha").textContent = txt;
}

/* ── 2. entrada escalonada ────────────────────────────────────
   Cada tira aparece 70 ms después de la anterior. El barrido
   completo dura medio segundo, que es lo que tarda en enfocarse
   la vista según la referencia de Apple.

   El seguro: pase lo que pase, al segundo están todas visibles.
   Una transición que se congela a mitad de camino deja la página
   vacía, y eso ya nos pasó. */
{
  const tiras = [...document.querySelectorAll(".tira")];
  tiras.forEach((t, i) => {
    t.style.transitionDelay = QUIETO ? "0ms" : (i * 70) + "ms";
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("entro")));
  });
  setTimeout(() => {
    for (const t of tiras) {
      t.classList.add("entro");
      t.style.transitionDelay = "";
      t.style.opacity = "1";
      t.style.transform = "";
    }
  }, 1000);
}

/* ── 3. el fondo ──────────────────────────────────────────────
   Una grilla de puntos que se desplaza muy despacio y se aclara
   cerca del puntero. En el celular no hay puntero, así que sólo
   se desplaza. Se apaga sola si el sistema pide menos movimiento
   o si la pestaña no está a la vista (no tiene sentido gastar
   batería dibujando algo que nadie mira). */
if (!QUIETO) {
  const cv = $("#fondo");
  const ctx = cv.getContext("2d", { alpha: true });
  let an = 0, ancho = 0, alto = 0, dpr = 1;
  const raton = { x: -1e4, y: -1e4 };

  const PASO = 34;      // separación entre puntos
  const RADIO = 130;    // hasta dónde llega el aura del puntero

  function medir() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    ancho = cv.clientWidth; alto = cv.clientHeight;
    cv.width = Math.round(ancho * dpr);
    cv.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dibujar(t) {
    ctx.clearRect(0, 0, ancho, alto);
    // El desplazamiento es lentísimo a propósito: se nota que está
    // vivo, pero no compite con el contenido.
    const desv = (t / 90) % PASO;
    for (let y = -PASO; y < alto + PASO; y += PASO) {
      for (let x = -PASO; x < ancho + PASO; x += PASO) {
        const px = x + desv, py = y + desv * .5;
        const dx = px - raton.x, dy = py - raton.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const cerca = d < RADIO ? 1 - d / RADIO : 0;
        const a = .1 + cerca * .5;
        const r = .8 + cerca * 1.5;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, 6.284);
        ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.fill();
      }
    }
    an = requestAnimationFrame(dibujar);
  }

  function arrancar() { if (!an) an = requestAnimationFrame(dibujar); }
  function parar() { if (an) { cancelAnimationFrame(an); an = 0; } }

  addEventListener("resize", medir);
  addEventListener("pointermove", e => { raton.x = e.clientX; raton.y = e.clientY; }, { passive: true });
  addEventListener("pointerleave", () => { raton.x = raton.y = -1e4; });
  document.addEventListener("visibilitychange", () => document.hidden ? parar() : arrancar());

  medir();
  arrancar();
}

/* ── 4. los datos vivos ───────────────────────────────────── */

const plata = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 0,
});

function poner(sel, html) {
  const el = document.querySelector(sel);
  if (el) el.innerHTML = html;
}

/* Deportes: el próximo evento del calendario que ya baja la app. */
(async () => {
  try {
    const r = await fetch("deportes/data/events.json", { cache: "no-cache" });
    if (!r.ok) return;
    const { eventos } = await r.json();
    if (!Array.isArray(eventos)) return;

    const ahora = Date.now();
    const prox = eventos
      .filter(e => new Date(e.inicio).getTime() > ahora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    if (!prox) return;

    const cuando = new Date(prox.inicio);
    const faltan = cuando.getTime() - ahora;
    const horas = faltan / 3600e3;

    const f = new Intl.DateTimeFormat("es-AR", {
      weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "America/Argentina/Buenos_Aires",
    }).format(cuando);

    const etiqueta = horas < 1  ? "ya empieza"
                   : horas < 24 ? "hoy"
                   : horas < 48 ? "mañana"
                   : f;

    const titulo = prox.titulo.length > 34 ? prox.titulo.slice(0, 33) + "…" : prox.titulo;
    poner("#vivo-deportes",
      (prox.emoji || "") + " " + escapar(titulo) +
      ' <span class="mini">' + escapar(etiqueta) + "</span>");
  } catch { /* sin conexión: la tira queda igual, sin la línea */ }
})();

/* Plata: el resumen que la app deja guardado al cerrar. Vive en
   el mismo dominio, así que se lee directo. */
(() => {
  try {
    const crudo = localStorage.getItem("plata-en-mano-v1-resumen");
    if (!crudo) return;
    const r = JSON.parse(crudo);
    if (typeof r.libre !== "number") return;
    const dias = r.diasHasta ? ' <span class="mini">cobrás en ' + r.diasHasta + " d</span>" : "";
    poner("#vivo-plata", "Libre: " + plata.format(r.libre) + dias);
  } catch {}
})();

/* Campamento: en qué día del plan estás.

   La cuenta la hace la propia sección y la deja guardada acá al abrirla.
   Si todavía no la abriste en este teléfono, la sacamos de la misma
   fecha de arranque que usa ella (13 de agosto de 2026, día 1), que es
   el único dato que define el plan. */
(() => {
  try {
    const ARRANQUE = new Date(2026, 7, 13);
    let dia = Number(localStorage.getItem("campamento-dia"));
    if (!Number.isFinite(dia) || dia < 1) {
      const hoy = new Date();
      const aMedianoche = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      dia = Math.floor((aMedianoche(hoy) - aMedianoche(ARRANQUE)) / 86400e3) + 1;
    }
    if (dia < 1) return;
    if (dia > 30) { poner("#vivo-campamento", "Plan terminado ✓"); return; }
    poner("#vivo-campamento",
      "Día " + dia + " de 30" +
      ' <span class="mini">semana ' + Math.ceil(dia / 7) + "</span>");
  } catch {}
})();

function escapar(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
