// The ladder card drawn with the terminal's own pixels, through the Lode Cells font (docs/preview/lode/cellfont.py):
// the scene is drawn at screen resolution, 8 x 16 pixels to a cell, and every cell becomes one of the font's glyphs
// (a picture of which of its pixels are lit) in a foreground and a background colour. The glyphs are the cells this
// very scene produces, gathered beforehand (docs/preview/lode/harvest.mjs); a cell that was never gathered takes the
// nearest glyph. The same story as lode.js, three times finer: the runner and the monk from rig.py at scale 3.
import FINE from './lode-fine-data.js'
import GLYPHS from './lode-glyphs.js'
import { TERRY_ROWS, packCells, writeText } from './render.js'
import { onRouteOf } from './lode.js'

export const CW = 8
export const CH = 16
export const GLYPH_BASE = 0x100000 // Supplementary Private Use Area-B: WaveTerm's Hack Nerd Font leaves it empty
const DEFAULT = 0x01000000

const KEYS = {
  A: '2e2018', a: '5a4030', K: 'f0bc92', k: 'c88e66', E: '141414', U: 'f2f4f8', u: 'c4cad4', q: '8e96a4', V: '262630',
  v: '50505e', N: '9a6636', n: '64401e', O: '3a2614', M: '707888', m: '3e4450', L: 'ff8a3c', R: 'd03030', r: '8a1a1a',
  Z: '560c0c', B: 'f2ecd8', b: 'bcb096', G: 'f5c542', g: 'b8860b', Y: 'fff2a8',
}
const KEYI = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, parseInt(v, 16)]))
const [SW, SH] = FINE.size // 72 x 96

// frames, decoded once: each a list of rows of keys
const unrle = row => row.replace(/(\d+)(.)/g, (_, n, k) => k.repeat(+n))
const FR = {}
for (const [hero, sets] of Object.entries(FINE.frames)) {
  FR[hero] = {}
  for (const [name, frames] of Object.entries(sets)) FR[hero][name] = frames.map(f => f.map(unrle))
}

// the scene, in screen pixels (everything three times lode.js's sizes)
const FLOOR = 144 // the top of the ledge he stands on: the card's last cell row
const LEDGE = 16
const STOREY = 128 // the ledge above shows as a band in the second cell row
const LADDER_W = 21
const BAR_H = SH - 9 // at his raised hands
const TURF_TOP = 0xaaff50, TURF = 0x68d628
const RAIL = 0xd6dae0, RAIL_SHADE = 0x969ca6, RUNG = 0xf0f2f6, BAR = 0xececE4
const GOLD = 0xf5c542, GOLD_DARK = 0xb8860b, GLINT = 0xfffadc, BEAM = 0xff6a3c, BEAM_HOT = 0xffd67a
const SCALE = 3
const route = onRouteOf(SCALE)
const ROUND_W = route.storey(6).x0 - route.storey(0).x0 // the route repeats every six storeys, this far to the right

// the turf's texture repeats every cell width, so a cell of turf is one of a few glyphs however far it has scrolled;
// and it is two colours, the bright top and flecks of it in the green, so a cell can draw it exactly
const turfAt = (wx, r) => {
  if (r < 3) return TURF_TOP
  const f = (((wx % CW) + CW) % CW) * 5 + r * 3
  return f % 11 === 0 && r < LEDGE - 2 ? TURF_TOP : TURF
}

export function fineScene(hero, mood, ms, columns, effort = 'high') {
  const W = columns * CW
  const H = TERRY_ROWS * CH
  const px = new Int32Array(W * H).fill(-1)
  const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c }
  const clear = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = -1 }
  const sprite = (rows, left, bottom) => {
    const top = bottom - rows.length + 1
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y]
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') put(left + x, top + y, KEYI[row[x]])
    }
  }
  const marks = []
  const t = ms / 1000
  const running = mood === 'run' || mood === 'fetch'
  const pace = route.PACE[effort] ?? 1
  const here = running ? route.onRoute(t * pace) : { k: 0, x: route.storey(0).x0 + 42, up: 0, kind: 'stand', step: 0 }
  // he stands on a cell boundary: his cells are always the same glyphs
  const leftCell = Math.max(1, Math.round(columns * (hero === 'runner' && running ? 0.5 : 0.36)) - 4)
  const left = leftCell * CW
  const MX = left + SW / 2
  const sx = x => MX + Math.round(x - here.x)
  const sy = (k, h) => FLOOR - Math.round(k * STOREY + h - (here.k * STOREY + here.up))

  for (let k = here.k - 1; k <= here.k + 1; k++) {
    const st = route.storey(k), prev = route.storey(k - 1)
    const top = sy(k, 0)
    for (let x = Math.max(0, sx(prev.ladder - 90)); x <= Math.min(W - 1, sx(st.ladder + LADDER_W + 30)); x++) {
      if (st.gap && x >= sx(st.gapFrom + 6) && x <= sx(st.gapTo - 6)) continue
      const wx = x - sx(Math.floor(k / 6) * ROUND_W) // the same texture every round, so the same glyphs
      for (let r = 0; r < LEDGE; r++) put(x, top + r, turfAt(wx, r))
    }
    if (st.gap) for (let x = sx(st.gapFrom - 36); x <= sx(st.gapTo + 36); x++) for (let r = 0; r < 3; r++) put(x, sy(k, BAR_H) + r, BAR)
    const lx = sx(st.ladder) - Math.floor(LADDER_W / 2)
    for (let h = 0; h <= STOREY; h++) {
      const y = sy(k, h)
      for (let r = 0; r < 3; r++) { put(lx + r, y, RAIL); put(lx + LADDER_W - 1 - r, y, RAIL_SHADE) }
      if (h % 12 < 3) for (let x = lx + 3; x < lx + LADDER_W - 3; x++) put(x, y, RUNG)
    }
    const gone = k < here.k || (k === here.k && running && here.x > st.gold)
    if (!gone) {
      const gx = sx(st.gold) - 7, gy = sy(k, 0) - 15
      const skull = ['.GGG.', 'GYGGG', 'GgGgG', 'GGGGG', '.GgG.']
      skull.forEach((row, y) => [...row].forEach((c, x) => {
        if (c === '.') return
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) put(gx + x * 3 + dx, gy + y * 3 + dy, c === 'G' ? GOLD : c === 'g' ? GOLD_DARK : GLINT)
      }))
    }
  }

  const streaks = []
  if (running && pace >= 1.5 && here.kind === 'walk') {
    for (let n = 0; n < 3; n++) {
      const y = FLOOR - 24 - n * 24
      const head = left - 3 - Math.floor(((t * 3 + n * 0.37) % 1) * 36)
      for (let k = 0; k < 18; k++) for (let r = 0; r < 2; r++) streaks.push(head - k, y + r, k < 6 ? 0xe8ecf6 : 0x828696)
    }
  }

  const F = FR[hero] || FR.runner
  const feet = FLOOR - 1
  const cellX = leftCell + 4
  const pose = (G, at) => {
    const frames = at.kind === 'climb' ? G.climb : at.kind === 'hang' ? G.hang : G.walk
    const per = at.kind === 'walk' ? 6 : 12
    return frames[Math.floor(at.step / per) % frames.length]
  }
  if (running) {
    if (hero === 'runner' && t * pace > route.CHASE_SECS) {
      const m = route.onRoute(t * pace - route.CHASE_SECS)
      sprite(pose(FR.monk, m), sx(m.x) - SW / 2, sy(m.k, m.up) - 1)
    }
    sprite(pose(F, here), left, feet)
  } else if (mood === 'sad' || mood === 'droop') {
    for (let x = left + 6; x < left + SW - 6; x++) for (let r = 0; r < LEDGE; r++) clear(x, FLOOR + r)
    sprite(F.stuck[Math.floor(t * 4) % 2], left, FLOOR + LEDGE - 1)
  } else if (mood === 'sleep') {
    sprite(F.sleep[Math.floor(t / 1.2) % 2], left, feet)
    const p = Math.floor(t / 0.7) % 3
    marks.push([cellX + 4, 3, 'z'])
    if (p >= 1) marks.push([cellX + 5, 2, 'Z'])
    if (p >= 2) marks.push([cellX + 6, 1, 'Z'])
  } else if (mood === 'happy' || mood === 'catch' || mood === 'pet' || mood === 'bark') {
    sprite(F.happy[Math.floor(t / 0.25) % 2], left, feet)
    if (mood === 'bark' && Math.floor(t / 0.34) % 2 === 0) marks.push([cellX + 4, 1, '!', 0xffd166])
    if (mood !== 'bark' && Math.floor(t / 0.3) % 2 === 0) marks.push([cellX + 4, 1, '*', 0xffd166])
  } else if ((mood === 'dig' || mood === 'sniff') && hero === 'runner') {
    const cycle = (t % 2.4) / 2.4
    const firing = cycle < 0.45
    sprite(F.dig[firing ? 1 : 0], left, feet)
    const [mx, my] = FINE.muzzle.runner[firing ? 1 : 0]
    const gx = left + mx, gy = feet - SH + 1 + my
    const hx = left + SW + 3
    const depth = Math.floor(Math.min(cycle, 0.45) / 0.45 * LEDGE)
    if (firing) {
      const span = Math.max(1, FLOOR + depth - gy)
      for (let k = 0; k < span; k++) {
        const x = gx + Math.round(k * (hx + 9 - gx) / span)
        for (let w = 0; w < 3; w++) put(x + w, gy + k, k % 6 < 3 ? BEAM_HOT : BEAM)
      }
    }
    const open = cycle < 0.85 ? Math.max(depth, cycle >= 0.45 ? LEDGE : 0) : 0
    for (let x = hx; x < hx + 24; x++) for (let r = 0; r < open; r++) clear(x, FLOOR + r)
  } else if (mood === 'dig' || mood === 'sniff') {
    sprite(F.dig[Math.floor(t / 0.35) % 2], left, feet)
  } else {
    const out = mood === 'wag' || mood === 'ask' || Math.floor(t / 1.5) % 4 === 3
    sprite(F.idle[out ? 1 : 0], left, feet)
    if (mood === 'ask' && Math.floor(t / 0.6) % 4 !== 3) marks.push([cellX + 4, 1, '?', 0xffd166])
  }
  // speed lines only through cells nothing else is in: across the monk or a ledge they would make a new glyph at
  // every pixel they move
  if (streaks.length) {
    const busy = new Set()
    for (let i = 0; i < px.length; i++) if (px[i] !== -1) busy.add(Math.floor(i / W / CH) * columns + Math.floor((i % W) / CW))
    for (let i = 0; i < streaks.length; i += 3) {
      const x = streaks[i], y = streaks[i + 1]
      if (x >= 0 && !busy.has(Math.floor(y / CH) * columns + Math.floor(x / CW))) put(x, y, streaks[i + 2])
    }
  }
  return { px, W, H, marks }
}

// ---- cells: two colours each and which pixels take the first -----------------------------------------------------
const BG_GUESS = [24, 24, 30] // what a terminal background looks like, to weigh empty pixels against colours
const rgb = c => (c < 0 ? BG_GUESS : [(c >> 16) & 255, (c >> 8) & 255, c & 255])
const distOf = (a, b) => { const p = rgb(a), q = rgb(b); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 }
// remembered: a card has a few dozen colours, and the row search below asks for the same pairs over and over
const distMemo = new Map()
const dist = (a, b) => {
  const k = (a + 2) * 16777219 + b + 2
  let d = distMemo.get(k)
  if (d === undefined) {
    if (distMemo.size > 200000) distMemo.clear()
    distMemo.set(k, d = distOf(a, b))
  }
  return d
}

// A cell shows two colours of its own, its background and its glyph's, and a third borrowed from the cell on its left:
// that cell's glyph may reach on into this one (the terminal draws a glyph wider than its cell over the next cell;
// one reaching left is cut off). So where he passes a ladder or a bar, red, white and the dark between can all show.
// Each row is chosen left to right as a whole: every cell's glyph colour is picked for itself and for its neighbour.
// The choice is the one that misdraws the fewest pixels, where painting the background (or punching a hole in him)
// counts several times over, because those mistakes show as the cell's own square, moving with him; a pixel of one
// colour drawn in a nearby one hardly shows.
const EDGE = 6 // what an empty pixel painted, or a lit one left empty, costs against a colour slip
const cost = (v, c) => (v === c ? 0 : c === NONE ? Infinity : (v === -1) !== (c === -1) ? dist(v, c) * EDGE : dist(v, c))
const NONE = -2 // no glyph colour
const BORROW = 1 // a borrowed pixel costs a hair more, so a cell borrows only when it helps

/** every cell of the scene as {mask, over, fg, bg} or null: mask [4 words, bit r*8+c] the cell's own pixels in fg,
 * over the same for the pixels of the next cell its glyph draws, in fg too (colour -1 = the terminal's own) */
export function cellsOf(scene, columns, rows) {
  const { px, W } = scene
  const out = []
  for (let cy = 0; cy < rows; cy++) {
    // a row of pixels seen before (most of the card stands still from one frame to the next) gives the same cells
    const key = rowKey(px, cy * CH * W, CH * W, columns)
    const seen = rowMemo.get(key)
    if (seen) { out.push(...seen); continue }
    const start = out.length
    // each cell's colours and how many pixels of each
    const counts = []
    for (let cx = 0; cx < columns; cx++) {
      const m = new Map()
      for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
        const v = px[(cy * CH + r) * W + cx * CW + c]
        m.set(v, (m.get(v) || 0) + 1)
      }
      counts.push(m)
    }
    // best[cx]: for each glyph colour of cell cx, the least error of cells 0..cx and how it was reached
    const best = []
    for (let cx = 0; cx < columns; cx++) {
      const own = [...counts[cx].keys()]
      const fgs = new Set([NONE, ...own.filter(v => v !== -1)])
      if (cx + 1 < columns) for (const v of counts[cx + 1].keys()) if (v !== -1) fgs.add(v)
      const bgs = counts[cx].has(-1) ? own : [...own, -1]
      const prev = cx ? best[cx - 1] : new Map([[NONE, { e: 0 }]])
      const here = new Map()
      for (const fg of fgs) {
        let pick = null
        for (const [left, p] of prev) for (const bg of bgs) {
          let e = p.e
          for (const [v, n] of counts[cx]) {
            const o = Math.min(cost(v, bg), cost(v, fg)), l = cost(v, left) + BORROW
            e += n * (l < o ? l : o)
            if (e >= (pick ? pick.e : Infinity)) break
          }
          if (!pick || e < pick.e) pick = { e, left, bg }
        }
        here.set(fg, pick)
      }
      best.push(here)
    }
    // back from the right: each cell's colours, then its pixels
    const row = new Array(columns)
    let fg = NONE, e = Infinity
    for (const [k, p] of best[columns - 1]) if (p.e < e) { e = p.e; fg = k }
    for (let cx = columns - 1; cx >= 0; cx--) {
      const p = best[cx].get(fg)
      row[cx] = { fg, bg: p.bg, left: p.left }
      fg = p.left
    }
    for (let cx = 0; cx < columns; cx++) {
      const { fg, bg, left } = row[cx]
      const mask = [0, 0, 0, 0]
      let lit = 0, borrowed = false
      for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
        const v = px[(cy * CH + r) * W + cx * CW + c]
        const o = Math.min(cost(v, bg), cost(v, fg)), l = cost(v, left) + BORROW
        const i = r * CW + c
        if (l < o) { row[cx - 1].over[i >> 5] |= 1 << (i & 31); borrowed = true }
        else if (cost(v, fg) <= cost(v, bg)) { mask[i >> 5] |= 1 << (i & 31); lit++ }
      }
      row[cx].mask = mask
      row[cx].over = [0, 0, 0, 0]
      row[cx].lit = lit
    }
    for (let cx = 0; cx < columns; cx++) {
      const c = row[cx]
      const over = c.over.map(w => w >>> 0)
      if (c.fg === NONE && over.every(w => !w)) {
        out.push(c.bg === -1 ? null : { mask: [0, 0, 0, 0], over, fg: c.bg, bg: c.bg })
        continue
      }
      let { mask, fg, bg } = c
      // a cell more lit than not, lending nothing on, is the same glyph inverted, its colours swapped (when neither is
      // the terminal's)
      if (c.lit > 64 && bg !== -1 && over.every(w => !w)) {
        for (let i = 0; i < 4; i++) mask[i] = ~mask[i]
        ;[fg, bg] = [bg, fg]
      }
      out.push({ mask: mask.map(w => w >>> 0), over, fg, bg })
    }
    if (rowMemo.size > 4000) rowMemo.clear()
    rowMemo.set(key, out.slice(start))
  }
  return out
}
const rowMemo = new Map()
// a row's pixels as two 32-bit hashes (FNV-1a and a multiply-xor), and the row's width
function rowKey(px, from, n, columns) {
  let a = 0x811c9dc5, b = 0x9e3779b9
  for (let i = from; i < from + n; i++) {
    const v = px[i]
    a = Math.imul(a ^ v, 0x01000193)
    b = Math.imul(b ^ (v >>> 16) ^ (v << 16), 0x85ebca6b) ^ (b >>> 13)
  }
  return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + columns
}
/** a glyph's key: its own pixels (32 hex digits), then, if it reaches on, the next cell's (32 more) */
export const keyOf = (mask, over) => {
  const hex = m => m.map(w => w.toString(16).padStart(8, '0')).join('')
  return over && over.some(w => w) ? hex(mask) + hex(over) : hex(mask)
}

// ---- glyphs: the gathered masks, in the font's order ---------------------------------------------------------------
// The lists are kept as base64, 32 bytes a glyph (its 8 words, little-endian; the next cell's 4 are 0 when it reaches
// no further): the engine will not read a module file over 1 MB, and the hex keys took 1.2 MB a card
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** a list of glyph keys as that base64 */
export function packKeys(keys) {
  const bytes = new Uint8Array(keys.length * 32)
  keys.forEach((k, g) => {
    for (let i = 0; i < 8; i++) {
      const w = parseInt(k.slice(i * 8, i * 8 + 8) || '0', 16)
      for (let b = 0; b < 4; b++) bytes[g * 32 + i * 4 + b] = (w >>> (b * 8)) & 255
    }
  })
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
  }
  return out
}
/** packKeys back to the keys (keyOf's spelling) */
export function unpackKeys(b64) {
  const val = new Map([...B64].map((c, i) => [c, i]))
  const bytes = new Uint8Array(Math.floor(b64.replace(/=+$/, '').length * 3 / 4))
  for (let i = 0, o = 0; i < b64.length; i += 4) {
    const n = (val.get(b64[i]) << 18) | (val.get(b64[i + 1]) << 12) | ((val.get(b64[i + 2]) ?? 0) << 6) | (val.get(b64[i + 3]) ?? 0)
    for (const v of [n >> 16, (n >> 8) & 255, n & 255]) if (o < bytes.length) bytes[o++] = v & 255
  }
  const keys = []
  for (let g = 0; g < bytes.length / 32; g++) {
    const words = []
    for (let i = 0; i < 8; i++) {
      const j = g * 32 + i * 4
      words.push((bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24)) >>> 0)
    }
    keys.push(keyOf(words.slice(0, 4), words.slice(4)))
  }
  return keys
}

const pop = v => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24 }
/** a lookup for a gathered list of glyph keys laid out in the font from `base`: (mask, over) -> codepoint; a cell
 * never gathered takes the nearest glyph (fewest pixels different) */
export function glyphTable(keys, base) {
  const index = new Map(keys.map((k, i) => [k, i]))
  const words = keys.map(k => [0, 1, 2, 3, 4, 5, 6, 7].map(i => parseInt(k.slice(i * 8, i * 8 + 8) || '0', 16)))
  const nearest = new Map()
  return (mask, over) => {
    const key = keyOf(mask, over)
    let i = index.get(key) ?? nearest.get(key)
    if (i !== undefined) return base + i
    const want = [...mask, ...over]
    let best = 0, bestD = 1e9
    for (let g = 0; g < words.length; g++) {
      const w = words[g]
      let d = 0
      for (let j = 0; j < 8 && d < bestD; j++) d += pop(w[j] ^ want[j])
      if (d < bestD) { bestD = d; best = g; if (!d) break }
    }
    nearest.set(key, best)
    return base + best
  }
}
let lodeTable = null // unpacked on first use: a session that never draws with the font does not pay for it
const lodeGlyph = (mask, over) => (lodeTable ??= glyphTable(unpackKeys(GLYPHS), GLYPH_BASE))(mask, over)

/** cellsOf's cells as [codepoint, fg, bg] (render.js's DEFAULT for the terminal's own colour), through `glyph` */
export function cellList(cells, glyph) {
  // a cell all one colour, lending nothing on, is a blank in that background colour: a background fills its cell
  // exactly, where a glyph's edges are smoothed and would show the cell as a faint seam
  const solid = c => c.over.some(w => w) ? -1 : c.mask.every(w => w === 0xffffffff) ? c.fg : c.mask.every(w => w === 0) ? c.bg : -1
  return cells.map(c =>
    c === null ? [0x20, DEFAULT, DEFAULT] : solid(c) !== -1 ? [0x20, DEFAULT, solid(c)]
      : [glyph(c.mask, c.over), c.fg < 0 ? DEFAULT : c.fg, c.bg < 0 ? DEFAULT : c.bg])
}

/** the card as [codepoint, fg, bg] cells, marks written over it */
export function fineCellList(hero, mood, ms, columns, effort = 'high') {
  const scene = fineScene(hero, mood, ms, columns, effort)
  const cells = cellList(cellsOf(scene, columns, TERRY_ROWS), lodeGlyph)
  for (const [x, y, text, color] of scene.marks) writeText(cells, columns, x, y, text, color ?? 0x9aa4c8)
  return cells
}

export function fineCells(hero, mood, ms, columns, effort = 'high') {
  return packCells(fineCellList(hero, mood, ms, columns, effort))
}
