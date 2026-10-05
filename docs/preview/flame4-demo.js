#!/usr/bin/env node
// Blue-flame usage band v4: a more physical fire on a grid of 2 x 4 sub-pixels per terminal cell.
//  - flame is carried upward by a smooth wind field (value noise), so it sways and swirls instead of flickering
//  - fuel and cooling vary along the bar, which splits the fire into tongues of different heights
//  - soft edges: the thin fringe of the flame is stippled with an ordered dither
//  - sparks leave short fading trails; the gauge is a bed of glowing embers
//
// Run: node docs/preview/flame4-demo.js [--rows=4] [--mode=braille|quad]    (auto-stops after 40s, Ctrl+C to quit)
//   --rows   terminal rows of flame above the gauge (default 3, 2 is flatter, 5 or 6 more detailed)
// Draws on the alternate screen and fits the window width. Needs a window about 20 rows tall.

const args = process.argv.slice(2)
const arg = name => (args.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1]
const MODE = arg('mode') === 'quad' ? 'quad' : 'braille'
const FLAME_ROWS = Math.max(2, Math.min(8, Number(arg("rows")) || 3))
const COLS = process.stdout.columns || 80

const LABEL_W = 8
const BAR_COLS = Math.max(16, Math.min(46, COLS - LABEL_W - 8))
const ROWS = FLAME_ROWS + 1
const W = BAR_COLS * 2
const H = ROWS * 4
const BAR_H = 2
const FH = H - BAR_H // sub-pixel rows of flame

// ---- Noise ----------------------------------------------------------------------------------------
function hash(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function vnoise(x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

// ---- Colours --------------------------------------------------------------------------------------
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const BLUE = [[10, 4, 40], [18, 12, 100], [14, 40, 200], [20, 100, 255], [60, 175, 255], [150, 232, 255], [215, 248, 255], [255, 255, 255]]
const HOT = [[30, 6, 4], [100, 16, 8], [200, 44, 16], [250, 104, 24], [255, 168, 48], [255, 214, 100], [255, 240, 170], [255, 255, 240]]
function ramp(stops, h) {
  const p = Math.min(0.9999, Math.max(0, h)) * (stops.length - 1)
  const i = Math.floor(p)
  return mix(stops[i], stops[i + 1], p - i)
}
const palette = (pct, h) => mix(ramp(BLUE, h), ramp(HOT, h), Math.min(1, Math.max(0, (pct - 65) / 30)))

// ---- The fire ---------------------------------------------------------------------------------------
class Fire {
  constructor() {
    this.heat = Array.from({ length: FH }, () => new Float32Array(W))
    this.sparks = []
  }

  sample(row, x) {
    return row[Math.min(W - 1, Math.max(0, Math.round(x)))]
  }

  step(pct, t) {
    const { heat } = this
    const filled = Math.max(2, Math.round((pct / 100) * W))
    const f = 0.46 + 0.52 * (pct / 100) // how tall the flame gets, as a share of its room
    const ember = pct <= 0 ? 0 : 1
    // fuel: strong where the noise is high, with soft ends so the fire has a shape
    for (let x = 0; x < W; x++) {
      const end = Math.min(1, x / 3, (filled - 1 - x) / 3 + 0.35)
      const fuel = 0.4 + 0.95 * Math.pow(vnoise(x * 0.3, t * 2.6), 1.3)
      heat[FH - 1][x] = x < filled ? Math.max(0, Math.min(1.15, fuel * end * ember)) : 0
    }
    // carry the heat upward on a wind that sways more the higher it goes
    for (let y = FH - 2; y >= 0; y--) {
      const rise = (FH - 1 - y) / FH
      for (let x = 0; x < W; x++) {
        const wind = (vnoise(x * 0.12, y * 0.13 - t * 2.1) - 0.5) * 2.6 * (0.4 + 1.5 * rise)
        const below = this.sample(heat[y + 1], x + wind)
        const tongue = Math.pow(vnoise(x * 0.33, y * 0.1 - t * 3.4), 1.6)
        // the first few columns cool fast so no thin spike stands at the left edge of the bar
        const edge = 1 + 2.6 * Math.max(0, 1 - x / 7)
        const cool = (1 / (FH * f)) * (0.18 + 2.1 * tongue) * edge
        heat[y][x] = Math.max(0, below - cool + (Math.random() - 0.5) * 0.025)
      }
    }
    // sparks with short trails
    if (Math.random() < 0.1 + 0.35 * (pct / 100) && filled > 6) {
      this.sparks.push({ x: Math.random() * filled, y: FH * (0.35 + Math.random() * 0.2), vy: 0.35 + Math.random() * 0.55, vx: (Math.random() - 0.5) * 0.4, life: 1, trail: [] })
    }
    for (const s of this.sparks) {
      s.trail.push([s.x, s.y])
      if (s.trail.length > 4) s.trail.shift()
      s.y -= s.vy
      s.x += s.vx + (vnoise(s.x * 0.2, t * 2) - 0.5) * 0.5
      s.life -= 0.035
    }
    this.sparks = this.sparks.filter(s => s.life > 0 && s.y > -1)
    return filled
  }

  paint(canvas, pct, filled, t) {
    const { heat } = this
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < W; x++) {
        const v = heat[y][x]
        if (v < 0.05) continue
        // thin fringe: dither it so the edge fades softly instead of ending in a hard line
        if (v < 0.24 && v * 4.1 < (BAYER[y & 3][x & 3] + 0.5) / 16 * 1.0) continue
        canvas[y][x] = palette(pct, Math.min(1, v * 0.92))
      }
    }
    for (const s of this.sparks) {
      s.trail.forEach(([tx, ty], i) => {
        const x = Math.round(tx)
        const y = Math.round(ty)
        if (x >= 0 && x < W && y >= 0 && y < FH && !canvas[y][x]) canvas[y][x] = palette(pct, 0.3 + 0.25 * (i / 4) * s.life)
      })
      const x = Math.round(s.x)
      const y = Math.round(s.y)
      if (x >= 0 && x < W && y >= 0 && y < FH) canvas[y][x] = palette(pct, 0.6 + 0.4 * s.life)
    }
    // the gauge: a bed of glowing embers, brighter and hotter toward the leading edge
    for (let k = 0; k < BAR_H; k++) {
      const y = H - BAR_H + k
      for (let x = 0; x < W; x++) {
        if (x < filled) {
          const near = x / Math.max(1, filled - 1)
          const flick = vnoise(x * 0.45, t * 5 + k * 3)
          const lead = Math.max(0, 1 - (filled - 1 - x) / 6)
          const glow = 0.34 + 0.34 * near + 0.3 * flick + 0.3 * lead - k * 0.14
          canvas[y][x] = palette(pct, Math.min(1, Math.max(0.12, glow)))
        } else if (k === 0 && x % 4 < 2) {
          canvas[y][x] = [54, 56, 70]
        }
      }
    }
  }
}

// ---- Cells: at most two colours per cell, then the glyph that draws them --------------------------
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
  if (ranked.length === 1) return ranked[0] === null ? '\x1b[49m ' : `\x1b[38;2;${ranked[0].join(';')}m\x1b[49m█`
  const [A, B] = ranked
  let bitsA = 0
  let bitsB = 0
  for (const u of units) {
    if (dist(u.color, B) < dist(u.color, A)) bitsB |= u.bit
    else bitsA |= u.bit
  }
  const glyph = bits => (MODE === 'braille' ? String.fromCodePoint(0x2800 + bits) : QUAD[bits])
  const c = x => x.join(';')
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
const entries = [{ name: '5시간', pct: 8 }, { name: '주간', pct: 45 }, { name: '대화', pct: 92 }].map(e => ({ ...e, fire: new Fire() }))
const visible = s => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) >= 0xac00 && ch.charCodeAt(0) <= 0xd7a3 ? 2 : 1), 0)
const pad = s => s + ' '.repeat(Math.max(0, LABEL_W - visible(s)))

function frame(t) {
  const out = [`${DIM}불꽃 게이지 v4 (${MODE}, 불꽃 ${FLAME_ROWS}줄) : 8% / 45% / 92%${RESET}`]
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
  if (t > 40) { clearInterval(timer); stop() }
  process.stdout.write('\x1b[H' + frame(t).map(l => l + '\x1b[K').join('\n'))
}, 55)
