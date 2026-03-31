/**
 * Reads icons/suggestion.png and produces icon16/32/48/128.png
 * Pure Node.js, no npm deps.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG decode → RGBA Float32 ────────────────────────────────────────────────
function decodePNG(buf) {
  let pos = 8; // skip signature

  function readChunk() {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // skip CRC
    return { type, data };
  }

  let width, height, bitDepth, colorType;
  const idatChunks = [];

  while (pos < buf.length) {
    const { type, data } = readChunk();
    if (type === 'IHDR') {
      width     = data.readUInt32BE(0);
      height    = data.readUInt32BE(4);
      bitDepth  = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  // channels per pixel
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));

  // Paeth predictor
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }

  const stride = width * channels;
  const pixels = new Float32Array(width * height * 4); // output always RGBA [0..1]
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) row[i] = raw[y * (stride + 1) + 1 + i];

    // Un-filter
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filterType === 1) row[i] = (row[i] + a) & 0xFF;
      else if (filterType === 2) row[i] = (row[i] + b) & 0xFF;
      else if (filterType === 3) row[i] = (row[i] + ((a + b) >> 1)) & 0xFF;
      else if (filterType === 4) row[i] = (row[i] + paeth(a, b, c)) & 0xFF;
    }
    prev = new Uint8Array(row);

    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      if (channels === 3) {
        pixels[dst]     = row[x * 3]     / 255;
        pixels[dst + 1] = row[x * 3 + 1] / 255;
        pixels[dst + 2] = row[x * 3 + 2] / 255;
        pixels[dst + 3] = 1;
      } else if (channels === 4) {
        pixels[dst]     = row[x * 4]     / 255;
        pixels[dst + 1] = row[x * 4 + 1] / 255;
        pixels[dst + 2] = row[x * 4 + 2] / 255;
        pixels[dst + 3] = row[x * 4 + 3] / 255;
      } else { // grayscale
        const v = row[x] / 255;
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = v;
        pixels[dst + 3] = 1;
      }
    }
  }

  return { width, height, pixels };
}

// ── Lanczos 2-lobe kernel ────────────────────────────────────────────────────
function lanczos(x, a = 2) {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

// ── High-quality resize (separable Lanczos) ──────────────────────────────────
function resize(src, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH * 4);
  const a = 2; // Lanczos 2

  // Horizontal pass: srcW → dstW, height stays srcH
  const tmp = new Float32Array(dstW * srcH * 4);
  const scaleX = dstW / srcW;
  const supportX = scaleX < 1 ? a / scaleX : a;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) / scaleX - 0.5;
      const lo = Math.ceil(sx - supportX);
      const hi = Math.floor(sx + supportX);
      let r = 0, g = 0, b = 0, al = 0, wsum = 0;
      for (let kx = lo; kx <= hi; kx++) {
        const w = lanczos((sx - kx) * (scaleX < 1 ? scaleX : 1), a);
        const px2 = Math.max(0, Math.min(srcW - 1, kx));
        const i = (y * srcW + px2) * 4;
        r += src[i]     * w;
        g += src[i + 1] * w;
        b += src[i + 2] * w;
        al += src[i + 3] * w;
        wsum += w;
      }
      if (wsum > 0) { r /= wsum; g /= wsum; b /= wsum; al /= wsum; }
      const i2 = (y * dstW + x) * 4;
      tmp[i2] = r; tmp[i2+1] = g; tmp[i2+2] = b; tmp[i2+3] = al;
    }
  }

  // Vertical pass: srcH → dstH
  const scaleY = dstH / srcH;
  const supportY = scaleY < 1 ? a / scaleY : a;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sy = (y + 0.5) / scaleY - 0.5;
      const lo = Math.ceil(sy - supportY);
      const hi = Math.floor(sy + supportY);
      let r = 0, g = 0, b = 0, al = 0, wsum = 0;
      for (let ky = lo; ky <= hi; ky++) {
        const w = lanczos((sy - ky) * (scaleY < 1 ? scaleY : 1), a);
        const py = Math.max(0, Math.min(srcH - 1, ky));
        const i = (py * dstW + x) * 4;
        r += tmp[i]     * w;
        g += tmp[i + 1] * w;
        b += tmp[i + 2] * w;
        al += tmp[i + 3] * w;
        wsum += w;
      }
      if (wsum > 0) { r /= wsum; g /= wsum; b /= wsum; al /= wsum; }
      const i2 = (y * dstW + x) * 4;
      out[i2]     = Math.max(0, Math.min(1, r));
      out[i2 + 1] = Math.max(0, Math.min(1, g));
      out[i2 + 2] = Math.max(0, Math.min(1, b));
      out[i2 + 3] = Math.max(0, Math.min(1, al));
    }
  }
  return out;
}

// ── PNG encode ───────────────────────────────────────────────────────────────
function encodePNG(pixels, w, h) {
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.allocUnsafe(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcBuf]);
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0; // RGBA

  const raw = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (1 + w * 4) + 1 + x * 4;
      raw[d]   = Math.round(pixels[s]     * 255);
      raw[d+1] = Math.round(pixels[s + 1] * 255);
      raw[d+2] = Math.round(pixels[s + 2] * 255);
      raw[d+3] = Math.round(pixels[s + 3] * 255);
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level:9})), chunk('IEND', Buffer.alloc(0))]);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const src = decodePNG(fs.readFileSync(path.join(__dirname, 'icons/suggestion.png')));
console.log(`Source: ${src.width}×${src.height}`);

for (const size of [16, 32, 48, 128]) {
  const scaled = resize(src.pixels, src.width, src.height, size, size);
  const png = encodePNG(scaled, size, size);
  const out = path.join(__dirname, `icons/icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ icons/icon${size}.png`);
}
console.log('\nDone.');
