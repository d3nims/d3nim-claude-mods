// usage-meter: 5시간 / 주간 / 대화 사용량을 프롬프트 위 한 줄 밴드로 보여줍니다.
// /flame1 : 칸마다 파란 불꽃이 타오르는 밴드 (사용량이 늘수록 커지고 80% 넘으면 주황으로 바뀜)
// /terry  : 베들링턴 테리어가 5시간 사용량 위치까지 달리는 큰 화면
// 뒤에 quad 또는 braille 을 붙이면 그림 방식을 바꿉니다 (예: /terry braille)
//
// 그림 그리는 계산은 render.js, 스프라이트 데이터는 terrier-data.js 에 있습니다.
import { BAND_GAP, BAND_NAMES, RUN_STYLES, runStyle, holidayOf, TERRY_COLS, TERRY_MIN_COLS, TERRY_ROWS, makeBand, stateColor, terryCells } from './render.js'

const FLAME_ROWS = 3 // 불꽃 줄 수 (게이지 줄과 이름 줄은 따로)
const FRAME_MS = 45 // 약 22프레임: 사이 프레임을 늘린 움직임이 부드럽게 보이도록

const startedAt = Date.now()
const nowMs = () => Date.now() - startedAt
// 지금 동작이 얼마나 이어졌는지 (땅 파기는 오래 팔수록 흙더미가 쌓인다)
let shownMood = null
let shownSince = 0
const today = () => {
  const d = new Date()
  const m = mood()
  if (m !== shownMood) {
    shownMood = m
    shownSince = Date.now()
  }
  const month = d.getMonth() + 1, day = d.getDate()
  const anniversary = !!installedOn && installedOn.slice(5) === String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') && Number(installedOn.slice(0, 4)) < d.getFullYear()
  return { month, day, moodMs: Date.now() - shownSince, holiday: holidayOf(d.getFullYear(), month, day), anniversary, style: look }
}
let hourOverride = null // TERRY_HOUR=21 이면 그 시각으로 고정 (밤하늘 미리보기, 테스트)
const localHour = () => {
  if (hourOverride !== null) return hourOverride
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
let look = 'classic' // 테리 그림체: 'classic' (기본) | 'real' (참고 그림에서 따온 자세, 보류 중: /terry real 로만 켜짐)
let mode = null // 고른 그림 방식: 'quad' (사분블록) | 'fine' (사분블록 + ▂▄▆, 가로 경계가 4단계로 매끈) | 'braille' (점자)
// 안 골랐으면 테리는 점자(점 하나하나 점자에 맞춰 그림), 불꽃 밴드는 사분블록
const drawMode = () => mode ?? (style === 'terry' ? 'braille' : 'quad')

// 임계치 알림: 같은 단계는 한 번만
const lastTier = new Map()
let lastContextTier = 0

// 움직이는 그림을 다시 그리는 타이머
const anims = new Map() // 그림(Raster key)마다 따로 도는 애니메이션: 프롬프트 위의 테리와 옆 창의 테리가 함께 움직인다
let denies = 0
const PANE = 'terry' // 테리를 따로 크게 보는 옆 창 (/terry pane, 🐕 버튼)

// 테리의 기분: 지금 무슨 일이 일어나는지에 따라 바뀐다
const SLEEP_AFTER = 3 * 60 * 1000 // 이만큼 조용하면 존다
let working = false // Claude 가 응답 중
let lastActivity = Date.now()
let lastEdit = 0
let barkUntil = 0
let typingUntil = 0
let happyUntil = 0
// 응답 중에 Claude 가 쓰는 도구에 따라: 읽기·찾기는 킁킁, 실행·고치기는 땅 파기, 웹은 물어 오기
const activeTools = new Map() // tool_use_id → 동작
let activityKind = null
let activityUntil = 0 // 빨리 끝나는 도구도 잠깐은 보이게
const ACTIVITY_MS = 2000
const asking = new Set() // 허락을 기다리는 도구 호출
// 테스트 결과: 통과하면 원반을 받고, 실패하면 귀가 처진다
let testUntil = 0
let testMood = null
const TEST_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(jest|vitest|pytest|mocha|ava|phpunit|rspec)\b|\bgo test\b|\bcargo test\b|\bdotnet test\b|\b(gradlew?|mvn)\b.*\btest\b|\bplugin test\b|\bnode --test\b|\bdeno test\b|\bmake test\b/
const TEST_FAIL = /\b[1-9]\d*\s+(failed|failing|failures?)\b|^FAIL\b|\bFAILED\b|Tests?:\s+[1-9]\d* failed|\bAssertionError\b|test result: FAILED/im
const TEST_PASS = /\b\d+\s+(passed|passing|pass)\b|\ball tests passed\b|^OK\b|test result: ok\b|^ok\s/im
// 하루 일과: 그날 첫 입력에 기지개, 저녁 6~7시 반엔 밥, 새벽 1~5시엔 금방 존다
let stretchUntil = 0
let stretchDay = null
const dateKey = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
let installedOn = null // 테리를 처음 만난 날: 해마다 그날엔 케이크
// 쓰다듬기
let petUntil = 0
// 5시간 한도를 다 쓰면 문 앞에서 기다리다가, 풀리는 순간 짖는다
let limitWaitUntil = 0
let limitNotified = 0
let lastLayout = 'beside' // 테리 옆에 카드가 안 들어가면 스피너에 테리 소식을 붙인다
let sadUntil = 0 // 요청이 실패하거나 멈추면 잠시 시무룩
let sadReason = null
function toolKind(tool) {
  if (/^(Read|Grep|Glob|LS|NotebookRead|ToolSearch|ListMcpResourcesTool|ReadMcpResource)/.test(tool)) return 'sniff'
  if (/^(Bash|Edit|Write|MultiEdit|NotebookEdit|PowerShell)/.test(tool)) return 'dig'
  if (/^(WebFetch|WebSearch)$/.test(tool) || /^mcp__/.test(tool)) return 'fetch'
  return null // Agent, Task 같은 것: 계속 달린다
}
let drawnMood = null
// /terry run 처럼 동작을 골라 잠깐 보여 주는 미리보기 (응답 중이 아니어도 볼 수 있게)
let previewMood = null
let previewEffort = null // /terry run max: 미리보기 동안만 그 강도로 달린다
let previewUntil = 0
const PREVIEW_MS = 20000
const previewing = () => previewMood !== null && Date.now() < previewUntil
const PREVIEW_ARGS = {
  run: 'run', 달리기: 'run', 뛰기: 'run',
  sit: 'sit', 앉기: 'sit',
  wag: 'wag', 꼬리: 'wag',
  bark: 'bark', 짖기: 'bark',
  happy: 'happy', 헥헥: 'happy',
  sleep: 'sleep', 잠: 'sleep', 졸기: 'sleep',
  sniff: 'sniff', 킁킁: 'sniff', 냄새: 'sniff',
  dig: 'dig', 파기: 'dig', 땅파기: 'dig',
  fetch: 'fetch', 물어오기: 'fetch', 막대기: 'fetch',
  ask: 'ask', 허락: 'ask', 손: 'ask',
  sad: 'sad', 시무룩: 'sad', 실패: 'sad',
  door: 'door', 문: 'door', 한도: 'door',
  catch: 'catch', 원반: 'catch', 통과: 'catch',
  droop: 'droop', 테스트실패: 'droop',
  stretch: 'stretch', 기지개: 'stretch',
  eat: 'eat', 밥: 'eat',
}

function mood() {
  const now = Date.now()
  if (previewing()) return previewMood
  if (now < petUntil) return 'pet'
  if (working) {
    if (asking.size) return 'ask'
    if (now < testUntil) return testMood
    const current = [...activeTools.values()].pop()
    if (current) return current
    if (activityKind && now < activityUntil) return activityKind
    return 'run'
  }
  if (now < sadUntil) return 'sad'
  if (now < testUntil) return testMood
  if (now < stretchUntil) return 'stretch'
  if (now < barkUntil) return 'bark'
  if (now < typingUntil) return 'wag'
  if (now < happyUntil) return 'happy'
  if (limitWaitUntil > now) return 'door'
  const h = localHour()
  if (now - lastActivity > (h >= 1 && h < 5 ? 30000 : SLEEP_AFTER)) return 'sleep'
  if (h >= 18 && h < 19.5 && Math.floor(now / 60000) % 5 < 2) return 'eat' // dinner: two minutes in every five
  return 'sit'
}
const MOOD_SHORT = {
  sit: '기다리는 중', wag: '보고 있어요', bark: '멍! 멍!', run: '달리는 중', happy: '다 했어요!', sleep: '졸고 있어요',
  sniff: '킁킁', dig: '파는 중', fetch: '물어 오는 중', ask: '허락 대기', sad: '시무룩',
  door: '문 앞 대기', catch: '원반 캐치!', droop: '테스트 실패', stretch: '기지개', eat: '밥 먹는 중', pet: '좋아요!',
}
// 달리기는 추론 강도에 따라: low 걷기, medium 빨리 걷기, high 달리기, xhigh 전력 질주, max 날기
const RUN_TEXT = { low: '걷는 중', medium: '빨리 걷는 중', high: '달리는 중', xhigh: '전력 질주 중', max: '날아가는 중!' }
// /terry run <강도> 에 쓸 수 있는 이름: 정식 이름 말고도 middle · 중간 같은 말도 받는다
const EFFORT_ALIASES = {
  low: 'low', l: 'low', 낮음: 'low', 낮게: 'low', 하: 'low',
  medium: 'medium', med: 'medium', mid: 'medium', middle: 'medium', m: 'medium', 중간: 'medium', 보통: 'medium', 중: 'medium',
  high: 'high', h: 'high', 높음: 'high', 높게: 'high', 상: 'high',
  xhigh: 'xhigh', 'x-high': 'xhigh', xh: 'xhigh', x: 'xhigh', 매우높음: 'xhigh', 아주: 'xhigh',
  max: 'max', 최대: 'max', 최고: 'max', 끝까지: 'max',
}
const runEffort = () => (previewing() && previewEffort ? previewEffort : effort)
const HOLIDAY_TEXT = { seollal: ['설날 · 새해 복 많이 받으세요', '새해 복!'], chuseok: ['추석 · 보름달이 떴어요', '추석!'] }
const moodLabel = (m, short) =>
  m === 'sit' && today().anniversary ? (short ? '1주년!' : '테리와 만난 지 ' + (new Date().getFullYear() - Number(installedOn.slice(0, 4))) + '년!')
  : m === 'sit' && today().holiday ? HOLIDAY_TEXT[today().holiday][short ? 1 : 0]
  : m === 'run' ? RUN_TEXT[runEffort()] ?? RUN_TEXT.high
  : m === 'sad' && !short ? (sadReason === 'aborted' ? '멈췄어요, 시무룩' : '앗, 실패했어요')
  : short ? MOOD_SHORT[m] : MOOD_TEXT[m]
const MOOD_TEXT = {
  sit: '앉아서 기다리는 중', wag: '입력하는 걸 보고 있어요', bark: '멍! 멍!', run: '달리는 중', happy: '다 했어요!', sleep: '졸고 있어요 zZ',
  sniff: '파일을 킁킁 살피는 중', dig: '열심히 파는 중', fetch: '웹에서 물어 오는 중', ask: '허락을 기다려요!', sad: '앗, 실패했어요',
  door: '한도가 풀리길 기다리는 중', catch: '테스트 통과! 원반 잡았다', droop: '테스트 실패… 시무룩', stretch: '기지개 켜는 중',
  eat: '밥 먹는 시간이에요', pet: '쓰다듬어 줘서 좋아요!',
}

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
  activeTools.clear()
  asking.clear()
  activityUntil = 0
  turn.end = Date.now()
  turn.reason = reason
  lastTurn = turn
  lastActivity = turn.end
  if (reason === 'answer') happyUntil = turn.end + 3500
  if (reason === 'error' || reason === 'aborted') {
    sadUntil = turn.end + 6000
    sadReason = reason
  }
  pendingStats = turn
}

// 오늘의 기록: 날짜별로 저장소에 쌓는다 (요청 수, 토큰, 가장 오래 걸린 요청, 테리가 달린 거리)
let pendingStats = null
const dayKey = () => {
  const d = new Date()
  return 'stats:' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const METERS_PER_SUBPIXEL = 0.25 // high 로 달리면 초속 8.5m 쯤
async function flushStats($) {
  const t = pendingStats
  if (!t) return
  pendingStats = null
  try {
    const key = dayKey()
    const day = (await $.store.get(key)) || { requests: 0, input: 0, output: 0, longest: 0, meters: 0, pets: 0 }
    const secs = Math.max(0, (t.end - t.start) / 1000)
    day.requests += 1
    day.input += t.input + t.cacheRead + t.cacheWrite
    day.output += t.output + estimate(t.liveChars)
    day.longest = Math.max(day.longest, secs)
    day.meters += secs * runStyle(effort).ground * METERS_PER_SUBPIXEL
    await $.store.set(key, day)
  } catch (err) {}
}
async function addPet($, ms = 3000) {
  petUntil = Date.now() + ms
  lastActivity = Date.now()
  try {
    const key = dayKey()
    const day = (await $.store.get(key)) || { requests: 0, input: 0, output: 0, longest: 0, meters: 0, pets: 0 }
    day.pets = (day.pets || 0) + 1
    await $.store.set(key, day)
  } catch (err) {}
  $.ui.invalidate('ui.render')
}
async function statsText($) {
  const d = new Date()
  let day = null
  try {
    day = await $.store.get(dayKey())
  } catch (err) {}
  const head = '오늘의 테리 (' + (d.getMonth() + 1) + '/' + d.getDate() + ')'
  if (!day || (!day.requests && !day.pets)) return head + '\n아직 오늘 요청이 없어요. 테리가 쉬는 중이에요.'
  const dur = s => (s < 60 ? s.toFixed(1) + '초' : Math.floor(s / 60) + '분 ' + Math.round(s % 60) + '초')
  const dist = m => (m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(1) + 'km')
  return [
    head,
    '요청 ' + day.requests + '번 · 토큰 입력 ' + fmtTokens(day.input) + ' / 출력 ' + fmtTokens(day.output),
    '가장 오래 걸린 요청 ' + dur(day.longest),
    '테리가 달린 거리 ' + dist(day.meters),
    ...(day.pets ? ['쓰다듬은 횟수 ' + day.pets + '번'] : []),
  ].join('\n')
}

// 사용법 안내 (불러올 때 알림창으로, /flame1 help 로도 볼 수 있다). 명령 하나당 한 줄.
const guide = () =>
  [
    'usage-meter 사용법 (지금: ' + (style === 'terry' ? '강아지' : '불꽃 밴드') + ', ' + drawMode() + ')',
    '/flame1 quad    : 파란 불꽃 밴드, 꽉 찬 블록으로 그림',
    '/flame1 braille : 파란 불꽃 밴드, 점자로 그림 (더 곱지만 알알이 보일 수 있음)',
    '/terry braille  : 달리는 강아지, 점자로 그림 (기본, 점 하나하나 다듬은 그림)',
    '/terry quad     : 달리는 강아지, 꽉 찬 블록으로 그림 (블록용으로 그렸던 1.0.2 그림)',
    '/terry pane     : 테리를 옆 창에 따로 띄우기 (카드의 🐕 를 눌러도 됨)',
    '/terry fine     : 달리는 강아지, 촘촘한 블록으로 그림 (등선·배·머리 윤곽이 더 매끈)',
    '/terry run      : 20초 동안 달리는 모습 미리보기 (sit · wag · bark · happy · sleep 도 됨, stop 으로 끝내기)',
    '/terry run max  : 추론 강도별 달리기 미리보기 (low 걷기 · medium 빨리 걷기 · high 달리기 · xhigh 전력 질주 · max 날기)',
    '/terry sniff    : 도구별 동작 미리보기 (sniff 읽기 · dig 실행·고치기 · fetch 웹 · ask 허락 대기 · sad 실패)',
    '/terry catch    : 상황별 동작 미리보기 (catch 테스트 통과 · droop 테스트 실패 · door 한도 대기 · stretch 하루 첫 입력 · eat 저녁)',
    '/terry stats    : 오늘의 기록 (요청 수 · 토큰 · 가장 오래 걸린 요청 · 테리가 달린 거리 · 쓰다듬은 횟수)',
    '/terry pet      : 쓰다듬기 (카드의 🐾 를 눌러도 돼요)',
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

// /model 이나 /effort 로 바꾸면 다음 요청을 기다리지 않고 카드에 바로 반영한다: 2초마다 지금 모델과 설정의 effortLevel 을 본다
let seenSettingsEffort
async function syncModel($) {
  let changed = false
  try {
    const m = await $.session.model()
    if (m && m !== modelId) {
      modelId = m
      changed = true
    }
  } catch (err) {}
  try {
    const level = (await $.settings.read()).effortLevel
    if (typeof level === 'string' && level && level !== seenSettingsEffort) {
      const first = seenSettingsEffort === undefined
      seenSettingsEffort = level
      // 처음 읽은 값은 요청에서 받은 강도가 없을 때만 쓴다; 그 뒤로 설정이 바뀌면 그것이 새 강도다
      if ((!first || !effort) && level !== effort) {
        effort = level
        effortFrom = '설정 effortLevel'
        changed = true
      }
    }
  } catch (err) {}
  return changed
}

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

  // 5시간 한도를 다 썼으면 풀리는 시각까지 문 앞에서 기다린다
  const five = usage.rateLimits.find(l => l.kind === 'five_hour')
  const fiveReset = five && Date.parse(five.resetsAt)
  if (five && five.percentUsed >= 100 && fiveReset > Date.now() + 1000 && fiveReset !== limitNotified) limitWaitUntil = fiveReset
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

function stopAnim(key) {
  for (const [k, a] of anims) {
    if (key !== undefined && k !== key) continue
    a.timer.cancel()
    anims.delete(k)
  }
}
const openPane = $ => $.ui.open({ id: PANE, title: '테리' })

// 같은 그림이면 그대로 두고, 바뀌었으면 타이머를 새로 건다. blit 이 거절되면(아직 안 그려졌을 수 있음) 몇 번 다시 시도한다.
function runAnim($, requestId, key, columns, rows, build) {
  const id = [requestId, key, columns, rows, drawMode()].join('|')
  if (anims.get(key)?.id === id) return
  stopAnim(key)
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
      if (anims.get(key)?.timer === timer) { timer.cancel(); anims.delete(key) }
      if (denies <= 4) $.ui.invalidate('ui.render')
    }, () => {})
  })
  anims.set(key, { id, timer })
}

// 폭이 바뀌면 밴드를 새로 만든다
let bandCache = null
function bandFor(cols) {
  if (!bandCache || bandCache.cols !== cols || bandCache.mode !== drawMode()) {
    bandCache = { cols, mode: drawMode(), band: makeBand(cols, FLAME_ROWS, drawMode()) }
  }
  return bandCache.band
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'flame1', description: '사용량을 파란 불꽃 밴드로 보여요 (뒤에 quad 또는 braille 을 붙이면 그림 방식 변경)' })
    await $.command.register({ name: 'terry', description: '사용량을 베들링턴 테리어가 달리는 화면으로 보여요 (뒤에 quad 또는 braille 을 붙이면 그림 방식 변경)' })
    style = (await $.store.get('style')) === 'terry' ? 'terry' : 'flame1'
    const savedMode = await $.store.get('mode')
    mode = savedMode === 'braille' || savedMode === 'fine' || savedMode === 'quad' ? savedMode : null
    look = (await $.store.get('look')) === 'real' ? 'real' : 'classic'
    try {
      stretchDay = (await $.store.get('stretchDay')) ?? null
      installedOn = (await $.store.get('installedOn')) ?? null
      if (!installedOn) {
        installedOn = dateKey()
        await $.store.set('installedOn', installedOn)
      }
    } catch (err) {}
    await refresh($)
    $.clock.every(30000, () => refresh($))
    $.clock.every(1000, () => {
      // 한도가 풀리는 순간: 문 앞에서 벌떡 일어나 짖고 알린다
      if (limitWaitUntil && Date.now() >= limitWaitUntil) {
        limitNotified = limitWaitUntil
        limitWaitUntil = 0
        barkUntil = Date.now() + 4000
        lastActivity = Date.now()
        void $.ui.toast('🐕 멍! 5시간 한도가 풀렸어요. 다시 시작해도 돼요').catch(() => {})
        void refresh($).catch(() => {})
      }
      if (style === 'terry') $.ui.invalidate('ui.render')
    })
    await syncModel($)
    $.clock.every(2000, async () => {
      if (await syncModel($)) $.ui.invalidate('ui.render')
    })
    await $.ui.toast(guide(), { timeoutMs: 12000 })
    // 터미널이 트루컬러를 알리지 않으면 Claude Code 가 256색으로 줄여 그린다 (테리가 청록색, 흙길이 회색으로 보임)
    const pinned = Number.parseFloat((await $.env.get('TERRY_HOUR').catch(() => '')) || '')
    hourOverride = pinned >= 0 && pinned < 24 ? pinned : null
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

  // 입력하는 동안 혀를 내밀고 꼬리를 흔든다 (입력 시작에 짖던 건 너무 짧아 빼 버렸다)
  on('prompt.edit', async ($, e, next) => {
    const now = Date.now()
    if (!working) {
      const todayKey = dateKey()
      if (stretchDay !== todayKey) {
        stretchDay = todayKey
        stretchUntil = now + 4000 // the whole stretch: the bow, the yawn, the hind legs, and back up
        void $.store.set('stretchDay', todayKey).catch(() => {})
      }
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
      await flushStats($)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // 도구가 돌아가는 동안 테리가 그 일에 맞춰 움직인다
  on('tool.call', async ($, e, next) => {
    const kind = working ? toolKind(e.tool) : null
    const id = e.tool_use_id ?? e.tool + ':' + Date.now()
    if (kind) {
      activeTools.set(id, kind)
      activityKind = kind
      activityUntil = Date.now() + ACTIVITY_MS
      $.ui.invalidate('ui.render')
    }
    try {
      const result = await next(e)
      // 테스트를 돌린 명령이면 결과를 읽어 원반을 받거나 귀가 처진다
      if (e.tool === 'Bash' && typeof e.command === 'string' && TEST_CMD.test(e.command) && result && !result.deny) {
        const out = typeof result.text === 'string' ? result.text : JSON.stringify(result.result ?? '')
        const verdict = result.isError || TEST_FAIL.test(out) ? 'droop' : TEST_PASS.test(out) ? 'catch' : null
        if (verdict) {
          testMood = verdict
          testUntil = Date.now() + (verdict === 'catch' ? 3300 : 3500)
          $.ui.invalidate('ui.render')
        }
      }
      return result
    } finally {
      activeTools.delete(id)
      if (asking.delete(id)) $.ui.invalidate('ui.render')
    }
  })

  // 허락을 물어야 하는 도구면, 답할 때까지 테리가 앞발을 들고 쳐다본다
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (working && verdict && verdict.decision === 'ask' && e.tool_use_id && !e.agentId) {
      asking.add(e.tool_use_id)
      $.ui.invalidate('ui.render')
    }
    return verdict
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
      if (name === 'terry' && (arg === 'stats' || arg === '기록' || arg === '오늘')) return { text: await statsText($) }
      if (name === 'terry' && (arg === 'pane' || arg === '창' || arg === 'window')) {
        const opened = await openPane($)
        return { text: opened.isPlaced ? '테리를 옆 창에 띄웠어요 (창 위 ✕ 나 Esc 로 닫기)' : '테리 창을 열었는데 화면이 좁아 아직 못 그렸어요: 터미널을 넓히면 나타나요' }
      }
      if (name === 'terry' && (arg === 'pet' || arg === '쓰다듬기' || arg === '쓰담')) {
        style = 'terry'
        await addPet($, 8000)
        return { text: '테리가 좋아해요! 🐾 (카드의 🐾 를 눌러도 쓰다듬을 수 있어요)' }
      }
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
      const [word, level] = arg.split(/\s+/)
      if (name === 'terry' && (word in PREVIEW_ARGS || word === 'stop')) {
        previewMood = word === 'stop' ? null : PREVIEW_ARGS[word]
        previewEffort = EFFORT_ALIASES[level] ?? null
        previewUntil = arg === 'stop' ? 0 : Date.now() + PREVIEW_MS
        style = 'terry'
        await $.store.set('style', style)
        stopAnim()
        $.ui.invalidate('ui.render')
        return { text: previewMood ? moodLabel(previewMood, false) + ' 모습을 20초 동안 보여 줄게요 (/terry stop 으로 끝내기)' : '미리보기를 끝냈어요' }
      }
      if (arg === 'quad' || arg === 'braille' || arg === 'fine') {
        mode = arg
        await $.store.set('mode', mode)
      }
      if (arg === 'classic' || arg === 'real') {
        look = arg
        await $.store.set('look', look)
      }
      style = name
      await $.store.set('style', style)
      stopAnim()
      $.ui.invalidate('ui.render')
      const way = drawMode() === 'quad' ? '사분블록(quad)' : drawMode() === 'fine' ? '촘촘한 블록(fine)' : '점자(braille)'
      const lookText = style === 'terry' ? ' · 그림체: ' + (look === 'classic' ? '예전(classic)' : '새(real)') : ''
      return { text: (style === 'terry' ? '강아지(terry)' : '불꽃 밴드(flame1)') + ' 화면으로 바꿨어요 · 그림 방식: ' + way + lookText }
    })
  }

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (style !== 'terry' || lastLayout === 'beside' || !e.props) return next(e)
    const suffix = (typeof e.props.suffix === 'string' ? e.props.suffix : '…') + '  🐾 ' + moodLabel(mood(), true)
    return next({ ...e, props: { ...e.props, suffix } })
  })

  // 옆 창의 테리: 프롬프트 위와 같은 장면을 창 폭에 맞춰 그리고, 아래에 지금 동작과 사용량 한 줄
  // (이 세션 화면 안에서 그려진다: SSH 로 붙은 터미널에서도 새 연결 없이 보인다)
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    if (!Raster || e.surface !== 'terminal') return Text({ key: 'pane-none', dimColor: true, children: ['테리는 터미널 화면에서만 보여요'] })
    const cols = Math.max(TERRY_MIN_COLS, Math.min(TERRY_COLS, (e.props.bodyColumns || TERRY_COLS) - 1))
    const scene = () => terryCells(mood(), nowMs(), drawMode(), localHour(), cols, runEffort(), today())
    runAnim($, e.requestId, 'pane-terry', cols, TERRY_ROWS, scene)
    const m = mood()
    const vals = values()
    return Box({
      key: 'pane',
      flexDirection: 'column',
      children: [
        Raster({ key: 'pane-terry', columns: cols, rows: TERRY_ROWS, cells: scene() }),
        Text({ key: 'pane-mood', bold: true, color: m === 'run' ? '#7fb2ff' : m === 'happy' || m === 'catch' || m === 'pet' ? '#9be08a' : undefined, children: [moodLabel(m, false)] }),
        Text({ key: 'pane-use', dimColor: true, children: [BAND_NAMES.map((n, i) => n + ' ' + show(vals[i])).join(' · ')] }),
      ],
    })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!usage || e.props.hasSurvey) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Button = 'Button' in elements ? elements.Button : null
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

    // /terry 화면: 테리가 지금 일어나는 일에 반응한다. 평소엔 앉아 있다가, 입력하는 동안 꼬리를 흔들고,
    // 엔터를 치면 응답이 끝날 때까지 달리고, 끝나면 꼬리를 흔들고, 한참 조용하면 존다. 옆 카드에 이번 요청의 숫자.
    if (style === 'terry') {
      // 화면이 알려 주는 '응답 중' 표시를 기준으로 맞춘다 (훅을 놓쳐도 달리기가 켜진 채로 남지 않게)
      if (e.props.isWorking === true && !working) startTurn()
      if (e.props.isWorking === false && working && Date.now() - turn.start > 2500) {
        endTurn('answer')
        void flushStats($)
      }
      const m = mood()
      drawnMood = m
      // 폭 나누기: 넓으면 테리(하늘 포함) 옆에 카드·표. 좁아지면 하늘부터 줄여서라도 옆에 둔다.
      // 창을 여러 개 나눠 띄우는 사람도 있어서, 옆자리가 10칸만 있어도 간추려 옆에 둔다. 그보다 좁으면 테리만 두고
      // 소식은 Claude 의 스피너에 붙인다.
      const SIDE_FULL = 26
      const SIDE_MIN = 12
      let terryCols = TERRY_COLS
      let beside = cols - TERRY_COLS - 4 >= SIDE_FULL
      if (!beside && cols - TERRY_MIN_COLS - 4 >= SIDE_MIN) {
        beside = true
        terryCols = Math.max(TERRY_MIN_COLS, cols - 4 - Math.min(34, cols - 4 - TERRY_MIN_COLS))
      }
      if (!beside) terryCols = Math.max(TERRY_MIN_COLS, Math.min(TERRY_COLS, cols - 2))
      lastLayout = beside ? 'beside' : 'alone'
      const sideRoom = cols - terryCols - 4
      const gap = sideRoom >= 40 ? 4 : 2
      const sideW = beside ? sideRoom - gap : cols
      // 좁은 옆자리(tight): 짧은 상태 문구, 토큰을 두 줄로, '지난 요청' 빼기 (카드 폭이 넘쳐 줄이 밀리지 않게)
      // 더 좁으면(mini): 테두리 없이 상태 · 모델 · 시간만, 사용량은 막대와 %만
      // 아주 좁으면(nano): 상태와 모델 이름만, 사용량은 이름과 %만
      const tight = sideW < 33
      const mini = beside && sideW < 22
      const nano = beside && sideW < 15
      runAnim($, e.requestId, 'terry', terryCols, TERRY_ROWS, () => terryCells(mood(), nowMs(), drawMode(), localHour(), terryCols, runEffort(), today()))
      const name = prettyModel(modelId)
      const t = working ? turnLine(turn, true) : lastTurn ? turnLine(lastTurn, false) : null
      const moodText = moodLabel(m, tight) + (previewing() ? (tight ? ' ·미리' : ' · 미리보기') : '')
      const tokenLines = mini || nano ? [] : !t ? [' '] : tight ? t.tokens.split(' · 캐시 ').map((x, i) => (i ? '캐시 ' + x : x)) : [t.tokens]
      const showEffort = !nano && (!mini || visible((name ?? '') + ' · ' + (effort ?? '--')) <= sideW)
      const timeText = !t ? (mini ? '요청 없음' : '아직 요청이 없어요') : (working || tight ? '' : '지난 요청 ') + t.time
      const timeLine = mini && visible(timeText) > sideW ? timeText.split(' · ')[0] : timeText
      const card = Box({
        key: 'terry-card',
        flexDirection: 'column',
        ...(mini ? {} : { borderStyle: 'round', borderColor: CARD_BORDER }),
        paddingX: tight ? 0 : 1,
        children: [
          Box({
            key: 'tc-moodrow',
            flexDirection: 'row',
            children: [
              Text({ key: 'tc-mood', bold: true, color: m === 'run' ? '#7fb2ff' : m === 'happy' || m === 'catch' || m === 'pet' ? '#9be08a' : m === 'bark' ? '#ffd166' : undefined, children: [moodText] }),
              ...(Button && !nano ? [Text({ key: 'tc-sp', children: [' '] }), Button({ key: 'terry-pet', label: '🐾', plain: true, dimColor: true, onPress: () => void addPet($) }),
                Text({ key: 'tc-sp2', children: [' '] }), Button({ key: 'terry-pane', label: '🐕', plain: true, dimColor: true, onPress: () => void openPane($) })] : []),
            ],
          }),
          Box({
            key: 'tc-model',
            flexDirection: 'row',
            children: name
              ? [
                  Text({ key: 'tc-m', color: MODEL_COLOR, bold: true, children: [name] }),
                  ...(showEffort
                    ? [
                        Text({ key: 'tc-ek', dimColor: true, children: [' · '] }),
                        Text({ key: 'tc-e', color: effort ? effortColor(effort) : undefined, dimColor: !effort, children: [effort ?? '--'] }),
                      ]
                    : []),
                ]
              : [Text({ key: 'tc-none', dimColor: true, children: ['모델 정보 기다리는 중'] })],
          }),
          ...(nano ? [] : [Text({ key: 'tc-time', dimColor: !working, children: [timeLine] })]),
          ...tokenLines.map((line, i) => Text({ key: 'tc-tokens' + i, dimColor: true, children: [line] })),
        ],
      })
      // 사용량: 오른쪽 아래에 줄을 맞춘 작은 표 (이름 / 막대 / % / 초기화). 폭이 모자라면 초기화 문구를 뺀다.
      // 막대는 가는 선(━)으로 그려 세 줄 사이에 틈이 생기게 하고, 남는 폭만큼 길게 늘인다.
      const withReset = sideW >= 32
      const MINI = nano ? 0 : Math.max(4, Math.min(20, sideW - 11 - (withReset ? 15 : 0)))
      const usageTable = Box({
        key: 'terry-usage',
        flexDirection: 'column',
        children: BAND_NAMES.map((nm, i) => {
          const v = vals[i] ?? 0
          const filled = v <= 0 || !MINI ? 0 : Math.max(1, Math.round((Math.min(100, v) / 100) * MINI))
          const reset = withReset ? resetText(i) : null
          return Box({
            key: 'tu' + i,
            flexDirection: 'row',
            children: [
              Text({ key: 'tu-n' + i, dimColor: true, children: [nm + ' '.repeat(Math.max(1, (nano ? 5 : 6) - visible(nm)))] }),
              Text({ key: 'tu-f' + i, color: stateColor(v), children: ['━'.repeat(filled)] }),
              Text({ key: 'tu-e' + i, dimColor: true, children: ['─'.repeat(MINI - filled)] }),
              Text({ key: 'tu-v' + i, color: stateColor(v), bold: true, children: [' ' + show(vals[i]).padStart(4, ' ')] }),
              Text({ key: 'tu-r' + i, dimColor: true, children: [reset ? '  ' + reset : ''] }),
            ],
          })
        }),
      })
      const dog = Raster({ key: 'terry', columns: terryCols, rows: TERRY_ROWS, cells: terryCells(m, nowMs(), drawMode(), localHour(), terryCols, runEffort(), today()) })
      // 오른쪽 위에 카드, 오른쪽 아래에 사용량 표: 테리와 같은 높이 안에 들어간다
      if (!beside) return Box({ key: 'terry-alone', flexDirection: 'column', children: [dog] })
      if (beside) {
        const side = Box({ key: 'terry-side', flexDirection: 'column', height: TERRY_ROWS, justifyContent: 'space-between', children: [card, usageTable] })
        return Box({ key: 'terry-row', flexDirection: 'row', children: [dog, Box({ key: 'terry-gap', marginLeft: gap, children: [side] })] })
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
