/* Efectos de fondo y movimiento.
   Todo procedural: ni una imagen, así la app sigue siendo liviana
   y funciona sin conexión. */
"use strict";

const SUAVE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- campo de estrellas ---------- */
(function estrellas() {
  const cv = document.getElementById("estrellas");
  if (!cv) return;
  const ctx = cv.getContext("2d", { alpha: false });

  let an = 0, al = 0, dpr = 1, capas = [];
  const COLORES = ["#ffffff", "#8fe9ff", "#ffd6f5", "#fff6a8"];

  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    an = cv.clientWidth; al = cv.clientHeight;
    cv.width = an * dpr; cv.height = al * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sembrar();
  }

  function sembrar() {
    // Menos estrellas en pantallas chicas: es un celular, no una consola.
    const total = Math.round(Math.min(150, (an * al) / 5200));
    capas = [];
    for (let i = 0; i < total; i++) {
      capas.push({
        x: Math.random() * an,
        y: Math.random() * al,
        r: Math.random() * 1.35 + .35,
        p: Math.random() * .55 + .18,             // profundidad → parallax
        c: COLORES[(Math.random() * COLORES.length) | 0],
        f: Math.random() * Math.PI * 2,           // fase del titileo
      });
    }
  }

  // Color de fondo según el equipo elegido, con la variable que pone la
  // app. Se relee cada cuadro: así el cambio se ve como un fundido.
  let fondoActual = null, fondoDestino = [5, 1, 15];
  function fondoDelTema() {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--tema-fondo").trim();
    const m = v.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) fondoDestino = [+m[1], +m[2], +m[3]];
    else if (/^#[0-9a-f]{6}$/i.test(v))
      fondoDestino = [1, 3, 5].map(i => parseInt(v.substr(i, 2), 16));

    if (!fondoActual) fondoActual = fondoDestino.slice();
    // Se acerca al destino de a poco: el cambio de color se ve fundido.
    for (let i = 0; i < 3; i++)
      fondoActual[i] += (fondoDestino[i] - fondoActual[i]) * 0.06;

    return `rgb(${fondoActual.map(Math.round).join(",")})`;
  }

  let desplaz = 0, objetivo = 0, t = 0, corriendo = true;

  function pintar() {
    if (!corriendo) return;
    // El fondo lo pinta este canvas, no el CSS: si acá quedara un negro
    // fijo, teñir el body no se vería. Lee el color del tema en curso.
    ctx.fillStyle = fondoDelTema();
    ctx.fillRect(0, 0, an, al);

    desplaz += (objetivo - desplaz) * .07;        // suavizado del parallax
    t += .03;

    for (const e of capas) {
      const y = (e.y - desplaz * e.p) % al;
      const yy = y < 0 ? y + al : y;
      const brillo = SUAVE ? .8 : .55 + Math.sin(t + e.f) * .45;
      ctx.globalAlpha = Math.max(.08, brillo);
      ctx.fillStyle = e.c;
      ctx.beginPath();
      ctx.arc(e.x, yy, e.r, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(pintar);
  }

  addEventListener("resize", medir, { passive: true });
  addEventListener("scroll", () => { objetivo = window.scrollY; }, { passive: true });

  // No gastamos batería con la app en segundo plano.
  document.addEventListener("visibilitychange", () => {
    corriendo = !document.hidden;
    if (corriendo) requestAnimationFrame(pintar);
  });

  medir();
  requestAnimationFrame(pintar);
})();

/* ---------- revelado al entrar en pantalla ----------
   El contenido es visible por defecto (ver .rev en el CSS). Sólo si
   podemos animar con garantías activamos el modo "anim", que lo esconde
   para revelarlo. Así, si algo del JS falla, la app se ve igual. */
const PUEDE_ANIMAR = !SUAVE && "IntersectionObserver" in window;
if (PUEDE_ANIMAR) document.documentElement.classList.add("anim");

let observador = null;

// Una vez que el elemento ya se revelo, le sacamos la clase "rev".
// Sin ella no queda ninguna regla que baje la opacidad, asi que el
// contenido queda visible aunque la transicion se haya trabado a medio
// camino (pasa en algunos navegadores y el costo seria no ver nada).
function asegurar(el) {
  setTimeout(() => {
    // Quitar la clase no alcanza: si la transición quedó congelada a
    // mitad de camino, su valor animado sigue pegado al elemento. Hay
    // que cortarla y fijar el estado final a mano.
    el.style.transition = "none";
    el.style.opacity = "1";
    el.style.transform = "none";
    el.style.transitionDelay = "";
    el.classList.remove("rev");
  }, 1000);
}

if (PUEDE_ANIMAR) {
  observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      const i = +(e.target.dataset.i || 0);   // escalonado
      e.target.style.transitionDelay = Math.min(i * 45, 400) + "ms";
      e.target.classList.add("visible");
      observador.unobserve(e.target);
      asegurar(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: .06 });
}

window.revelar = function (raiz) {
  const nodos = [...(raiz || document).querySelectorAll(".rev:not(.visible)")];
  if (!observador) { nodos.forEach(n => n.classList.remove("rev")); return; }
  nodos.forEach((n, i) => { n.dataset.i = i; observador.observe(n); });

  // Red de seguridad para los que nunca entraron en pantalla.
  // Cada llamada lleva SU propio temporizador: antes había uno solo y
  // compartido, así que una llamada posterior cancelaba el rescate de la
  // anterior y esos elementos se quedaban invisibles para siempre.
  setTimeout(() => {
    for (const n of nodos) {
      if (n.isConnected) { n.classList.add("visible"); asegurar(n); }
    }
  }, 1500);
};

/* ---------- red final ----------
   Cualquier elemento que siga escondido después de 2 s se muestra igual.
   El contenido nunca puede quedar invisible porque alguien se olvidó de
   llamar a revelar() o porque una transición se trabó. */
setInterval(() => {
  const ahora = Date.now();
  for (const n of document.querySelectorAll(".rev")) {
    if (!n.dataset.visto) { n.dataset.visto = String(ahora); continue; }
    if (ahora - (+n.dataset.visto) > 2000) { n.classList.add("visible"); asegurar(n); }
  }
}, 1000);

/* ---------- cambio de sección ----------
   Se usó startViewTransition y en algunos navegadores la transición
   quedaba colgada, dejando la página congelada a medio desvanecer.
   Un fundido propio hace lo mismo y no puede trabarse. */
window.transicion = function (pintarNuevo) {
  const vista = document.getElementById("vista");
  if (SUAVE || !vista) { pintarNuevo(); return; }

  vista.classList.add("saliendo");
  setTimeout(() => {
    pintarNuevo();
    vista.classList.remove("saliendo");
  }, 130);
};

/* ---------- contador de visitas (guiño noventoso, real) ---------- */
(function contador() {
  const cont = document.getElementById("contador-visitas");
  if (!cont) return;
  let n = 0;
  try {
    n = (+localStorage.getItem("visitas") || 0) + 1;
    localStorage.setItem("visitas", String(n));
  } catch { n = 1; }
  const txt = String(n).padStart(6, "0");
  cont.innerHTML = [...txt].map(d => `<i>${d}</i>`).join("");
  cont.title = `Abriste la app ${n} ${n === 1 ? "vez" : "veces"}`;
})();
