// Writes assets/atlas.png: 8x8 cells of 32px. Cells 0-62 are grayscale discs with transparent corners
// (so sprites exercise alpha blending), cell 63 is an opaque checker used as the cube texture.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 256, CELL = 32;
const px = Buffer.alloc(SIZE * SIZE * 4);

for (let i = 0; i < 64; i++) {
  const cx = (i % 8) * CELL, cy = Math.floor(i / 8) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const o = ((cy + y) * SIZE + cx + x) * 4;
    let v, a;
    if (i === 63) {
      v = ((x >> 3) + (y >> 3)) & 1 ? 255 : 150; a = 255;
    } else {
      const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy);
      const ring = 4 + (i % 7) * 1.5;               // each cell has a different inner ring
      v = Math.abs(d - ring) < 1.5 ? 140 : 255;
      a = d < 15 ? 255 : d < 16 ? Math.round((16 - d) * 255) : 0;
    }
    px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = a;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
const crc32 = buf => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);

mkdirSync(new URL('../assets/', import.meta.url), { recursive: true });
writeFileSync(new URL('../assets/atlas.png', import.meta.url), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
console.log('wrote assets/atlas.png');
