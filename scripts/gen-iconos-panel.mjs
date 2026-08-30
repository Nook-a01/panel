// Ícono del Panel: cuatro baldosas, una por sección, con el color exacto
// de cada una. Es el mismo mapa que ves al abrir la portada.
// Sin dependencias: el encoder PNG está acá abajo.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; }
  return t;
})();
const crc32 = buf => { let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const FONDO = [13, 13, 16];          // el papel de la portada
const BALDOSAS = [
  [0x6c, 0xbd, 0xf2],   // deportes
  [0x0a, 0x7a, 0x6c],   // plata
  [0xc1, 0x35, 0x84],   // instagram
  [0xff, 0x9a, 0x4d],   // campamento
];

// Distancia a un rectángulo de esquinas redondeadas: negativa adentro.
function distRedondeado(px, py, mitad, radio) {
  const qx = Math.abs(px) - mitad + radio;
  const qy = Math.abs(py) - mitad + radio;
  const fuera = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return fuera + Math.min(Math.max(qx, qy), 0) - radio;
}

const dibujo = (x, y, size) => {
  const c = size / 2;
  const dx = x - c + 0.5, dy = y - c + 0.5;

  // Recorte exterior con esquinas al 22%, como los íconos de iOS.
  if (distRedondeado(dx, dy, size * 0.5, size * 0.22) > 0) return [0, 0, 0, 0];

  const margen = size * 0.20;   // aire alrededor del bloque de baldosas
  const hueco  = size * 0.055;  // separación entre baldosas
  const lado   = (size - margen * 2 - hueco) / 2;
  const radio  = lado * 0.26;

  for (let i = 0; i < 4; i++) {
    const col = i % 2, fila = i >> 1;
    const cx = margen + col * (lado + hueco) + lado / 2;
    const cy = margen + fila * (lado + hueco) + lado / 2;
    const d = distRedondeado(x + 0.5 - cx, y + 0.5 - cy, lado / 2, radio);

    if (d <= 0) return [...BALDOSAS[i], 255];

    // Borde suavizado: un pixel de transición para que no quede dentado.
    if (d < 1) {
      const t = 1 - d;
      const b = BALDOSAS[i];
      return [
        Math.round(FONDO[0] + (b[0] - FONDO[0]) * t),
        Math.round(FONDO[1] + (b[1] - FONDO[1]) * t),
        Math.round(FONDO[2] + (b[2] - FONDO[2]) * t),
        255,
      ];
    }
  }
  return [...FONDO, 255];
};

mkdirSync(new URL("../docs/iconos/", import.meta.url), { recursive: true });
for (const size of [32, 180, 192, 512]) {
  writeFileSync(new URL(`../docs/iconos/panel-${size}.png`, import.meta.url), png(size, dibujo));
  console.log(`  ✓ iconos/panel-${size}.png`);
}
