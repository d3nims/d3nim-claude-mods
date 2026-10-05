#!/usr/bin/env node
// Terry on his own: draws the same picture /terry shows above the prompt, in any terminal, without a request running.
//
// Run:   node docs/preview/terry-view.mjs [run|sit|wag|bark|happy|sleep] [--mode=quad|braille] [--hour=0-23] [--slow=N]
// Keys:  1 run  2 sit  3 wag  4 bark  5 happy  6 sleep   q / Ctrl+C quit
// --slow=4 plays 4x slower, to look at each frame of the gallop.

import { terryCells, TERRY_COLS, TERRY_ROWS } from '../../plugins/usage-meter/hooks/render.js'

const args = process.argv.slice(2)
const opt = name => args.find(a => a.startsWith('--' + name + '='))?.split('=')[1]
const MOODS = ['run', 'sit', 'wag', 'bark', 'happy', 'sleep']
let mood = args.find(a => MOODS.includes(a)) ?? 'run'
const mode = opt('mode') === 'braille' ? 'braille' : 'quad'
const hour = opt('hour') !== undefined ? Number(opt('hour')) : null
const slow = Math.max(1, Number(opt('slow') ?? 1))
const FRAME_MS = 66

const DEFAULT = 0x01000000
const ansi = (v, layer) => (v & DEFAULT ? (layer === 38 ? '\x1b[39m' : '\x1b[49m') : `\x1b[${layer};2;${(v >> 16) & 255};${(v >> 8) & 255};${v & 255}m`)

function draw() {
  const ms = Date.now() / slow
  const raw = Buffer.from(terryCells(mood, ms, mode, hour ?? new Date().getHours()), 'base64')
  let out = '\x1b[H'
  for (let y = 0; y < TERRY_ROWS; y++) {
    for (let x = 0; x < TERRY_COLS; x++) {
      const i = (y * TERRY_COLS + x) * 12
      out += ansi(raw.readUInt32LE(i + 4), 38) + ansi(raw.readUInt32LE(i + 8), 48) + String.fromCodePoint(raw.readUInt32LE(i))
    }
    out += '\x1b[0m\n'
  }
  out += `\n \x1b[1m${mood}\x1b[0m${slow > 1 ? `  (${slow}x 느리게)` : ''}   1 run  2 sit  3 wag  4 bark  5 happy  6 sleep   q 끝내기\x1b[K`
  process.stdout.write(out)
}

process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J')
const quit = () => {
  process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l')
  process.exit(0)
}
process.on('SIGINT', quit)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.on('data', d => {
    const k = d.toString()
    if (k === 'q' || k === '\x03') quit()
    const n = Number(k)
    if (n >= 1 && n <= MOODS.length) {
      mood = MOODS[n - 1]
      process.stdout.write('\x1b[2J')
    }
  })
}
setInterval(draw, FRAME_MS)
draw()
