/**
 * Generates the branded EduSen PWA app icons — a white columned-institution
 * mark on a Senegal-green plate — using ONLY built-in Node modules (zlib).
 * We deliberately avoid adding `sharp`/`canvas` just to rasterise icons.
 *
 * The output PNGs are committed to public/icons; re-run this only if the mark
 * changes. The school photo is intentionally never used as an app icon.
 *
 * Run: node scripts/generate-icons.js
 */

'use strict'

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Brand palette — matches the manifest theme_color and the design system.
const GREEN = [0x0f, 0x7a, 0x3f] // #0F7A3F
const GREEN_DARK = [0x05, 0x4d, 0x2c] // #054D2C — subtle vertical shade for depth
const WHITE = [0xff, 0xff, 0xff]

// ── CRC-32 (PNG chunk integrity) ──────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c
}
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function uint32BE(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const crcVal = crc32(Buffer.concat([typeBytes, data]))
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crcVal)])
}

// ── tiny RGBA canvas with source-over compositing ─────────────────────────────
function makeCanvas(size) {
  const px = new Uint8Array(size * size * 4) // transparent by default
  return {
    size,
    px,
    set(x, y, [r, g, b], a = 255) {
      x = Math.round(x)
      y = Math.round(y)
      if (x < 0 || y < 0 || x >= size || y >= size) return
      const i = (y * size + x) * 4
      const sa = a / 255
      const da = px[i + 3] / 255
      const oa = sa + da * (1 - sa)
      if (oa === 0) return
      const src = [r, g, b]
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round((px[i + c] * da * (1 - sa) + src[c] * sa) / oa)
      }
      px[i + 3] = Math.round(oa * 255)
    },
  }
}
function insideRounded(x, y, size, radius) {
  if (radius <= 0) return true
  const max = size - 1
  const rx = Math.min(Math.max(x, radius), max - radius)
  const ry = Math.min(Math.max(y, radius), max - radius)
  const dx = x - rx
  const dy = y - ry
  return dx * dx + dy * dy <= radius * radius
}
function fillRect(c, x0, y0, w, h, color) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) c.set(x, y, color)
}
// Isosceles pediment: apex at top-centre, base at bottom.
function fillPediment(c, cx, topY, bottomY, halfBase, color) {
  for (let y = Math.round(topY); y <= Math.round(bottomY); y++) {
    const t = (y - topY) / (bottomY - topY)
    const half = halfBase * t
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) c.set(x, y, color)
  }
}

// ── draw one icon ─────────────────────────────────────────────────────────────
// mode 'any'   -> rounded green plate, mark ~60%
//      'mask'  -> full-bleed green, mark ~46% (inside the Android safe zone)
//      'apple' -> full square green (iOS rounds corners itself), mark ~60%
function drawIcon(size, mode) {
  const c = makeCanvas(size)
  const radius = mode === 'any' ? Math.round(size * 0.22) : 0

  for (let y = 0; y < size; y++) {
    const t = y / size
    const plate = [
      Math.round(GREEN[0] * (1 - t) + GREEN_DARK[0] * t),
      Math.round(GREEN[1] * (1 - t) + GREEN_DARK[1] * t),
      Math.round(GREEN[2] * (1 - t) + GREEN_DARK[2] * t),
    ]
    for (let x = 0; x < size; x++) {
      if (!insideRounded(x, y, size, radius)) continue
      c.set(x, y, plate)
    }
  }

  // Columned facade (school / institution) in white.
  const scale = mode === 'mask' ? 0.46 : 0.6
  const bw = size * scale
  const bh = bw * 0.92
  const cx = size / 2
  const bx = cx - bw / 2
  const by = (size - bh) / 2

  const roofBottom = by + bh * 0.3
  fillPediment(c, cx, by, roofBottom, bw / 2, WHITE)

  const beamH = bh * 0.08
  fillRect(c, bx, roofBottom, bw, beamH, WHITE)

  const baseH = bh * 0.13
  const baseTop = by + bh - baseH
  const colTop = roofBottom + beamH + bh * 0.03
  const colBottom = baseTop - bh * 0.03
  const inset = bw * 0.08
  const usable = bw - inset * 2
  const nCols = 4
  const colW = usable * 0.13
  const gap = (usable - nCols * colW) / (nCols - 1)
  for (let i = 0; i < nCols; i++) {
    fillRect(c, bx + inset + i * (colW + gap), colTop, colW, colBottom - colTop, WHITE)
  }

  // Stylobate (base step), slightly wider than the facade.
  fillRect(c, bx - bw * 0.05, baseTop, bw * 1.1, baseH, WHITE)

  return c
}

// ── PNG encode (RGBA, 8-bit, filter=None) ─────────────────────────────────────
function encodePng(c) {
  const { size, px } = c
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // 10,11,12 already 0 (compression, filter, interlace)

  const rowBytes = size * 4
  const raw = Buffer.alloc((rowBytes + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0 // filter: none
    for (let i = 0; i < rowBytes; i++) raw[rowStart + 1 + i] = px[y * rowBytes + i]
  }
  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── emit ──────────────────────────────────────────────────────────────────────
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'icons')
fs.mkdirSync(OUT_DIR, { recursive: true })

const icons = [
  { name: 'icon-192x192.png', size: 192, mode: 'any' },
  { name: 'icon-512x512.png', size: 512, mode: 'any' },
  { name: 'icon-maskable-512x512.png', size: 512, mode: 'mask' },
  { name: 'apple-touch-icon.png', size: 180, mode: 'apple' },
]
for (const { name, size, mode } of icons) {
  const png = encodePng(drawIcon(size, mode))
  fs.writeFileSync(path.join(OUT_DIR, name), png)
  console.log(`  ✓ ${name} (${size}px, ${mode}, ${png.length}b)`)
}
console.log('\nDone — branded EduSen icons written to public/icons.')
