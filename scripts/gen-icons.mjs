// Genera los PNG del ícono sin dependencias externas (encoder PNG mínimo).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

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

// Cuatro cuadrantes con el color de cada deporte y un disco oscuro al centro.
const COLORES = [[34,197,94], [56,189,248], [239,68,68], [245,158,11]];
const FONDO = [15, 20, 32];

const dibujo = (x, y, size) => {
  const c = size / 2, dx = x - c + 0.5, dy = y - c + 0.5;
  const dist = Math.hypot(dx, dy);

  // Esquinas redondeadas (radio 22% como iOS)
  const r = size * 0.22, m = size * 0.5;
  const qx = Math.abs(dx) - (m - r), qy = Math.abs(dy) - (m - r);
  if (qx > 0 && qy > 0 && Math.hypot(qx, qy) > r) return [0, 0, 0, 0];

  const anillo = size * 0.34, hueco = size * 0.17;
  if (dist > anillo || dist < hueco) return [...FONDO, 255];

  // Ángulo → cuadrante de color, con transición suave entre vecinos
  let ang = Math.atan2(dy, dx) + Math.PI;           // 0..2π
  const seg = ang / (Math.PI / 2);                   // 0..4
  const i = Math.floor(seg) % 4, f = seg - Math.floor(seg);
  const a = COLORES[i], b = COLORES[(i + 1) % 4];
  const t = Math.min(1, Math.max(0, (f - 0.85) / 0.15)); // mezcla sólo cerca del borde
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
};

for (const size of [192, 512, 180]) {
  writeFileSync(new URL(`../docs/deportes/icons/icon-${size}.png`, import.meta.url), png(size, dibujo));
  console.log(`  ✓ icons/icon-${size}.png`);
}
