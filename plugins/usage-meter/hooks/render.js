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

// Near-black: the terrier's eye and nose. Tiny, so a cell would otherwise give its two colours to the fur around them.
const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
const isFeature = c => c !== null && lum(c) < 30

function cellOf(units, mode) {
  const counts = new Map()
  for (const u of units) {
    const k = u.color ? u.color.join(',') : 'none'
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => (k === 'none' ? null : k.split(',').map(Number)))
  // an eye or nose pixel always gets one of the two colours of its cell
  const feature = ranked.findIndex(isFeature)
  if (feature > 1) ranked.splice(1, 0, ranked.splice(feature, 1)[0])
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
            // a quarter block covers two sub-pixel rows: an eye or nose pixel wins, else the inner row (keeps edges tidy)
            const pickRow = isFeature(a) ? a : isFeature(b) ? b : a && b ? (qy === 0 ? b : a) : a || b
            units.push({ bit: 1 << (qy * 2 + dx), color: pickRow })
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
// The walk: a strip of sky above him (for the sun) and a dirt path under his paws (bones are buried in it)
const SKY = 8 // sub-pixel rows of sky above the sprite (the sun is 7 tall)
const PATH = 8 // sub-pixel rows of dirt below his paws (the bones are 6 tall)
export const DOG_ROWS = Math.ceil((SKY + ground + 1 + PATH) / 4)
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

// Fixed colours only (no gradients): Raster keeps about 1000 colour pairs exact, see palette() above
const SOIL_TOP = [128, 94, 60]
const SOIL = [104, 75, 47]
const SOIL_DARK = [82, 58, 36]
const PEBBLE = [152, 148, 138]
const PEBBLE_DARK = [112, 108, 100]
const GRASS = [[98, 164, 74], [74, 130, 58]]
const STEM = [70, 128, 60]
const PETALS = [[246, 128, 178], [250, 212, 84], [240, 240, 236], [182, 134, 236]]
const FLOWER_EYE = [255, 210, 60]
const SUN = { core: [255, 228, 94], rim: [255, 184, 62] }
const SUNSET = { core: [255, 152, 82], rim: [232, 94, 62] }
const MOON = { core: [236, 234, 214], rim: [188, 186, 170] }
const STAR = [230, 232, 255]
const BONE = [242, 230, 198]
const BONE_EMPTY = [70, 50, 32] // a dug-out hole in the soil
// Six rows, so that a quarter block (two rows each) still shows knob / shaft / knob
const BONE_SHAPE = ['XX......XX', 'XXX....XXX', '.XXXXXXXX.', '.XXXXXXXX.', 'XXX....XXX', 'XX......XX']
const FLOWER_EVERY = 26 // sub-pixels between flower slots along the path

/** How many of the five bones are left at a context fill of `pct`. */
export function bonesLeft(pct) {
  return pct == null ? 5 : Math.max(0, Math.min(5, Math.ceil((5 * (100 - pct)) / 100)))
}

/**
 * Terry's walk, `columns` wide. vals: [five_hour, seven_day, context] percentages (or null); ms since start.
 *  - 5시간: how far along the path he has run (his position). Under 80% he runs, then pants, at 97% he sleeps.
 *  - 주간: the sun crossing the sky, left to right over the week; sunset colours from 80%, the moon at 100%.
 *  - 대화: five bones buried in the path at the left, one dug out for every fifth of the context window used.
 * The path scrolls under him (dirt, pebbles, grass, flowers drifting past) while he moves.
 */
export function walkCells(columns, vals, ms, mode) {
  const [five, week, ctx] = vals
  const TW = columns * 2
  const H = DOG_ROWS * 4
  const canvas = Array.from({ length: H }, () => Array(TW).fill(null))
  const put = (x, y, c) => { if (x >= 0 && x < TW && y >= 0 && y < H) canvas[y][x] = c }
  const t = ms / 1000
  const pct = five ?? 0
  const set = pct >= 97 ? SETS.sleep : pct >= 80 ? SETS.pant : SETS.run
  const speed = set === SETS.sleep ? 0 : set === SETS.pant ? 7 : 16 // sub-pixels a second the path slides by
  const off = Math.floor(t * speed)
  const surface = SKY + ground + 1 // first dirt row, right under his paws

  // the sky strip: the sun (or the moon and stars) travels left to right over the week, a little higher mid-week
  if (week != null) {
    const p = Math.max(0, Math.min(1, week / 100))
    const sx = Math.round(5 + p * (TW - 10))
    const sy = 4
    const look = week >= 100 ? MOON : week >= 80 ? SUNSET : SUN
    if (week >= 100) {
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(hash(i, 501) * TW)
        const y = Math.floor(hash(i, 502) * (SKY - 1))
        if (Math.abs(x - sx) > 4 && hash(i, Math.floor(t * 2)) > 0.25) put(x, y, STAR)
      }
    }
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy)
        if (d <= 3.1 && sy + dy < SKY) put(sx + dx, sy + dy, d <= 1.8 ? look.core : look.rim)
      }
    }
    if (week < 80) {
      // short rays to either side that twinkle
      for (const [dx, k] of [[-5, 0], [5, 1], [-4, 2], [4, 3]]) {
        if ((Math.floor(t * 3) + k) % 2) continue
        put(sx + dx, sy + (k > 1 ? -2 : 0), look.rim)
      }
    }
  }

  // the path: soil with pebbles, a grassy edge, flowers drifting past
  for (let x = 0; x < TW; x++) {
    const wx = x + off
    for (let y = surface; y < H; y++) {
      let c = y === surface ? SOIL_TOP : hash(wx >> 1, y) < 0.28 ? SOIL_DARK : SOIL
      if (y > surface && hash(wx >> 2, (y >> 1) + 50) < 0.07) c = hash(wx, y + 9) < 0.5 ? PEBBLE : PEBBLE_DARK
      put(x, y, c)
    }
    if (hash(wx, 7) < 0.45) {
      const tall = 1 + Math.floor(hash(wx, 8) * 3)
      for (let k = 1; k <= tall; k++) put(x, surface - k, GRASS[(wx + k) & 1])
    }
  }
  for (let cell = Math.floor(off / FLOWER_EVERY) - 1; cell <= Math.floor((off + TW) / FLOWER_EVERY) + 1; cell++) {
    if (hash(cell, 99) > 0.55) continue
    const fx = cell * FLOWER_EVERY + 4 + Math.floor(hash(cell, 98) * 18) - off
    const stem = 4 + Math.floor(hash(cell, 97) * 3)
    const petal = PETALS[Math.floor(hash(cell, 96) * PETALS.length)]
    for (let k = 1; k <= stem; k++) put(fx, surface - k, STEM)
    const hy = surface - stem - 1
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) put(fx + dx, hy + dy, petal)
    put(fx, hy, FLOWER_EYE)
  }

  // bones for the context window, buried in the path at the left (drawn over the soil, under nothing)
  const left = bonesLeft(ctx)
  const boneTop = (surface + 1) % 2 ? surface + 2 : surface + 1 // start on an even row so quarter blocks split it cleanly
  for (let i = 0; i < 5; i++) {
    BONE_SHAPE.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') put(2 + i * 13 + x, boneTop + y, i < left ? BONE : BONE_EMPTY)
    })
  }

  // Terry, at the 5-hour position
  const frame = set.frames[pick(set, ms)]
  const dogX = Math.round(((TW - SW + 6) * Math.min(100, pct)) / 100) - 4
  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < SW; x++) {
      const c = frame[y][x]
      if (c) put(dogX + x, SKY + y, c)
    }
  }
  return canvasToCells(canvas, columns, DOG_ROWS, mode)
}
