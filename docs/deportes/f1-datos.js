/* Datos de Fórmula 1 que ninguna de las dos APIs entrega junto:

   - Jolpica da la nacionalidad del piloto como adjetivo ("Italian"), no
     como código de país, así que hay que traducirla para poder mostrar
     la bandera.
   - ESPN no publica logos de escuderías (lo verifiqué: `logos` viene
     vacío para las 11), pero sí el color oficial de cada una. Se usa ese
     color como identificador visual.

   Los códigos y los colores están verificados uno por uno contra
   a.espncdn.com. */
"use strict";

// nacionalidad (como la escribe Jolpica) → código de país en ESPN
const PAISES = {
  Italian: "ita", British: "gbr", Monegasque: "mon", Dutch: "ned",
  Australian: "aus", French: "fra", "New Zealander": "nzl", Argentine: "arg",
  Brazilian: "bra", German: "ger", Spanish: "esp", Thai: "tha",
  Japanese: "jpn", Canadian: "can", Finnish: "fin", Mexican: "mex",
  American: "usa", Belgian: "bel", Danish: "den", Swiss: "sui",
  Austrian: "aut", Chinese: "chn", Russian: "rus", Polish: "pol",
  Swedish: "swe", Portuguese: "por", Colombian: "col", Indian: "ind",
  Venezuelan: "ven", Indonesian: "idn", Malaysian: "mas", "South African": "rsa",
};

export function banderaDePiloto(nacionalidad) {
  const cod = PAISES[nacionalidad];
  if (!cod) return null;
  // Sin pasar por el redimensionador de ESPN: con la carpeta de países
  // devuelve una imagen en blanco de 400 bytes. La original pesa 3 KB y
  // el navegador la reutiliza para todos los pilotos del mismo país.
  return `https://a.espncdn.com/i/teamlogos/countries/500/${cod}.png`;
}

// Colores oficiales, tal como los publica ESPN para cada escudería.
// Las claves cubren las dos formas de escribirlas: la de ESPN y la de
// Jolpica (que agrega "F1 Team" a varias).
const COLORES = {
  "mercedes": "#00D2BE",
  "ferrari": "#DC0000",
  "mclaren": "#FF8700",
  "red bull": "#00327D",
  "racing bulls": "#6692FF",
  "rb f1 team": "#6692FF",
  "rb": "#6692FF",
  "alpine": "#FFF500",
  "alpine f1 team": "#FFF500",
  "haas": "#5A5A5A",
  "haas f1 team": "#5A5A5A",
  "audi": "#FF2D00",
  "williams": "#FFFFFF",
  "aston martin": "#006F62",
  "cadillac": "#A2AAAD",
  "cadillac f1 team": "#A2AAAD",
};

export function colorDeEscuderia(nombre) {
  if (!nombre) return "#888";
  const k = nombre.toLowerCase().trim();
  if (COLORES[k]) return COLORES[k];
  // Coincidencia parcial: "Alpine F1 Team" cae en "alpine".
  for (const [clave, color] of Object.entries(COLORES))
    if (k.includes(clave) || clave.includes(k)) return color;
  return "#888";
}
