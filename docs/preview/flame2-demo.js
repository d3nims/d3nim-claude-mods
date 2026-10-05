#!/usr/bin/env node
// Blue-flame usage band v2: fire simulation drawn with half-block pixels (2 px per cell, full colour).
// Run: node docs/preview/flame2-demo.js   (Ctrl+C to quit, auto-stops after 25s)

const rgb = (r, g, b) => [r, g, b]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// Heat 0..1 -> colour. Calm usage burns blue; near the limit the flame heats to amber/red.
const BLUE = [rgb(0, 0, 0), rgb(8, 18, 90), rgb(20, 60, 230), rgb(50, 160, 255), rgb(150, 225, 255), rgb(245, 252, 255)]
const HOT = [rgb(0, 0, 0), rgb(90, 18, 8), rgb(230, 60, 20), rgb(255, 160, 40), rgb(255, 225, 120), rgb(255, 252, 235)]

function ramp(stops, h) {
  const p = Math.min(0.9999, Math.max(0, h)) * (stops.length - 1)
  const i = Math.floor(p)
  return mix(stops[i], stops[i + 1], p - i)
}

const palette = (pct, h) => {
  const heat = Math.min(1, Math.max(0, (pct - 65) / 30))
  return mix(ramp(BLUE, h), ramp(HOT, h), heat)
}

class Flame {
  // rows = terminal rows, so the sim is rows*2 pixels tall
  constructor(width, rows) {
    this.w = width
    this.h = rows * 2
    this.rows = rows
    this.grid = Array.from({ length: this.h }, () => new Float32Array(width))
  }

  step(pct) {
    const { w, h, grid } = this
    const filled = Math.max(1, Math.round((pct / 100) * w))
    // Fuel on the bottom pixel row, only under the filled part of the bar
    for (let x = 0; x < w; x++) {
      grid[h - 1][x] = x < filled ? 0.85 + Math.random() * 0.15 : 0
    }
    // Taller flames with more usage, but never a wall of fire
    const reach = 0.45 + 0.55 * (pct / 100)
    const cool = (1 / h) * (1.9 - reach)
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const drift = Math.floor(Math.random() * 3) - 1
        const sx = Math.min(w - 1, Math.max(0, x + drift))
        const below = (grid[y + 1][sx] + grid[y + 1][x] + grid[y + 1][Math.min(w - 1, x + 1)]) / 3
        grid[y][x] = Math.max(0, below - Math.random() * cool)
      }
    }
    return filled
  }

  lines(pct) {
    const { w, rows, grid } = this
    const out = []
    for (let r = 0; r < rows; r++) {
      let line = ''
      for (let x = 0; x < w; x++) {
        const top = grid[r * 2][x]
        const bot = grid[r * 2 + 1][x]
        const T = 0.06
        const hasTop = top > T
        const hasBot = bot > T
        if (!hasTop && !hasBot) { line += ' '; continue }
        const [tr, tg, tb] = palette(pct, top)
        const [br, bg, bb] = palette(pct, bot)
        if (hasTop && hasBot) line += `\x1b[38;2;${tr};${tg};${tb};48;2;${br};${bg};${bb}m▀\x1b[0m`
        else if (hasTop) line += `\x1b[38;2;${tr};${tg};${tb}m▀\x1b[0m`
        else line += `\x1b[38;2;${br};${bg};${bb}m▄\x1b[0m`
      }
      out.push(line)
    }
    return out
  }
}

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const W = 28

const entries = [
  { name: '5시간', pct: 2, rows: 2 },
  { name: '주간', pct: 3, rows: 2 },
  { name: '대화', pct: 5, rows: 2 },
  { name: '5시간', pct: 45, rows: 2 },
  { name: '5시간', pct: 90, rows: 3 },
].map(e => ({ ...e, flame: new Flame(W, e.rows) }))

function frame() {
  const out = []
  out.push(DIM + '위 줄=불꽃 / 아래 줄=게이지(█ 채움, ░ 빈칸). 2%~90% 비교' + RESET)
  for (const e of entries) {
    const filled = e.flame.step(e.pct)
    const fl = e.flame.lines(e.pct)
    const blue = e.pct >= 90 ? '\x1b[38;2;255;120;60m' : e.pct >= 65 ? '\x1b[38;2;255;190;80m' : '\x1b[38;2;60;160;255m'
    for (const line of fl) out.push('      ' + line)
    const bar = blue + '█'.repeat(filled) + RESET + DIM + '░'.repeat(W - filled) + RESET
    out.push(`${e.name.padEnd(5, ' ')} ${bar} ${String(e.pct).padStart(3, ' ')}%`)
  }
  return out
}

const start = Date.now()
let height = 0
process.stdout.write('\x1b[?25l')
const stop = () => { process.stdout.write('\x1b[?25h\n'); process.exit(0) }
process.on('SIGINT', stop)

const timer = setInterval(() => {
  if ((Date.now() - start) / 1000 > 25) { clearInterval(timer); stop() }
  const rows = frame()
  if (height) process.stdout.write(`\x1b[${height}A`)
  process.stdout.write(rows.map(r => r + '\x1b[K').join('\n') + '\n')
  height = rows.length
}, 60)
