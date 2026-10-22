// 글꼴(font) 방식의 카드 그림: Lode Cells 글꼴의 글리프로 터미널 픽셀 그대로 그린다 (register.js 의 Client 가 띄움).
// Raster 는 BMP 글자만 받아 U+100000 위의 글리프를 못 그려서, 줄마다 글(Text)로 그린다. Raster 와 달리 blit 이 없어
// 장마다 다시 그려야 하는데, 이 모듈이 자기 칸만 다시 그리므로 카드 전체(사용량 표·카드)를 다시 그리지 않는다.
// props: { hero, mood, effort, hour, cols, startedAt, date (moodSince 는 그 동작이 시작된 시각),
//   paused (다른 창이 움직이는 중: 지금 기분의 첫 장을 어둡게, 일시정지 막대와 함께 멈춰 둔다. pause.js) }
import { terryFineCellList } from './terry-fine.js'
import { fineCellList } from './lode-fine.js'
import { TERRY_ROWS } from './render.js'
import { pausedCells, PAUSE_MS } from './pause.js'

const FRAME_MS = 60 // 달리기 한 장(60ms)에 한 번. 그림이 그대로면 다시 그리지 않는다
const TERM_DEFAULT = 0x01000000 // 칸 목록의 '터미널 기본색'
const hexColor = c => (c === TERM_DEFAULT ? undefined : '#' + c.toString(16).padStart(6, '0'))

const cellsFor = p => {
  const now = Date.now()
  const date = p.date && { ...p.date, moodMs: p.paused ? 0 : now - p.date.moodSince }
  const ms = p.paused ? PAUSE_MS : now - p.startedAt
  const cells = p.hero === 'terry'
    ? terryFineCellList(p.mood, ms, p.hour, p.cols, p.effort, date)
    : fineCellList(p.hero, p.mood, ms, p.cols, p.effort)
  return p.paused ? pausedCells(cells, p.cols, TERRY_ROWS) : cells
}

// 칸 목록을 줄마다 글 하나로: 색이 같은 칸끼리 묶는다. 빈칸은 글자색이 안 보이니 앞 칸의 글자색에 붙인다.
// 글리프가 오른쪽 칸 위로 넘쳐 그려져(칸당 3색) 줄은 칸 그대로 이어 써야 한다(잘리거나 줄바꿈되면 안 됨)
function picture(Box, Text, cells, cols) {
  const lines = []
  for (let y = 0; y < TERRY_ROWS; y++) {
    const runs = []
    for (let x = 0; x < cols; x++) {
      const [cp, fg, bg] = cells[y * cols + x]
      const last = runs[runs.length - 1]
      if (last && last.bg === bg && (last.fg === fg || cp === 0x20)) last.text += String.fromCodePoint(cp)
      else runs.push({ fg, bg, text: String.fromCodePoint(cp) })
    }
    lines.push(Text({
      key: 'r' + y,
      wrap: 'truncate',
      children: runs.map((r, i) => Text({ key: 'r' + y + '-' + i, color: hexColor(r.fg), backgroundColor: hexColor(r.bg), children: [r.text] })),
    }))
  }
  return Box({ flexDirection: 'column', width: cols, height: TERRY_ROWS, children: lines })
}

// 인스턴스마다 가장 최근 props (타이머가 읽는다; 같은 인스턴스엔 같은 surface 가 온다)
const latest = new WeakMap()
const ticking = new WeakSet()

export default function HeroFont(props, surface) {
  const { Box, Text } = surface.elements
  const changed = latest.get(surface) !== props
  latest.set(surface, props)
  if (!ticking.has(surface)) {
    ticking.add(surface)
    surface.every(FRAME_MS, () => {
      if (latest.get(surface).paused) return // 멈춘 장: props 가 바뀔 때만 다시 그린다
      let cells
      try {
        cells = cellsFor(latest.get(surface))
      } catch (err) {
        return
      }
      const sig = cells.join()
      if (surface.state?.sig !== sig) surface.setState({ cells, sig })
    })
  }
  // 새 props(동작·폭이 바뀜)면 바로 새 장, 아니면 타이머가 그려 둔 장
  const cells = !changed && !props.paused && surface.state?.cells.length === props.cols * TERRY_ROWS ? surface.state.cells : cellsFor(props)
  return picture(Box, Text, cells, props.cols)
}
