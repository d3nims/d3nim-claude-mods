// The card exactly as the plugin draws it (cape, clouds, wind, the sky and all), for the motion studio:
//   node card-cells.mjs <hooks dir> <mood> <effort> <step ms> <count>
// prints {cols, rows, step, braille: [frame...], quad: [frame...]}, a frame being the cells flat: codepoint, fg, bg, ...
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const [dir, mood, effort, step, count] = process.argv.slice(2)
const { terryCells, TERRY_COLS, TERRY_ROWS } = await import(pathToFileURL(join(dir, 'render.js')).href)
const flat = b64 => Array.from(new Uint32Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer))
const frames = mode => Array.from({ length: +count }, (_, i) => flat(terryCells(mood, i * +step, mode, 14, TERRY_COLS, effort)))
console.log(JSON.stringify({ cols: TERRY_COLS, rows: TERRY_ROWS, step: +step, braille: frames('braille'), quad: frames('quad') }))
