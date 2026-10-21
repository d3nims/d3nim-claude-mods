// Plays the ladder card (or Terry's) in this terminal with the Lode Cells font, the way the plugin would draw it:
//   node docs/preview/lode/play.mjs [hero=runner|monk|terry] [mood=run] [effort=high] [columns=42] [--nosync]
// (needs the font installed and listed after the terminal's font, e.g. WaveTerm "term:fontfamily": "Hack, Lode Cells").
// Ctrl+C to stop.
import { fineCellList } from '../../../plugins/usage-meter/hooks/lode-fine.js'
import { terryFineCellList } from '../../../plugins/usage-meter/hooks/terry-fine.js'
import { TERRY_ROWS } from '../../../plugins/usage-meter/hooks/render.js'

const [hero = 'runner', mood = 'run', effort = 'high', cols = '42'] = process.argv.slice(2)
const columns = +cols
const DEFAULT = 0x01000000
const color = (c, bg) => (c === DEFAULT ? (bg ? '\x1b[49m' : '\x1b[39m') : `\x1b[${bg ? 48 : 38};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`)
const out = process.stdout
out.write('\x1b[?25l\x1b[2J')
const stop = () => { out.write('\x1b[0m\x1b[?25h\n'); process.exit(0) }
process.on('SIGINT', stop)
const t0 = Date.now()
const sync = !process.argv.includes('--nosync')
let last = null
// each frame inside a synchronized update (the terminal shows it whole, not half old and half new), and only the
// cells that changed are sent
const frame = () => {
  const now = new Date(), hour = now.getHours() + now.getMinutes() / 60
  const cells = hero === 'terry' ? terryFineCellList(mood, Date.now() - t0, hour, columns, effort)
    : fineCellList(hero, mood, Date.now() - t0, columns, effort)
  let s = sync ? '\x1b[?2026h' : ''
  if (!last) s += '\x1b[H' + `${hero} · ${mood} · ${effort}   (Ctrl+C to stop)\x1b[K`
  let pfg = null, pbg = null
  for (let y = 0; y < TERRY_ROWS; y++) {
    let cursor = -1
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x
      const [cp, fg, bg] = cells[i]
      if (last && last[i][0] === cp && last[i][1] === fg && last[i][2] === bg) continue
      if (cursor !== x) s += `\x1b[${y + 2};${x + 1}H`
      if (fg !== pfg) { s += color(fg, false); pfg = fg }
      if (bg !== pbg) { s += color(bg, true); pbg = bg }
      s += String.fromCodePoint(cp)
      cursor = x + 1
    }
  }
  s += '\x1b[0m' + (sync ? '\x1b[?2026l' : '')
  last = cells
  out.write(s)
}
setInterval(frame, 1000 / 30) // 30 a second: at 20 the ledges jumped three pixels a frame and looked jerky
