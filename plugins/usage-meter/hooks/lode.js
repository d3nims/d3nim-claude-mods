// The ladder card's picture, after Lode Runner: The Legend Returns (1994, MS-DOS): thick lime turf ledges, white
// ladders, bars to go hand over hand along, golden skulls to collect, and the hero (docs/preview/lode/rig.py, drawn
// afresh): the runner (/runner, white suit, backpack, a laser that digs) with a red-robed skeleton monk on his heels,
// or the monk himself (/monk). While Claude works the hero walks right, climbs the next ladder up a storey, crosses
// breaks in the ledge on a bar, and walks on; the picture follows him, sliding left and down. At rest he stands, looks
// out, dozes, digs (the runner with his laser), or holds up a golden skull.
import LODE from './lode-data.js'
import { TERRY_ROWS, canvasToCellList, packCells, writeText } from './render.js'

const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
const KEY = Object.fromEntries(Object.entries(LODE.keys).map(([k, v]) => [k, hex(v)]))
const [SW, SH_SPR] = LODE.size // a frame's width and height (sub-pixels)

const STOREY = 38 // from one ledge's top to the next one's: he is 32 tall, the ledge above shows as a band at the top
const LEDGE = 5 // the turf's thickness
const LADDER_W = 7
const FLOOR = 36 // the canvas row of the top of the ledge he stands on (his feet on the row above)
const BAR_H = SH_SPR - 3 // the bar's height over the ledge: at his raised hands

// the turf: a bright top, lime, and darker green flecks lower down (the game's first world, Moss Caverns)
const TURF_TOP = [170, 255, 80]
const TURF = [104, 214, 40]
const TURF_MID = [72, 176, 28]
const TURF_DARK = [40, 120, 18]
const RAIL = [214, 218, 224]
const RAIL_SHADE = [150, 156, 166]
const RUNG = [240, 242, 246]
const BAR = [236, 236, 228]
const GOLD = [245, 197, 66]
const GOLD_DARK = [184, 134, 11]
const GLINT = [255, 250, 220]
const BEAM = [255, 106, 60]
const BEAM_HOT = [255, 214, 122]
const CHASE_SECS = 1.4 // how far behind the runner the monk comes, on the same route

// the speeds (sub-pixels a second) at each effort, as Terry's run follows it
const PACE = { low: 0.55, medium: 0.8, high: 1, xhigh: 1.5, max: 2.2 }
const STRIDE = 2 // sub-pixels walked per frame of the eight-frame step

const rnd = (k, salt) => {
  let h = (k * 374761393 + salt * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** the route, its lengths and speeds times `scale` (1 for the dots and blocks, 3 for the cell font), storeys `storeyH`
 * apart: storeys 0..5 laid out once, storey k is storey k % 6 moved right and up by whole rounds */
export function onRouteOf(scale = 1, storeyH = STOREY * scale) {
  const ROUND = 6
  const WALK_V = 18 * scale, CLIMB_V = 13 * scale, HANG_V = 11 * scale
  const storeys = []
  let x0 = 0
  for (let k = 0; k < ROUND; k++) {
    const walk1 = (44 + Math.floor(rnd(k, 1) * 24)) * scale
    const gap = rnd(k, 2) < 0.55 ? (26 + Math.floor(rnd(k, 3) * 8)) * scale : 0
    const walk2 = gap ? (18 + Math.floor(rnd(k, 4) * 14)) * scale : 0
    const ladder = x0 + walk1 + gap + walk2 // the hero's centre when he reaches it
    storeys.push({ x0, walk1, gap, walk2, ladder, gold: x0 + Math.round(walk1 * 0.6) })
    x0 = ladder
  }
  const width = x0
  const storey = k => {
    const r = Math.floor(k / ROUND)
    const b = storeys[((k % ROUND) + ROUND) % ROUND]
    const dx = r * width
    return { x0: b.x0 + dx, gap: b.gap, ladder: b.ladder + dx, gold: b.gold + dx, gapFrom: b.x0 + dx + b.walk1, gapTo: b.x0 + dx + b.walk1 + b.gap }
  }
  const legs = []
  for (let k = 0; k < ROUND; k++) {
    const s = storeys[k]
    legs.push({ k, kind: 'walk', from: s.x0, len: s.walk1, v: WALK_V })
    if (s.gap) {
      legs.push({ k, kind: 'hang', from: s.x0 + s.walk1, len: s.gap, v: HANG_V })
      legs.push({ k, kind: 'walk', from: s.x0 + s.walk1 + s.gap, len: s.walk2, v: WALK_V })
    }
    legs.push({ k, kind: 'climb', from: s.ladder, len: storeyH, v: CLIMB_V })
  }
  const roundSecs = legs.reduce((a, l) => a + l.len / l.v, 0)
  // where the hero is after `secs` on the route (at pace 1): storey, centre x, height over the storey's ledge, doing what
  const onRoute = secs => {
    const round = Math.floor(secs / roundSecs)
    let t = secs - round * roundSecs
    let walked = 0
    for (const leg of legs) {
      const dur = leg.len / leg.v
      if (t < dur) {
        const d = t * leg.v
        const k = leg.k + round * ROUND
        const from = leg.from + round * width
        if (leg.kind === 'climb') return { k, x: from, up: d, kind: 'climb', step: d }
        return { k, x: from + d, up: 0, kind: leg.kind, step: walked + d }
      }
      t -= dur
      if (leg.kind !== 'climb') walked += leg.len
    }
    return { k: (round + 1) * ROUND, x: storey((round + 1) * ROUND).x0, up: 0, kind: 'walk', step: 0 }
  }
  return { PACE, CHASE_SECS, onRoute, storey, roundSecs }
}
const { onRoute, storey } = onRouteOf(1)

export function lodeScene(hero, mood, ms, mode, columns, effort = 'high') {
  const F = LODE.frames[hero] || LODE.frames.runner
  const TW = columns * 2
  const H = TERRY_ROWS * 4
  const canvas = Array.from({ length: H }, () => Array(TW).fill(null))
  const put = (x, y, c) => { if (x >= 0 && x < TW && y >= 0 && y < H) canvas[y][x] = c }
  const clear = (x, y) => { if (x >= 0 && x < TW && y >= 0 && y < H) canvas[y][x] = null }
  const sprite = (rows, left, bottom) => rows.forEach((row, y) => [...row].forEach((k, x) => {
    if (k !== '.') put(left + x, bottom - rows.length + 1 + y, KEY[k])
  }))
  const marks = []
  const t = ms / 1000
  const running = mood === 'run' || mood === 'fetch'
  const pace = PACE[effort] ?? 1
  const here = running ? onRoute(t * pace) : { k: 0, x: storey(0).x0 + 14, up: 0, kind: 'stand', step: 0 }
  const MX = Math.round(TW * (hero === 'runner' && running ? 0.5 : 0.36)) // his centre on the canvas (room behind him for the monk)
  // blocks pair the rows two by two into one colour: the picture moves in whole pairs, so the turf's bright top
  // stays its own pair instead of blinking as he climbs
  const pair = mode === 'braille' ? 1 : 2
  const camUp = Math.floor((here.k * STOREY + here.up) / pair) * pair
  const lift = here.k * STOREY + here.up - camUp
  const sx = x => MX + Math.round(x - here.x)
  const sy = (k, h) => FLOOR - Math.round(k * STOREY + h - camUp)

  for (let k = here.k - 1; k <= here.k + 1; k++) {
    const st = storey(k), prev = storey(k - 1)
    const top = sy(k, 0)
    // the ledge: from a little behind where the last ladder came up to a little past this storey's ladder
    for (let x = Math.max(0, sx(prev.ladder - 30)); x <= Math.min(TW - 1, sx(st.ladder + LADDER_W + 10)); x++) {
      if (st.gap && x >= sx(st.gapFrom + 2) && x <= sx(st.gapTo - 2)) continue // the break, inside the bar's reach
      const wx = x - sx(0)
      for (let r = 0; r < LEDGE; r++) {
        const fleck = (wx * 7 + r * 13 + k * 5) % 9
        put(x, top + r, r < pair ? TURF_TOP : fleck === 0 ? TURF_DARK : fleck < 3 ? TURF_MID : TURF)
      }
      // tufts hanging off the underside
      if ((wx * 5 + k) % 7 === 0) put(x, top + LEDGE, TURF_DARK)
    }
    if (st.gap) for (let x = sx(st.gapFrom - 12); x <= sx(st.gapTo + 12); x++) put(x, sy(k, BAR_H), BAR)
    // the ladder up to the next storey, through the ledge above to its top
    const lx = sx(st.ladder) - Math.floor(LADDER_W / 2)
    for (let h = 0; h <= STOREY; h++) {
      const y = sy(k, h)
      put(lx, y, RAIL)
      put(lx + LADDER_W - 1, y, RAIL_SHADE)
      if (h % 4 === 1) for (let x = lx + 1; x < lx + LADDER_W - 1; x++) put(x, y, RUNG)
    }
    // the golden skull on the ledge, there until he walks past it
    const gone = k < here.k || (k === here.k && running && here.x > st.gold)
    if (!gone) {
      const gx = sx(st.gold) - 3, gy = sy(k, 0) - 1
      const skull = ['.GGG.', 'GYGGG', 'GgGgG', 'GGGGG', '.GgG.']
      skull.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '.') put(gx + x, gy - 4 + y, c === 'G' ? GOLD : c === 'g' ? GOLD_DARK : GLINT)
      }))
      if (Math.floor(t * 2 + k) % 3 === 0) put(gx + 4, gy - 5, GLINT)
    }
  }

  // speed lines behind him when he hurries
  if (running && pace >= 1.5 && here.kind === 'walk') {
    for (let n = 0; n < 3; n++) {
      const y = FLOOR - 8 - n * 8
      const head = MX - SW / 2 - 1 - Math.floor(((t * 3 + n * 0.37) % 1) * 12)
      for (let k = 0; k < 6; k++) put(head - k, y, k < 2 ? [232, 236, 246] : [130, 134, 150])
    }
  }

  const left = MX - SW / 2
  const feet = FLOOR - 1 - Math.round(lift)
  const cellX = Math.floor((left + SW) / 2)
  const pose = (G, at) => {
    const frames = at.kind === 'climb' ? G.climb : at.kind === 'hang' ? G.hang : G.walk
    const per = at.kind === 'walk' ? STRIDE : 4
    return frames[Math.floor(at.step / per) % frames.length]
  }
  if (running) {
    // the runner has a monk on his heels: the same route, CHASE_SECS behind (drawn first, so the runner is in front)
    if (hero === 'runner' && t * pace > CHASE_SECS) {
      const m = onRoute(t * pace - CHASE_SECS)
      const mleft = sx(m.x) - SW / 2
      if (mleft > -SW && mleft < TW) sprite(pose(LODE.frames.monk, m), mleft, sy(m.k, m.up) - 1)
    }
    sprite(pose(F, here), left, feet)
  } else if (mood === 'sad' || mood === 'droop') {
    // fallen into a hole in the turf: in it to the waist, waving
    for (let x = left + 2; x < left + SW - 2; x++) for (let r = 0; r < LEDGE; r++) clear(x, FLOOR + r)
    sprite(F.stuck[Math.floor(t * 4) % 2], left, FLOOR + LEDGE - 1)
  } else if (mood === 'sleep') {
    sprite(F.sleep[Math.floor(t / 1.2) % 2], left, feet)
    const p = Math.floor(t / 0.7) % 3
    marks.push([cellX, 3, 'z'])
    if (p >= 1) marks.push([cellX + 1, 2, 'Z'])
    if (p >= 2) marks.push([cellX + 2, 1, 'Z'])
  } else if (mood === 'happy' || mood === 'catch' || mood === 'pet' || mood === 'bark') {
    const hop = Math.floor(t / 0.25) % 2
    sprite(F.happy[hop], left, feet)
    if (mood === 'bark' && Math.floor(t / 0.34) % 2 === 0) marks.push([cellX, 0, '!', 0xffd166])
    if (mood !== 'bark' && Math.floor(t / 0.3) % 2 === 0) marks.push([cellX, 0, '*', 0xffd166])
  } else if ((mood === 'dig' || mood === 'sniff') && hero === 'runner') {
    // the laser: a beam from the gun down to the turf in front of him, which melts away into a hole and grows back
    const cycle = (t % 2.4) / 2.4
    const firing = cycle < 0.45
    sprite(F.dig[firing ? 1 : 0], left, feet)
    const [mx, my] = LODE.muzzle.runner[firing ? 1 : 0]
    const gx = left + mx, gy = feet - SH_SPR + 1 + my
    const hx = left + SW + 1
    const depth = Math.floor(Math.min(cycle, 0.45) / 0.45 * LEDGE)
    if (firing) {
      const span = Math.max(1, FLOOR + depth - gy)
      for (let k = 0; k < span; k++) put(gx + Math.round(k * (hx + 3 - gx) / span), gy + k, k % 2 ? BEAM : BEAM_HOT)
    }
    const open = cycle < 0.85 ? Math.max(depth, cycle >= 0.45 ? LEDGE : 0) : 0 // stays open a while, then grows back
    for (let x = hx; x < hx + 8; x++) for (let r = 0; r < open; r++) clear(x, FLOOR + r)
    if (firing) for (const [dx, dy] of [[1, -1], [4, -2], [6, -1]]) put(hx + dx, FLOOR + dy, Math.floor(t * 10) % 2 ? BEAM_HOT : TURF_TOP)
  } else if (mood === 'dig' || mood === 'sniff') {
    const strike = Math.floor(t / 0.35) % 2
    sprite(F.dig[strike], left, feet)
    if (strike) for (const [dx, dy] of [[SW, -2], [SW + 2, -3], [SW + 1, -4]]) put(left + dx, FLOOR + dy, TURF_DARK)
  } else {
    // waiting: looks ahead, now and then turns to look out at you (all the time while you type)
    const out = mood === 'wag' || mood === 'ask' || Math.floor(t / 1.5) % 4 === 3
    sprite(F.idle[out ? 1 : 0], left, feet)
    if (mood === 'ask' && Math.floor(t / 0.6) % 4 !== 3) marks.push([cellX, 0, '?', 0xffd166])
  }
  return { canvas, marks }
}

export function lodeCells(hero, mood, ms, mode, columns, effort = 'high') {
  return packCells(lodeCellList(hero, mood, ms, mode, columns, effort))
}
/** the same as a list of [char, fg, bg] (a paused card dims it first: pause.js) */
export function lodeCellList(hero, mood, ms, mode, columns, effort = 'high') {
  const { canvas, marks } = lodeScene(hero, mood, ms, mode, columns, effort)
  const cells = canvasToCellList(canvas, columns, TERRY_ROWS, mode)
  for (const [x, y, text, color] of marks) writeText(cells, columns, x, y, text, color ?? 0x9aa4c8)
  return cells
}
