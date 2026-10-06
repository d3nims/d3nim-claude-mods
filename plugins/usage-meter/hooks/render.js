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
  return packCells(canvasToCellList(canvas, cols, rows, mode))
}

/** As canvasToCells, but the [codePoint, fg, bg] list itself, so text can be written over some cells first. */
function canvasToCellList(canvas, cols, rows, mode) {
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
  return cells
}

/** Writes ASCII `text` into a cell list (cols wide) at cell x, row y: each character keeps its cell's colour behind it. */
function writeText(cells, cols, x, y, text, fg) {
  for (let i = 0; i < text.length; i++) {
    const cx = x + i
    if (cx < 0 || cx >= cols) continue
    const cell = cells[y * cols + cx]
    const behind = cell[0] === 0x2588 ? cell[1] : cell[2] // a full block's colour is its foreground
    cells[y * cols + cx] = [text.charCodeAt(i), fg, behind]
  }
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
  // The fire is the gauge: exactly pct of the width, nothing at 0%. Terry stands with his front paws at its end.
  const lit = pct <= 0 ? 0 : Math.max(1, Math.round((Math.min(100, pct) / 100) * TW))
  const front = lit - 1
  const dogX = Math.max(0, Math.min(TW - SW, lit - Math.round(SW * 0.8)))
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

// ---- Terry reacting to the session ------------------------------------------------------------------------
// mood -> which frames: sit (idle), wag (you are typing), bark (you just started typing), run (Claude is working),
// happy (the answer just landed), sleep (nothing for a while)
const MOOD_FRAMES = {
  sit: 'sit', wag: 'wag', bark: 'bark', run: 'run', happy: 'pant', sleep: 'sleep',
  sniff: 'sniff', dig: 'dig', fetch: 'run', ask: 'ask', sad: 'sad',
}
// How he runs follows the effort level: a walk, a brisk trot, the gallop, a flat-out sprint, and at max he takes off.
// speed plays the frames faster, ground is how fast the ground slides past (sub-pixels a second).
export const RUN_STYLES = {
  low: { set: 'walk', speed: 0.6, ground: 9, lines: 0, len: 0, dust: false },
  medium: { set: 'walk', speed: 1.5, ground: 22, lines: 0, len: 0, dust: true }, // the same clean walk as low, brisker (the old trot tangled its steps)
  high: { set: 'run', speed: 1, ground: 34, lines: 3, len: 7, dust: true },
  xhigh: { set: 'run', speed: 1.5, ground: 52, lines: 4, len: 10, dust: true },
  max: { set: 'run', speed: 2.2, ground: 85, lines: 0, len: 0, dust: false, fly: true },
}
export const runStyle = effort => RUN_STYLES[effort] || RUN_STYLES.high
const FLY_FRAME = 4 // in the run set: the third key pose, stretched flat out in the air
const SKY_COLS = 12 // room to the right of Terry for the sun, the moon and the stars
const TRAIL_COLS = 5 // room to the left of Terry for speed lines and dust while he runs
const SOIL_ROWS = 3 // sub-pixel rows of earth under the grass
export const TERRY_COLS = DOG_COLS + SKY_COLS + TRAIL_COLS
export const TERRY_ROWS = Math.ceil((ground + 1 + SOIL_ROWS) / 4)
export const TERRY_MIN_COLS = DOG_COLS + 3 // a narrow window gives up the sky first, then most of the room behind him

// Fixed colours (no gradients), so Raster's ~1000 exact colour pairs are never used up
const GRASS = [[98, 164, 74], [74, 130, 58]]
const SOIL = [[110, 80, 50], [88, 63, 39], [128, 94, 60]]
const PEBBLE = [150, 146, 136]
const SUN_DAWN = { core: [255, 196, 170], rim: [246, 128, 150] }
const SUN_DAY = { core: [255, 232, 110], rim: [255, 190, 64] }
const SUN_DUSK = { core: [255, 176, 92], rim: [240, 104, 60] }
const MOON = { core: [238, 236, 218], rim: [190, 188, 172] }
const STAR = [[226, 230, 255], [150, 160, 210]]

// Blinking: about every 4.2 s the eye shuts for 140 ms, and every third time twice in a row. Asleep, it stays shut.
const BLINK_EVERY = 4200
function isBlinking(ms) {
  const m = ms % BLINK_EVERY
  return m < 140 || (Math.floor(ms / BLINK_EVERY) % 3 === 0 && m > 300 && m < 440)
}
const EYE = [24, 24, 24] // the eye's colour in the sprite (the nose is a different near-black)
const isEye = c => c !== null && c[0] === EYE[0] && c[1] === EYE[1] && c[2] === EYE[2]
const LID = [28, 28, 28] // near-black, so a cell always keeps it (see isFeature): a thin closed-eye line
const FACE = [226, 226, 226]
/** The frame with the eye shut: the eye becomes face colour with a lid line along its bottom, a pixel longer at each
 * end, so on a terminal cell it reads as a dash rather than a dot. */
function closeEyes(frame, shut) {
  if (!shut) return frame
  let lowest = -1
  let minX = Infinity
  let maxX = -1
  frame.forEach((row, y) => row.forEach((c, x) => {
    if (!isEye(c)) return
    lowest = Math.max(lowest, y)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
  }))
  if (lowest < 0) return frame
  return frame.map((row, y) => {
    if (y !== lowest && !row.some(isEye)) return row
    return row.map((c, x) => (y === lowest && x >= minX - 1 && x <= maxX + 1 && c ? LID : isEye(c) ? FACE : c))
  })
}

/**
 * Terry in `mood` at local `hour` (0-24, fractions allowed), ms since start.
 *  - the sky to his right follows the clock: the sun rises at 6 and sets at 18 (pink at dawn, orange at dusk), then
 *    the moon crosses with stars twinkling around
 *  - he stands on grass over earth, which slides past while he runs
 *  - a mark by his head: ! when he barks, * when he is pleased, z Z Z when he sleeps
 */
export function terryCells(mood, ms, mode, hour = 12, columns = TERRY_COLS, effort = 'high', date = null) {
  const TW = columns * 2
  const H = TERRY_ROWS * 4
  const canvas = Array.from({ length: H }, () => Array(TW).fill(null))
  const put = (x, y, c) => { if (x >= 0 && x < TW && y >= 0 && y < H) canvas[y][x] = c }
  const t = ms / 1000
  const style = runStyle(effort)
  const running = mood === 'run'
  const set = (running ? SETS[style.set] : SETS[MOOD_FRAMES[mood]]) || SETS.sit
  // flying, he holds the stretched-out flight pose of the gallop (legs reaching fore and aft) instead of striding
  const index = running && style.fly ? FLY_FRAME : pick(set, running ? ms * style.speed : ms)
  let frame = closeEyes(set.frames[index], mood === 'sleep' || isBlinking(ms))
  // fetching: he runs off to the right, then comes back the other way with a stick in his mouth
  const fetchPhase = mood === 'fetch' ? (ms / 3200) % 1 : 0
  const fetchBack = mood === 'fetch' && fetchPhase >= 0.5
  if (fetchBack) frame = frame.map(row => row.slice().reverse())
  const trail = Math.max(1, Math.min(TRAIL_COLS, columns - DOG_COLS - 1))
  const homeX = trail * 2
  const away = TW - homeX + 6
  const dogX = mood !== 'fetch' ? homeX
    : fetchPhase < 0.5 ? homeX + Math.round((fetchPhase / 0.5) * away)
    : homeX + Math.round((1 - (fetchPhase - 0.5) / 0.5) * away)

  // the sky, right of his nose
  const skyX0 = dogX + SW + 1
  const skyW = TW - skyX0 - 3
  const isDay = hour >= 6 && hour < 18
  const p = isDay ? (hour - 6) / 12 : ((hour - 18 + 24) % 24) / 12
  const bx = Math.round(skyX0 + 2 + p * (skyW - 4))
  const by = Math.round(ground - 9 - (ground - 15) * Math.sin(Math.PI * p))
  if (!isDay) {
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i, 701) * TW)
      const y = Math.floor(hash(i, 702) * (ground - 8))
      if (Math.abs(x - bx) < 4 && Math.abs(y - by) < 4) continue
      const twinkle = Math.sin(t * (1.2 + hash(i, 703) * 2) + i * 2)
      if (twinkle > -0.4) put(x, y, STAR[twinkle > 0.5 ? 0 : 1])
    }
  }
  const look = !isDay ? MOON : hour < 7.5 ? SUN_DAWN : hour >= 16.5 ? SUN_DUSK : SUN_DAY
  // no room for the sun or the moon in a narrow window (the stars stay)
  if (skyW >= 8) for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy * 0.9)
      if (d > 3.1) continue
      if (!isDay && Math.hypot(dx - 1.6, dy + 0.8) < 2.4) continue // a bite out of the moon: a crescent
      put(bx + dx, by + dy, d <= 1.9 ? look.core : look.rim)
    }
  }
  if (skyW >= 8 && isDay && Math.sin(t * 2) > -0.2) {
    for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [-4, -4], [4, -4]]) put(bx + dx, by + dy, look.rim)
  }

  // the season, from the real date: snow in winter, petals in spring, fireflies on summer nights, leaves in autumn,
  // fireworks on New Year's Eve and New Year's night
  if (date) {
    const { month, day } = date
    const drift = running ? t * style.ground * 0.4 : 0
    const wrap = v => ((v % TW) + TW) % TW
    if (month === 12 || month <= 2) {
      for (let i = 0; i < 22; i++) {
        const y = Math.floor((hash(i, 802) * ground + t * (3 + hash(i, 803) * 4)) % (ground - 1))
        put(Math.floor(wrap(hash(i, 801) * TW + Math.sin(t * 1.3 + i) * 2.5 - drift)), y, [236, 240, 250])
      }
    } else if (month <= 5) {
      for (let i = 0; i < 12; i++) {
        const y = Math.floor((hash(i, 812) * ground + t * (3 + hash(i, 813) * 2)) % (ground - 1))
        put(Math.floor(wrap(hash(i, 811) * TW - t * 5 + Math.sin(t * 2 + i) * 3 - drift)), y, i % 3 ? [255, 183, 205] : [255, 214, 226])
      }
    } else if (month <= 8) {
      if (!isDay) {
        for (let i = 0; i < 7; i++) {
          if (Math.sin(t * (1.5 + hash(i, 823)) + i * 1.7) < 0.2) continue
          const x = Math.floor(wrap(hash(i, 821) * TW + Math.sin(t * 0.7 + i) * 6 - drift))
          put(x, Math.floor(ground - 4 - hash(i, 822) * (ground - 10) + Math.sin(t + i) * 2), [214, 244, 96])
        }
      }
    } else {
      const LEAVES = [[214, 120, 40], [196, 70, 38], [232, 182, 62]]
      for (let i = 0; i < 9; i++) {
        const y = Math.floor((hash(i, 832) * ground + t * (2.5 + hash(i, 833) * 2)) % (ground - 1))
        const x = Math.floor(wrap(hash(i, 831) * TW + Math.sin(t * 1.6 + i * 2) * 4 - drift))
        put(x, y, LEAVES[i % 3])
        if (i % 2) put(x + 1, y, LEAVES[i % 3])
      }
    }
    const newYear = (month === 12 && day === 31) || (month === 1 && day === 1)
    if (newYear && !isDay) {
      const FIRE = [[255, 120, 120], [255, 214, 102], [140, 200, 255], [190, 150, 255]]
      for (let b = 0; b < 2; b++) {
        const cycle = Math.floor(t / 1.6 + b * 0.5)
        const age = (t / 1.6 + b * 0.5) % 1
        const cx = Math.floor(skyX0 + hash(cycle, 841 + b) * Math.max(4, skyW)), cy = 4 + Math.floor(hash(cycle, 851 + b) * 8)
        const r = age * 7
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          if (age < 0.85) put(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), FIRE[(cycle + b) % 4])
        }
      }
    }
  }

  // the ground: a grassy edge on earth with a few pebbles; it slides past while he runs
  const off = running ? Math.floor(t * style.ground) : mood === 'sniff' ? Math.floor(t * 6) : 0 // the ground slides by as fast as he goes
  for (let x = 0; x < TW; x++) {
    const wx = x + off
    for (let k = 1; k <= SOIL_ROWS; k++) {
      const y = ground + k
      put(x, y, hash(wx >> 2, y + 41) < 0.06 ? PEBBLE : k === 1 ? SOIL[2] : SOIL[hash(wx >> 1, y) < 0.3 ? 1 : 0])
    }
    put(x, ground, GRASS[(wx >> 1) & 1])
    if (hash(wx, 7) < 0.4) put(x, ground - 1, GRASS[wx & 1])
    if (hash(wx, 8) < 0.12) put(x, ground - 2, GRASS[1])
  }

  // running: speed lines streaking back past him and puffs of dust kicked up behind (how many follows the effort)
  if (running && style.lines) {
    const rowsY = [ground - 17, ground - 12, ground - 7, ground - 21, ground - 3]
    for (let n = 0; n < style.lines; n++) {
      const y = rowsY[n] - (style.fly ? 4 : 0)
      const span = dogX + 4
      const head = dogX + 3 - Math.floor(((t * 4.5 * style.speed + n * 0.37) % 1) * span)
      for (let k = 0; k < style.len; k++) put(head - k, y, k < 3 ? [232, 236, 246] : k < 8 ? [150, 154, 170] : [96, 100, 116])
    }
  }
  if (running && style.dust) {
    for (let i = 0; i < 3; i++) {
      const age = (t * 3 * style.speed + i / 3) % 1 // each puff drifts back and fades
      const x = Math.round(dogX + 2 - age * 10 - i)
      const y = ground - 1 - Math.round(age * 2)
      const c = age < 0.5 ? [176, 150, 118] : [120, 104, 86]
      put(x, y, c)
      if (age < 0.6) put(x - 1, y, c)
    }
  }
  // max: he flies like a superhero — lifted over his shadow, a red cape streaming back from his shoulders,
  // wind rushing past above and below and clouds racing by
  const lift = running && style.fly ? 5 + Math.round(Math.sin(t * 6)) : 0
  if (lift) {
    for (let x = dogX + 10; x < dogX + SW - 12; x++) put(x, ground, [34, 70, 34]) // his shadow on the grass
    // clouds racing by in the sky
    for (let i = 0; i < 3; i++) {
      const cx = TW + 8 - Math.floor(((t * 1.6 + i / 3) % 1) * (TW + 16))
      const cy = 3 + i * 4
      const cloud = isDay ? [226, 232, 244] : [74, 78, 98]
      for (let dx = -3; dx <= 3; dx++) put(cx + dx, cy, cloud)
      for (let dx = -1; dx <= 2; dx++) put(cx + dx, cy - 1, cloud)
    }
    // the cape: a ribbon from his shoulders back past his tail, waving harder toward its free end
    const ax = dogX + 26
    const ay = 15 - lift
    const L = 36
    for (let u = 0; u <= L; u++) {
      const k = u / L
      const wave = Math.sin(u * 0.38 - t * 16) * (0.4 + 2.6 * k)
      const slope = Math.cos(u * 0.38 - t * 16)
      const top = Math.round(ay - 1 - u * 0.1 + wave)
      const thick = Math.round(3 + 4 * k)
      for (let w = 0; w < thick; w++) {
        const c = w === 0 ? [244, 92, 96] : slope < -0.3 ? [150, 22, 34] : [214, 38, 48]
        put(ax - u, top + w, c)
      }
    }
  }
  // wind streaks rushing past at max, the full width of the picture
  if (running && style.fly) {
    const rowsY = [ground - 25, ground - 22, ground - 4, ground - 8, ground - 14]
    for (let n = 0; n < rowsY.length; n++) {
      const len = 8 + (n % 3) * 3
      const head = TW + len - Math.floor(((t * (2.4 + n * 0.3) + n * 0.29) % 1) * (TW + 2 * len))
      for (let k = 0; k < len; k++) put(head + k, rowsY[n], k < 2 ? [236, 240, 250] : k < 6 ? [170, 180, 205] : [104, 110, 134])
    }
  }

  // sniffing: little wisps of scent rising from the ground in front of his nose
  if (mood === 'sniff') {
    for (let i = 0; i < 3; i++) {
      const age = (t * 1.2 + i / 3) % 1
      put(dogX + 46 + Math.round(Math.sin(age * 6 + i) * 1.5), Math.round(ground - 2 - age * 7), [176, 190, 168])
    }
  }
  // digging: a dark hole at his front paws, dirt flung back under him and over his rump, and a heap behind him that
  // grows the longer he digs (two soil colours only: each terminal cell holds two)
  if (mood === 'dig') {
    const SOIL_LIGHT = [140, 100, 62], SOIL_DARK = [104, 74, 46]
    for (let x = dogX + 27; x <= dogX + 35; x++) put(x, ground, [46, 32, 20])
    const since = (date && date.moodMs) || ms
    const heap = Math.min(7, 2 + Math.floor(since / 1500))
    const hx0 = dogX + 2
    for (let dx = -heap - 1; dx <= heap + 1; dx++) {
      const h = Math.floor(Math.max(0, heap - Math.abs(dx) * 0.9))
      for (let k = 0; k <= h; k++) put(hx0 + dx, ground - k, k === h ? SOIL_LIGHT : SOIL_DARK)
    }
    for (let i = 0; i < 5; i++) {
      const age = (t * 2.2 + i / 5) % 1
      const x = Math.round(dogX + 30 - age * 28)
      const y = Math.round(ground - 3 - Math.sin(Math.PI * age) * 14 + age * 2)
      put(x, y, SOIL_LIGHT)
    }
  }

  // Terry on top
  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < SW; x++) {
      const c = frame[y][x]
      if (c) put(dogX + x, y - lift, c)
    }
  }
  if (lift) for (const [x, y] of [[26, 17], [27, 17], [26, 18], [27, 18], [25, 18]]) put(dogX + x, y - lift, [214, 38, 48]) // the cape tied at his neck
  // the request failed: a tear rolling down from his eye and a little rain cloud just above his drooping head
  if (mood === 'sad') {
    let ex = -1, ey = -1
    frame.forEach((row, y) => row.forEach((c, x) => { if (ey < 0 && c && c[0] === 24 && c[1] === 24 && c[2] === 24) { ex = x; ey = y } }))
    if (ey >= 0) {
      const fall = Math.floor(((t * 1.4) % 1) * 6)
      put(dogX + ex, ey + 2 + fall, [110, 170, 245])
      if (fall < 5) put(dogX + ex, ey + 3 + fall, [70, 130, 225])
    }
    let top = frame.findIndex(row => row.some(c => c))
    if (top < 0) top = 8
    const cy = Math.max(2, top - 4)
    const cx = dogX + 36
    for (let dx = -5; dx <= 5; dx++) put(cx + dx, cy, [104, 108, 126])
    for (let dx = -3; dx <= 3; dx++) put(cx + dx, cy - 1, [124, 128, 146])
    for (let dx = -1; dx <= 1; dx++) put(cx + dx, cy - 2, [124, 128, 146])
    for (let i = 0; i < 3; i++) {
      const age = (t * 1.8 + i / 3) % 1
      put(cx - 4 + i * 4, cy + 1 + Math.floor(age * 3), [120, 166, 236])
    }
  }
  // waiting for a permission: a white speech bubble beside his head, lined up on whole cells so a real '?' fits in it
  const bubbleCol = Math.ceil((dogX + SW) / 2) + 3 <= columns ? Math.ceil((dogX + SW) / 2) : Math.max(0, Math.floor(dogX / 2) + 4)
  const bubbleLeft = bubbleCol < Math.ceil((dogX + SW) / 2)
  if (mood === 'ask') {
    const bx0 = bubbleCol * 2, W = 6, Hb = 12
    for (let y = 0; y < Hb; y++) {
      for (let x = 0; x < W; x++) {
        const corner = (x === 0 || x === W - 1) && (y === 0 || y === Hb - 1)
        if (!corner) put(bx0 + x, y, [240, 240, 246])
      }
    }
    for (let k = 0; k < 3; k++) put(bubbleLeft ? bx0 + W + k : bx0 - 1 - k, Hb - 1 + k, [240, 240, 246]) // the bubble's tail, toward his head
  }
  // the stick he brings back, held across his mouth
  if (fetchBack) for (let k = -5; k <= 6; k++) { put(dogX + k, 15, [156, 108, 62]); if (k > -4 && k < 5) put(dogX + k, 16, [118, 80, 44]) }
  const cells = canvasToCellList(canvas, columns, TERRY_ROWS, mode)
  const markX = Math.ceil((dogX + SW) / 2)
  if (mood === 'bark' && Math.floor(ms / 340) % 2 === 0) writeText(cells, columns, markX, 1, '!', 0xffd166)
  if (mood === 'happy' && Math.floor(ms / 300) % 2 === 0) writeText(cells, columns, markX, 0, '*', 0xffd166)
  if (mood === 'ask' && Math.floor(ms / 600) % 4 !== 3) writeText(cells, columns, bubbleCol + 1, 1, '?', 0x2a2a36)
  if (mood === 'sleep') {
    const phase = Math.floor(ms / 700) % 3
    writeText(cells, columns, markX - 3, 3, 'z', 0x9aa4c8)
    if (phase >= 1) writeText(cells, columns, markX - 2, 2, 'Z', 0x9aa4c8)
    if (phase >= 2) writeText(cells, columns, markX - 1, 1, 'Z', 0xb8c0e0)
  }
  return packCells(cells)
}
