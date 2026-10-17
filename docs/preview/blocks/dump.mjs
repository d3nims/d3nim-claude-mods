import { __T } from './render.js'
import fs from 'fs'
const { SETS, QUAD_SETS, liftBlock, canvasToCellList, QUAD, FINE_MASKS } = __T
// 코드 -> 2x4 비트 (fine 목록 + 사분블록: 한 사분이 두 줄)
const maskOf = new Map()
for (let q = 0; q < 16; q++) {
  let m = 0; const bit = (dy, dx) => 1 << (dy * 2 + dx)
  if (q & 1) m |= bit(0, 0) | bit(1, 0); if (q & 2) m |= bit(0, 1) | bit(1, 1); if (q & 4) m |= bit(2, 0) | bit(3, 0); if (q & 8) m |= bit(2, 1) | bit(3, 1)
  maskOf.set(QUAD[q].codePointAt(0), m)
}
for (const [m, code] of FINE_MASKS) maskOf.set(code, m)
maskOf.set(0x2588, 255); maskOf.set(0x20, 0)
const out = {}
const HYB = JSON.parse(fs.readFileSync(process.env.HYB, 'utf8'))
const hyb = Object.fromEntries(Object.entries(HYB).map(([n, s]) => [n, { durations: s.durations, frames: s.frames.map((f, i) => {
  const head = new Set(s.heads[i].map(([y, x]) => y + ',' + x))
  return f.map((r, y) => r.map((c, x) => {
    if (!c || head.has(y + ',' + x)) return c
    const l = liftBlock(c); if (l === c) return c
    const v = Math.round(110 + (255 - 110) * (c[0] / 255)); return [v, v, Math.min(255, v + 4)]
  }))
}) }]))
const variants = {
  old: QUAD_SETS,
  raw: SETS,
  mid: Object.fromEntries(Object.entries(SETS).map(([n, s]) => [n, { ...s, frames: s.frames.map(f => f.map(r => r.map(c => {
    const l = liftBlock(c); if (!c || l === c) return c
    const v = Math.round(110 + (255 - 110) * (c[0] / 255)); return [v, v, Math.min(255, v + 4)]
  }))) }])),
  hyb,
  lift: Object.fromEntries(Object.entries(SETS).map(([n, s]) => [n, { ...s, frames: s.frames.map(f => f.map(r => r.map(liftBlock))) }])),
}
const moods = process.argv.slice(2)
for (const [vn, sets] of Object.entries(variants)) for (const mode of ['quad', 'fine', 'braille']) {
  if (mode === 'braille' && vn !== 'raw') continue

  if (vn === 'old' && mode === 'quad') {}
  for (const mood of moods) {
    const set = sets[mood]; if (!set) continue
    out[`${vn}.${mode}.${mood}`] = { durations: set.durations, frames: set.frames.map(f => {
      const H = f.length, W = f[0].length, rows = Math.ceil(H / 4), cols = Math.ceil(W / 2)
      const canvas = Array.from({ length: rows * 4 }, (_, y) => Array.from({ length: cols * 2 }, (_, x) => f[y]?.[x] ?? null))
      const cells = canvasToCellList(canvas, cols, rows, mode)
      return { cols, rows, cells: cells.map(([cp, fg, bg]) => [mode === 'braille' ? cp - 0x2800 : maskOf.get(cp) ?? -1, fg, bg]) }
    }) }
  }
}
fs.writeFileSync('cells.json', JSON.stringify(out))
console.log(Object.keys(out).map(k => k + ':' + out[k].frames.length).join(' '))
