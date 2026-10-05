// usage-meter: 5시간 / 주간 / 대화 사용량을 프롬프트 위 한 줄 밴드로 보여줍니다.
// /flame1 : 칸마다 파란 불꽃이 타오르는 밴드 (사용량이 늘수록 커지고 80% 넘으면 주황으로 바뀜)
// /terry  : 베들링턴 테리어가 5시간 사용량 위치까지 달리는 큰 화면
// 뒤에 quad 또는 braille 을 붙이면 그림 방식을 바꿉니다 (예: /terry braille)
//
// 그림 그리는 계산은 render.js, 스프라이트 데이터는 terrier-data.js 에 있습니다.
import { BAND_GAP, BAND_NAMES, DOG_COLS, DOG_ROWS, dogCells, makeBand, stateColor } from './render.js'

const FLAME_ROWS = 3 // 불꽃 줄 수 (게이지 줄과 이름 줄은 따로)
const FRAME_MS = 66 // 약 15프레임
const MINI_BAR = 14 // /terry 화면 아래의 작은 게이지 칸 수

const startedAt = Date.now()
const nowMs = () => Date.now() - startedAt

let usage = null // $.session.usage() 의 마지막 결과
let modelId = null // 지금 모델 (/model 이 보여주는 것)
let effort = null // 추론 강도: 요청마다 turn.step 에서 읽는다. 첫 요청 전이거나 강도가 없는 모델이면 null
let style = 'flame1' // 'flame1' (불꽃 밴드) | 'terry' (강아지)
let mode = 'quad' // 'quad' (사분블록) | 'braille' (점자)

// 임계치 알림: 같은 단계는 한 번만
const lastTier = new Map()
let lastContextTier = 0

// 움직이는 그림을 다시 그리는 타이머
let anim = null
let denies = 0

// 사용법 안내 (불러올 때 알림창으로, /flame1 help 로도 볼 수 있다). 명령 하나당 한 줄.
const guide = () =>
  [
    'usage-meter 사용법 (지금: ' + (style === 'terry' ? '강아지' : '불꽃 밴드') + ', ' + (mode === 'quad' ? 'quad' : 'braille') + ')',
    '/flame1 quad    : 파란 불꽃 밴드, 꽉 찬 블록으로 그림',
    '/flame1 braille : 파란 불꽃 밴드, 점자로 그림 (더 곱지만 알알이 보일 수 있음)',
    '/terry quad     : 달리는 강아지, 꽉 찬 블록으로 그림',
    '/terry braille  : 달리는 강아지, 점자로 그림',
  ].join('\n')

const LABELS = { five_hour: '5시간', seven_day: '주간', spend_limit: '지출' }
const labelFor = kind => LABELS[kind] ?? kind

// 엔진이 주는 값은 0~100 이고, context.percent 는 비어 있을 수 있다
const tierFor = value => (value >= 90 ? 2 : value >= 80 ? 1 : 0)
const limitPct = kind => {
  const limit = usage?.rateLimits.find(l => l.kind === kind)
  return limit ? limit.percentUsed : null
}
const values = () => [limitPct('five_hour'), limitPct('seven_day'), usage?.context.percent ?? null]
const show = v => (v == null ? '--' : Math.round(v) + '%')

// 'claude-opus-5-5' -> 'Opus 5.5', 'claude-haiku-4-5-20251001' -> 'Haiku 4.5'
function prettyModel(id) {
  if (!id) return null
  const parts = id.replace(/^claude-/, '').replace(/\[.*\]$/, '').split('-')
  const family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  const version = parts.slice(1).filter(p => /^\d{1,2}$/.test(p)).join('.')
  return version ? family + ' ' + version : family
}
// 밴드 아래 줄이나 강아지 화면 아래에 붙는 짧은 표기. 예: 'Opus 5.5 · high'
const modelLine = () => {
  const name = prettyModel(modelId)
  if (!name) return null
  return effort ? name + ' · ' + effort : name
}

// 한글은 두 칸을 차지한다
const visible = s => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) >= 0xac00 && ch.charCodeAt(0) <= 0xd7a3 ? 2 : 1), 0)

async function refresh($) {
  usage = await $.session.usage()
  try {
    modelId = await $.session.model()
  } catch (err) {
    // 모델 이름은 없어도 밴드는 그린다
  }

  for (const limit of usage.rateLimits) {
    const tier = tierFor(limit.percentUsed)
    const prevTier = lastTier.get(limit.kind) ?? 0
    if (tier > prevTier) {
      if (tier === 1) {
        await $.ui.toast(labelFor(limit.kind) + ' 사용량 80% 넘었어요 — 슬슬 아껴 쓰세요')
      } else if (tier === 2) {
        await $.ui.toast(labelFor(limit.kind) + ' 사용량 90% 넘었어요 — 하던 것만 마무리하고 멈추는 걸 추천해요')
      }
    }
    lastTier.set(limit.kind, tier)
  }

  const ctx = usage.context.percent ?? 0
  const contextTier = tierFor(ctx)
  if (contextTier > lastContextTier && ctx >= 85) {
    await $.ui.toast('대화가 길어졌어요 — /compact 로 정리할까요?')
  }
  lastContextTier = contextTier

  $.ui.invalidate('ui.render')
}

function stopAnim() {
  anim?.timer.cancel()
  anim = null
}

// 같은 그림이면 그대로 두고, 바뀌었으면 타이머를 새로 건다. blit 이 거절되면(아직 안 그려졌을 수 있음) 몇 번 다시 시도한다.
function runAnim($, requestId, key, columns, rows, build) {
  const id = [requestId, key, columns, rows, mode].join('|')
  if (anim && anim.id === id) return
  stopAnim()
  const timer = $.clock.every(FRAME_MS, () => {
    let cells
    try {
      cells = build()
    } catch (err) {
      return
    }
    void $.ui.blit({ requestId, key, cells }).then(result => {
      if (!result.deny) { denies = 0; return }
      denies += 1
      if (anim && anim.timer === timer) { timer.cancel(); anim = null }
      if (denies <= 4) $.ui.invalidate('ui.render')
    })
  })
  anim = { id, timer }
}

// 폭이 바뀌면 밴드를 새로 만든다
let bandCache = null
function bandFor(cols) {
  if (!bandCache || bandCache.cols !== cols || bandCache.mode !== mode) {
    bandCache = { cols, mode, band: makeBand(cols, FLAME_ROWS, mode) }
  }
  return bandCache.band
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'flame1', description: '사용량을 파란 불꽃 밴드로 보여요 (뒤에 quad 또는 braille 을 붙이면 그림 방식 변경)' })
    await $.command.register({ name: 'terry', description: '사용량을 베들링턴 테리어가 달리는 화면으로 보여요 (뒤에 quad 또는 braille 을 붙이면 그림 방식 변경)' })
    style = (await $.store.get('style')) === 'terry' ? 'terry' : 'flame1'
    mode = (await $.store.get('mode')) === 'braille' ? 'braille' : 'quad'
    await refresh($)
    $.clock.every(30000, () => refresh($))
    await $.ui.toast(guide(), { timeoutMs: 12000 })
    return next(e)
  })

  // 모델 요청마다 모델과 추론 강도를 읽는다 (바뀐 때만 다시 그린다). 요청은 그대로 보낸다.
  // turn.step 은 응답이 조각조각 흘러오는 이벤트라서 async function* 로 쓰고, 그대로 통과시킨다.
  on('turn.step', async function* ($, e, next) {
    const nextEffort = e.effort == null ? null : String(e.effort)
    if (e.model !== modelId || nextEffort !== effort) {
      modelId = e.model
      effort = nextEffort
      $.ui.invalidate('ui.render')
    }
    return yield* next(e)
  })

  // 턴이 끝날 때와 한도 % 가 바뀔 때
  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // /flame1 과 /terry: 그 화면으로 바꾼다. 뒤에 quad / braille 이 있으면 그림 방식도 바꾼다.
  for (const name of ['flame1', 'terry']) {
    on('command.run', { command: name }, async ($, e) => {
      const arg = e.args.trim().toLowerCase()
      if (arg === 'help' || arg === '?') return { text: guide() }
      if (arg === 'quad' || arg === 'braille') {
        mode = arg
        await $.store.set('mode', mode)
      }
      style = name
      await $.store.set('style', style)
      stopAnim()
      $.ui.invalidate('ui.render')
      const way = mode === 'quad' ? '사분블록(quad)' : '점자(braille)'
      return { text: (style === 'terry' ? '강아지(terry)' : '불꽃 밴드(flame1)') + ' 화면으로 바꿨어요 · 그림 방식: ' + way }
    })
  }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!usage || e.props.hasSurvey) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const vals = values()
    const cols = Math.max(30, e.props.bodyColumns || 80)

    // 그림을 못 그리는 화면: 글자 한 줄
    if (!Raster || e.surface !== 'terminal') {
      return Box({
        flexDirection: 'row',
        children: BAND_NAMES.map((name, i) =>
          Text({ key: 't' + i, color: stateColor(vals[i] ?? 0), children: [name + ' ' + show(vals[i]) + '  '] }),
        ),
      })
    }

    // /terry 화면: 강아지가 사용량(5시간) 위치까지 달린다
    if (style === 'terry') {
      // 모델과 추론 강도는 강아지 오른쪽 빈 곳에 세로로 둔다. 자리가 모자라면 아래 줄에 붙인다.
      const name = prettyModel(modelId)
      const SIDE = 22
      const side = name != null && cols - 2 - SIDE >= DOG_COLS + 8
      const columns = Math.max(DOG_COLS + 8, Math.min(64, cols - 2 - (side ? SIDE : 0)))
      const pct = vals[0] ?? 0
      runAnim($, e.requestId, 'dog', columns, DOG_ROWS, () => dogCells(columns, values()[0] ?? 0, nowMs(), mode))
      const dog = Raster({ key: 'dog', columns, rows: DOG_ROWS, cells: dogCells(columns, pct, nowMs(), mode) })
      return Box({
        flexDirection: 'column',
        children: [
          side
            ? Box({
                key: 'dog-row',
                flexDirection: 'row',
                children: [
                  dog,
                  Box({
                    key: 'dog-side',
                    flexDirection: 'column',
                    marginLeft: 3,
                    paddingTop: Math.max(0, Math.floor(DOG_ROWS / 2) - 2),
                    children: [
                      Text({ key: 'ds-model', bold: true, children: [name] }),
                      Text({ key: 'ds-effort', dimColor: true, children: [effort ?? ''] }),
                    ],
                  }),
                ],
              })
            : dog,
          // 강아지가 달리는 위치는 5시간. 주간과 대화는 아래에 작은 게이지로 따로 보여준다
          Box({
            key: 'dog-main',
            flexDirection: 'row',
            children: [
              Text({ key: 'dm-label', color: stateColor(pct), bold: true, children: ['5시간 ' + show(vals[0])] }),
              Text({ key: 'dm-model', dimColor: true, children: [!side && modelLine() ? '   ' + modelLine() : ''] }),
              Text({ key: 'dm-hint', dimColor: true, children: ['   (강아지가 달리는 위치 · /flame1 로 불꽃 밴드)'] }),
            ],
          }),
          Box({
            key: 'dog-sub',
            flexDirection: 'row',
            children: [1, 2].flatMap(i => {
              const v = vals[i]
              const filled = Math.round(((v ?? 0) / 100) * MINI_BAR)
              return [
                Text({ key: 'ds-l' + i, color: stateColor(v ?? 0), children: [BAND_NAMES[i] + ' ' + show(v) + ' '] }),
                Text({ key: 'ds-f' + i, color: stateColor(v ?? 0), children: ['█'.repeat(filled)] }),
                Text({ key: 'ds-e' + i, dimColor: true, children: ['░'.repeat(MINI_BAR - filled) + (i === 1 ? '    ' : '')] }),
              ]
            }),
          }),
        ],
      })
    }

    // /flame1 화면: 5시간 | 주간 | 대화, 칸마다 불꽃
    // 모델 표기가 들어갈 자리를 먼저 남기고 밴드 폭을 정한다 (자리가 너무 좁아지면 모델 표기를 뺀다)
    const ml = modelLine()
    const reserve = ml ? visible(ml) + 2 : 0
    const bandCols = cols - 2 - reserve >= 36 ? cols - 2 - reserve : cols - 2
    const band = bandFor(bandCols)
    const showModel = ml != null && band.columns + 2 + reserve <= cols
    runAnim($, e.requestId, 'band', band.columns, band.rows, () => band.cells(values(), nowMs() / 1000))
    const labels = BAND_NAMES.map((name, i) => {
      const pct = vals[i] ?? 0
      const text = name + ' ' + show(vals[i]) + (pct >= 90 ? ' !' : '')
      const pad = ' '.repeat(Math.max(0, band.widths[i] + BAND_GAP - visible(text)))
      return Text({ key: 'label' + i, color: stateColor(pct), children: [text + pad] })
    })
    return Box({
      flexDirection: 'column',
      children: [
        Raster({ key: 'band', columns: band.columns, rows: band.rows, cells: band.cells(vals, nowMs() / 1000) }),
        Box({
          flexDirection: 'row',
          children: [
            ...labels,
            ...(showModel ? [Text({ key: 'model', dimColor: true, children: [ml] })] : []),
          ],
        }),
      ],
    })
  })
}
