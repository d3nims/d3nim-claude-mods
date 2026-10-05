#!/usr/bin/env node
// Terrier usage meter preview: a small Bedlington Terrier runs along the gauge, the ground behind him burns blue.
// Position = usage. Under 80% he runs, from 80% he pants, at 97% he lies down and sleeps.
//
// The sprite is drawn on a grid of 2 x 4 square sub-pixels per terminal cell, so it can be shown two ways:
//   --mode=braille   2 x 4 dots per cell: finest, but the dots can look speckled in some fonts
//   --mode=quad      2 x 2 solid quarter blocks per cell: solid fills, half as fine vertically
//
// Build the sprite:  python3 docs/preview/build-terrier.py [--k=0.8] [--coat=blue|liver|sandy]
// Run:  node docs/preview/terry-demo.js [pct] [--mode=braille|quad]    pct holds a value; none = sweep 0 -> 100 -> 0
// Ctrl+C to quit. Draws on the alternate screen and fits the window width.

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const modeArg = args.find(a => a.startsWith('--mode='))
const MODE = modeArg && modeArg.slice(7) === 'quad' ? 'quad' : 'braille'
const fixedArg = args.find(a => /^\d+(\.\d+)?$/.test(a))
const fixed = fixedArg !== undefined ? Math.max(0, Math.min(100, Number(fixedArg))) : null
const COLS = process.stdout.columns || 80

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'terrier-frames.json'), 'utf8'))
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
const PAL = data.palette.map(hex)
const decode = rows => rows.map(row => [...row].map(c => (c === '.' ? null : PAL[data.alphabet.indexOf(c)])))
const SETS = Object.fromEntries(Object.entries(data.sets).map(([n, s]) => [n, { ...s, frames: s.frames.map(decode) }]))
const SH = SETS.run.frames[0].length // sub-pixel rows
const SWD = SETS.run.frames[0][0].length // sub-pixel columns
const TRACK = Math.max(20, Math.min(60, COLS - 14)) // terminal columns for the track
const TW = TRACK * 2 // sub-pixel width
// The ground is the lowest sub-pixel row any frame draws on
const GROUND = Math.max(
  ...Object.values(SETS).flatMap(set => set.frames.map(f => f.reduce((last, row, y) => (row.some(c => c) ? y : last), 0))),
)
const ROWS = Math.ceil((GROUND + 1) / 4) // no empty line under his paws

// ---- Colours ------------------------------------------------------------------------------------
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const BLUE = [[0, 0, 0], [8, 18, 90], [20, 60, 230], [50, 160, 255], [150, 225, 255], [245, 252, 255]]
const HOT = [[0, 0, 0], [90, 18, 8], [230, 60, 20], [255, 160, 40], [255, 225, 120], [255, 252, 235]]
function ramp(stops, h) {
  const p = Math.min(0.9999, Math.max(0, h)) * (stops.length - 1)
  const i = Math.floor(p)
  return mix(stops[i], stops[i + 1], p - i)
}
const palette = (pct, h) => mix(ramp(BLUE, h), ramp(HOT, h), Math.min(1, Math.max(0, (pct - 65) / 30)))
const noise = (x, t) => 0.5 + 0.28 * Math.sin(x * 0.95 + t * 7.3) + 0.14 * Math.sin(x * 0.35 - t * 4.1) + 0.08 * Math.sin(x * 1.65 + t * 11)

// ---- Cells: pick at most two colours per cell, then the glyph that draws them ---------------------
const BRAILLE_BIT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] // [row][col]
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█' // bits: 1 upper-left, 2 upper-right, 4 lower-left, 8 lower-right
const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

// units: [{ bit, color | null }]. Returns the escape sequence and glyph for one cell.
function cell(units) {
  const counts = new Map()
  for (const u of units) {
    const k = u.color ? u.color.join(',') : 'none'
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => (k === 'none' ? null : k.split(',').map(Number)))
  const A = ranked[0]
  const B = ranked.length > 1 ? ranked[1] : null
  if (ranked.length === 1 && A === null) return { glyph: ' ', seq: '\x1b[49m' }
  // A is the most common colour: it becomes the background; B (or the only colour) is drawn as the foreground
  let bg = A
  let fg = B
  if (ranked.length === 1) { bg = null; fg = A }
  if (bg === null || fg === null) { /* one side is the terminal background */ }
  let bits = 0
  for (const u of units) {
    if (ranked.length === 1) { bits |= u.bit; continue }
    const toA = u.color === null ? (A === null ? 0 : 1e9) : A === null ? 1e9 : dist(u.color, A)
    const toB = u.color === null ? (B === null ? 0 : 1e9) : B === null ? 1e9 : dist(u.color, B)
    if (toB < toA) bits |= u.bit
  }
  const glyph = MODE === 'braille' ? String.fromCodePoint(0x2800 + bits) : QUAD[bits]
  const fgSeq = fg ? `\x1b[38;2;${fg.join(';')}m` : ''
  const bgSeq = bg ? `\x1b[48;2;${bg.join(';')}m` : '\x1b[49m'
  // a cell whose set pixels would be drawn in the terminal background: invert so the foreground carries colour
  if (fg === null && bg) {
    const inv = MODE === 'braille' ? String.fromCodePoint(0x2800 + (0xff ^ bits)) : QUAD[0xf ^ bits]
    return { glyph: inv, seq: `\x1b[38;2;${bg.join(';')}m\x1b[49m` }
  }
  return { glyph, seq: fgSeq + bgSeq }
}

function toLines(canvas) {
  const lines = []
  const w = canvas[0].length
  const stepY = MODE === 'braille' ? 4 : 4 // both modes consume 4 sub-pixel rows per terminal row
  for (let r = 0; r < Math.ceil(canvas.length / stepY); r++) {
    let line = ''
    for (let x = 0; x < w; x += 2) {
      const units = []
      if (MODE === 'braille') {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) units.push({ bit: BRAILLE_BIT[dy][dx], color: canvas[r * 4 + dy]?.[x + dx] ?? null })
      } else {
        // 2 x 2 blocks: each quarter takes the colour of the more opaque of its two sub-pixel rows
        for (let qy = 0; qy < 2; qy++) {
          for (let dx = 0; dx < 2; dx++) {
            const a = canvas[r * 4 + qy * 2]?.[x + dx] ?? null
            const b = canvas[r * 4 + qy * 2 + 1]?.[x + dx] ?? null
            units.push({ bit: 1 << (qy * 2 + dx), color: a && b ? (qy === 0 ? b : a) : a || b })
          }
        }
      }
      const c = cell(units)
      line += c.seq + c.glyph
    }
    lines.push(line + '\x1b[0m')
  }
  return lines
}

// ---- Scene -----------------------------------------------------------------------------------------
function scene(frame, dogX, pct, t) {
  const canvas = Array.from({ length: ROWS * 4 }, () => Array(TW).fill(null))
  const front = Math.min(TW - 1, dogX + 18) // fire is lit up to under his chest
  for (let x = 0; x < TW; x++) {
    if (x > front) { if (x % 4 < 2) canvas[GROUND][x] = [58, 58, 70]; continue }
    const near = 1 - (front - x) / Math.max(16, front)
    const tall = Math.round(1 + 5 * noise(x, t) * (0.5 + 0.7 * near))
    for (let k = 0; k < tall; k++) {
      const heat = Math.max(0.12, Math.min(1, (0.35 + 0.6 * near) * (1 - k / (tall + 0.6)) + 0.1 * noise(x * 3, t)))
      canvas[GROUND - k][x] = palette(pct, heat)
    }
  }
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SWD; x++) {
      const c = frame[y][x]
      if (c && dogX + x >= 0 && dogX + x < TW) canvas[y][dogX + x] = c
    }
  }
  return toLines(canvas)
}

function pick(set, ms) {
  const total = set.durations.reduce((a, b) => a + b, 0)
  let m = ms % total
  for (let i = 0; i < set.durations.length; i++) {
    if (m < set.durations[i]) return i
    m -= set.durations[i]
  }
  return 0
}

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const start = Date.now()
process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[?7l')
const stop = () => { process.stdout.write('\x1b[?7h\x1b[?25h\x1b[?1049l'); process.exit(0) }
process.on('SIGINT', stop)

const timer = setInterval(() => {
  const ms = Date.now() - start
  const t = ms / 1000
  if (t > 40) { clearInterval(timer); stop() }
  const pct = fixed ?? Math.round(50 - 50 * Math.cos((t / 20) * Math.PI * 2))
  const dogX = Math.round(((TW - SWD + 6) * pct) / 100) - 4
  const set = pct >= 97 ? SETS.sleep : pct >= 80 ? SETS.pant : SETS.run
  const lines = scene(set.frames[pick(set, ms)], dogX, pct, t)
  const color = pct >= 90 ? '\x1b[38;2;255;120;60m' : pct >= 65 ? '\x1b[38;2;255;190;80m' : '\x1b[38;2;60;160;255m'
  const mood = pct >= 97 ? ' zZ' : pct >= 80 ? ' 헥헥' : ''
  lines[Math.floor(ROWS / 4)] += `  ${DIM}5시간${RESET} ${color}${String(pct).padStart(3, ' ')}%${RESET}${mood}`
  process.stdout.write('\x1b[H' + lines.map(l => l + '\x1b[K').join('\n'))
}, 70)
