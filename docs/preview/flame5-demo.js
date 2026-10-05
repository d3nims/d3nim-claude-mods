#!/usr/bin/env node
// Blue-flame usage band v5: ONE compact band, three flames side by side (5시간 | 주간 | 대화), each in its own cell of the
// row. Same fire as flame4-demo.js, drawn on 2 x 4 sub-pixels per terminal cell.
//
//   rows 1..N   the flames, each over its own glowing gauge line (N = --rows, default 2)
//   last row    labels and percentages
//
// Run: node docs/preview/flame5-demo.js [--rows=2] [--mode=braille|quad] [--pct=38,71,93] [--sweep]
//   --pct     the three values to show (5시간, 주간, 대화). Default 38,71,93 so every colour state is visible.
//   --sweep   instead, move all three up and down so you can watch the flames grow
// Auto-stops after 40s, Ctrl+C to quit. Draws on the alternate screen and fits the window width.

const args = process.argv.slice(2)
const arg = name => (args.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1]
const MODE = arg('mode') === 'quad' ? 'quad' : 'braille'
const FLAME_ROWS = Math.max(1, Math.min(6, Number(arg('rows')) || 2))
const SWEEP = args.includes('--sweep')
const FIXED = (arg('pct') || '38,71,93').split(',').map(Number)
const COLS = process.stdout.columns || 80

// ---- Layout: three cells with a small gap -------------------------------------------------------------
const GAP = 3
const USABLE = Math.max(36, Math.min(110, COLS - 2))
const W5 = Math.max(14, Math.floor((USABLE - 2 * GAP) * 0.4))
const W2 = Math.max(10, Math.floor((USABLE - 2 * GAP - W5) / 2))
const CELLS = [
  { name: '5시간', cols: W5 },
  { name: '주간', cols: W2 },
  { name: '대화', cols: W2 },
]
const ROWS = FLAME_ROWS + 1 // flame rows plus the gauge row
const BAR_H = 2

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
// Stays blue until about 72%, then turns to the hot palette quickly, so no muddy mid colour lingers
const palette = (pct, h) => mix(ramp(BLUE, h), ramp(HOT, h), Math.min(1, Math.max(0, (pct - 74) / 16)))

// ---- One fire per cell -----------------------------------------------------------------------------
class Fire {
  constructor(cols, rows) {
    this.W = cols * 2
    this.rows = rows
    this.H = rows * 4
    this.FH = this.H - BAR_H
    this.heat = Array.from({ length: this.FH }, () => new Float32Array(this.W))
    this.sparks = []
    this.seed = Math.random() * 100 // so the three flames do not move in lockstep
  }

  step(pct, t0) {
    const { heat, W, FH } = this
    const t = t0 + this.seed
    const filled = pct <= 0 ? 0 : Math.max(2, Math.round((pct / 100) * W))
    const f = 0.46 + 0.52 * (pct / 100)
    for (let x = 0; x < W; x++) {
      const end = Math.min(1, x / 3, (filled - 1 - x) / 3 + 0.35)
      const fuel = 0.4 + 0.95 * Math.pow(vnoise(x * 0.3, t * 2.6), 1.3)
      heat[FH - 1][x] = x < filled ? Math.max(0, Math.min(1.15, fuel * end)) : 0
    }
    for (let y = FH - 2; y >= 0; y--) {
      const rise = (FH - 1 - y) / FH
      for (let x = 0; x < W; x++) {
        const wind = (vnoise(x * 0.12, y * 0.13 - t * 2.1) - 0.5) * 2.6 * (0.4 + 1.5 * rise)
        const src = Math.min(W - 1, Math.max(0, Math.round(x + wind)))
        const tongue = Math.pow(vnoise(x * 0.33, y * 0.1 - t * 3.4), 1.6)
        const edge = 1 + 2.6 * Math.max(0, 1 - x / 7)
        const cool = (1 / (FH * f)) * (0.18 + 2.1 * tongue) * edge
        heat[y][x] = Math.max(0, heat[y + 1][src] - cool + (Math.random() - 0.5) * 0.025)
      }
    }
    if (Math.random() < 0.08 + 0.3 * (pct / 100) && filled > 6) {
      this.sparks.push({ x: Math.random() * filled, y: FH * (0.35 + Math.random() * 0.2), vy: 0.35 + Math.random() * 0.55, vx: (Math.random() - 0.5) * 0.4, life: 1, trail: [] })
    }
    for (const s of this.sparks) {
      s.trail.push([s.x, s.y])
      if (s.trail.length > 3) s.trail.shift()
      s.y -= s.vy
      s.x += s.vx + (vnoise(s.x * 0.2, t * 2) - 0.5) * 0.5
      s.life -= 0.04
    }
    this.sparks = this.sparks.filter(s => s.life > 0 && s.y > -1)
    return filled
  }

  paint(canvas, pct, filled, t0) {
    const { heat, W, FH, H } = this
    const t = t0 + this.seed
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < W; x++) {
        const v = heat[y][x]
        if (v < 0.05) continue
        if (v < 0.24 && v * 4.1 < (BAYER[y & 3][x & 3] + 0.5) / 16) continue
        canvas[y][x] = palette(pct, Math.min(1, v * 0.92))
      }
    }
    for (const s of this.sparks) {
      s.trail.forEach(([tx, ty], i) => {
        const x = Math.round(tx)
        const y = Math.round(ty)
        if (x >= 0 && x < W && y >= 0 && y < FH && !canvas[y][x]) canvas[y][x] = palette(pct, 0.3 + 0.25 * (i / 3) * s.life)
      })
      const x = Math.round(s.x)
      const y = Math.round(s.y)
      if (x >= 0 && x < W && y >= 0 && y < FH) canvas[y][x] = palette(pct, 0.6 + 0.4 * s.life)
    }
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

function toLines(canvas, w, rows) {
  const lines = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let x = 0; x < w; x += 2) {
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
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const stateColor = p => (p >= 90 ? '\x1b[38;2;255;120;60m' : p >= 65 ? '\x1b[38;2;255;190;80m' : '\x1b[38;2;80;170;255m')
const visible = s => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) >= 0xac00 && ch.charCodeAt(0) <= 0xd7a3 ? 2 : 1), 0)
const fires = CELLS.map(c => new Fire(c.cols, FLAME_ROWS + 1))

function frame(t) {
  const values = SWEEP ? [0, 1, 2].map(i => Math.round(50 - 50 * Math.cos((t / (14 + i * 3)) * Math.PI * 2))) : FIXED
  const cellLines = CELLS.map((c, i) => {
    const pct = values[i] ?? 0
    const fire = fires[i]
    const filled = fire.step(pct, t)
    const canvas = Array.from({ length: fire.H }, () => Array(fire.W).fill(null))
    fire.paint(canvas, pct, filled, t)
    return toLines(canvas, fire.W, fire.rows)
  })
  const out = [`${DIM}불꽃 한 줄 밴드 (${MODE}, 불꽃 ${FLAME_ROWS}줄)${RESET}`]
  for (let r = 0; r < ROWS; r++) out.push(' ' + cellLines.map(l => l[r]).join(' '.repeat(GAP)))
  // label row: name and percentage under each cell
  let labels = ' '
  CELLS.forEach((c, i) => {
    const pct = values[i] ?? 0
    const text = `${c.name} ${pct}%${pct >= 90 ? ' !' : ''}`
    labels += stateColor(pct) + text + RESET + ' '.repeat(Math.max(0, c.cols + GAP - visible(text)))
  })
  out.push(labels)
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
