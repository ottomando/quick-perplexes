/**
 * Packages the extension into dist/ for Chrome and Firefox.
 * Pure Node.js, no npm deps. Run with: node build.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 ─────────────────────────────────────────────────────────────────────
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

// ── Minimal ZIP writer ────────────────────────────────────────────────────────
function writeU16LE(buf, offset, val) { buf.writeUInt16LE(val, offset); }
function writeU32LE(buf, offset, val) { buf.writeUInt32LE(val >>> 0, offset); }

function buildZip(entries) {
  // entries: [{ name: string, data: Buffer }]
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  const dosDate = dosDateTime(new Date()); // captured once for deterministic timestamps

  for (const { name, data } of entries) {
    const compressed = zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const nameBytes = Buffer.from(name, 'utf8');

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30 + nameBytes.length);
    writeU32LE(local,  0, 0x04034b50);           // signature
    writeU16LE(local,  4, 20);                    // version needed (2.0)
    writeU16LE(local,  6, 0);                     // flags
    writeU16LE(local,  8, 8);                     // compression: deflate
    writeU16LE(local, 10, dosDate.time);
    writeU16LE(local, 12, dosDate.date);
    writeU32LE(local, 14, crc);
    writeU32LE(local, 18, compressed.length);
    writeU32LE(local, 22, data.length);
    writeU16LE(local, 26, nameBytes.length);
    writeU16LE(local, 28, 0);                     // extra field length
    nameBytes.copy(local, 30);

    localHeaders.push(local, compressed);

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46 + nameBytes.length);
    writeU32LE(central,  0, 0x02014b50);          // signature
    writeU16LE(central,  4, 20);                  // version made by
    writeU16LE(central,  6, 20);                  // version needed
    writeU16LE(central,  8, 0);                   // flags
    writeU16LE(central, 10, 8);                   // compression: deflate
    writeU16LE(central, 12, dosDate.time);
    writeU16LE(central, 14, dosDate.date);
    writeU32LE(central, 16, crc);
    writeU32LE(central, 20, compressed.length);
    writeU32LE(central, 24, data.length);
    writeU16LE(central, 28, nameBytes.length);
    writeU16LE(central, 30, 0);                   // extra length
    writeU16LE(central, 32, 0);                   // comment length
    writeU16LE(central, 34, 0);                   // disk start
    writeU16LE(central, 36, 0);                   // internal attributes
    writeU32LE(central, 38, 0);                   // external attributes
    writeU32LE(central, 42, offset);              // local header offset
    nameBytes.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  writeU32LE(eocd,  0, 0x06054b50);              // end of central dir signature
  writeU16LE(eocd,  4, 0);                        // disk number
  writeU16LE(eocd,  6, 0);                        // disk with central dir
  writeU16LE(eocd,  8, entries.length);           // entries on disk
  writeU16LE(eocd, 10, entries.length);           // total entries
  writeU32LE(eocd, 12, centralDir.length);
  writeU32LE(eocd, 16, offset);                   // central dir offset
  writeU16LE(eocd, 20, 0);                        // comment length

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// ── Collect files ─────────────────────────────────────────────────────────────
function collectEntries() {
  const files = [
    'manifest.json',
    'background.js',
    'content.js',
    'overlay.css',
  ];
  const iconDir = path.join(__dirname, 'icons');
  const iconFiles = fs.readdirSync(iconDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => `icons/${f}`);

  const entries = [];
  for (const file of [...files, ...iconFiles]) {
    const data = fs.readFileSync(path.join(__dirname, file));
    entries.push({ name: file, data });
  }
  return entries;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const version = manifest.version;
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

const entries = collectEntries();
const zipBuf = buildZip(entries);

const targets = [
  `quick-perplexes-chrome-${version}.zip`,
  `quick-perplexes-firefox-${version}.zip`,
];

for (const name of targets) {
  const outPath = path.join(distDir, name);
  fs.writeFileSync(outPath, zipBuf);
  console.log(`✓ dist/${name}`);
}
console.log(`\n${entries.length} files packaged.`);
