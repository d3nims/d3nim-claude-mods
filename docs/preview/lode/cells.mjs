// The ladder card exactly as the plugin draws it, for the preview page:
//   node cells.mjs <hero> <mood> <effort> <step ms> <count> <from ms>
// prints {cols, rows, step, braille: [frame...], quad: [frame...]}, a frame being render.js's packed cells (base64)
import { TERRY_COLS, TERRY_ROWS } from '../../../plugins/usage-meter/hooks/render.js'
import { lodeCells } from '../../../plugins/usage-meter/hooks/lode.js'

const [hero, mood, effort, step, count, from] = process.argv.slice(2)
const frames = mode => Array.from({ length: +count }, (_, i) => lodeCells(hero, mood, +from + i * +step, mode, TERRY_COLS, effort))
console.log(JSON.stringify({ cols: TERRY_COLS, rows: TERRY_ROWS, step: +step, braille: frames('braille'), quad: frames('quad') }))
