// usage-meter: 5시간 / 주간 / 대화 사용량을 프롬프트 위 한 줄 밴드로 보여줍니다.
// /flame1 : 칸마다 파란 불꽃이 타오르는 밴드 (사용량이 늘수록 커지고 80% 넘으면 주황으로 바뀜)
// /terry  : 베들링턴 테리어가 5시간 사용량 위치까지 달리는 큰 화면
// 뒤에 quad 또는 braille 을 붙이면 그림 방식을 바꿉니다 (예: /terry braille)
//
// 그림 그리는 계산은 render.js, 스프라이트 데이터는 terrier-data.js 에 있습니다.
import { BAND_GAP, BAND_NAMES, BONE_ROWS, DOG_COLS, DOG_ROWS, boneCells, dogCells, makeBand, stateColor } from './render.js'

const FLAME_ROWS = 3 // 불꽃 줄 수 (게이지 줄과 이름 줄은 따로)
const FRAME_MS = 66 // 약 15프레임

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
// 모델은 연보라, 추론 강도는 단계별 색 (경고에 쓰는 노랑·주황·빨강은 피했다)
const MODEL_COLOR = '#b4a0ff'
const EFFORT_COLORS = { low: '#8a8f98', medium: '#7fb2ff', high: '#c792ea', xhigh: '#ff9ecd', max: '#ff6fae' }
const effortColor = level => EFFORT_COLORS[level] ?? '#c792ea'
function modelTexts(Text, prefix, lead) {
  const name = prettyModel(modelId)
  if (!name) return []
  const parts = [Text({ key: prefix + 'm', color: MODEL_COLOR, bold: true, children: [lead + name] })]
  if (effort) {
    parts.push(Text({ key: prefix + 'sep', dimColor: true, children: [' · 추론 '] }))
    parts.push(Text({ key: prefix + 'e', color: effortColor(effort), children: [effort] }))
  }
  return parts
}
// 모델 카드: 둥근 테두리 안에 두 줄 (모델 / 추론). 테두리까지 4줄이라 불꽃 밴드 높이와 같다.
const CARD_BORDER = '#5a5f73'
function modelCard(Box, Text, key) {
  const name = prettyModel(modelId)
  if (!name) return null
  return Box({
    key,
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: CARD_BORDER,
    paddingX: 1,
    children: [
      Text({ key: key + '-m', color: MODEL_COLOR, bold: true, children: [name] }),
      Box({
        key: key + '-e',
        flexDirection: 'row',
        children: [
          Text({ key: key + '-ek', dimColor: true, children: ['추론 '] }),
          Text({ key: key + '-ev', color: effort ? effortColor(effort) : undefined, dimColor: !effort, children: [effort ?? '--'] }),
        ],
      }),
    ],
  })
}
// 카드가 차지하는 폭 (테두리 2 + 안쪽 여백 2 + 글자)
const cardWidth = () => {
  const name = prettyModel(modelId)
  return name ? Math.max(visible(name), visible('추론 ' + (effort ?? '--'))) + 4 : 0
}
const modelLine = () => {
  const name = prettyModel(modelId)
  if (!name) return null
  return effort ? name + ' · 추론 ' + effort : name
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
  // 추론 강도는 요청마다 turn.step 에서 받지만, 불러온 직후(첫 요청 전)에는 환경 변수와 설정에서 먼저 읽어 둔다
  if (!effort) {
    try {
      effort = (await $.env.get('CLAUDE_EFFORT')) || null
    } catch (err) {}
  }
  if (!effort) {
    try {
      const row = (await $.config.list()).find(r => /effort/i.test(r.key))
      if (row && typeof row.value === 'string' && row.value) effort = row.value
    } catch (err) {}
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
    // 터미널이 트루컬러를 알리지 않으면 Claude Code 가 256색으로 줄여 그린다 (테리가 청록색, 흙길이 회색으로 보임)
    const colorterm = ((await $.env.get('COLORTERM')) || '').toLowerCase()
    if (colorterm !== 'truecolor' && colorterm !== '24bit') {
      await $.ui.toast('usage-meter: 색이 이상하게 보이면 셸 설정에 export COLORTERM=truecolor 를 넣고 Claude Code 를 다시 시작하세요 (지금은 256색으로 그려져요)', { timeoutMs: 12000 })
    }
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

    // /terry 화면: 테리가 불꽃 막대(5시간) 위를 달리고, 오른쪽에 모델 카드와 뼈다귀 두 개(주간, 대화).
    // 뼈다귀는 쓴 만큼 왼쪽부터 차오르고, 가운데 몸통에 퍼센트가 적혀 있다. 5시간 숫자는 막대 끝에 적힌다.
    if (style === 'terry') {
      const BONE_COLS = 13
      const SIDE = Math.max(cardWidth(), BONE_COLS * 2 + 2) + 3
      const side = cols - 2 - SIDE >= DOG_COLS + 8
      const columns = Math.max(DOG_COLS + 8, Math.min(60, cols - 2 - (side ? SIDE : 0)))
      const pct = vals[0] ?? 0
      runAnim($, e.requestId, 'dog', columns, DOG_ROWS, () => dogCells(columns, values()[0] ?? 0, nowMs(), mode))
      const bone = i =>
        Box({
          key: 'bone-box' + i,
          flexDirection: 'column',
          alignItems: 'center',
          marginRight: i === 1 ? 2 : 0,
          children: [
            Raster({ key: 'bone' + i, columns: BONE_COLS, rows: BONE_ROWS, cells: boneCells(BONE_COLS, vals[i], mode) }),
            Text({ key: 'bone-l' + i, color: stateColor(vals[i] ?? 0), bold: true, children: [BAND_NAMES[i]] }),
          ],
        })
      const bones = Box({ key: 'bones', flexDirection: 'row', children: [bone(1), bone(2)] })
      const card = modelCard(Box, Text, 'dog-card')
      const dog = Raster({ key: 'dog', columns, rows: DOG_ROWS, cells: dogCells(columns, pct, nowMs(), mode) })
      if (side) {
        return Box({
          key: 'dog-row',
          flexDirection: 'row',
          children: [
            dog,
            Box({ key: 'dog-side', flexDirection: 'column', marginLeft: 2, children: [card ?? Text({ key: 'no-card', children: [''] }), bones] }),
          ],
        })
      }
      // 좁은 화면: 뼈다귀는 테리 아래로, 모델은 한 줄 글자로
      return Box({
        flexDirection: 'column',
        children: [dog, bones, Box({ key: 'dog-model', flexDirection: 'row', children: modelTexts(Text, 'dm-', '') })],
      })
    }

    // /flame1 화면: 5시간 | 주간 | 대화, 칸마다 불꽃
    // 모델 표기가 들어갈 자리를 먼저 남기고 밴드 폭을 정한다 (자리가 너무 좁아지면 모델 표기를 뺀다)
    // 모델 카드 자리를 먼저 남기고 밴드 폭을 정한다 (자리가 너무 좁아지면 카드를 뺀다)
    const reserve = prettyModel(modelId) ? cardWidth() + 2 : 0
    const bandCols = cols - 2 - reserve >= 36 ? cols - 2 - reserve : cols - 2
    const band = bandFor(bandCols)
    const showModel = reserve > 0 && band.columns + 2 + reserve <= cols
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
        Box({
          key: 'band-row',
          flexDirection: 'row',
          children: [
            Raster({ key: 'band', columns: band.columns, rows: band.rows, cells: band.cells(vals, nowMs() / 1000) }),
            ...(showModel ? [Box({ key: 'band-side', marginLeft: 2, children: [modelCard(Box, Text, 'band-card')] })] : []),
          ],
        }),
        Box({ key: 'labels', flexDirection: 'row', children: labels }),
      ],
    })
  })
}
