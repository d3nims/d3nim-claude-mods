// usage-meter: 5시간 / 주간 / 대화 사용량을 프롬프트 위 한 줄 밴드로 보여줍니다.
// /flame1 : 칸마다 파란 불꽃이 타오르는 밴드 (사용량이 늘수록 커지고 80% 넘으면 주황으로 바뀜)
// /terry  : 베들링턴 테리어가 5시간 사용량 위치까지 달리는 큰 화면
// 뒤에 quad 또는 braille 을 붙이면 그림 방식을 바꿉니다 (예: /terry braille)
//
// 그림 그리는 계산은 render.js, 스프라이트 데이터는 terrier-data.js 에 있습니다.
import { BAND_GAP, BAND_NAMES, TERRY_COLS, TERRY_ROWS, makeBand, stateColor, terryCells } from './render.js'

const FLAME_ROWS = 3 // 불꽃 줄 수 (게이지 줄과 이름 줄은 따로)
const FRAME_MS = 66 // 약 15프레임

const startedAt = Date.now()
const nowMs = () => Date.now() - startedAt
const localHour = () => {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

let usage = null // $.session.usage() 의 마지막 결과
let modelId = null // 지금 모델 (/model 이 보여주는 것)
let lastStepEffort = '(아직 요청 없음)'
let stepCalls = 0
let stepChunks = 0
let countedChunks = 0
let effortFrom = '없음' // 추론 강도를 어디서 읽었는지 (/terry debug)
let effort = null // 추론 강도: 요청마다 turn.step 에서 읽는다. 첫 요청 전이거나 강도가 없는 모델이면 null
let style = 'flame1' // 'flame1' (불꽃 밴드) | 'terry' (강아지)
let mode = 'quad' // 'quad' (사분블록) | 'braille' (점자)

// 임계치 알림: 같은 단계는 한 번만
const lastTier = new Map()
let lastContextTier = 0

// 움직이는 그림을 다시 그리는 타이머
let anim = null
let denies = 0

// 테리의 기분: 지금 무슨 일이 일어나는지에 따라 바뀐다
const SLEEP_AFTER = 3 * 60 * 1000 // 이만큼 조용하면 존다
let working = false // Claude 가 응답 중
let lastActivity = Date.now()
let lastEdit = 0
let barkUntil = 0
let typingUntil = 0
let happyUntil = 0
let drawnMood = null
function mood() {
  const now = Date.now()
  if (working) return 'run'
  if (now < barkUntil) return 'bark'
  if (now < typingUntil) return 'wag'
  if (now < happyUntil) return 'happy'
  if (now - lastActivity > SLEEP_AFTER) return 'sleep'
  return 'sit'
}
const MOOD_TEXT = { sit: '앉아서 기다리는 중', wag: '입력하는 걸 보고 있어요', bark: '멍! 멍!', run: '달리는 중', happy: '다 했어요!', sleep: '졸고 있어요 zZ' }

// 이번 요청(턴)의 숫자: 걸린 시간, 토큰, 초당 토큰
const blankTurn = () => ({ start: 0, genStart: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, liveChars: 0, end: 0, reason: null })
let turn = blankTurn()
let lastTurn = null
// 응답이 흘러오는 동안의 추정 토큰 (요청이 끝나면 API 가 준 정확한 값으로 바뀐다): 영문 4글자, 한글 1글자 = 1토큰 정도
const estimate = chars => Math.round(chars / 3)
const fmtTokens = n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n))
function turnLine(t, live) {
  const end = live ? Date.now() : t.end
  const secs = Math.max(0, (end - t.start) / 1000)
  const out = t.output + estimate(t.liveChars)
  const genSecs = t.genStart ? Math.max(0.5, (end - t.genStart) / 1000) : 0
  const tps = genSecs ? Math.round(out / genSecs) : 0
  return {
    time: (secs < 60 ? secs.toFixed(1) + '초' : Math.floor(secs / 60) + '분 ' + Math.round(secs % 60) + '초') + (tps ? ' · ' + tps + ' tok/s' : ''),
    tokens: '입력 ' + fmtTokens(t.input) + ' · 출력 ' + fmtTokens(out) + ' · 캐시 ' + fmtTokens(t.cacheRead),
  }
}
function startTurn() {
  if (working) return
  working = true
  turn = blankTurn()
  turn.start = Date.now()
  lastActivity = turn.start
}
function endTurn(reason) {
  if (!working) return
  // no model answer came in (a slash command also flips the band's 'working' flag): forget it, keep the last real one
  const hadAnswer = turn.genStart || turn.input || turn.output || turn.liveChars
  if (!hadAnswer) {
    working = false
    return
  }
  working = false
  turn.end = Date.now()
  turn.reason = reason
  lastTurn = turn
  lastActivity = turn.end
  if (reason === 'answer') happyUntil = turn.end + 3500
}

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

// 초기화 시각: 한도 정보의 resetsAt (ISO). 5시간은 '2시간 13분 뒤', 주간은 '10/9(목) 14시'.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const limitReset = kind => {
  const at = usage?.rateLimits.find(l => l.kind === kind)?.resetsAt
  const t = at ? Date.parse(at) : NaN
  return Number.isFinite(t) ? t : null
}
function resetText(i) {
  if (i === 0) {
    const t = limitReset('five_hour')
    if (t == null) return null
    const left = Math.max(0, t - Date.now())
    const h = Math.floor(left / 3600000)
    const m = Math.floor((left % 3600000) / 60000)
    return left < 60000 ? '곧' : h > 0 ? h + '시간 ' + m + '분 뒤' : m + '분 뒤'
  }
  if (i === 1) {
    const t = limitReset('seven_day')
    if (t == null) return null
    const d = new Date(t)
    return d.getMonth() + 1 + '/' + d.getDate() + '(' + WEEKDAYS[d.getDay()] + ') ' + d.getHours() + '시'
  }
  return null
}

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
    parts.push(Text({ key: prefix + 'sep', dimColor: true, children: [' · '] }))
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
          Text({ key: key + '-ek', dimColor: true, children: [effort ? '' : '추론 '] }),
          Text({ key: key + '-ev', color: effort ? effortColor(effort) : undefined, dimColor: !effort, children: [effort ?? '--'] }),
        ],
      }),
    ],
  })
}
// 카드가 차지하는 폭 (테두리 2 + 안쪽 여백 2 + 글자)
const cardWidth = () => {
  const name = prettyModel(modelId)
  return name ? Math.max(visible(name), visible(effort ?? '추론 --')) + 4 : 0
}
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
  // 추론 강도는 요청마다 turn.step 에서 받지만, 불러온 직후(첫 요청 전)에는 환경 변수와 설정에서 먼저 읽어 둔다
  if (!effort) {
    try {
      effort = (await $.env.get('CLAUDE_EFFORT')) || null
      if (effort) effortFrom = 'CLAUDE_EFFORT 환경 변수'
    } catch (err) {}
  }
  if (!effort) {
    try {
      const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) || (await $.env.get('HOME')) + '/.claude'
      const level = JSON.parse(await $.fs.read(dir + '/settings.json')).effortLevel
      if (typeof level === 'string' && level) {
        effort = level
        effortFrom = '설정 파일 effortLevel'
      }
    } catch (err) {}
  }
  if (!effort) {
    try {
      const row = (await $.config.list()).find(r => /effort/i.test(r.key))
      if (row && typeof row.value === 'string' && row.value) {
        effort = row.value
        effortFrom = '설정 ' + row.key
      }
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
    $.clock.every(1000, () => {
      if (style === 'terry') $.ui.invalidate('ui.render')
    })
    await $.ui.toast(guide(), { timeoutMs: 12000 })
    // 터미널이 트루컬러를 알리지 않으면 Claude Code 가 256색으로 줄여 그린다 (테리가 청록색, 흙길이 회색으로 보임)
    let colorterm = ''
    try {
      colorterm = ((await $.env.get('COLORTERM')) || '').toLowerCase()
    } catch (err) {
      colorterm = 'unknown' // 읽을 수 없으면 안내하지 않는다
    }
    if (colorterm !== 'truecolor' && colorterm !== '24bit' && colorterm !== 'unknown') {
      await $.ui.toast('usage-meter: 색이 이상하게 보이면 셸 설정에 export COLORTERM=truecolor 를 넣고 Claude Code 를 다시 시작하세요 (지금은 256색으로 그려져요)', { timeoutMs: 12000 })
    }
    return next(e)
  })

  // 모델 요청마다 모델과 추론 강도를 읽는다 (바뀐 때만 다시 그린다). 요청은 그대로 보낸다.
  // turn.step 은 응답이 조각조각 흘러오는 이벤트라서 async function* 로 쓰고, 그대로 통과시킨다.
  on('turn.step', async function* ($, e, next) {
    const nextEffort = e.effort == null ? null : String(e.effort)
    stepCalls += 1
    lastStepEffort = e.effort == null ? '(없음)' : String(e.effort)
    if (e.model !== modelId || (nextEffort && nextEffort !== effort)) {
      modelId = e.model
      if (nextEffort) {
        effort = nextEffort
        effortFrom = '요청(turn.step)'
      }
      $.ui.invalidate('ui.render')
    }
    // 세기만 한다. 턴이 끝난 뒤의 모델 호출(다음 입력 제안 등)에서 달리기를 다시 켜면 안 된다.
    for await (const chunk of next(e)) {
      stepChunks += 1
      if (!working) {
        yield chunk
        continue
      }
      countedChunks += 1
      if (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'input') {
        if (!turn.genStart) turn.genStart = Date.now()
        turn.liveChars += chunk.kind === 'input' ? chunk.json.length : chunk.text.length
      } else if (chunk.kind === 'stop' && chunk.usage) {
        turn.input += chunk.usage.input_tokens
        turn.output += chunk.usage.output_tokens
        turn.cacheRead += chunk.usage.cache_read_input_tokens
        turn.cacheWrite += chunk.usage.cache_creation_input_tokens
        turn.liveChars = 0
      }
      yield chunk
    }
  })

  // 입력을 시작하면 짖고, 치는 동안 꼬리를 흔든다
  on('prompt.edit', async ($, e, next) => {
    const now = Date.now()
    if (!working) {
      if (now - lastEdit > 6000) barkUntil = now + 1400
      typingUntil = now + 3500
    }
    lastEdit = now
    lastActivity = now
    return next(e)
  })

  // 엔터: 달리기 시작
  on('prompt.submit', async ($, e, next) => {
    startTurn()
    barkUntil = 0
    typingUntil = 0
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    startTurn()
    return next(e)
  })

  // 응답 끝: 멈춰서 꼬리 흔들기 (중단이나 오류면 그냥 앉는다)
  on('turn.complete', async ($, e, next) => {
    if (working && !e.agentId) {
      endTurn(e.reason)
      $.ui.invalidate('ui.render')
    }
    return next(e)
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
      if (arg === 'debug') {
        let env = '(읽기 실패)'
        try {
          env = (await $.env.get('CLAUDE_EFFORT')) ?? '(없음)'
        } catch (err) {}
        let rows = '(읽기 실패)'
        try {
          rows = (await $.config.list()).filter(r => /effort|think|reason/i.test(r.key + ' ' + r.label)).map(r => r.key + '=' + JSON.stringify(r.value)).join(', ') || '(해당 항목 없음)'
        } catch (err) {}
        return {
          text: [
            'usage-meter 진단',
            '모델: ' + (modelId ?? '(없음)') + ' / 추론: ' + (effort ?? '(없음)') + ' (출처: ' + effortFrom + ')',
            '마지막 요청의 effort 값: ' + lastStepEffort + ' / 요청 신호 ' + stepCalls + '번, 응답 조각 ' + stepChunks + '개',
            'CLAUDE_EFFORT: ' + env,
            '설정 항목: ' + rows,
            '응답 중: ' + working + ' / 지금 요청 토큰: 입력 ' + turn.input + ' 출력 ' + turn.output + ' 추정 글자 ' + turn.liveChars,
            '센 조각 ' + countedChunks + '개 / 건너뛴 조각 ' + (stepChunks - countedChunks) + '개 (응답 중이 아닐 때 온 것)',
            '지난 요청: ' + (lastTurn ? turnLine(lastTurn, false).time + ' / ' + turnLine(lastTurn, false).tokens : '(없음)'),
          ].join('\n'),
        }
      }
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

    // /terry 화면: 테리가 지금 일어나는 일에 반응한다. 평소엔 앉아 있다가, 입력을 시작하면 짖고, 치는 동안 꼬리를 흔들고,
    // 엔터를 치면 응답이 끝날 때까지 달리고, 끝나면 꼬리를 흔들고, 한참 조용하면 존다. 옆 카드에 이번 요청의 숫자.
    if (style === 'terry') {
      // 화면이 알려 주는 '응답 중' 표시를 기준으로 맞춘다 (훅을 놓쳐도 달리기가 켜진 채로 남지 않게)
      if (e.props.isWorking === true && !working) startTurn()
      if (e.props.isWorking === false && working && Date.now() - turn.start > 2500) endTurn('answer')
      const m = mood()
      drawnMood = m
      runAnim($, e.requestId, 'terry', TERRY_COLS, TERRY_ROWS, () => terryCells(mood(), nowMs(), mode, localHour()))
      const name = prettyModel(modelId)
      const t = working ? turnLine(turn, true) : lastTurn ? turnLine(lastTurn, false) : null
      const card = Box({
        key: 'terry-card',
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: CARD_BORDER,
        paddingX: 1,
        children: [
          Text({ key: 'tc-mood', bold: true, color: m === 'run' ? '#7fb2ff' : m === 'happy' ? '#9be08a' : m === 'bark' ? '#ffd166' : undefined, children: [MOOD_TEXT[m]] }),
          Box({
            key: 'tc-model',
            flexDirection: 'row',
            children: name
              ? [
                  Text({ key: 'tc-m', color: MODEL_COLOR, bold: true, children: [name] }),
                  Text({ key: 'tc-ek', dimColor: true, children: [' · '] }),
                  Text({ key: 'tc-e', color: effort ? effortColor(effort) : undefined, dimColor: !effort, children: [effort ?? '--'] }),
                ]
              : [Text({ key: 'tc-none', dimColor: true, children: ['모델 정보 기다리는 중'] })],
          }),
          Text({ key: 'tc-time', dimColor: !working, children: [t ? (working ? '' : '지난 요청 ') + t.time : '아직 요청이 없어요'] }),
          Text({ key: 'tc-tokens', dimColor: true, children: [t ? t.tokens : ' '] }),
        ],
      })
      // 사용량: 오른쪽 아래에 줄을 맞춘 작은 표 (이름 / 막대 / % / 초기화). 폭이 모자라면 초기화 문구를 뺀다.
      const MINI = 8
      const sideRoom = cols - TERRY_COLS - 4
      const withReset = sideRoom >= 34
      const usageTable = Box({
        key: 'terry-usage',
        flexDirection: 'column',
        children: BAND_NAMES.map((nm, i) => {
          const v = vals[i] ?? 0
          const filled = v <= 0 ? 0 : Math.max(1, Math.round((Math.min(100, v) / 100) * MINI))
          const reset = withReset ? resetText(i) : null
          return Box({
            key: 'tu' + i,
            flexDirection: 'row',
            children: [
              Text({ key: 'tu-n' + i, dimColor: true, children: [nm + ' '.repeat(6 - visible(nm))] }),
              Text({ key: 'tu-f' + i, color: stateColor(v), children: ['█'.repeat(filled)] }),
              Text({ key: 'tu-e' + i, dimColor: true, children: ['░'.repeat(MINI - filled)] }),
              Text({ key: 'tu-v' + i, color: stateColor(v), bold: true, children: [' ' + show(vals[i]).padStart(4, ' ')] }),
              Text({ key: 'tu-r' + i, dimColor: true, children: [reset ? '  ' + reset : ''] }),
            ],
          })
        }),
      })
      const dog = Raster({ key: 'terry', columns: TERRY_COLS, rows: TERRY_ROWS, cells: terryCells(m, nowMs(), mode, localHour()) })
      // 오른쪽 위에 카드, 오른쪽 아래에 사용량 표: 테리와 같은 높이 안에 들어간다
      if (sideRoom >= 26) {
        const side = Box({ key: 'terry-side', flexDirection: 'column', height: TERRY_ROWS, justifyContent: 'space-between', children: [card, usageTable] })
        return Box({ key: 'terry-row', flexDirection: 'row', children: [dog, Box({ key: 'terry-gap', marginLeft: sideRoom >= 40 ? 4 : 2, children: [side] })] })
      }
      return Box({ key: 'terry-col', flexDirection: 'column', children: [dog, card, usageTable] })
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
      const reset = resetText(i)
      const room = band.widths[i] + BAND_GAP - 1
      const extra = reset && visible(text + ' · ' + reset) <= room ? ' · ' + reset : ''
      const pad = ' '.repeat(Math.max(0, band.widths[i] + BAND_GAP - visible(text + extra)))
      return Box({
        key: 'label' + i,
        flexDirection: 'row',
        children: [
          Text({ key: 'lt' + i, color: stateColor(pct), children: [text] }),
          Text({ key: 'lr' + i, dimColor: true, children: [extra + pad] }),
        ],
      })
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
