// 쉬는 창의 카드: 여러 Claude 창을 띄우면 마지막으로 입력한 창의 카드만 움직이고, 나머지는 지금 기분의 한 장에서 멈춰
// 어두워지고 가운데에 일시정지 막대(❚❚)가 선다. 기분이 바뀌면(끝남·실패·졸기) 그 한 장으로 바뀐다.
// 왜: WaveTerm 은 글꼴·크기·색이 같은 터미널끼리 글자 그림 저장소(xterm 의 texture atlas) 하나를 나눠 쓴다. 창마다 카드가
// 저마다 움직이면 그 저장소가 창 수만큼 빨리 차서 글자가 깨졌다 (2026-10-21, 네 창에서). 멈춘 한 장은 더 늘지 않는다.
// cells: [글자, 글자색, 바탕색] 목록 (render.js 의 칸 목록). 터미널 기본색(TERM_DEFAULT)은 그대로 둔다.

export const TERM_DEFAULT = 0x01000000
const DIM = 0.42 // 어둡게: 색마다 이만큼만 남긴다
const BAR = 0xdcdce4 // 일시정지 막대
const dim = c => (c === TERM_DEFAULT || c < 0 ? c : (Math.round(((c >> 16) & 255) * DIM) << 16) | (Math.round(((c >> 8) & 255) * DIM) << 8) | Math.round((c & 255) * DIM))

// 멈춘 장의 시각: 첫 장(0ms)은 앉은 테리가 눈을 감고 있어 졸린 듯 보였다
export const PAUSE_MS = 1200

/** 멈춘 카드 한 장: 칸 목록을 어둡게 하고, 테리 오른쪽 하늘에 일시정지 막대 둘(한 칸 폭, 네 줄)을 세운다(테리의 자세가
 * 상태라서 그 위엔 두지 않는다). 새 목록을 돌려준다 */
export function pausedCells(cells, cols, rows) {
  const out = cells.map(([cp, fg, bg]) => [cp, dim(fg), dim(bg)])
  const x = Math.floor(cols * 0.72), y0 = Math.max(0, Math.floor(rows / 2) - 3)
  for (let y = y0; y < Math.min(rows, y0 + 4); y++) for (const bx of [x, x + 2]) {
    const i = y * cols + bx
    if (bx >= 0 && bx < cols) out[i] = [0x2588, BAR, out[i][2]]
  }
  return out
}
