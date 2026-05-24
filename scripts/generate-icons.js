/**
 * Generates solid-color PNG placeholder icons for the PWA manifest.
 * Uses only built-in Node.js modules — no npm packages required.
 *
 * Replace the output files with branded artwork before launch.
 * Run: node scripts/generate-icons.js
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

// Build a CRC-32 lookup table (PNG chunk integrity check)
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  }
  CRC_TABLE[i] = c
}

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function uint32BE(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const crcVal   = crc32(Buffer.concat([typeBytes, data]))
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crcVal)])
}

/**
 * Creates a minimal valid PNG filled with a single RGB colour.
 * Format: 8-bit depth, RGB colour type (2), no interlacing, filter=None.
 */
function solidPNG(width, height, r, g, b) {
  // PNG file signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width,  0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8]  = 8   // bit depth
  ihdr[9]  = 2   // colour type: RGB (no alpha)
  ihdr[10] = 0   // compression method
  ihdr[11] = 0   // filter method
  ihdr[12] = 0   // interlace method

  // Raw image data: each row starts with a 0x00 (filter=None) byte
  const rowBytes  = width * 3
  const rawLength = (rowBytes + 1) * height
  const raw       = Buffer.alloc(rawLength)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0 // filter byte
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3
      raw[px]     = r
      raw[px + 1] = g
      raw[px + 2] = b
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// Indigo #4f46e5 — matches theme_color in manifest.json
const R = 0x4F
const G = 0x46
const B = 0xE5

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons')
fs.mkdirSync(OUT_DIR, { recursive: true })

const icons = [
  { name: 'icon-192x192.png',    w: 192, h: 192 },
  { name: 'icon-512x512.png',    w: 512, h: 512 },
  { name: 'apple-touch-icon.png', w: 180, h: 180 },
]

for (const { name, w, h } of icons) {
  const filePath = path.join(OUT_DIR, name)
  fs.writeFileSync(filePath, solidPNG(w, h, R, G, B))
  console.log(`  ✓ ${filePath}`)
}

console.log('\nDone. Replace these placeholder icons with branded artwork before launch.')
