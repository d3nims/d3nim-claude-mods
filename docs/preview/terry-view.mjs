#!/usr/bin/env node
// Terry on his own: draws the same picture /terry shows above the prompt, in any terminal, without Claude Code.
// Every mood, effort, drawing mode, width, time of day, season and holiday, switched with one key. When the sprite or
// the plugin's code changes (docs/preview/build-terrier.py writes terrier-data.js), the picture reloads by itself.
//
// Run:   node docs/preview/terry-view.mjs [mood] [--effort=high] [--mode=braille] [--slow=4]
// Keys:  ← →  mood (or h l)     e effort    m quad / fine / braille    w width (full / 31 / 28)
//        t time of day          s season    y holiday / anniversary     space slower (1x 2x 4x 8x)
//        v real / classic drawing           r replay the mood from its start   q / Ctrl+C quit

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../plugins/usage-meter/hooks')
const args = process.argv.slice(2)
const opt = name => args.find(a => a.startsWith('--' + name + '='))?.split('=')[1]

const MOODS = [
  ['sit', '앉아서 기다리기'], ['wag', '꼬리 흔들기 (입력 중)'], ['bark', '짖기 (입력 시작)'], ['run', '달리기 (응답 중)'],
  ['happy', '헥헥 (응답 끝)'], ['sleep', '졸기'], ['sniff', '킁킁 (읽기·검색)'], ['dig', '땅 파기 (실행·수정)'],
  ['fetch', '물어 오기 (웹)'], ['ask', '허락 대기 ?'], ['sad', '시무룩 (실패)'], ['door', '문 앞 대기 (한도)'],
  ['catch', '원반 캐치 (테스트 통과)'], ['droop', '귀 처짐 (테스트 실패)'], ['stretch', '기지개 (하루 첫 입력)'],
  ['eat', '밥 먹기 (저녁)'], ['pet', '쓰다듬기'],
]
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const MODES = ['quad', 'fine', 'braille']
const HOURS = [null, 14, 7, 19, 23] // null: the real clock
const SEASONS = [null, 4, 7, 10, 1] // null: today's month
const SEASON_NAMES = { 4: '봄', 7: '여름', 10: '가을', 1: '겨울' }
const HOLIDAYS = [null, 'seollal', 'chuseok', 'anniversary']
const LOOKS = ['classic', 'real']
const HOLIDAY_NAMES = { seollal: '설날', chuseok: '추석', anniversary: '1주년' }

const state = {
  mood: Math.max(0, MOODS.findIndex(([m]) => m === args.find(a => !a.startsWith('--')))),
  effort: Math.max(0, EFFORTS.indexOf(opt('effort') ?? 'high')),
  mode: Math.max(0, MODES.indexOf(opt('mode') ?? 'braille')),
  width: 0, hour: 0, season: 0, holiday: 0, look: 0,
  slow: Math.max(1, Number(opt('slow') ?? 1)),
}
let moodStart = Date.now()
const FRAME_MS = 45

// The plugin's modules are imported from a fresh copy each time they change, so the new sprite shows without a restart
// (an ES module is cached by its URL, and render.js imports terrier-data.js by a relative path)
let render = null
let copies = 0
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terry-view-'))
let reloadNote = ''
async function load() {
  const dir = path.join(tmpRoot, String(++copies))
  fs.mkdirSync(dir)
  for (const f of fs.readdirSync(HOOKS)) if (f.endsWith('.js')) fs.copyFileSync(path.join(HOOKS, f), path.join(dir, f))
  try {
    render = await import(pathToFileURL(path.join(dir, 'render.js')).href)
    reloadNote = copies > 1 ? `  \x1b[32m다시 불러옴 ${new Date().toLocaleTimeString()}\x1b[0m` : ''
  } catch (err) {
    reloadNote = `  \x1b[31m불러오기 실패: ${String(err.message).split('\n')[0]}\x1b[0m`
  }
  process.stdout.write('\x1b[2J')
}
// polled, not watched: change events don't reach WSL from a Windows drive (/mnt/c)
let pending = null
for (const f of fs.readdirSync(HOOKS).filter(f => f.endsWith('.js'))) {
  fs.watchFile(path.join(HOOKS, f), { interval: 400 }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs) return
    clearTimeout(pending)
    pending = setTimeout(load, 200) // the generator writes in pieces: wait until it is done
  })
}

const DEFAULT = 0x01000000
const ansi = (v, layer) => (v & DEFAULT ? (layer === 38 ? '\x1b[39m' : '\x1b[49m') : `\x1b[${layer};2;${(v >> 16) & 255};${(v >> 8) & 255};${v & 255}m`)

function draw() {
  if (!render) return
  const { terryCells, TERRY_COLS, TERRY_MIN_COLS, TERRY_ROWS } = render
  // never wider than the terminal: a row that wraps puts its end (the sky) on a line of its own, and he looks torn apart
  const room = process.stdout.columns || TERRY_COLS
  const cols = Math.max(TERRY_MIN_COLS ?? 21, Math.min([TERRY_COLS, 31, 28][state.width], room))
  const now = new Date()
  const hour = HOURS[state.hour] ?? now.getHours() + now.getMinutes() / 60
  const month = SEASONS[state.season] ?? now.getMonth() + 1
  const hol = HOLIDAYS[state.holiday]
  const [mood, label] = MOODS[state.mood]
  const date = { month, day: 15, moodMs: (Date.now() - moodStart) / state.slow, holiday: hol === 'anniversary' ? null : hol, anniversary: hol === 'anniversary', style: LOOKS[state.look] }
  let raw
  try {
    raw = Buffer.from(terryCells(mood, Date.now() / state.slow, MODES[state.mode], hour, cols, EFFORTS[state.effort], date), 'base64')
  } catch (err) {
    process.stdout.write(`\x1b[H\x1b[31m그리다 실패: ${err.message}\x1b[0m\x1b[K`)
    return
  }
  let out = '\x1b[H'
  for (let y = 0; y < TERRY_ROWS; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 12
      out += ansi(raw.readUInt32LE(i + 4), 38) + ansi(raw.readUInt32LE(i + 8), 48) + String.fromCodePoint(raw.readUInt32LE(i))
    }
    out += '\x1b[0m\x1b[K\n'
  }
  const dim = s => `\x1b[2m${s}\x1b[0m`
  out += `\n \x1b[1m${state.mood + 1}/${MOODS.length} ${mood}\x1b[0m ${label}${mood === 'run' ? ' · ' + EFFORTS[state.effort] : ''}${reloadNote}\x1b[K\n`
  out += ` ${LOOKS[state.look] === 'real' ? '새 그림' : '예전 그림'} · ${MODES[state.mode]} · ${cols}칸 · ${HOURS[state.hour] === null ? '지금 시각' : HOURS[state.hour] + '시'} · ${SEASONS[state.season] === null ? '오늘 날짜' : SEASON_NAMES[month]}${hol ? ' · ' + HOLIDAY_NAMES[hol] : ''}${state.slow > 1 ? ` · ${state.slow}x 느리게` : ''}\x1b[K\n`
  out += dim(' ←→ 동작  v 그림체  e 강도  m 그림  w 너비  t 시각  s 계절  y 명절  space 느리게  r 처음부터  q 끝') + '\x1b[K\n'
  process.stdout.write(out)
}

const quit = () => {
  process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l')
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  process.exit(0)
}
const cycle = (key, n, by = 1) => {
  state[key] = (state[key] + by + n) % n
  process.stdout.write('\x1b[2J')
}
process.on('SIGINT', quit)
process.on('SIGTERM', quit)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.on('data', d => {
    const k = d.toString()
    if (k === 'q' || k === '\x03') quit()
    else if (k === '\x1b[C' || k === 'l') { cycle('mood', MOODS.length); moodStart = Date.now() }
    else if (k === '\x1b[D' || k === 'h') { cycle('mood', MOODS.length, -1); moodStart = Date.now() }
    else if (k === 'e') cycle('effort', EFFORTS.length)
    else if (k === 'm') cycle('mode', MODES.length)
    else if (k === 'v') cycle('look', LOOKS.length)
    else if (k === 'w') cycle('width', 3)
    else if (k === 't') cycle('hour', HOURS.length)
    else if (k === 's') cycle('season', SEASONS.length)
    else if (k === 'y') cycle('holiday', HOLIDAYS.length)
    else if (k === ' ') state.slow = state.slow >= 8 ? 1 : state.slow * 2
    else if (k === 'r') moodStart = Date.now()
  })
}

process.stdout.on('resize', () => process.stdout.write('\x1b[2J'))
process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J')
await load()
setInterval(draw, FRAME_MS)
draw()
