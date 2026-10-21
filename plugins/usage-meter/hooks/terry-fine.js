// Terry drawn with the terminal's own pixels, through the Lode Cells font (see lode-fine.js): his card's picture
// (terryScene's braille dots: the editor's art, one dot a pixel of it) with its pixels halved by Scale2x, so every
// step of an outline becomes two smaller ones, then 8 x 16 screen pixels to a cell. A cell is two to three colours
// (lode-fine's cellsOf) and one of the font's glyphs gathered from this scene (docs/preview/lode/harvest-terry.mjs).
// A frame touched up by hand at twice the dots (the 2x dot editor, terry-2x-data.js) takes the place of his Scale2x.
import GLYPHS from './terry-glyphs.js'
import FINE2X from './terry-2x-data.js'
import SPRITE from './terrier-data.js'
import { terryScene, TERRY_ROWS, writeText, MOON, moonShape } from './render.js'
import { CW, CH, cellsOf, cellList, glyphTable } from './lode-fine.js'

export const TERRY_GLYPH_BASE = 0x10a000 // after the ladder card's glyphs, in the same font
const glyph = glyphTable(GLYPHS, TERRY_GLYPH_BASE)
const rgbInt = c => (c ? (c[0] << 16) | (c[1] << 8) | c[2] : -1)

// Scale2x (EPX): each pixel becomes 2 x 2, a corner taking its two neighbours' colour where they agree (and the
// other two differ), which rounds a stair step off without inventing colours
function scale2x(g, w, h) {
  const o = new Int32Array(w * 2 * h * 2), W2 = w * 2
  const at = (x, y) => g[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const E = at(x, y), B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), H = at(x, y + 1)
    let e0 = E, e1 = E, e2 = E, e3 = E
    if (B !== H && D !== F) {
      if (D === B) e0 = D
      if (B === F) e1 = F
      if (D === H) e2 = D
      if (H === F) e3 = F
    }
    const i = y * 2 * W2 + x * 2
    o[i] = e0; o[i + 1] = e1; o[i + W2] = e2; o[i + W2 + 1] = e3
  }
  return o
}

const KEY = Object.fromEntries(SPRITE.palette.map((hex, i) => [SPRITE.alphabet[i], parseInt(hex, 16)]))
const flat = (canvas, w, h) => {
  const g = new Int32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = rgbInt(canvas[y][x])
  return g
}

// His hand-drawn 2x frame laid into the 2x picture: what is drawn over him (a cape, a frisbee) stays on top, and where
// the frame he is showing differs from the set's own (an eye shut, a breath) the Scale2x of it stays, so those keep
// moving; where the finer frame leaves out a pixel he had, what is behind him shows.
function layIn(two, w2, h2, dog, over, behind, rows) {
  const fw = dog.frame[0].length, fh = dog.frame.length
  const shift = dog.drop || 0, flip = dog.flipped
  const at = (f, x, y) => { const yy = y - shift; return yy < 0 || yy >= f.length ? null : f[yy][flip ? fw - 1 - x : x] }
  const out = two.slice()
  for (let Y = 0; Y < h2; Y++) for (let X = 0; X < w2; X++) {
    const x = X >> 1, y = Y >> 1, fx = x - dog.x, fy = y - dog.y
    if (fx < 0 || fy < 0 || fx >= fw || fy >= fh) continue
    if (over && over[y * (w2 >> 1) + x]) continue
    if (rgbInt(dog.frame[fy][fx]) !== rgbInt(at(dog.raw, fx, fy))) continue
    const rx = (flip ? fw * 2 - 1 - (X - dog.x * 2) : X - dog.x * 2), ry = Y - (dog.y + shift) * 2
    const k = rows[ry]?.[rx]
    out[Y * w2 + X] = k && k !== '.' ? KEY[k] : behind[Y * w2 + X]
  }
  return out
}

// The moon again at the finer pixels (half a dot): render.js's moonShape at twice its size
function layMoon(two, w2, moon, behind) {
  const L = moon.left * 2, T = moon.top * 2, W = moon.w * 2, H = moon.h * 2
  const shape = moonShape(moon.kind, W, H), col = [0, rgbInt(MOON.core), rgbInt(MOON.rim)]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (T + y) * w2 + L + x
    two[i] = shape[y * W + x] ? col[shape[y * W + x]] : behind[i]
  }
}

/** the card in screen pixels: {px (colour ints, -1 empty), W, H, marks} */
export function terryFineScene(mood, ms, hour = 12, columns, effort = 'high', date = null) {
  const scene = terryScene(mood, ms, 'braille', hour, columns, effort, date, { track: true })
  const { canvas, marks, dog } = scene
  const w = columns * 2, h = TERRY_ROWS * 4
  let two = scale2x(flat(canvas, w, h), w, h)
  const w2 = w * 2 // a dot is 4 x 4 screen pixels: halved, 2 x 2
  const rows = FINE2X[dog.set]?.[dog.index]
  if (rows) {
    const behind = scale2x(flat(terryScene(mood, ms, 'braille', hour, columns, effort, date, { noDog: true }).canvas, w, h), w, h)
    two = layIn(two, w2, h * 2, dog, scene.over, behind, rows)
  }
  if (scene.moon) layMoon(two, w2, scene.moon, scale2x(flat(terryScene(mood, ms, 'braille', hour, columns, effort, date, { noMoon: true }).canvas, w, h), w, h))
  const W = columns * CW, H = TERRY_ROWS * CH
  const px = new Int32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = two[(y >> 1) * w2 + (x >> 1)]
  return { px, W, H, marks }
}

/** the card as [codepoint, fg, bg] cells (render.js's DEFAULT for the terminal's own colour), marks written over it */
export function terryFineCellList(mood, ms, hour, columns, effort = 'high', date = null) {
  const scene = terryFineScene(mood, ms, hour, columns, effort, date)
  const cells = cellList(cellsOf(scene, columns, TERRY_ROWS), glyph)
  for (const m of scene.marks) writeText(cells, columns, m.x, m.y, m.text, m.color)
  return cells
}
