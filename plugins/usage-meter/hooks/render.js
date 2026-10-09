// Pure drawing code for the usage meter: no engine calls here, so it can be tried with plain node.
//
// Everything is drawn on a grid of 2 x 4 square sub-pixels per terminal cell. A cell can show two colours, so each cell
// is turned into one glyph (quadrant blocks or braille) with a foreground and a background, then packed for `Raster`.

import SPRITE from './terrier-data.js'
import QUAD_SPRITE from './terrier-quad-data.js'

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

// the darkest coat grey in braille: below this a dot on a dark background looks missing, and a shaded patch (the ear,
// the belly, the far legs) reads as a hole or a dent in him
const BR_GREY_LO = 168
function cellOf(units, mode) {
  // braille: dots only, never a filled cell or a coloured background, so the whole picture reads as one dot texture.
  // A dot covers little of its cell, so colours are lifted (gamma) to keep them from looking faded. An eye or nose
  // pixel is left as a gap in the dots rather than lighting the whole cell dark, so the eye stays its real size.
  if (mode === 'braille') {
    // Every pixel of the dog lights its dot; the shading is told by the cell's colour alone. (Shading by dot density,
    // dropping dots where the coat is dark, left holes on a dark background: a dent in the back, a leg one dot thin.)
    // An eye or nose is left as a gap, its real size; the outline is left out (it showed as dark specks).
    // A cell holds one colour, so where white fur meets a colour (the open mouth, the tongue, the ear's pink inside)
    // the cell takes one side, not their average: averaged, the pink spread out pale over the muzzle. The colour
    // wins with two or more of its dots (or when there is little fur), and the other side's dots stay dark.
    let featureBits = 0
    const grey = [], tint = []
    for (const u of units) {
      const c = u.color
      if (!c) continue
      if (isFeature(c)) {
        featureBits |= u.bit
        continue
      }
      if (OUTLINE.has(c.join(','))) continue
      ;(Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 14 ? grey : tint).push(u)
    }
    // (only his own reds win so: the tongue, the mouth, a pink ear. A blade of grass or a leaf sharing a cell with him
    // went the same way and wiped out his dots there: the end of his tail vanished into the grass)
    const reddish = tint.filter(u => u.color[0] > u.color[1] * 1.25)
    // (a cell without any of him, the sun or the earth, keeps all its dots)
    // (and then only when they outnumber his coat in the cell: a cell holds one colour, so the side with more dots
    // keeps them; on a tie the red wins, a mouth being smaller than the fur around it)
    const lit = !grey.length ? tint : reddish.length && reddish.length >= grey.length ? reddish : grey
    let bits = 0
    let r = 0, g = 0, b = 0, n = 0
    for (const u of lit) {
      bits |= u.bit
      r += u.color[0]; g += u.color[1]; b += u.color[2]; n++
    }
    if (!bits && !featureBits) return [0x20, DEFAULT, DEFAULT]
    if (!bits) return [0x2800 + featureBits, rgbInt([90, 90, 98]), DEFAULT] // only an eye or nose here: a dim outline
    const mean = [r / n, g / n, b / n]
    // (a dim fill behind full cells to hide the font's gap between braille rows was tried: it shows as dark blocks)
    const greyCell = Math.max(...mean) - Math.min(...mean) < 14
    if (greyCell) {
      // the coat's greys are squeezed into a lighter range: the darkest shade still reads as fur, not as a hole in it,
      // while light and shade stay apart (the volume)
      const v = Math.round(BR_GREY_LO + (255 - BR_GREY_LO) * (mean[0] / 255))
      return [0x2800 + bits, rgbInt([v, v, Math.min(255, v + 4)]), DEFAULT]
    }
    return [0x2800 + bits, rgbInt(mean.map(v => Math.round(255 * Math.pow(v / 255, 0.7)))), DEFAULT]
  }
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

// fine: the full 2 x 4 sub-pixels of a cell, fitted chafa-style. Besides the 2 x 2 quadrants, the lower quarter and
// three-quarter blocks (▂ ▆, and ▄) give horizontal edges a 4-step precision, and with the colours swapped the upper
// ones too. Terminals on xterm.js WebGL (WaveTerm) draw all of these themselves, so they tile without seams.
const FINE_MASKS = (() => {
  const bit = (dy, dx) => 1 << (dy * 2 + dx)
  const list = []
  for (let q = 1; q < 15; q++) {
    let m = 0
    if (q & 1) m |= bit(0, 0) | bit(1, 0)
    if (q & 2) m |= bit(0, 1) | bit(1, 1)
    if (q & 4) m |= bit(2, 0) | bit(3, 0)
    if (q & 8) m |= bit(2, 1) | bit(3, 1)
    list.push([m, QUAD[q].codePointAt(0)])
  }
  list.push([bit(3, 0) | bit(3, 1), 0x2582]) // ▂ lower quarter
  list.push([bit(1, 0) | bit(1, 1) | bit(2, 0) | bit(2, 1) | bit(3, 0) | bit(3, 1), 0x2586]) // ▆ lower three quarters
  return list
})()
const MISS = 200000 // the cost of colouring a pixel that should be empty, or emptying one that should be coloured
const cost = (a, b) => (a === null && b === null ? 0 : a === null || b === null ? MISS : (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
function cellOfFine(units) {
  const counts = new Map()
  for (const u of units) {
    const k = u.color ? u.color.join(',') : 'none'
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => (k === 'none' ? null : k.split(',').map(Number)))
  const feature = ranked.findIndex(isFeature)
  if (feature > 1) ranked.splice(1, 0, ranked.splice(feature, 1)[0])
  if (ranked.length === 1) return ranked[0] === null ? [0x20, DEFAULT, DEFAULT] : [0x2588, rgbInt(ranked[0]), DEFAULT]
  const top = ranked.slice(0, 3)
  const pairs = []
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) pairs.push([top[i], top[j]])
  if (feature >= 0) pairs.splice(1) // an eye or nose keeps its place in the first pair
  let best = null
  for (const [P, Q] of pairs) {
    for (const [fg, bg] of [[P, Q], [Q, P]]) {
      if (fg === null) continue // the foreground must be a colour; an empty background is the terminal's
      for (const [mask, code] of FINE_MASKS) {
        let err = 0
        for (const u of units) err += cost(u.color, mask & u.bit ? fg : bg)
        if (!best || err < best.err) best = { err, code, fg, bg }
      }
    }
  }
  return [best.code, rgbInt(best.fg), best.bg === null ? DEFAULT : rgbInt(best.bg)]
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
      if (mode === 'fine') {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) units.push({ bit: 1 << (dy * 2 + dx), color: canvas[r * 4 + dy]?.[x + dx] ?? null })
        cells.push(cellOfFine(units))
        continue
      }
      if (mode === 'braille') {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) units.push({ bit: BRAILLE_BIT[dy][dx], color: canvas[r * 4 + dy]?.[x + dx] ?? null, dy, dx })
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
// two styles: 'classic' (drawn here, the default) and 'real' (poses traced from a drawn reference sheet; on hold)
const SETS = {}
for (const name of Object.keys(SPRITE.sets)) SETS[name] = { ...SPRITE.sets[name], frames: SPRITE.sets[name].frames.map(decode) }
const REAL = {}
for (const name of Object.keys(SPRITE.real || {})) REAL[name] = { ...SPRITE.real[name], frames: SPRITE.real[name].frames.map(decode) }
const SW = SETS.run.frames[0][0].length // sub-pixel width of the sprite
// the sprite's soft outline colours: braille leaves them out (as dots they read as dark specks)
const OUTLINE = new Set((SPRITE.outline || []).map(i => SPRITE.palette[i]).map(h => [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)).join(',')))
let ground = 0
for (const set of [...Object.values(SETS), ...Object.values(REAL)]) for (const f of set.frames) f.forEach((row, y) => { if (row.some(c => c)) ground = Math.max(ground, y) })
// every pose stands on the grass: a set whose lowest row ends above the ground line is drawn that much lower
// (the motion inside a set, a bounce or a leap, is kept)
for (const set of [...Object.values(SETS), ...Object.values(REAL)]) {
  let bottom = 0
  for (const f of set.frames) f.forEach((row, y) => { if (row.some(c => c)) bottom = Math.max(bottom, y) })
  set.drop = ground - bottom
}
// Blocks (quad, fine) draw the older frames, made for blocks; braille's frames are drawn dot by dot and blur together
// in blocks. A mood the older set lacks borrows the braille frame, its greys lifted as braille lifts them (raw, the ear
// and the hand-laid shading came out as black patches and dark stripes).
const QPAL = QUAD_SPRITE.palette.map(hex)
const BLOCK_GREY_LO = 150
const liftBlock = c => {
  if (!c || isFeature(c) || OUTLINE.has(c.join(',')) || Math.max(...c) - Math.min(...c) >= 14) return c
  const v = Math.round(BLOCK_GREY_LO + (255 - BLOCK_GREY_LO) * (c[0] / 255))
  return [v, v, Math.min(255, v + 4)]
}
const QUAD_SETS = {}
for (const name of Object.keys(SETS)) {
  const old = QUAD_SPRITE.sets[name]
  QUAD_SETS[name] = old
    ? { ...old, flyFrame: 4, frames: old.frames.map(rows => rows.map(row => [...row].map(c => (c === '.' ? null : QPAL[QUAD_SPRITE.alphabet.indexOf(c)])))) }
    : { ...SETS[name], frames: SETS[name].frames.map(f => f.map(row => row.map(liftBlock))) }
}
for (const set of Object.values(QUAD_SETS)) {
  let bottom = 0
  for (const f of set.frames) f.forEach((row, y) => { if (row.some(c => c)) bottom = Math.max(bottom, y) })
  set.drop = ground - bottom // (the older sleep lay two rows lower: drawn that much higher)
}
const setsFor = mode => (mode === 'braille' ? SETS : QUAD_SETS)
export const DOG_ROWS = Math.ceil((ground + 1) / 4)
export const DOG_COLS = Math.ceil(SW / 2)

// a frame moved down (or up) onto the grass by its set's drop
function shifted(set, frame) {
  if (set.drop > 0) return [...Array.from({ length: set.drop }, () => Array(SW).fill(null)), ...frame.slice(0, frame.length - set.drop)]
  if (set.drop < 0) return [...frame.slice(-set.drop), ...Array.from({ length: -set.drop }, () => Array(SW).fill(null))]
  return frame
}
// the frame at a point (0-1) of one pass through a set, by its frames' own durations (the catch: one pass per throw)
function frameAt(set, phase) {
  const total = set.durations.reduce((a, b) => a + b, 0)
  let t = phase * total
  for (let i = 0; i < set.durations.length; i++) { if (t < set.durations[i]) return i; t -= set.durations[i] }
  return set.durations.length - 1
}
// where (0-1) in that pass a frame begins
const frameStart = (set, i) => set.durations.slice(0, i).reduce((a, b) => a + b, 0) / set.durations.reduce((a, b) => a + b, 0)
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
  const S = setsFor(mode)
  const set = pct >= 97 ? S.sleep : pct >= 80 ? S.pant : S.run
  const frame = shifted(set, set.frames[pick(set, ms)])
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
  door: 'door', catch: 'jump', droop: 'droop', stretch: 'stretch', eat: 'eat', pet: 'pet',
}
// Little things drawn beside him, on square pixels (2 x 2 sub-pixels in quad mode). Each letter is a colour of `colors`.
const PROPS = {
  door: { art: ['dddddd', 'dwwwwd', 'dwppwd', 'dwppwd', 'dwwwwd', 'dwppwd', 'dwppwd', 'dwwwkd', 'dwwwwd', 'dwppwd', 'dwppwd', 'dwwwwd'],
    colors: { d: [92, 60, 36], w: [152, 102, 62], p: [126, 82, 48], k: [242, 204, 84] } },
  bowl: { art: ['.fffff.', 'bbbbbbb', '.bbbbb.'], colors: { f: [190, 124, 72], b: [206, 66, 66] } },
  // (`dots`: the art used in braille, where a prop pixel is one dot and the 2 x 2 art came out too small to see)
  frisbee: { art: ['.rr.', 'rrrr'], dots: ['..rrrr..', '.rwwwwr.', 'rrrrrrrr', '.rrrrrr.'], colors: { r: [236, 72, 64], w: [255, 150, 140] } },
  heart: { art: ['h.h', 'hhh', '.h.'], colors: { h: [255, 120, 160] } },
  pouch: { art: ['.g.g.', '..r..', '.rrr.', 'rrrrr', '.rrr.'], colors: { g: [246, 206, 90], r: [214, 46, 60] } },
  songpyeon: { art: ['.a..b..c.', 'aaabbbccc'], colors: { a: [250, 196, 210], b: [246, 244, 236], c: [170, 214, 150] } },
  cake: { art: ['..y..', '..w..', 'ppppp', 'ccccc', 'ccccc'], colors: { y: [255, 200, 80], w: [240, 240, 246], p: [255, 170, 200], c: [214, 160, 110] } },
}
// Seollal and Chuseok by the solar date they fall on (the day before to the day after count)
const HOLIDAYS = {
  seollal: ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'],
  chuseok: ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12'],
}
export function holidayOf(year, month, day) {
  const t = Date.UTC(year, month - 1, day)
  for (const [name, dates] of Object.entries(HOLIDAYS)) {
    for (const d of dates) if (Math.abs(Date.parse(d + 'T00:00:00Z') - t) <= 86400000) return name
  }
  return null
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
const CAPE_X = 27 // the flight pose's shoulders (sub-pixels from his left), where the cape starts
const CAPE_BACK = 19 // how far back along his back it lies before it streams off behind
const FLY_FRAME = 6 // in the run set (two in-betweens per key): key pose 4, stretched flat out in the air
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
// the sun in four tones: a pale highlight, the body, a deeper rim, and its rays (one sun pixel is half a cell, so
// every cell holds at most two of them and the shading comes through whole)
const SUN_DAWN = { hi: [255, 236, 222], core: [255, 192, 168], rim: [238, 124, 140], ray: [246, 138, 156] }
const SUN_DAY = { hi: [255, 252, 214], core: [255, 226, 92], rim: [255, 168, 46], ray: [255, 204, 84] }
const SUN_DUSK = { hi: [255, 222, 164], core: [255, 162, 80], rim: [226, 88, 48], ray: [240, 112, 62] }
const MOON = { core: [240, 236, 214], rim: [204, 199, 176] }
const STAR = [[226, 230, 255], [150, 160, 210]]
// The sun and the moon, drawn by hand on square pixels: a terminal cell is twice as tall as it is wide, so in quad
// mode one art pixel is 2 x 2 sub-pixels (a whole quarter-block pair), in braille 1 x 1 dot.
// c: the body, s: its shaded edge, r / R: the sun's rays, two sets that take turns twinkling
const SUN_ART = [
  '....r....',
  '.R.....R.',
  '...ooo...',
  '..ohyyo..',
  'r.oyyyo.r',
  '..oyyoo..',
  '...ooo...',
  '.R.....R.',
  '....r....',
]
const SUN_SMALL = ['R.r.R', '.hyo.', 'ryyor', '.yoo.', 'R.r.R']
// The crescent moon is cut from two true circles at twice the sun's horizontal resolution: one moon pixel is one
// sub-pixel wide and two tall (a single quarter block, half a cell wide), which a round shape this small needs
// tilted a little (the opening turned 18 degrees up), s: a thin shade along the inner curve, close to the body's colour
// so a cell that holds both still reads as one
const MOON_ART = [
  '...cccss.....',
  '..cccs.......',
  '.cccs........',
  'ccccs........',
  '.ccccs.......',
  '..ccccss.....',
  '...ccccccccss',
]
// Chuseok's full moon: a true circle at the moon's resolution, with a few soft craters
const MOON_FULL = (() => {
  const R = 6.5, W = 14, Hq = 7, cx = W / 2, cy = Hq
  const craters = [[5.2, 4.6, 1.4], [9.0, 8.4, 1.6], [6.4, 10.2, 1.0]]
  const rows = []
  for (let qy = 0; qy < Hq; qy++) {
    let r = ''
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = qy * 2 + 1
      if (Math.hypot(px - cx, py - cy) > R) { r += '.'; continue }
      r += craters.some(([ax, ay, ar]) => Math.hypot(px - ax, py - ay) <= ar) ? 's' : 'c'
    }
    rows.push(r)
  }
  return rows
})()
const MOON_SMALL = [
  '..ccs...',
  '.ccs....',
  'cccs....',
  '.cccs...',
  '..cccccc',
]

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
/** Terry's whole picture as sub-pixel colours (canvas: rows*4 lines of columns*2 [r,g,b] or null) plus the text marks
 *  drawn over it (! * ? z) in cell coordinates. The terminal turns it into cells; the web view draws it directly. */
export function terryScene(mood, ms, mode, hour = 12, columns = TERRY_COLS, effort = 'high', date = null) {

  const TW = columns * 2
  const H = TERRY_ROWS * 4
  const canvas = Array.from({ length: H }, () => Array(TW).fill(null))
  const put = (x, y, c) => { if (x >= 0 && x < TW && y >= 0 && y < H) canvas[y][x] = c }
  const PX = mode === 'braille' ? 1 : 2
  // a prop from PROPS with its bottom-left pixel at (left, bottom)
  const prop = (name, left, bottom) => {
    const { colors } = PROPS[name]
    const art = (mode === 'braille' && PROPS[name].dots) || PROPS[name].art
    const top = bottom - art.length * PX + 1
    art.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return
      for (let i = 0; i < PX; i++) for (let k = 0; k < PX; k++) put(left + x * PX + i, top + y * PX + k, colors[ch])
    }))
  }
  const t = ms / 1000
  const style = runStyle(effort)
  const running = mood === 'run'
  const sets = mode !== 'braille' ? QUAD_SETS : date && date.style === 'real' ? { ...SETS, ...REAL } : SETS
  const set = (running ? sets[style.set] : sets[MOOD_FRAMES[mood]]) || sets.sit
  // flying, he holds the stretched-out flight pose of the gallop (legs reaching fore and aft) instead of striding
  // catching: crouch while the frisbee comes, leap for it, land with it (the frame follows the throw, not a timer)
  const throwPhase = mood === 'catch' ? (ms / 1600) % 1 : 0
  const index = running && style.fly ? set.flyFrame ?? FLY_FRAME
    // (four frames: watching it come, a crouch, the leap held at the top, landed; the older three-frame set has no crouch)
    : mood === 'catch' && set.catchAt != null ? frameAt(set, throwPhase)
    : mood === 'catch' ? (set.frames.length >= 4 ? (throwPhase < 0.36 ? 0 : throwPhase < 0.44 ? 1 : throwPhase < 0.82 ? 2 : 3) : throwPhase < 0.42 ? 0 : throwPhase < 0.82 ? 1 : 2)
    : mood === 'stretch' ? pick(set, date && date.moodMs != null ? date.moodMs : ms) // from the start of the stretch
    : pick(set, running ? ms * style.speed : ms)
  const yawning = mood === 'stretch' && index >= 5 && index <= 7 // eyes shut through the yawn
  let frame = closeEyes(set.frames[index], mood === 'sleep' || yawning || isBlinking(ms))
  // fetching: he runs off to the right, then comes back the other way with a stick in his mouth
  const fetchPhase = mood === 'fetch' ? (ms / 3200) % 1 : 0
  const fetchBack = mood === 'fetch' && fetchPhase >= 0.5
  if (fetchBack) frame = frame.map(row => row.slice().reverse())
  const mouthAt = set.mouth && set.mouth[index] ? [set.mouth[index][0], set.mouth[index][1] + Math.max(0, set.drop)] : null
  frame = shifted(set, frame)
  const trail = Math.max(1, Math.min(TRAIL_COLS, columns - DOG_COLS - 1))
  const homeX = trail * 2
  const away = TW - homeX + 6
  const dogX = mood !== 'fetch' ? homeX
    : fetchPhase < 0.5 ? homeX + Math.round((fetchPhase / 0.5) * away)
    : homeX + Math.round((1 - (fetchPhase - 0.5) / 0.5) * away)

  // the sky, right of his nose (where he stands at home: fetching, he runs past the sun, it doesn't follow him)
  const skyX0 = homeX + SW + 1
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
  // the season, from the real date: snow in winter, petals in spring, fireflies on summer nights, leaves in autumn,
  // fireworks on New Year's Eve and New Year's night
  if (date) {
    const { month, day } = date
    const drift = running ? t * style.ground * 0.4 : 0
    const wrap = v => ((v % TW) + TW) % TW
    const shape = (x, y, dots, c) => { for (const [dx, dy] of dots) put(x + dx, y + dy, c) }
    if (mode === 'braille') {
      // In braille every dot is a pixel, so the season gets shapes: tumbling leaves, star-shaped flakes, spinning
      // petals, glowing fireflies — the near ones larger and brighter, the far ones single dim dots.
      const near = i => hash(i, 861) < 0.4
      const dim = (c, k) => c.map(v => Math.round(v * k))
      if (month === 12 || month <= 2) {
        for (let i = 0; i < 26; i++) {
          const close = near(i)
          const y = Math.floor((hash(i, 802) * ground + t * (close ? 6 : 3) * (1 + hash(i, 803))) % (ground - 1))
          const x = Math.floor(wrap(hash(i, 801) * TW + Math.sin(t * 1.3 + i) * 2.5 - drift * (close ? 1.4 : 0.7)))
          if (close) shape(x, y, [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]], [240, 244, 252])
          else put(x, y, [180, 186, 200])
        }
      } else if (month <= 5) {
        const PETAL_SPIN = [[[0, 0], [1, 0]], [[0, 0], [1, 1]], [[0, 0], [0, 1]], [[1, 0], [0, 1]]]
        for (let i = 0; i < 16; i++) {
          const close = near(i)
          const y = Math.floor((hash(i, 812) * ground + t * (close ? 4.5 : 2.5)) % (ground - 1))
          const x = Math.floor(wrap(hash(i, 811) * TW - t * 5 + Math.sin(t * 2 + i) * 3 - drift))
          const c = i % 3 ? [255, 183, 205] : [255, 214, 226]
          if (close) shape(x, y, PETAL_SPIN[Math.floor(t * 3 + i) % 4], c)
          else put(x, y, dim(c, 0.75))
        }
      } else if (month <= 8) {
        if (!isDay) {
          for (let i = 0; i < 9; i++) {
            const glow = Math.sin(t * (1.5 + hash(i, 823)) + i * 1.7)
            if (glow < 0) continue
            const x = Math.floor(wrap(hash(i, 821) * TW + Math.sin(t * 0.7 + i) * 6 - drift))
            const y = Math.floor(ground - 4 - hash(i, 822) * (ground - 10) + Math.sin(t + i) * 2)
            put(x, y, [214, 244, 96])
            if (glow > 0.6) shape(x, y, [[1, 0], [-1, 0], [0, 1], [0, -1]], [96, 120, 50]) // the glow around it
          }
        }
      } else {
        // autumn: leaves tumbling as they fall (the shape turns), swaying side to side; a few already on the grass
        const LEAVES = [[214, 120, 40], [196, 70, 38], [232, 182, 62], [168, 96, 44]]
        const SPIN = [
          [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]],
          [[0, 0], [1, 0], [1, 1], [2, 1]],
          [[1, 0], [0, 1], [1, 1], [0, 2]],
          [[0, 0], [1, 1], [2, 1], [1, 2]],
        ]
        for (let i = 0; i < 14; i++) {
          const close = near(i)
          const y = Math.floor((hash(i, 832) * ground + t * (close ? 4 : 2.2) * (1 + hash(i, 833) * 0.6)) % (ground - 2))
          const x = Math.floor(wrap(hash(i, 831) * TW + Math.sin(t * 1.6 + i * 2) * (close ? 5 : 3) - drift * (close ? 1.3 : 0.7)))
          const c = LEAVES[i % 4]
          if (close) shape(x, y, SPIN[Math.floor(t * 2.5 + i) % 4], c)
          else shape(x, y, (Math.floor(t * 2 + i) % 2) ? [[0, 0], [1, 0]] : [[0, 0], [0, 1]], dim(c, 0.7))
        }
      }
    } else {
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

  // the sun or the moon, over the season's petals, leaves and snow (none in a narrow window; the stars stay)
  // (not while the '?' bubble is up: it sits in the same patch of sky)
  if (skyW >= 10 && mood !== 'ask' && mood !== 'door') {
    const px = mode === 'braille' ? 1 : 2 // one sun pixel, in sub-pixels each way
    const big = skyW >= SUN_ART[0].length * px + 2
    const art = isDay ? (big ? SUN_ART : SUN_SMALL) : date && date.holiday === 'chuseok' ? MOON_FULL : big ? MOON_ART : MOON_SMALL
    const pw = isDay ? px : 1 // the moon's pixels are finer: one sub-pixel wide,
    const ph = isDay ? px : 2 // two tall
    const w = art[0].length * pw
    let left = Math.min(TW - 1 - w, Math.max(skyX0, bx - Math.floor(w / 2)))
    let top = Math.max(0, by - Math.floor((art.length * ph) / 2))
    left -= left % pw // on whole quarter blocks, so no art pixel is split across two
    top -= top % ph
    const twinkle = Math.floor(t * 1.6) % 2
    art.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return
      if ((ch === 'r' && twinkle) || (ch === 'R' && !twinkle)) return
      const c = ch === 'h' ? look.hi : ch === 'c' || ch === 'y' ? look.core : ch === 'r' || ch === 'R' ? look.ray || look.rim : look.rim
      for (let i = 0; i < pw; i++) for (let k = 0; k < ph; k++) put(left + x * pw + i, top + y * ph + k, c)
    }))
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
  }  // braille: what the season leaves on the grass — settled snow, fallen leaves (they slide by with the ground)
  if (date && mode === 'braille') {
    const slide = running ? Math.floor(t * style.ground) : 0
    const { month } = date
    if (month === 12 || month <= 2) for (let x = 0; x < TW; x++) { if (hash(x + slide, 871) < 0.4) put(x, ground - 1, [226, 230, 240]) }
    else if (month >= 9 && month <= 11) {
      const FALLEN = [[214, 120, 40], [196, 70, 38], [232, 182, 62], [168, 96, 44]]
      for (let x = 0; x < TW; x++) if (hash(x + slide, 881) < 0.08) put(x, ground - 1, FALLEN[(x + slide) % 4])
    }
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
  // a test passed: a frisbee sails in from the right, he leaps for it and lands with it in his mouth
  const catchPhase = mood === 'catch' ? (ms / 1600) % 1 : 0
  // (the traced leap is already drawn in the air, up to the top of the picture: it gets no extra hop)
  const hop = mood === 'catch' && !set.mouth && set.catchAt == null && catchPhase >= 0.42 && catchPhase < 0.82 ? Math.round(Math.sin((Math.PI * (catchPhase - 0.42)) / 0.4) * 1) : 0 // (the leap pose is already up in the air: lifted more, his head went off the top)
  const lift = running && style.fly ? 5 + Math.round(Math.sin(t * 6)) : hop
  // the cape's run along his back, from the shoulders to the rump: a straight line between the top of his coat at each
  // end (a tuft standing above it is covered too), as [x, top, bottom] on the canvas. Its bottom ends on a cell's last
  // row, so no cell is shared by the red and his coat (a cell shows one colour: shared, the cape broke into pieces)
  const capeBack = [], capeTail = []
  if (running && style.fly) {
    const topAt = x => { let y = 6; while (y < frame.length && !frame[y][x]) y++; return y }
    const y0 = topAt(CAPE_X), y1 = topAt(CAPE_X - CAPE_BACK)
    for (let u = 0; u <= CAPE_BACK; u++) {
      const x = CAPE_X - u
      const line = Math.round(y0 + ((y1 - y0) * u) / CAPE_BACK) - lift
      capeBack.push([dogX + x, Math.min(topAt(x) - lift, line), (line + 2) | 3])
    }
  }
  if (lift && running && style.fly) {
    for (let x = dogX + 10; x < dogX + SW - 12; x++) put(x, ground, [34, 70, 34]) // his shadow on the grass
    // clouds racing by in the sky
    for (let i = 0; i < 3; i++) {
      const cx = TW + 8 - Math.floor(((t * 1.6 + i / 3) % 1) * (TW + 16))
      const cy = 3 + i * 4
      const cloud = isDay ? [226, 232, 244] : [74, 78, 98]
      for (let dx = -3; dx <= 3; dx++) put(cx + dx, cy, cloud)
      for (let dx = -1; dx <= 2; dx++) put(cx + dx, cy - 1, cloud)
    }
    // the cape: lying on his back from the shoulders to the rump, then streaming back over his tail as a ribbon, waving
    // harder toward its free end (both drawn over him, below: behind him, his tail cut the ribbon off from his back)
    const ax = dogX + CAPE_X
    const ay = capeBack[capeBack.length - 1][1]
    const L = 30
    for (let u = 0; u <= L; u++) {
      const k = u / L
      const wave = Math.sin(u * 0.38 - t * 16) * (0.4 + 2.6 * k)
      const slope = Math.cos(u * 0.38 - t * 16)
      const top = Math.round(ay - u * 0.1 + wave * Math.min(1, u / 4))
      const thick = Math.round(4 + 3 * k)
      for (let w = 0; w < thick; w++) {
        const c = w === 0 ? [244, 92, 96] : slope < -0.3 ? [150, 22, 34] : [214, 38, 48]
        capeTail.push([ax - CAPE_BACK - u, top + w, c])
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

  // props beside him: the door he waits at, his dinner bowl, holiday things, the anniversary cake
  const right = dogX + SW + 1
  if (mood === 'door') prop('door', right, ground)
  if (mood === 'eat') {
    // the bowl under his nose: the front-most of his pixels in the rows just above the ground
    let nose = 30
    frame.forEach((row, y) => { if (y >= ground - 10) row.forEach((c, x) => { if (c && x > nose) nose = x }) })
    prop('bowl', dogX + nose - (mode === 'braille' ? 6 : 8), ground)
  }
  const idle = mood === 'sit' || mood === 'wag' || mood === 'bark' || mood === 'sleep' || mood === 'happy' || mood === 'pet'
  if (date && idle) {
    if (date.anniversary) prop('cake', right, ground)
    else if (date.holiday === 'seollal') prop('pouch', right, ground)
    else if (date.holiday === 'chuseok') prop('songpyeon', right, ground)
  }

  // Terry on top
  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < SW; x++) {
      const c = frame[y][x]
      if (c) put(dogX + x, y - lift, c)
    }
  }
  // the cape over his back, its upper edge lit
  for (const [x, top, bottom] of capeBack) for (let y = top; y <= bottom; y++) put(x, y, y === top ? [244, 92, 96] : [214, 38, 48])
  for (const [x, y, c] of capeTail) put(x, y, c)
  // the request failed: a tear rolling down from his eye and a little rain cloud just above his drooping head
  if (mood === 'sad' || mood === 'droop') {
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
  // waiting for a permission: a rounded white speech bubble beside his head, lined up on whole cells so a real '?' fits
  // in its middle; to the right of his head when there is room, otherwise over his back
  const BW = 5 // cells
  const rightCol = Math.ceil((dogX + SW) / 2)
  const bubbleCol = rightCol + BW <= columns ? rightCol : Math.max(0, Math.floor(dogX / 2) + 2)
  const bubbleLeft = bubbleCol < rightCol
  if (mood === 'ask') {
    const bx0 = bubbleCol * 2, W = BW * 2, Hb = 16
    const inset = y => (y === 0 || y === Hb - 1 ? 2 : y === 1 || y === Hb - 2 ? 1 : 0) // rounded corners
    const inside = (x, y) => y >= 0 && y < Hb && x >= inset(y) && x < W - inset(y)
    if (mode === 'braille') {
      // in dots a filled bubble can't hold a letter (a cell is dots or text), so the bubble is drawn as its outline
      // and the '?' in dots inside it
      for (let y = 0; y < Hb; y++) for (let x = 0; x < W; x++) {
        const edge = !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))
        if (inside(x, y)) put(bx0 + x, y, edge ? [240, 240, 246] : null) // (inside it, no snow or petals)
      }
      // a bold '?', two dots thick, so it still reads through the font's gaps between braille rows; it fills the two
      // middle cell rows exactly, so no cell holds both the '?' and the outline (a cell has one colour: the outline's
      // white took over the '?' where they shared one)
      const Q = ['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..']
      if (Math.floor(ms / 600) % 4 !== 3) Q.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') put(bx0 + 2 + x, 4 + y, [255, 214, 102]) }))
    } else for (let y = 0; y < Hb; y++) for (let x = inset(y); x < W - inset(y); x++) put(bx0 + x, y, [240, 240, 246])
    // the tail, a little hook toward his head
    const tail = bubbleLeft ? [[W - 2, Hb], [W - 1, Hb], [W, Hb + 1], [W + 1, Hb + 2]] : [[1, Hb], [0, Hb], [-1, Hb + 1], [-2, Hb + 2]]
    for (const [x, y] of tail) put(bx0 + x, y, [240, 240, 246])
  }
  // the frisbee: flying in along an arc, then held in his mouth (found as his rightmost pixel in the head rows)
  if (mood === 'catch') {
    // his mouth: the open mouth (its red tongue and inside) when he leaps, otherwise the tip of his nose
    // (a traced pose carries where its mouth is; for the others it is found)
    let [mx, my] = mouthAt || [-1, -1]
    if (mx < 0) frame.forEach((row, y) => row.forEach((c, x) => { if (c && c[0] > 90 && c[0] > c[1] * 1.6 && c[0] > c[2] * 1.4 && x > mx) { mx = x; my = y } }))
    if (mx < 0) {
      mx = 40; my = 14
      for (let y = 0; y < 24; y++) for (let x = SW - 1; x >= 0; x--) if (frame[y] && frame[y][x]) { if (x > mx) { mx = x; my = y } break }
    }
    const fArt = (mode === 'braille' && PROPS.frisbee.dots) || PROPS.frisbee.art
    const fw = fArt[0].length * PX
    // held across the jaws: its back edge in his mouth, the rest sticking out in front, its middle at mouth height
    const hx = dogX + mx - Math.floor(fw / 4), hy = my - lift + Math.ceil(fArt.length * PX / 2) - 1
    const caughtAt = set.catchAt != null ? frameStart(set, set.catchAt) : 0.5 // caught at the top of the leap
    const k = Math.min(1, catchPhase / caughtAt)
    const fx = Math.round(TW + 4 + (hx - TW - 4) * k), fy = Math.round(3 + (hy - 3) * k - Math.sin(Math.PI * k) * 6)
    prop('frisbee', catchPhase < caughtAt ? fx : hx, Math.max(fArt.length * PX - 1, catchPhase < caughtAt ? fy : hy))
  }
  // petted: hearts floating up from his head
  if (mood === 'pet') {
    for (let i = 0; i < 2; i++) {
      const age = (t * 0.9 + i / 2) % 1
      prop('heart', dogX + 40 + i * 7 + Math.round(Math.sin(age * 6 + i) * 2), Math.round(10 - age * 10)) // (ahead of his face, not over it)
    }
  }
  // the stick he brings back, held across his mouth
  if (fetchBack) {
    const [sx, sy] = mouthAt ? [SW - 1 - mouthAt[0], mouthAt[1] - lift] : [0, 15] // (the frame is turned round: so is the mouth)
    for (let k = -6; k <= 5; k++) { put(dogX + sx + k, sy, [156, 108, 62]); if (k > -5 && k < 4) put(dogX + sx + k, sy + 1, [118, 80, 44]) }
  }
  const marks = []
  const mark = (x, y, text, color) => marks.push({ x, y, text, color })
  const markX = Math.ceil((dogX + SW) / 2)
  if (mood === 'bark' && Math.floor(ms / 340) % 2 === 0) mark(markX, 1, '!', 0xffd166)
  if (mood === 'happy' && Math.floor(ms / 300) % 2 === 0) mark(markX, 0, '*', 0xffd166)
  if (mood === 'ask' && mode !== 'braille' && Math.floor(ms / 600) % 4 !== 3) mark(bubbleCol + 2, 1, '?', 0x2a2a36)
  if (mood === 'sleep') {
    const phase = Math.floor(ms / 700) % 3
    mark(markX - 3, 3, 'z', 0x9aa4c8)
    if (phase >= 1) mark(markX - 2, 2, 'Z', 0x9aa4c8)
    if (phase >= 2) mark(markX - 1, 1, 'Z', 0xb8c0e0)
  }
  return { canvas, columns, marks }
}

export function terryCells(mood, ms, mode, hour = 12, columns = TERRY_COLS, effort = 'high', date = null) {
  const { canvas, marks } = terryScene(mood, ms, mode, hour, columns, effort, date)
  const cells = canvasToCellList(canvas, columns, TERRY_ROWS, mode)
  for (const m of marks) writeText(cells, columns, m.x, m.y, m.text, m.color)
  return packCells(cells)
}
