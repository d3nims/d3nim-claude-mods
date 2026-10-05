#!/usr/bin/env node
// Blue-flame usage band v3: the fire is simulated on a grid of 2 x 4 square sub-pixels per terminal cell, so tongues
// of flame, a glowing gauge line and rising sparks are far finer than the half-block version (flame2-demo.js).
//
//   --mode=braille   2 x 4 dots per cell: finest, but dots can look speckled in some fonts
//   --mode=quad      2 x 2 solid quarter blocks per cell: solid fills, half as fine vertically
//
// Run: node docs/preview/flame3-demo.js [--mode=braille|quad]      (auto-stops after 30s, Ctrl+C to quit)
// Draws on the alternate screen and fits the window width. Needs a window about 20 rows tall.

const args = process.argv.slice(2)
const modeArg = args.find(a => a.startsWith('--mode='))
const MODE = modeArg && modeArg.slice(7) === 'quad' ? 'quad' : 'braille'
const COLS = process.stdout.columns || 80

const LABEL_W = 8
const BAR_COLS = Math.max(16, Math.min(44, COLS - LABEL_W - 8))
const FLAME_ROWS = 2 // terminal rows of flame above the gauge line; the gauge line takes the bottom sub-pixel rows
const ROWS = FLAME_ROWS + 1
const W = BAR_COLS * 2 // sub-pixels across
const H = ROWS * 4 // sub-pixels tall
const BAR_H = 2 // the glowing gauge line is 2 sub-pixels thick

// ---- Colours --------------------------------------------------------------------------------------
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const BLUE = [[0, 0, 0], [4, 10, 70], [10, 30, 170], [20, 80, 255], [60, 170, 255], [150, 228, 255], [250, 254, 255]]
const HOT = [[0, 0, 0], [70, 12, 8], [190, 40, 16], [250, 100, 24], [255, 170, 50], [255, 226, 130], [255, 252, 238]]
function ramp(stops, h) {
  const p = Math.min(0.9999, Math.max(0, h)) * (stops.length - 1)
  const i = Math.floor(p)
  return mix(stops[i], stops[i + 1], p - i)
}
const palette = (pct, h) => mix(ramp(BLUE, h), ramp(HOT, h), Math.min(1, Math.max(0, (pct - 65) / 30)))

// ---- Fire on sub-pixels ---------------------------------------------------------------------------
class Fire {
  constructor() {
    this.fh = H - BAR_H // sub-pixel rows of flame above the gauge line
    this.heat = Array.from({ length: this.fh }, () => new Float32Array(W))
    this.sparks = []
  }

  step(pct, t) {
    const { heat, fh } = this
    const filled = Math.max(2, Math.round((pct / 100) * W))
    // average flame height as a share of the available height: low at low usage, tall near the limit
    const f = 0.5 + 0.48 * (pct / 100)
    const cool = (2 * 0.9) / (f * fh)
    // fuel varies along the gauge so the fire splits into separate tongues that drift and swell
    for (let x = 0; x < W; x++) {
      const wave = Math.sin(x * 0.55 + t * 3.2) * Math.sin(x * 0.21 - t * 2.1)
      const fuel = Math.min(1, Math.max(0.22, 0.62 + 0.45 * wave))
      heat[fh - 1][x] = x < filled ? fuel * (0.8 + Math.random() * 0.2) : 0
    }
    // now and then a tongue licks higher from a random spot
    if (Math.random() < 0.4 && filled > 4) {
      const tx = Math.floor(Math.random() * filled)
      for (let k = 0; k < 3; k++) heat[fh - 1][Math.min(W - 1, tx + k)] = 1.5
    }
    for (let y = 0; y < fh - 1; y++) {
      for (let x = 0; x < W; x++) {
        const dx = Math.floor(Math.random() * 3) - 1
        const sx = Math.min(W - 1, Math.max(0, x + dx))
        const below = (heat[y + 1][sx] + heat[y + 1][x] + heat[y + 1][Math.min(W - 1, x + 1)]) / 3
        heat[y][x] = Math.max(0, below - Math.random() * cool)
      }
    }
    // sparks: tiny bright points that drift upward and fade
    if (Math.random() < 0.18 + 0.4 * (pct / 100) && filled > 4) {
      this.sparks.push({ x: Math.random() * filled, y: fh - 2, vy: 0.25 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.3, life: 1 })
    }
    for (const s of this.sparks) { s.y -= s.vy; s.x += s.vx; s.life -= 0.045 }
    this.sparks = this.sparks.filter(s => s.life > 0 && s.y > -1)
    return filled
  }

  // fills the sub-pixel canvas (H rows of W colours or null)
  paint(canvas, pct, filled, t) {
    const { heat, fh } = this
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < W; x++) {
        const v = heat[y][x]
        if (v > 0.07) canvas[y][x] = palette(pct, Math.min(1, v))
      }
    }
    for (const s of this.sparks) {
      const x = Math.round(s.x)
      const y = Math.round(s.y)
      if (x >= 0 && x < W && y >= 0 && y < fh && !canvas[y][x]) canvas[y][x] = palette(pct, 0.55 + 0.4 * s.life)
    }
    // the gauge line: glowing, brightest at the leading edge, dim dots for what is still unused
    for (let k = 0; k < BAR_H; k++) {
      const y = H - BAR_H + k
      for (let x = 0; x < W; x++) {
        if (x < filled) {
          const near = x / Math.max(1, filled - 1)
          const lead = x > filled - 4 ? 1 : 0
          const glow = 0.3 + 0.5 * near + 0.1 * Math.sin(x * 0.6 - t * 9) + 0.25 * lead
          canvas[y][x] = palette(pct, Math.min(1, Math.max(0.18, glow - k * 0.12)))
        } else if (x % 4 < 2 && k === 0) {
          canvas[y][x] = [56, 58, 72]
        }
      }
    }
  }
}

// ---- Cells: at most two colours per cell, then the glyph that draws them ------------------------------
const BRAILLE_BIT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const dist = (a, b) => (a === null && b === null ? 0 : a === null || b === null ? 1e9 : (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

function cell(units) {
  const counts = new Map()
  for (const u of units) {
    const k = u.color ? u.color.join(',') : 'none'
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => (k === 'none' ? null : k.split(',').map(Number)))
  if (ranked.length === 1) {
    return ranked[0] === null ? '\x1b[49m ' : `\x1b[38;2;${ranked[0].join(';')}m\x1b[49m█`
  }
  const [A, B] = ranked
  let bitsA = 0
  let bitsB = 0
  for (const u of units) {
    if (dist(u.color, B) < dist(u.color, A)) bitsB |= u.bit
    else bitsA |= u.bit
  }
  const glyph = bits => (MODE === 'braille' ? String.fromCodePoint(0x2800 + bits) : QUAD[bits])
  const c = x => `${x.join(';')}`
  if (A === null) return `\x1b[38;2;${c(B)}m\x1b[49m${glyph(bitsB)}`
  if (B === null) return `\x1b[38;2;${c(A)}m\x1b[49m${glyph(bitsA)}`
  return `\x1b[38;2;${c(B)}m\x1b[48;2;${c(A)}m${glyph(bitsB)}`
}

function toLines(canvas) {
  const lines = []
  for (let r = 0; r < ROWS; r++) {
    let line = ''
    for (let x = 0; x < W; x += 2) {
      const units = []
      if (MODE === 'braille') {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) units.push({ bit: BRAILLE_BIT[dy][dx], color: canvas[r * 4 + dy][x + dx] })
      } else {
        for (let qy = 0; qy < 2; qy++) {
          for (let dx = 0; dx < 2; dx++) {
            const a = canvas[r * 4 + qy * 2][x + dx]
            const b = canvas[r * 4 + qy * 2 + 1][x + dx]
            units.push({ bit: 1 << (qy * 2 + dx), color: a && b ? (qy === 0 ? b : a) : a || b })
          }
        }
      }
      line += cell(units)
    }
    lines.push(line + '\x1b[0m')
  }
  return lines
}

// ---- Scene ---------------------------------------------------------------------------------------------
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const entries = [
  { name: '5시간', pct: 2 },
  { name: '주간', pct: 3 },
  { name: '대화', pct: 5 },
  { name: '5시간', pct: 45 },
  { name: '5시간', pct: 90 },
].map(e => ({ ...e, fire: new Fire() }))

const visible = s => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x1100 ? 2 : 1), 0)
const pad = s => s + ' '.repeat(Math.max(0, LABEL_W - visible(s)))

function frame(t) {
  const out = [`${DIM}불꽃 게이지 (${MODE}) : 2% / 3% / 5% / 45% / 90%${RESET}`]
  for (const e of entries) {
    const filled = e.fire.step(e.pct, t)
    const canvas = Array.from({ length: H }, () => Array(W).fill(null))
    e.fire.paint(canvas, e.pct, filled, t)
    const lines = toLines(canvas)
    const color = e.pct >= 90 ? '\x1b[38;2;255;120;60m' : e.pct >= 65 ? '\x1b[38;2;255;190;80m' : '\x1b[38;2;60;160;255m'
    lines.forEach((l, i) => {
      const left = i === 0 ? `${DIM}${pad(e.name)}${RESET}` : ' '.repeat(LABEL_W)
      const right = i === lines.length - 1 ? ` ${color}${String(e.pct).padStart(3, ' ')}%${RESET}` : ''
      out.push(left + l + right)
    })
  }
  return out
}

const start = Date.now()
process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[?7l')
const stop = () => { process.stdout.write('\x1b[?7h\x1b[?25h\x1b[?1049l'); process.exit(0) }
process.on('SIGINT', stop)

const timer = setInterval(() => {
  const t = (Date.now() - start) / 1000
  if (t > 30) { clearInterval(timer); stop() }
  process.stdout.write('\x1b[H' + frame(t).map(l => l + '\x1b[K').join('\n'))
}, 60)
