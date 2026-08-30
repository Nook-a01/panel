// Fotos de jugadores y pilotos.
//
// ESPN tiene pocas: 2 de 49 en Boca, 15 de 23 pilotos. Wikipedia tiene
// casi todas, así que se usa como segunda fuente.
//
// El riesgo de buscar por nombre es traer a otra persona (hay muchos
// "Juan Pérez"). Por eso se comprueba que la descripción del artículo
// hable de deporte antes de aceptar la foto.

const UA = { "User-Agent": "MisDeportes/1.0 (proyecto personal)" };

// Palabras que confirman que el artículo es de un deportista.
const ES_DEPORTISTA = /futbolist|jugador|piloto|deportist|rugby|entrenador|arquero|delanter|defensor|mediocampist|automovilis|luchador|peleador/i;

async function resumenWiki(titulo, idioma) {
  try {
    const r = await fetch(
      `https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`,
      { headers: UA, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Busca el artículo por nombre y devuelve el título más probable.
async function buscarWiki(nombre, idioma, pista) {
  try {
    const q = encodeURIComponent(`${nombre} ${pista}`);
    const r = await fetch(
      `https://${idioma}.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${q}&srlimit=3&format=json&origin=*`,
      { headers: UA, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.query?.search?.[0]?.title || null;
  } catch {
    return null;
  }
}

/**
 * Devuelve la URL de una foto, o null.
 * @param {string} nombre  Nombre completo de la persona
 * @param {string} pista   Contexto para desambiguar ("futbolista", "piloto")
 */
export async function fotoDe(nombre, pista = "futbolista") {
  if (!nombre || nombre.length < 4) return null;

  const intentos = Array.isArray(pista) ? pista : [pista];

  for (const idioma of ["es", "en"]) {
    // 1) Probamos el nombre tal cual: es lo más rápido y suele acertar.
    let d = await resumenWiki(nombre.replace(/ /g, "_"), idioma);

    // 2) Si no hay artículo, o es una desambiguación, o no parece
    //    deportista, buscamos con la pista.
    const sirve = d && d.type !== "disambiguation" &&
                  ES_DEPORTISTA.test((d.description || "") + " " + (d.extract || ""));

    if (!sirve) {
      // Se prueba con cada pista: primero la más específica (el club),
      // después la genérica. Con homónimos el club es lo que decide.
      d = null;
      for (const p of intentos) {
        const titulo = await buscarWiki(nombre, idioma, p);
        if (!titulo) continue;
        const cand = await resumenWiki(titulo.replace(/ /g, "_"), idioma);
        if (!cand || cand.type === "disambiguation") continue;
        if (!ES_DEPORTISTA.test((cand.description || "") + " " + (cand.extract || ""))) continue;
        d = cand;
        break;
      }
      if (!d) continue;
    }

    const foto = d.thumbnail?.source || d.originalimage?.source;
    if (foto) return foto;
  }
  return null;
}

/**
 * Completa las fotos que falten en una lista, sin repetir consultas.
 * Va de a tandas para no golpear a Wikipedia de golpe.
 */
export async function completarFotos(lista, pista, log = () => {}) {
  // En la tabla de F1 el nombre del piloto vive en `equipo` (la columna
  // se comparte con las tablas de fútbol), así que se aceptan los dos.
  const nombreDe = x => x.nombre || x.equipo || "";
  const faltan = lista.filter(x => !x.foto && nombreDe(x));
  if (!faltan.length) return 0;

  let puestas = 0;
  const TANDA = 6;

  for (let i = 0; i < faltan.length; i += TANDA) {
    const tanda = faltan.slice(i, i + TANDA);
    const fotos = await Promise.all(tanda.map(x => fotoDe(nombreDe(x), pista).catch(() => null)));
    tanda.forEach((x, n) => {
      if (fotos[n]) { x.foto = fotos[n]; x.fotoDeWiki = true; puestas++; }
    });
  }

  log(`   · fotos de Wikipedia: +${puestas} de ${faltan.length} que faltaban`);
  return puestas;
}
