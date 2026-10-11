import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// Reproducible, dependency-free application icon used by the Windows resource.
const output = fileURLToPath(new URL('../icons/', import.meta.url));
const flame = [
  [0.52, 0.13],
  [0.55, 0.3],
  [0.69, 0.36],
  [0.79, 0.57],
  [0.74, 0.76],
  [0.59, 0.85],
  [0.41, 0.84],
  [0.27, 0.73],
  [0.23, 0.55],
  [0.3, 0.4],
  [0.36, 0.49],
  [0.44, 0.29],
];

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function colorAt(x, y) {
  const dx = Math.max(0.18 - x, 0, x - 0.82);
  const dy = Math.max(0.18 - y, 0, y - 0.82);
  if (dx * dx + dy * dy > 0.18 * 0.18) return [0, 0, 0, 0];
  if (insidePolygon(x, y, flame)) {
    const glow = ((x - 0.5) / 0.115) ** 2 + ((y - 0.68) / 0.17) ** 2 < 1;
    return glow ? [255, 217, 142, 255] : [249, 159, 96, 255];
  }
  return [25, 25, 37, 255];
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, bytes) {
  const content = Buffer.concat([Buffer.from(type), bytes]);
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length, 0);
  content.copy(result, 4);
  result.writeUInt32BE(crc32(content), result.length - 4);
  return result;
}

function png(size) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const sample = colorAt((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          for (let channel = 0; channel < 4; channel++) color[channel] += sample[channel] / 16;
        }
      }
      for (let channel = 0; channel < 4; channel++) {
        rows[y * (size * 4 + 1) + 1 + x * 4 + channel] = Math.round(color[channel]);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [32, 48, 128, 256];
const frames = sizes.map(png);
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, index) => {
  const base = 6 + index * 16;
  directory[base] = size % 256;
  directory[base + 1] = size % 256;
  directory.writeUInt16LE(1, base + 4);
  directory.writeUInt16LE(32, base + 6);
  directory.writeUInt32LE(frames[index].length, base + 8);
  directory.writeUInt32LE(offset, base + 12);
  offset += frames[index].length;
});
await mkdir(output, { recursive: true });
await writeFile(`${output}/icon.png`, frames[2]);
await writeFile(`${output}/icon.ico`, Buffer.concat([directory, ...frames]));
