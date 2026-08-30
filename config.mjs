// ============================================================
//  MIS DEPORTES — configuración
//  Editá este archivo para agregar / quitar equipos o avisos.
// ============================================================

export const CONFIG = {
  // Zona horaria en la que querés ver y recibir todo.
  // Ej: "America/Argentina/Buenos_Aires", "America/Mexico_City", "Europe/Madrid"
  timezone: "America/Argentina/Buenos_Aires",

  // Contacto que exige el estándar de Web Push: los servidores de Apple/Google
  // lo usan sólo para avisarte si algo falla con tus envíos.
  // Se usa la URL del repo en vez de un email porque el repo es público
  // (si preferís que te escriban, poné "mailto:tu@correo.com").
  contacto: "https://github.com/Nook-a01/panel",

  // Cuántos meses hacia adelante traer (y 1 mes hacia atrás, para ver resultados recientes).
  monthsAhead: 12,

  // Cuándo avisarte antes de cada evento. Podés poner los que quieras.
  //   { hours: 24 }  -> un día antes
  //   { hours: 1 }   -> una hora antes
  avisos: [
    { hours: 24, etiqueta: "mañana" },
    { hours: 1,  etiqueta: "en 1 hora" },
  ],

  // Los intereses. Poné activo:false para silenciar uno sin borrarlo.
  feeds: [
    {
      id: "boca",
      label: "Boca Juniors",
      sport: "futbol",
      emoji: "⚽",
      color: "#f2c400",   // el amarillo de la camiseta
      escudo: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/5.png&h=120&w=120",
      activo: true,
      source: "espn-soccer",
      // Ligas de ESPN donde juega. Agregá más si clasifica a otras copas.
      leagues: ["arg.1", "conmebol.libertadores", "conmebol.sudamericana", "arg.copa"],
      matchTeamId: "5",          // id de Boca en ESPN
      matchName: /boca juniors/i, // respaldo si falta el id
    },
    {
      id: "argentina",
      label: "Selección Argentina",
      sport: "futbol",
      emoji: "🇦🇷",
      color: "#6cbdf2",   // el celeste
      escudo: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/countries/500/arg.png&h=120&w=120",
      activo: true,
      source: "espn-soccer",
      leagues: ["fifa.world", "fifa.friendly", "fifa.worldq.conmebol", "conmebol.america", "fifa.finalissima"],
      matchTeamId: "202",
      matchName: /\bargentina\b/i,
    },
    {
      id: "intermiami",
      label: "Inter Miami",
      sport: "futbol",
      emoji: "🩷",
      color: "#f7b5cd",   // el rosa del club
      escudo: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/20232.png&h=120&w=120",
      activo: true,
      source: "espn-soccer",
      leagues: ["usa.1", "usa.open", "concacaf.champions", "concacaf.leagues.cup"],
      matchTeamId: "20232",
      matchName: /inter miami/i,
    },
    {
      id: "pumas",
      label: "Los Pumas",
      sport: "rugby",
      emoji: "🏉",
      color: "#38d0ff",   // el celeste de Los Pumas
      escudo: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/rugby/teams/500/10.png&h=120&w=120",
      activo: true,
      source: "espn-rugby",
      // 289234 = International Test Match (ahí juega el Rugby Championship y las ventanas)
      leagues: ["289234", "164205", "244293"],
      matchName: /\bargentina\b/i,
    },
    {
      id: "f1",
      label: "Fórmula 1",
      sport: "f1",
      emoji: "🏎️",
      color: "#ff2d2d",   // el rojo de la Fórmula 1
      escudo: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/f1.png&h=120&w=120",
      activo: true,
      source: "jolpica-f1",
      // Trae carrera + clasificación + sprint de cada Gran Premio.
      incluirSesiones: true,
    },
    {
      id: "ufc",
      label: "UFC",
      sport: "ufc",
      emoji: "🥊",
      color: "#ffb300",   // el ámbar de UFC
      escudo: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/ufc.png&h=120&w=120",
      activo: true,
      source: "espn-mma",
      // Sólo los eventos grandes: numerados (UFC 330), Fight Night y
      // Noche UFC. Se descarta Contender Series, que son peleas de
      // prueba para conseguir contrato, no cartelera.
      excluirTitulo: /contender series/i,
      leagues: ["ufc"],
    },
  ],
};

// El emoji de cada feed queda como respaldo: si el escudo no carga
// (sin internet la primera vez, o si ESPN cambia la ruta), se muestra él.

export const SPORTS = {
  futbol: { label: "Fútbol", color: "#22c55e" },
  rugby:  { label: "Rugby",  color: "#38bdf8" },
  f1:     { label: "F1",     color: "#ef4444" },
  ufc:    { label: "UFC",    color: "#f59e0b" },
};
