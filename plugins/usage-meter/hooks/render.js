// Pure drawing code for the usage meter: no engine calls here, so it can be tried with plain node.
//
// Everything is drawn on a grid of 2 x 4 square sub-pixels per terminal cell. A cell can show two colours, so each cell
// is turned into one glyph (quadrant blocks or braille) with a foreground and a background, then packed for `Raster`.

import SPRITE from './terrier-data.js'

const DEFAULT = 0x01000000 // Raster's "terminal default colour"
const BAR_H = 2 // thickness of the glowing gauge line, in sub-pixels

// ---- Packing for Raster ---------------------------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}

const rgbInt = c => (c[0] << 16) | (c[1] << 8) | c[2]

/** cells: array of [codePoint, foreground, background] -> the base64 string Raster takes. */
export function packCells(cells) {
  const words = new Uint32Array(cells.length * 3)
  for (let i = 0; i < cells.length; i++) {
    words[i * 3] = cells[i][0]
    words[i * 3 + 1] = cells[i][1]
    words[i * 3 + 2] = cells[i][2]
  }
  return base64(new Uint8Array(words.buffer))
}

// ---- Cells: at most two colours each, then the glyph that draws them -----------------------------------
const BRAILLE_BIT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const dist = (a, b) => (a === null && b === null ? 0 : a === null || b === null ? 1e9 : (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

function cellOf(units, mode) {
  const counts = new Map()
  for (const u of units) {
    const k = u.color ? u.color.join(',') : 'none'
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => (k === 'none' ? null : k.split(',').map(Number)))
  if (ranked.length === 1) return ranked[0] === null ? [0x20, DEFAULT, DEFAULT] : [0x2588, rgbInt(ranked[0]), DEFAULT]
  const [A, B] = ranked
  let bitsA = 0
  let bitsB = 0
  for (const u of units) {
    if (dist(u.color, B) < dist(u.color, A)) bitsB |= u.bit
    else bitsA |= u.bit
  }
  const code = bits => (mode === 'braille' ? 0x2800 + bits : QUAD[bits].codePointAt(0))
  if (A === null) return [code(bitsB), rgbInt(B), DEFAULT] // B on the terminal background
  if (B === null) return [code(bitsA), rgbInt(A), DEFAULT]
  return [code(bitsB), rgbInt(B), rgbInt(A)]
}

/** canvas: rows*4 lines of cols*2 colours (or null). Returns the packed cells for a rows x cols Raster. */
export function canvasToCells(canvas, cols, rows, mode) {
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * 2
      const units = []
      if (mode === 'braille') {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) units.push({ bit: BRAILLE_BIT[dy][dx], color: canvas[r * 4 + dy]?.[x + dx] ?? null })
      } else {
        for (let qy = 0; qy < 2; qy++) {
          for (let dx = 0; dx < 2; dx++) {
            const a = canvas[r * 4 + qy * 2]?.[x + dx] ?? null
            const b = canvas[r * 4 + qy * 2 + 1]?.[x + dx] ?? null
            units.push({ bit: 1 << (qy * 2 + dx), color: a && b ? (qy === 0 ? b : a) : a || b })
          }
        }
      }
      cells.push(cellOf(units, mode))
    }
  }
  return packCells(cells)
}

// ---- Noise and colours ------------------------------------------------------------------------------
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

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const BLUE = [[10, 4, 40], [18, 12, 100], [14, 40, 200], [20, 100, 255], [60, 175, 255], [150, 232, 255], [215, 248, 255], [255, 255, 255]]
const HOT = [[30, 6, 4], [100, 16, 8], [200, 44, 16], [250, 104, 24], [255, 168, 48], [255, 214, 100], [255, 240, 170], [255, 255, 240]]
function ramp(stops, h) {
  const p = Math.min(0.9999, Math.max(0, h)) * (stops.length - 1)
  const i = Math.floor(p)
  return mix(stops[i], stops[i + 1], p - i)
}
// Stays blue until about 74%, then turns to the hot palette quickly, so no muddy middle colour lingers
// The colours are snapped to a few steps on purpose: Raster only keeps about 1000 distinct colour pairs exact, so a flame
// whose colour drifts a little every frame would use them all up and turn everything else (the terrier) a wrong colour.
const HEAT_STEPS = 10
const HOT_STEPS = 4
const palette = (pct, h) => {
  const hot = Math.round(Math.min(1, Math.max(0, (pct - 74) / 16)) * HOT_STEPS) / HOT_STEPS
  return mix(ramp(BLUE, Math.round(Math.min(1, Math.max(0, h)) * HEAT_STEPS) / HEAT_STEPS), ramp(HOT, Math.round(Math.min(1, Math.max(0, h)) * HEAT_STEPS) / HEAT_STEPS), hot)
}

/** The colour of a percentage in text (hex string): blue, amber, red. */
export function stateColor(pct) {
  return pct >= 90 ? '#ff783c' : pct >= 80 ? '#ffbe50' : '#50aaff'
}

// ---- One fire per gauge ----------------------------------------------------------------------------------
class Fire {
  constructor(cols, rows) {
    this.W = cols * 2
    this.rows = rows
    this.H = rows * 4
    this.FH = this.H - BAR_H
    this.heat = Array.from({ length: this.FH }, () => new Float32Array(this.W))
    this.sparks = []
    this.seed = Math.random() * 100 // so the flames do not move in lockstep
  }

  step(pct, t0) {
    const { heat, W, FH } = this
    const t = t0 + this.seed
    const filled = pct <= 0 ? 0 : Math.max(2, Math.round((Math.min(100, pct) / 100) * W))
    const f = 0.46 + 0.52 * (Math.min(100, pct) / 100)
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
        const edge = 1 + 2.6 * Math.max(0, 1 - x / 7) // the first columns cool fast: no thin spike at the left end
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

  paint(canvas, ox, pct, filled, t0) {
    const { heat, W, FH, H } = this
    const t = t0 + this.seed
    const put = (x, y, c) => { if (canvas[y] && x + ox < canvas[y].length) canvas[y][x + ox] = c }
    const has = (x, y) => canvas[y] && canvas[y][x + ox]
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < W; x++) {
        const v = heat[y][x]
        if (v < 0.05) continue
        if (v < 0.24 && v * 4.1 < (BAYER[y & 3][x & 3] + 0.5) / 16) continue // dither the thin fringe
        put(x, y, palette(pct, Math.min(1, v * 0.92)))
      }
    }
    for (const s of this.sparks) {
      s.trail.forEach(([tx, ty], i) => {
        const x = Math.round(tx)
        const y = Math.round(ty)
        if (x >= 0 && x < W && y >= 0 && y < FH && !has(x, y)) put(x, y, palette(pct, 0.3 + 0.25 * (i / 3) * s.life))
      })
      const x = Math.round(s.x)
      const y = Math.round(s.y)
      if (x >= 0 && x < W && y >= 0 && y < FH) put(x, y, palette(pct, 0.6 + 0.4 * s.life))
    }
    for (let k = 0; k < BAR_H; k++) {
      const y = H - BAR_H + k
      for (let x = 0; x < W; x++) {
        if (x < filled) {
          const near = x / Math.max(1, filled - 1)
          const flick = vnoise(x * 0.45, t * 5 + k * 3)
          const lead = Math.max(0, 1 - (filled - 1 - x) / 6)
          const glow = 0.34 + 0.34 * near + 0.3 * flick + 0.3 * lead - k * 0.14
          put(x, y, palette(pct, Math.min(1, Math.max(0.12, glow))))
        } else if (k === 0 && x % 4 < 2) {
          put(x, y, [54, 56, 70])
        }
      }
    }
  }
}

// ---- The band: three flames side by side -----------------------------------------------------------------
export const BAND_GAP = 3
export const BAND_NAMES = ['5시간', '주간', '대화']

/** Widths of the three cells (terminal columns) for a band at most `cols` wide, and the band's total width. */
export function bandLayout(cols) {
  const usable = Math.max(36, Math.min(100, cols))
  const w5 = Math.max(14, Math.floor((usable - 2 * BAND_GAP) * 0.4))
  const w2 = Math.max(10, Math.floor((usable - 2 * BAND_GAP - w5) / 2))
  const widths = [w5, w2, w2]
  return { widths, total: w5 + 2 * w2 + 2 * BAND_GAP }
}

export function makeBand(cols, flameRows, mode) {
  const { widths, total } = bandLayout(cols)
  const rows = flameRows + 1 // flame rows plus the gauge row
  const fires = widths.map(w => new Fire(w, rows))
  return {
    columns: total,
    rows,
    widths,
    /** values: [five_hour, seven_day, context] percentages or null; t: seconds. Returns packed Raster cells. */
    cells(values, t) {
      const canvas = Array.from({ length: rows * 4 }, () => Array(total * 2).fill(null))
      let x0 = 0
      widths.forEach((w, i) => {
        const pct = values[i] ?? 0
        const filled = fires[i].step(pct, t)
        fires[i].paint(canvas, x0 * 2, pct, filled, t)
        x0 += w + BAND_GAP
      })
      return canvasToCells(canvas, total, rows, mode)
    },
  }
}

// ---- The terrier ------------------------------------------------------------------------------------------
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
const PAL = SPRITE.palette.map(hex)
const decode = rows => rows.map(row => [...row].map(c => (c === '.' ? null : PAL[SPRITE.alphabet.indexOf(c)])))
const SETS = {}
for (const name of Object.keys(SPRITE.sets)) SETS[name] = { ...SPRITE.sets[name], frames: SPRITE.sets[name].frames.map(decode) }
const SW = SETS.run.frames[0][0].length // sub-pixel width of the sprite
let ground = 0
for (const set of Object.values(SETS)) for (const f of set.frames) f.forEach((row, y) => { if (row.some(c => c)) ground = Math.max(ground, y) })
export const DOG_ROWS = Math.ceil((ground + 1) / 4)
export const DOG_COLS = Math.ceil(SW / 2)

function pick(set, ms) {
  const total = set.durations.reduce((a, b) => a + b, 0)
  let m = ms % total
  for (let i = 0; i < set.durations.length; i++) {
    if (m < set.durations[i]) return i
    m -= set.durations[i]
  }
  return 0
}

/** The terrier on a gauge `columns` wide at `pct`, ms since start. Under 80% he runs, then pants, then sleeps. */
export function dogCells(columns, pct, ms, mode) {
  const TW = columns * 2
  const canvas = Array.from({ length: DOG_ROWS * 4 }, () => Array(TW).fill(null))
  const t = ms / 1000
  const set = pct >= 97 ? SETS.sleep : pct >= 80 ? SETS.pant : SETS.run
  const frame = set.frames[pick(set, ms)]
  const dogX = Math.round(((TW - SW + 6) * Math.min(100, pct)) / 100) - 4
  const front = Math.min(TW - 1, dogX + Math.round(SW * 0.3)) // the ground burns up to his hind legs
  for (let x = 0; x < TW; x++) {
    if (x > front) { if (x % 4 < 2) canvas[ground][x] = [58, 58, 70]; continue }
    const near = 1 - (front - x) / Math.max(16, front)
    const tall = Math.round(1 + 5 * (0.5 + 0.28 * Math.sin(x * 0.95 + t * 7.3) + 0.14 * Math.sin(x * 0.35 - t * 4.1)) * (0.5 + 0.7 * near))
    for (let k = 0; k < tall && ground - k >= 0; k++) {
      const heat = Math.max(0.12, Math.min(1, (0.35 + 0.6 * near) * (1 - k / (tall + 0.6)) + 0.08 * Math.sin(x * 2.9 + t * 11)))
      canvas[ground - k][x] = palette(pct, heat)
    }
  }
  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < SW; x++) {
      const c = frame[y][x]
      if (c && dogX + x >= 0 && dogX + x < TW) canvas[y][dogX + x] = c
    }
  }
  return canvasToCells(canvas, columns, DOG_ROWS, mode)
}
