#!/usr/bin/env node
// Blue-flame usage band: terminal preview (not the mod itself).
// Run: node docs/preview/flame-demo.js   (Ctrl+C to quit, auto-stops after 20s)

const GLYPHS = ' ▁▂▃▄▅▆▇█'
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const DEEP = [30, 70, 255]
const CYAN = [60, 190, 255]
const WHITE = [225, 245, 255]
const AMBER = [255, 170, 60]
const RED = [255, 70, 70]

// Smooth pseudo-noise so the flame flickers instead of strobing
const noise = (x, t) =>
  0.5 + 0.25 * Math.sin(x * 1.7 + t * 5.1) + 0.15 * Math.sin(x * 0.6 - t * 3.3) + 0.1 * Math.sin(x * 3.1 + t * 8.7)

// Calm usage = blue flame; as usage nears the limit the tip heats toward amber/red
function tipColor(pct, edge) {
  const heat = Math.max(0, (pct - 60) / 40)
  const cool = mix(DEEP, CYAN, edge)
  const hot = pct >= 90 ? mix(AMBER, RED, (pct - 90) / 10) : mix(CYAN, AMBER, heat)
  return mix(cool, hot, heat)
}

// A: one row. Filled cells flicker in height; the leading edge burns brightest.
function barA(pct, width, t) {
  const filled = Math.max(1, Math.round((pct / 100) * width))
  let out = ''
  for (let x = 0; x < width; x++) {
    if (x >= filled) { out += DIM + '·' + RESET; continue }
    const lead = x / Math.max(1, filled - 1)
    const h = Math.min(8, Math.max(2, Math.round(2 + 6 * noise(x, t) * (0.4 + 0.6 * lead))))
    const col = x === filled - 1 ? mix(tipColor(pct, 1), WHITE, 0.6) : tipColor(pct, lead)
    out += rgb(...col) + GLYPHS[h] + RESET
  }
  return out
}

// B: two rows. Solid bar underneath, little tongues of flame licking up on top.
function barB(pct, width, t) {
  const filled = Math.max(1, Math.round((pct / 100) * width))
  let top = ''
  let bottom = ''
  for (let x = 0; x < width; x++) {
    if (x >= filled) { top += ' '; bottom += DIM + '░' + RESET; continue }
    const lead = x / Math.max(1, filled - 1)
    const h = Math.round(8 * Math.max(0, noise(x, t) - 0.35) * (0.5 + 0.8 * lead))
    top += rgb(...tipColor(pct, lead)) + GLYPHS[Math.min(8, h)] + RESET
    bottom += rgb(...mix(DEEP, tipColor(pct, lead), 0.5)) + '█' + RESET
  }
  return [top, bottom]
}

// C: pilot light. A tiny three-cell flame next to the label, no bar at all.
function pilot(pct, t) {
  const speed = 1 + pct / 40
  let out = ''
  for (let x = 0; x < 3; x++) {
    const h = Math.round(1 + 7 * noise(x * 2.3, t * speed) * (x === 1 ? 1 : 0.7))
    out += rgb(...tipColor(pct, x === 1 ? 1 : 0.4)) + GLYPHS[Math.min(8, h)] + RESET
  }
  return out
}

const label = (s, w = 6) => s.padEnd(w, ' ')
const num = pct => String(pct).padStart(3, ' ') + '%'

function frame(t) {
  const rows = []
  rows.push(DIM + 'A  한 줄 불꽃 바' + RESET)
  for (const [n, p] of [['5시간', 2], ['주간', 3], ['대화', 5]]) rows.push(`${label(n)}${barA(p, 24, t)} ${num(p)}`)
  rows.push(`${label('5시간')}${barA(85, 24, t)} ${num(85)}   ${DIM}← 85% 근처: 끝이 달아오름${RESET}`)
  rows.push('')
  rows.push(DIM + 'B  두 줄 불꽃 (바 위로 혀가 널름)' + RESET)
  const [t1, b1] = barB(5, 24, t)
  rows.push(`${label('')}${t1}`)
  rows.push(`${label('대화')}${b1} ${num(5)}`)
  const [t2, b2] = barB(92, 24, t)
  rows.push(`${label('')}${t2}`)
  rows.push(`${label('5시간')}${b2} ${num(92)}   ${DIM}← 92%${RESET}`)
  rows.push('')
  rows.push(DIM + 'C  파일럿 라이트 (바 없이 불꽃만, 쓸수록 빨리 일렁임)' + RESET)
  rows.push([['5시간', 2], ['주간', 3], ['대화', 5], ['5시간', 88]].map(([n, p]) => `${pilot(p, t)} ${n} ${p}%`).join('   '))
  return rows
}

const start = Date.now()
let height = 0
process.stdout.write('\x1b[?25l')
const stop = () => { process.stdout.write('\x1b[?25h\n'); process.exit(0) }
process.on('SIGINT', stop)

const timer = setInterval(() => {
  const t = (Date.now() - start) / 1000
  if (t > 20) { clearInterval(timer); stop() }
  const rows = frame(t)
  if (height) process.stdout.write(`\x1b[${height}A`)
  process.stdout.write(rows.map(r => r + '\x1b[K').join('\n') + '\n')
  height = rows.length
}, 70)
