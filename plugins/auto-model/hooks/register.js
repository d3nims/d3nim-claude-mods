// auto-model: 프롬프트 캐시를 아끼며 모델을 고른다.
//
// 1단계: 한참 쉬어서 캐시가 식었고 대화가 길면, 다음 요청이 대화 전체를 다시 캐시에 쓴다는 걸 알리고 /compact 를
// 제안한다. 제안은 usage-meter 가 테리 카드 아래에 그린다 ($.state 의 auto-model / hint).
//   - 캐시는 마지막 호출 뒤 TTL(Claude Code 는 1시간)이 지나면 식는다. 그 뒤 첫 요청은 대화 전체를 다시 쓴다.
//   - /compact 도 대화 전체를 한 번 읽어 요약하므로 그 순간 비용이 사라지지는 않는다. 아끼는 건 그 뒤의 요청들과
//     다음에 또 쉬고 돌아올 때다. 압축이 실제로 든 값은 기록해 두고 /auto-model 에서 보여 준다.
//
// 2단계: 요청마다 메인 대화의 모델을 고른다 (turn.step 의 첫 단계에서 정하고 그 턴 동안 유지).
//   - 캐시는 모델마다 따로라서, 긴 대화에서 캐시가 따뜻할 때 모델을 바꾸면 대화 전체를 새 모델이 다시 쓴다.
//     그래서 '가벼운 요청'이라도 바꾸는 쪽의 어림값(다시 쓰기 + 답)이 그대로 두는 쪽보다 확실히 쌀 때만 바꾼다.
//     실제로는 캐시가 식은 순간이나 대화가 짧을 때다.
//   - 안전장치: 애매하면 그대로 / 메인은 Sonnet 까지만 내림 (Haiku 는 검색·탐색 서브에이전트만, 설정으로 메인 허용)
//     / 싼 모델에서 결과를 거부하거나 도구 오류가 거듭되면 다음 턴에 원래 모델로 / 카드에 늘 표시, 명령 하나로 고정·끄기,
//     /model 로 직접 바꾸면 그 세션은 자동 중지 / 결정마다 기록 (/auto-model log).
//   - 판단: 로컬 규칙이 먼저, 애매하고 바꿀 만할 때만 작은 모델에게 묻는다 ($.model.classify). 밖으로 보내지 않는다.
//   - 프롬프트 앞에 ~ 를 붙이면 그 요청은 원래 모델 그대로 (~ 는 떼고 보낸다).
//
// 3단계: 판단이 필요 없는 일(쓰기는 Sonnet, 찾기·읽기는 Haiku)은 Opus 대신 일꾼 서브에이전트가 맡는다 (기본은 shadow: 기록만).
//   '@@ 요청' / '@@h 요청' 은 손으로 Sonnet / Haiku 일꾼에게.
//
// /auto-model                : 지금 상태
// /auto-model on | off       : 전부 켜고 끄기 (제안과 자동 전환)
// /auto-model auto | manual  : 자동 전환만 켜고 끄기
// /auto-model pin <opus|sonnet|haiku> · unpin : 모델 고정 / 풀기
// /auto-model haiku on | off : 메인 대화도 Haiku 까지 내릴지 (기본 off)
// /auto-model worker on | shadow | off : 일꾼 (기본 shadow)
// /auto-model light on | off : 기억 확인 질문('어디였지?')도 실제로 내릴지 (기본 off: '켰다면'만 기록하는 shadow)
// /auto-model log            : 최근 판단 기록 (전환·보류 이유, 대화 크기, 캐시, 사용량)
// /auto-model ttl <분> · min <천 토큰> : 캐시 식는 시간 (기본 60) · 제안할 대화 크기 (기본 150)
// /auto-model compact [남길 내용] · dismiss · preview : 압축 / 이번 제안 닫기 / 제안 미리 보기 1분
// /auto-model warn <퍼센트> | off : 작업 중 대화가 이만큼 차면 압축 권하기 (기본 85)

import { MODELS, familyOf, isRejection, isSearchy, missedWorkerOf, prettyName, promptHead, ruleOf, taskOf, turnCost, usageCost, workerEstimate } from './route.js'

const HINT = { plugin: 'auto-model', key: 'hint' }
const ROUTE = { plugin: 'auto-model', key: 'route' }
const MEMORY = { plugin: 'auto-model', key: 'memory' }

const DEFAULTS = { enabled: true, ttlMinutes: 60, minTokens: 150000, route: 'auto', pin: null, mainHaiku: false, lightSwitch: false, worker: 'shadow', warnPct: 85 }
let settings = { ...DEFAULTS }
// 메인 대화의 마지막 모델 호출: 시각, 다음 요청이 다시 보낼 크기, 답한 모델
let last = null
let dismissedFor = null // 이 시각의 호출에 대한 제안은 닫았음
let shownMinutes = -1
let previewUntil = 0 // /auto-model preview 가 보여 주는 동안은 판단을 쉰다
let shownKind = null // 떠 있는 제안: 'cold' (쉬고 옴) | 'warm' (작업 중 대화가 참)
let shownPct = -1
let warmSnoozePct = 0 // 작업 중 제안에서 '나중에' 를 누르면, 이만큼(+5%p) 더 찰 때까지 다시 안 묻는다
let compactMode = null // 우리 [압축] 버튼이 시작한 압축의 종류 (session.compact 훅이 읽는다)
let compactModeUntil = 0
// (자기 플러그인이 시작한 압축에는 자기 session.compact 훅이 돌지 않는다: 그래서 Sonnet 요약은 카드의 [압축] 버튼, 즉
//  usage-meter 가 압축을 시작하고 auto-model 이 그걸 가로챌 때만 된다. /auto-model compact 로 친 압축은 원래 모델이 한다)
let compactHandled = false

// 2단계 (세션 동안)
const warmAt = {} // 모델 계열(opus/sonnet/haiku) -> 그 모델이 메인 대화에 마지막으로 답한 시각
let current = null // 메인 대화에 마지막으로 쓴 모델
let sessionBase = null // 세션에 설정된 모델 (/model): 바뀌면 사람이 고른 것
let stopped = false // 사람이 /model 로 바꿔서 이 세션은 자동 중지
let pending = null // 방금 입력한 요청 { text, skip }
let cooldown = 0 // 되돌아온 뒤 몇 턴은 다시 내리지 않는다
let errors = 0 // 싼 모델 턴의 도구 오류 수
const turnModel = new Map() // turnId -> 그 턴에 쓰는 모델
let decisions = [] // 최근 판단 (store 'decisions' 에도)
let route = null // 카드에 보이는 상태
let sessionId = null
let lastAnswer = '' // 메인 대화의 직전 답 끝부분 (짧은 긍정이 승인인지 볼 때)
// 3단계 일꾼
let pendingWork = null // 방금 입력한 요청이 일꾼 후보면 { task, model, text, manual }
const workerWaiters = new Map() // 일꾼 agentId -> resolve(turn.complete)
const workerIds = new Set() // 우리가 띄운 일꾼: 끝나면 엔진이 결과를 메인 대화에 또 배달하는데, 이미 답으로 붙였으니 버린다
const WORKER_WAIT_MS = 10 * 60000
const turnTools = new Map() // 메인 턴 turnId -> 그 턴의 도구 호출 [{ tool, isError }] (사후 판정용)
let liveTurnId = null

// 판단 근거를 세션 상태에 적어 둔다 (/reload-plugins 는 모듈 변수를 비우지만 $.state 는 남는다)
async function saveMemory($) {
  if (!sessionId) return
  try {
    await $.state.set(MEMORY, { sessionId, last, warmAt: { ...warmAt }, current, sessionBase, stopped, cooldown, lastAnswer })
  } catch {}
}
// 같은 세션의 기록이면 되살린다 (다른 세션이면 모르는 채로: 모르면 그대로 둔다)
async function restoreMemory($) {
  try {
    sessionId = await $.session.id()
    const { value } = await $.state.get(MEMORY)
    if (!value || value.sessionId !== sessionId) return
    last = value.last
    Object.assign(warmAt, value.warmAt || {})
    current = value.current
    sessionBase = value.sessionBase
    stopped = !!value.stopped
    cooldown = value.cooldown || 0
    lastAnswer = value.lastAnswer || ''
  } catch {}
}

// 응답 하나의 사용량에서, 다음 요청이 다시 보낼 대화 크기 (입력 전부 + 이번 출력)
const contextOf = u => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0)
// 1시간 캐시에 대화를 다시 쓰는 값 (답 값은 빼고)
const rewriteUsd = (model, tokens) => turnCost(model, tokens, false, 0)

const tokensText = n => (n >= 10000 ? Math.round(n / 10000) + '만' : (n / 1000).toFixed(0) + '천') + ' 토큰'
const idleText = min => (min >= 60 ? Math.floor(min / 60) + '시간' + (min % 60 ? ' ' + (min % 60) + '분' : '') : min + '분')
const timeText = at => new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const usd = n => '$' + n.toFixed(n >= 1 ? 2 : 3)

async function setHint($, value) {
  try {
    await $.state.set(HINT, value)
  } catch {}
}
async function setRoute($, value) {
  try {
    await $.state.set(ROUTE, value)
  } catch {}
}

// ---- 1단계: 쉰 뒤 압축 제안 ----

async function check($) {
  const now = await $.clock.now()
  if (previewUntil) {
    if (now < previewUntil) return
    previewUntil = 0
    await clearHint($)
  }
  if (!settings.enabled || !last) return
  const idle = now - last.at
  const cold = idle >= settings.ttlMinutes * 60000
  // 쉬고 옴: 캐시가 식었고 대화가 길다 → 압축하면 Sonnet 이 요약 (같은 품질에 절반 값, 시험으로 확인)
  if (cold && last.tokens >= settings.minTokens && dismissedFor !== last.at) {
    const idleMinutes = Math.floor(idle / 60000)
    if (shownKind === 'cold' && idleMinutes === shownMinutes) return
    shownKind = 'cold'
    shownMinutes = idleMinutes
    await setHint($, { kind: 'cold', id: last.at, idleMinutes, tokens: last.tokens, rewriteUsd: rewriteUsd(last.model, last.tokens), model: last.model })
    return
  }
  // 작업 중: 대화가 많이 찼다 → 지금은 캐시가 살아 있어 원래 모델이 싸게 압축한다
  if (!cold && settings.warnPct > 0) {
    let pct = null
    try {
      pct = (await $.session.usage()).context.percent
    } catch {}
    if (pct != null && pct >= settings.warnPct && pct >= warmSnoozePct) {
      if (shownKind === 'warm' && shownPct === pct) return
      shownKind = 'warm'
      shownPct = pct
      shownMinutes = 0
      await setHint($, { kind: 'warm', id: last.at, percent: pct, idleMinutes: 0, tokens: last.tokens, rewriteUsd: 0, model: last.model })
      return
    }
  }
  if (shownKind) await clearHint($)
}

async function clearHint($, onlyKind) {
  if (onlyKind && shownKind !== onlyKind) return
  previewUntil = 0
  if (shownMinutes < 0 && !shownKind) return
  shownMinutes = -1
  shownKind = null
  shownPct = -1
  await setHint($, null)
}

// 압축: 명령이나 버튼이 도는 동안엔 엔진이 압축을 거절해서('턴이 도는 중'), 명령이 끝난 직후에 시작한다.
// (자기 플러그인의 압축 훅은 자기 호출엔 돌지 않으므로, 쓴 토큰 기록도 여기서 한다)
async function compactNow($, instructions, mode) {
  const kind = mode || shownKind || 'warm'
  await clearHint($)
  void (async () => {
    await $.clock.sleep(300)
    compactMode = kind
    compactHandled = false
    try {
      const r = await $.session.compact(instructions ? { instructions } : undefined)
      if (r && r.skip) {
        $.ui.toast('auto-model: 압축하지 않았어요 — ' + r.skip)
        return
      }
      const before = r && r.tokensBefore
      const after = r && r.tokensAfter
      if (last && after) last = { ...last, tokens: after }
      if (!compactHandled) await logCompaction($, { trigger: 'plugin', mode: kind, before, after, usage: r && r.usage })
      $.ui.toast('auto-model: 압축했어요' + (before && after ? ` (${tokensText(before)} → ${tokensText(after)})` : ''))
    } catch (err) {
      $.ui.toast('auto-model: 압축을 못 했어요 (' + String((err && err.message) || err).slice(0, 120) + ') · /compact 를 직접 입력해 주세요')
    } finally {
      compactMode = null
    }
  })()
  return kind === 'cold' ? '압축을 시작할게요 (쉬고 와서 캐시가 식었으니 Sonnet 이 요약해요. 끝나면 알려 드려요)' : '압축을 시작할게요 (끝나면 알려 드려요)'
}

async function logCompaction($, c) {
  try {
    const log = (await $.store.get('compactions')) || []
    log.push({ at: await $.clock.now(), trigger: c.trigger, mode: c.mode || null, model: c.model || null, before: c.before ?? null, after: c.after ?? null, usage: c.usage ?? null })
    await $.store.set('compactions', log.slice(-20))
  } catch {}
}

// ---- 압축 요약: 쉬고 와서(cold) 우리 [압축] 버튼일 때는 Sonnet, 작업 중(warm)은 원래 모델 ----
// 시험(대화 2개, 25만·50만 토큰): Sonnet 요약은 Opus 와 사실 보존이 같고 절반 값. 다만 승인·금지 범위를 일반화해 틀린 일이
// 있어서, 사용자 메시지를 원문으로 붙이면 사라졌다. 그 섹션은 모델에 맡기지 않고 여기서 대화에서 그대로 꺼내 붙인다.
const COLD_SUMMARY = `아래는 Claude Code 와 사용자의 긴 대화 기록이에요. 이 대화가 압축되어, 이후에는 이 요약만 보고 같은 일을 이어 가야 해요.
아래 항목으로 자세히 요약하세요. 사실만, 지어내지 말고, 경로·명령·숫자·버전은 정확히.
1. 사용자의 목표와 요청 (시간 순)
2. 핵심 기술 개념과 결정 사항 (왜 그렇게 정했는지 포함)
3. 파일과 코드 (경로, 바뀐 내용)
4. 오류와 고친 방법
5. 사용자가 준 승인·허락의 범위와 금지 사항 (예외는 예외로, 일반 규칙과 구분해서)
6. 사용자의 선호와 작업 방식
7. 남은 작업
8. 지금 하던 일과 바로 다음 단계
(사용자 메시지 원문 목록은 따로 붙으니 쓰지 마세요.)

=== 대화 기록 시작 ===
`
const SUMMARY_HEAD = '이 대화는 앞부분이 압축되어 이어지고 있어요. 아래는 앞부분의 요약과, 사용자가 보낸 메시지의 원문이에요.\n\n'

const clip = (text, keep = 200) => (text.length > keep + 100 ? text.slice(0, keep) + `[…${text.length - keep}자 생략]` : text)
// 사용자가 직접 보낸 메시지만 (시스템 알림·명령 기록·도구 결과·다른 세션의 메시지·이전 압축 요약은 빼고), 짧은 건 원문 그대로,
// 긴 붙여넣기는 앞 200자만. 사용자가 '!' 로 직접 실행한 명령은 '(! 실행)' 으로 앞부분만 (배포 같은 승인의 근거라서)
const NOT_TYPED = /^(<(system-reminder|task-notification|local-command|command-|cross-session-message|agent-message|bash-stdout|bash-stderr)|Another Claude session sent a message|This session is being continued from a previous conversation|\[Request interrupted)/
export function userMessagesSection(messages) {
  const lines = []
  for (const m of messages || []) {
    if (m.role !== 'user' || m.agentId) continue
    let t = String(m.text || '').replace(/\u001b?\[?<\d+;\d+;\d+[mM]/g, '').trim() // (터미널 마우스 입력 찌꺼기)
    if (!t || NOT_TYPED.test(t)) continue
    t = t.replace(/\[Image: source: [^\]]*\]/g, '').trim()
    if (!t) continue
    const bash = /^<bash-input>([\s\S]*?)(<\/bash-input>|$)/.exec(t)
    const line = bash ? '(! 실행) ' + clip(bash[1].trim(), 120) : clip(t)
    lines.push(`${lines.length + 1}. ${line.replace(/\n+/g, ' ⏎ ')}`)
  }
  return '## 모든 사용자 메시지 (원문, 자동 추출. 긴 붙여넣기는 앞부분만)\n' + (lines.join('\n') || '(없음)')
}
function transcriptText(messages) {
  const out = []
  for (const m of messages || []) {
    if (m.agentId) continue
    if (m.text) out.push(`[${m.role}] ${m.text}`)
    for (const t of m.toolUses || []) out.push(`[${m.role} 도구 ${t.tool}] ${JSON.stringify(t.input || {}).slice(0, 800)}`)
    for (const t of m.toolResults || []) out.push(`[도구 결과] ${JSON.stringify(t).slice(0, 800)}`)
  }
  return out.join('\n')
}
async function sonnetCompact($, e) {
  const r = await $.model.complete({
    model: 'sonnet',
    system: '긴 대화를 이어받을 사람을 위해 정확하게 요약하는 도우미예요. 지시를 그대로 따르세요.',
    prompt: COLD_SUMMARY + transcriptText(e.messages) + '\n=== 대화 기록 끝 ===',
    maxTokens: 16000,
    timeoutMs: 15 * 60000,
  })
  if (!r || !r.isAnswered || !String(r.text || '').trim()) return null
  const text = SUMMARY_HEAD + r.text.trim() + '\n\n' + userMessagesSection(e.messages)
  return { messages: [{ role: 'user', text, toolUses: [] }], tokensBefore: last ? last.tokens : undefined, usage: r.usage }
}

// ---- 2단계: 모델 고르기 ----

const routing = () => settings.enabled && settings.route === 'auto' && !stopped
const modeOf = () => (!settings.enabled || settings.route !== 'auto' ? 'off' : stopped ? 'stopped' : settings.pin ? 'pin' : 'auto')

async function publish($, base, model, reason) {
  const next = { mode: modeOf(), base, model, reason }
  if (route && route.mode === next.mode && route.base === base && route.model === model && route.reason === reason) return
  route = next
  await setRoute($, next)
}

async function remember($, entry) {
  decisions.push(entry)
  decisions = decisions.slice(-100)
}
async function flushLog($) {
  try {
    await $.store.set('decisions', decisions)
  } catch {}
}

// 이번 턴의 모델: 사람이 고른 세션 모델(base)을 기준으로, 내릴지 / 그대로 둘지 / 되돌릴지
async function decide($, e) {
  const now = await $.clock.now()
  const base = e.model
  if (sessionBase && familyOf(base) !== familyOf(sessionBase) && familyOf(base) !== familyOf(current) && !stopped && settings.route === 'auto') {
    stopped = true // /model 로 직접 바꿨다: 이 세션은 사람 뜻대로
    await remember($, { at: now, turnId: e.turnId, from: current, to: base, reason: '/model 로 직접 바꿈 → 이 세션 자동 중지' })
  }
  sessionBase = base
  const p = pending
  pending = null
  const ctx = last ? last.tokens : 0
  const cur = current || base
  const warm = model => warmAt[familyOf(model)] != null && now - warmAt[familyOf(model)] < settings.ttlMinutes * 60000
  const entry = { at: now, turnId: e.turnId, from: cur, ctx, baseWarm: warm(base), prompt: p ? promptHead(p.text) : undefined }
  const pick = async (to, reason, extra = {}) => {
    Object.assign(entry, { to, reason }, extra)
    await remember($, entry)
    await publish($, base, to, reason)
    return to
  }

  if (!settings.enabled || settings.route !== 'auto') return pick(base, '자동 꺼짐')
  if (stopped) return pick(base, '/model 로 고른 모델')
  if (settings.pin) return pick(MODELS[settings.pin] || base, settings.pin + ' 고정')
  if (p && p.skip) return pick(base, '~ 로 건너뜀')

  const cheap = familyOf(cur) !== familyOf(base)
  // 헤매면 원래 모델로: 결과를 거부하는 말, 또는 도구 오류가 거듭됨
  if (cheap && ((p && isRejection(p.text)) || errors >= 2)) {
    const why = p && isRejection(p.text) ? '결과 거부' : `도구 오류 ${errors}번`
    cooldown = 3
    errors = 0
    return pick(base, `${why} → 원래 모델로`, { rule: 'revert' })
  }
  if (!p) return pick(cur, '새 입력 없음 → 그대로')
  // 이 세션에서 아직 모델 응답을 본 적이 없다 (방금 시작했거나 /reload-plugins 직후): 대화 크기도 캐시도 모른다.
  // 모르면 그대로 둔다 (크기를 0 으로 치고 내렸다가 수십만 토큰을 새로 쓴 일이 있었다)
  let rule = ruleOf(p.text, lastAnswer)
  // 직전 판단이 shadow(켰다면 내렸을 것)였으면, 다음 턴이 무슨 일이었는지 붙여 둔다 (켰다면 손익 계산용)
  const open = [...decisions].reverse().find(d => d.shadow && !d.next)
  if (open && open.turnId !== e.turnId) open.next = { rule, turnId: e.turnId }
  if (rule === 'heavy' || rule === 'approve') {
    const what = rule === 'approve' ? '승인·진행 지시' : '무거운 일'
    return pick(base, cheap ? what + ' → 원래 모델로' : what, { rule })
  }
  if (!last) return pick(base, '대화 크기·캐시를 아직 몰라 그대로', { rule })
  if (rule === 'ack') return pick(cur, '맞장구만 → 그대로', { rule })
  if (cheap) return pick(cur, rule === 'light' ? '가벼움 → 지금 모델 유지' : '애매함 → 그대로', { rule })
  if (cooldown > 0) {
    cooldown--
    return pick(base, '되돌아온 직후라 유지', { rule })
  }

  // 내릴 후보와 어림값: 그대로(base) vs 바꿈(후보). 바꾸는 쪽이 확실히(30% 넘게) 쌀 때만
  const cand = settings.mainHaiku ? MODELS.haiku : MODELS.sonnet
  const stay = turnCost(base, ctx, warm(base))
  const sw = turnCost(cand, ctx, warm(cand))
  Object.assign(entry, { cand, candWarm: warm(cand), stay, sw })
  if (!(sw < stay * 0.7)) return pick(base, rule === 'light' ? '가볍지만 캐시가 따뜻해 그대로가 쌈' : '애매함 → 그대로', { rule })

  // 애매하면 작은 모델에게 한 번 묻는다 (확실히 가볍다고 할 때만 내린다). 실패하면 그대로
  let label = null
  if (rule === 'unsure') {
    try {
      label = (await $.model.classify(p.text, ['light', 'heavy', 'unsure'])) || 'unsure'
    } catch {
      label = 'error'
    }
    if (label !== 'light') return pick(base, `애매함 (분류: ${label}) → 그대로`, { rule, label })
    rule = 'light'
  }
  // 기억 확인 질문의 전환은 아직 shadow: 실제로는 그대로 두고 '켰다면'만 기록한다. 쉬고 와서 바로 일을 이어 가면
  // 다음 턴에 원래 모델이 다시 써야 해서 왕복 손해라, 손익이 플러스로 확인되면 /auto-model light on 으로 켠다
  if (!settings.lightSwitch) return pick(base, `가벼움 · 켰다면 ${prettyName(cand)} (shadow)`, { rule, label, shadow: true })
  return pick(cand, `가벼움 · 바꾸는 쪽이 쌈 (${usd(sw)} < ${usd(stay)})`, { rule, label })
}

// ---- 3단계: 일꾼 ----
// 판단이 필요 없는 일(쓰기는 Sonnet, 찾기·읽기는 Haiku)은 Opus 를 부르지 않고 일꾼 서브에이전트가 맡는다. 일꾼은 대화 전체가
// 아니라 요청과 최근 몇 턴만 받는다. 일꾼의 답이 그 턴의 답으로 대화 끝에 붙으므로 Opus 의 캐시(대화 앞부분)는 그대로다.
// (시제품 실측: 일꾼 턴 뒤 Opus 는 74만 토큰을 캐시로 그대로 읽고 새로 쓴 건 6~7천 토큰)
async function recentContext($) {
  try {
    const msgs = await $.session.messages()
    const tail = msgs.filter(m => !m.agentId && m.text).slice(-6)
    return tail.map(m => (m.role === 'user' ? '사용자: ' : 'Claude: ') + m.text.slice(0, 1500)).join('\n\n')
  } catch {
    return ''
  }
}

// 일꾼을 띄우고 끝날 때까지 기다린다: 답 텍스트, 또는 null (못 띄움 / 시간 초과 / 중단 / 맥락 부족)
async function runWorker($, work) {
  const context = await recentContext($)
  const prompt =
    '아래 요청을 처리해 주세요. 당신은 긴 대화의 일부만 넘겨받은 작업자예요. 요청을 그대로 처리하고, 결과를 사용자에게 보여 줄 짧은 보고로 끝내세요. ' +
    '대화의 다른 부분이 꼭 필요해 보이면 추측하지 말고 첫 줄을 "맥락이 부족해요:" 로 시작해 답하세요.\n\n' +
    (context ? '## 최근 대화 (참고)\n' + context + '\n\n' : '') +
    '## 요청\n' + work.text
  const sp = await $.agent.spawn({ prompt, description: 'auto-model 일꾼', subagentType: 'general-purpose', model: work.model })
  if (!sp || !sp.agentId) return { failed: '일꾼을 못 띄움' }
  workerIds.add(sp.agentId)
  const done = await Promise.race([new Promise(resolve => workerWaiters.set(sp.agentId, resolve)), $.clock.sleep(WORKER_WAIT_MS).then(() => null)])
  workerWaiters.delete(sp.agentId)
  if (!done) return { failed: '시간 초과', agentId: sp.agentId }
  if (done.isAborted) return { failed: '중단됨', agentId: sp.agentId }
  const answer = String(done.answer || '')
  if (!answer.trim() || /^\s*맥락이 부족해요/.test(answer)) return { failed: '맥락 부족', answer, agentId: sp.agentId, usage: done.usage }
  return { answer, agentId: sp.agentId, usage: done.usage, model: (done.usage && done.usage.model) || sp.model }
}

async function statusText($) {
  const lines = []
  const mode = modeOf()
  lines.push('auto-model ' + (settings.enabled ? '켜짐' : '꺼짐') + ' · 자동 전환: ' + { auto: '켜짐', off: '꺼짐', stopped: '/model 로 직접 골라서 이 세션은 멈춤', pin: (settings.pin || '') + ' 고정' }[mode] + (settings.mainHaiku ? ' · 메인 Haiku 허용' : ''))
  if (route) lines.push(`지금: ${prettyName(route.model)}` + (familyOf(route.model) !== familyOf(route.base) ? ` (원래 ${prettyName(route.base)})` : '') + ` · ${route.reason}`)
  lines.push(`캐시 식는 시간 ${settings.ttlMinutes}분 · 압축 제안 ${tokensText(settings.minTokens)} 이상`)
  if (last) {
    const idle = Math.floor(((await $.clock.now()) - last.at) / 60000)
    lines.push(`마지막 호출 ${idleText(idle)} 전 (${prettyName(last.model)}) · 대화 ${tokensText(last.tokens)} · 다시 쓰면 약 ${usd(rewriteUsd(last.model, last.tokens))} (API 환산)`)
  } else lines.push('이 세션에서 아직 모델 호출이 없어요')
  let log = []
  try {
    log = (await $.store.get('compactions')) || []
  } catch {}
  if (log.length) {
    lines.push('최근 압축 (압축 요청이 실제로 쓴 토큰):')
    for (const c of log.slice(-5)) {
      const u = c.usage || {}
      lines.push(`  ${timeText(c.at)} · ${c.mode === 'cold' ? '쉬고 와서' : c.mode === 'warm' ? '작업 중' : c.trigger || ''}${c.model ? ' · ' + prettyName(c.model).split(' ')[0] + ' 요약' : ''} · ${c.before ? tokensText(c.before) : '?'} → ${c.after ? tokensText(c.after) : '?'} · 입력 ${u.input_tokens ?? '?'} · 캐시 읽기 ${u.cache_read_input_tokens ?? '?'} · 캐시 쓰기 ${u.cache_creation_input_tokens ?? '?'} · 출력 ${u.output_tokens ?? '?'}`)
    }
  }
  lines.push('(/auto-model log: 최근 판단 기록)')
  return lines.join('\n')
}

async function logText($) {
  let saved = []
  try {
    saved = (await $.store.get('decisions')) || []
  } catch {}
  const all = saved.length >= decisions.length ? saved : decisions
  let subs = []
  try {
    subs = (await $.store.get('subagents')) || []
  } catch {}
  const lines = []
  // shadow 요약: 기억 확인 질문에서 전환을 켰다면 어땠을지 (다음 턴이 무거우면 원래 모델이 대화를 다시 쓴다)
  const shadows = all.filter(d => d.shadow && d.next && d.cand)
  if (shadows.length) {
    let pnl = 0
    let heavyNext = 0
    for (const d of shadows) {
      const back = d.next.rule === 'heavy' || d.next.rule === 'approve'
      if (back) heavyNext++
      const actual = d.stay + turnCost(d.to, d.ctx, true)
      const would = d.sw + (back ? turnCost(d.to, d.ctx, false) : turnCost(d.cand, d.ctx, true))
      pnl += actual - would
    }
    lines.push(`기억 확인 질문 전환 (shadow): 후보 ${shadows.length}번 중 다음 턴이 무거운 일·승인 ${heavyNext}번 · 켰다면 예상 손익 ${pnl >= 0 ? '+' : '−'}${usd(Math.abs(pnl))} (API 환산, +면 아꼈을 것)` + (settings.lightSwitch ? ' · 지금 켜짐' : ' · 지금 꺼짐 (/auto-model light on)'))
  }
  // 일꾼 shadow 요약: 일꾼 후보였던 턴을 실제로 원래 모델이 처리한 값 vs 일꾼이었다면의 어림값
  const ws = all.filter(d => d.workerShadow && d.usage)
  if (ws.length) {
    const actual = ws.reduce((a, d) => a + usageCost(d.to, d.usage), 0)
    const would = ws.reduce((a, d) => a + d.workerShadow.est, 0)
    const counts = ws.reduce((a, d) => ((a[d.workerShadow.task] = (a[d.workerShadow.task] || 0) + 1), a), {})
    lines.push(`일꾼 후보 (shadow): ${ws.length}번 (쓰기 ${counts.write || 0} · 찾기·읽기 ${counts.search || 0}) · 실제 ${usd(actual)} vs 일꾼이었다면 약 ${usd(would)} (API 환산)` + (settings.worker === 'on' ? ' · 지금 켜짐' : settings.worker === 'shadow' ? ' · 지금 기록만 (/auto-model worker on 으로 켜기)' : ' · 지금 꺼짐'))
  }
  // 놓친 일꾼 후보: 원래 모델이 처리했지만 실제 행동(도구 1~3번, 단순 쓰기·찾기, 짧은 출력)으로 보면 일꾼으로 충분했던 턴
  const handled = all.filter(d => !d.worker && d.usage)
  const missed = handled.filter(d => d.missedWorker)
  if (handled.length) {
    const saved = missed.reduce((a, d) => a + Math.max(0, usageCost(d.to, d.usage) - d.missedWorker.est), 0)
    const mc = missed.reduce((a, d) => ((a[d.missedWorker.task] = (a[d.missedWorker.task] || 0) + 1), a), {})
    const ex = missed.filter(d => d.prompt).slice(-2).map(d => `'${d.prompt.slice(0, 30)}'`).join(', ')
    lines.push(`원래 모델 처리 ${handled.length}번 중 놓친 일꾼 후보 ${missed.length}번 (쓰기 ${mc.write || 0} · 찾기 ${mc.search || 0}) · 일꾼이었다면 약 ${usd(saved)} 절약` + (ex ? ` · 예: ${ex}` : ''))
  }
  const wr = all.filter(d => d.worker)
  if (wr.length) lines.push(`일꾼이 실제로 맡은 턴: ${wr.length}번 · 일꾼 비용 합 약 ${usd(wr.reduce((a, d) => a + (d.usage ? usageCost(d.to, d.usage) : d.est || 0), 0))}`)
  lines.push('최근 판단 (시각 · 이전→이번 · 이유 · 대화 · 캐시 · 이번 턴 사용량):')
  for (const d of all.slice(-15)) {
    const u = d.usage
    lines.push(
      `  ${d.shadow ? '[shadow] ' : ''}${timeText(d.at)} · ${prettyName(d.from)}→${prettyName(d.to)} · ${d.reason}` +
        (d.shadow && d.next ? ` · 다음 턴: ${d.next.rule}` : '') +
        (d.prompt ? ` · "${d.prompt.slice(0, 40)}"` : '') +
        (d.missedWorker ? ` · [놓친 일꾼 후보: ${d.missedWorker.task === 'write' ? '쓰기' : '찾기'} · ${d.missedWorker.why}]` : '') +
        (d.workerShadow ? ` · [일꾼 후보: ${d.workerShadow.task === 'write' ? '쓰기' : '찾기·읽기'}, ${prettyName(d.workerShadow.model).split(' ')[0]} 였다면 약 ${usd(d.workerShadow.est)}]` : '') +
        (d.ctx ? ` · ${tokensText(d.ctx)}` : '') +
        (d.baseWarm != null ? ` · 원래 모델 캐시 ${d.baseWarm ? '따뜻' : '식음'}` : '') +
        (u ? ` · 입력 ${u.input_tokens} 캐시읽기 ${u.cache_read_input_tokens} 캐시쓰기 ${u.cache_creation_input_tokens} 출력 ${u.output_tokens}` : ''),
    )
  }
  if (subs.length) {
    lines.push('최근 서브에이전트 (종류 · 요청한 모델 → 실제 모델):')
    for (const s of subs.slice(-8)) lines.push(`  ${timeText(s.at)} · ${s.type} · ${s.requested || '(지정 없음)'} → ${s.resolved || '?'}${s.routed ? ' (검색류라 haiku 로)' : ''}`)
  }
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      settings = { ...DEFAULTS, ...((await $.store.get('settings')) || {}) }
    } catch {}
    await restoreMemory($)
    await $.command.register({ name: 'auto-model', description: '캐시를 아끼며 모델을 골라요: 쉰 뒤 압축 제안, 가벼운 요청 자동 전환 (on · off · auto · manual · pin · log)' })
    $.clock.every(30000, () => void check($))
    return r
  })

  // 메인 대화의 모델 호출: 첫 단계에서 모델을 정하고 그 턴 동안 유지, 응답마다 시각·크기·답한 모델을 적는다
  // (서브에이전트의 호출은 메인 캐시와 무관해서 건드리지 않는다)
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    liveTurnId = e.turnId
    // 일꾼에게 맡길 턴: 첫 단계에서 Opus 대신 일꾼을 띄우고, 일꾼의 답을 이 턴의 답으로 낸다
    const work = e.index === 0 ? pendingWork : null
    if (work) pendingWork = null
    const workerOn = work && settings.enabled && (work.manual || (settings.worker === 'on' && settings.route === 'auto' && !stopped && !settings.pin))
    if (workerOn) {
      const started = await $.clock.now()
      let res
      try {
        res = await runWorker($, work)
      } catch (err) {
        res = { failed: '일꾼 오류: ' + String((err && err.message) || err).slice(0, 80) }
      }
      const entry = { at: started, turnId: e.turnId, from: current || e.model, to: res.model || work.model, reason: '', task: work.task, worker: true, manual: work.manual, ctx: last ? last.tokens : 0, usage: res.usage || null, est: workerEstimate(res.model || work.model), prompt: promptHead(work.text) }
      if (res.failed && res.failed !== '맥락 부족') {
        entry.reason = `일꾼 ${res.failed} → 원래 모델로`
        entry.to = e.model
        await remember($, entry)
        return yield* next(e) // 못 하면 이 턴은 Opus 가
      }
      const name = prettyName(res.model || work.model).split(' ')[0]
      const secs = Math.round(((await $.clock.now()) - started) / 1000)
      const text = (res.failed ? `🐕 ${name} 일꾼이 맥락이 부족하다고 했어요. 다음 요청은 원래 모델이 이어받아요.\n\n` : `🐕 ${name} 가 처리했어요 (일꾼, ${secs}초)\n\n`) + (res.answer || '')
      if (res.failed) cooldown = Math.max(cooldown, 1)
      entry.reason = res.failed ? '일꾼: 맥락 부족' : `일꾼 (${work.task === 'write' ? '쓰기' : '찾기·읽기'}${work.manual ? ', 손으로' : ''})`
      await remember($, entry)
      lastAnswer = text.slice(-200)
      // (메인 턴의 사용량은 비워 둔다: 일꾼의 작은 대화 크기가 메인 대화 크기로 잡히지 않게. 일꾼 비용은 서브에이전트 쪽에 잡힌다)
      yield { kind: 'text', index: 0, text }
      yield { kind: 'stop', stopReason: 'end_turn', usage: null }
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage: null }
    }
    let model = turnModel.get(e.turnId)
    if (model === undefined) {
      try {
        model = await decide($, e)
      } catch {
        model = e.model // 판단이 실패하면 그대로 (fail open)
      }
      turnModel.set(e.turnId, model)
      if (turnModel.size > 50) turnModel.delete(turnModel.keys().next().value)
      // 일꾼 shadow: 실제로는 이 모델이 처리하고, '일꾼이었다면'만 이 턴의 판단 기록에 붙인다 (턴이 끝나면 실제 사용량과 비교)
      const d = decisions.length && decisions[decisions.length - 1]
      if (work && d && d.turnId === e.turnId) {
        const wm = work.model === 'haiku' ? MODELS.haiku : MODELS.sonnet
        d.workerShadow = { task: work.task, model: wm, est: workerEstimate(wm) }
      }
    }
    const r = yield* next(model && model !== e.model ? { ...e, model } : e)
    if (r && r.usage) {
      const now = await $.clock.now()
      last = { at: now, tokens: contextOf(r.usage), model: r.usage.model }
      warmAt[familyOf(r.usage.model)] = now
      current = r.usage.model
      if (r.answer) lastAnswer = String(r.answer).slice(-200)
      await clearHint($, 'cold')
      const d = decisions.length && decisions[decisions.length - 1]
      if (d && d.turnId === e.turnId) {
        const u = d.usage || { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 }
        for (const k of Object.keys(u)) u[k] += r.usage[k] || 0
        d.usage = u
      }
      await saveMemory($)
    }
    return r
  })

  // /resume · fork 로 다른 대화를 이어받으면, 엔진이 그 대화의 마지막 응답 뒤 지난 시간과 크기를 알려 준다:
  // 그걸로 캐시가 따뜻한지 추정한다 (없으면 모르는 채로 = 그대로)
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    try {
      if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number' && e.context_tokens) {
        sessionId = await $.session.id()
        const at = (await $.clock.now()) - e.seconds_since_last_response * 1000
        const model = e.model || current || sessionBase || MODELS.opus
        last = { at, tokens: e.context_tokens, model }
        for (const k of Object.keys(warmAt)) delete warmAt[k]
        warmAt[familyOf(model)] = at
        current = model
        await saveMemory($)
      }
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  // 입력: 제안은 할 일을 다 했다 (그 요청이 어차피 다시 쓴다). 2단계 판단을 위해 문장을 적어 둔다.
  // (끼어들기만 하고 막지 않는다: 실패해도 입력은 그대로 간다)
  on('prompt.submit', async ($, e, next) => {
    const text = typeof e.text === 'string' ? e.text : ''
    // 우리가 띄운 일꾼의 결과가 메인 대화에 또 배달되면 넣지 않는다 (그대로 두면 그 배달이 새 턴이 되어 Opus 가 대화 전체를 또 읽는다)
    if (e.origin && workerIds.size) {
      const id = [...workerIds].find(x => text.includes(x))
      if (id) {
        workerIds.delete(id)
        return { drop: '🐕 일꾼의 결과는 이미 그 턴의 답으로 붙였어요' }
      }
    }
    await clearHint($)
    if (text.startsWith('/')) return next(e) // 명령은 판단 거리가 아니다
    pendingWork = null
    // '@@ 요청' 은 Sonnet 일꾼, '@@h 요청' 은 Haiku 일꾼에게 바로 (손으로 고르기)
    const manual = /^\s*@@(h?)\s+([\s\S]+)/.exec(text)
    if (manual) {
      pendingWork = { task: manual[1] ? 'search' : 'write', model: manual[1] ? 'haiku' : 'sonnet', text: manual[2], manual: true }
      pending = { text: manual[2], skip: false }
      return next({ ...e, text: manual[2] })
    }
    if (!e.origin) {
      const task = taskOf(text, lastAnswer)
      if (task === 'write' || task === 'search') pendingWork = { task, model: task === 'write' ? 'sonnet' : 'haiku', text, manual: false }
    }
    if (/^[~<]/.test(text)) {
      pending = { text: text.slice(1).trimStart(), skip: true }
      return next({ ...e, text: pending.text })
    }
    pending = { text, skip: false }
    return next(e)
  }).catch(($, e, next) => next(e))

  // 싼 모델 턴의 도구 오류를 센다 (거듭되면 다음 턴에 원래 모델로)
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && liveTurnId) {
      const list = turnTools.get(liveTurnId) || []
      list.push({ tool: String(e.tool || ''), isError: !!(r && r.isError) })
      turnTools.set(liveTurnId, list)
      if (turnTools.size > 30) turnTools.delete(turnTools.keys().next().value)
    }
    if (!e.agentId && route && familyOf(route.model) !== familyOf(route.base)) {
      if (r && r.isError) errors++
    } else if (!e.agentId) errors = 0
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId && workerWaiters.has(e.agentId)) workerWaiters.get(e.agentId)(e)
    // 사후 판정: 원래 모델이 처리한 메인 턴이 사실 일꾼으로 충분했는지, 그 턴의 실제 도구 사용과 출력으로 본다
    if (!e.agentId && e.turnId) {
      const d = [...decisions].reverse().find(x => x.turnId === e.turnId)
      if (d && !d.worker && d.usage) {
        const miss = missedWorkerOf(turnTools.get(e.turnId), d.usage)
        if (miss) {
          const wm = miss.task === 'write' ? MODELS.sonnet : MODELS.haiku
          d.missedWorker = { task: miss.task, why: miss.why, model: wm, est: workerEstimate(wm) }
        }
      }
      turnTools.delete(e.turnId)
    }
    const r = await next(e)
    await flushLog($)
    return r
  }).catch(($, e, next) => next(e))

  // 서브에이전트: 모델을 지정하지 않은 검색·탐색류는 Haiku 로. 지정한 모델이 있으면 그게 먼저. 모두 기록한다.
  on('agent.spawn', async ($, e, next) => {
    const routed = routing() && !e.model && !e.fork && isSearchy(e.subagentType, e.description)
    const r = await next(routed ? { ...e, model: 'haiku' } : e)
    try {
      const subs = (await $.store.get('subagents')) || []
      subs.push({ at: await $.clock.now(), type: e.subagentType, requested: routed ? 'haiku' : e.model || null, resolved: (r && r.model) || null, routed })
      await $.store.set('subagents', subs.slice(-50))
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  // 압축이 끝나면: 대화 크기를 줄여 적고, 압축 요청이 실제로 쓴 토큰을 기록한다 (제안이 맞는지 나중에 보려고)
  // 압축: 우리 [압축] 버튼(trigger plugin)일 때만 손을 댄다. 쉬고 와서 캐시가 식었으면 Sonnet 이 요약하고, 작업 중이면 원래 모델이
  // 요약하되 사용자 메시지 원문을 붙인다. 사람이 친 /compact(manual)와 자동 압축(auto)은 그대로. 실패하면 원래대로 (fail open)
  on('session.compact', async ($, e, next) => {
    const mode = !e.agentId && e.trigger === 'plugin' && compactMode && (await $.clock.now()) < compactModeUntil ? compactMode : null
    if (mode) compactMode = null
    let r = null
    let model = null
    if (mode === 'cold' && last && (await $.clock.now()) - last.at >= settings.ttlMinutes * 60000) {
      try {
        r = await sonnetCompact($, e)
        if (r) model = MODELS.sonnet
      } catch {
        r = null
      }
    }
    if (!r) {
      r = await next(e)
      if (mode && r && r.messages) r = { ...r, messages: [...r.messages, { role: 'user', text: userMessagesSection(e.messages), toolUses: [] }] }
    }
    if (!e.agentId && r && r.messages) {
      if (last && r.tokensAfter) last = { ...last, tokens: r.tokensAfter }
      await clearHint($)
      if (mode) compactHandled = true
      await logCompaction($, { trigger: e.trigger, mode, model, before: r.tokensBefore, after: r.tokensAfter, usage: r.usage })
    }
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'auto-model' }, async ($, e) => {
    const [word = '', ...rest] = (e.args || '').trim().split(/\s+/)
    const arg = word.toLowerCase()
    const save = async () => {
      try {
        await $.store.set('settings', settings)
      } catch {}
    }
    const refreshRoute = async () => {
      if (route) await publish($, route.base, route.model, route.reason)
    }
    if (arg === 'on' || arg === 'off') {
      settings.enabled = arg === 'on'
      if (arg === 'on') stopped = false
      await save()
      if (!settings.enabled) await clearHint($)
      else await check($)
      await refreshRoute()
      return { text: 'auto-model ' + (settings.enabled ? '켰어요 (압축 제안 + 자동 전환)' : '껐어요. 다음 요청부터 원래 모델 그대로예요') }
    }
    if (arg === 'auto' || arg === 'manual') {
      settings.route = arg
      if (arg === 'auto') stopped = false
      await save()
      await refreshRoute()
      return { text: arg === 'auto' ? '자동 전환을 켰어요' : '자동 전환을 껐어요 (압축 제안은 그대로)' }
    }
    if (arg === 'pin' || arg === 'unpin') {
      const m = (rest[0] || '').toLowerCase()
      if (arg === 'pin' && !MODELS[m]) return { text: '/auto-model pin opus | sonnet | haiku' }
      settings.pin = arg === 'pin' ? m : null
      await save()
      await refreshRoute()
      return { text: arg === 'pin' ? `다음 요청부터 ${m} 로 고정해요` : '고정을 풀었어요' }
    }
    if (arg === 'haiku') {
      settings.mainHaiku = (rest[0] || '').toLowerCase() === 'on'
      await save()
      return { text: settings.mainHaiku ? '메인 대화도 가벼우면 Haiku 까지 내려요' : '메인 대화는 Sonnet 까지만 내려요' }
    }
    if (arg === 'light') {
      settings.lightSwitch = (rest[0] || '').toLowerCase() === 'on'
      await save()
      return { text: settings.lightSwitch ? '기억 확인 질문도 캐시가 식었으면 Sonnet 으로 내려요' : '기억 확인 질문은 내리지 않고 "켰다면"만 기록해요 (shadow)' }
    }
    if (arg === 'worker') {
      const m = (rest[0] || '').toLowerCase()
      if (!['on', 'off', 'shadow'].includes(m)) return { text: '/auto-model worker on | shadow | off (지금: ' + settings.worker + ')' }
      settings.worker = m
      await save()
      return { text: { on: '판단이 필요 없는 일은 일꾼(쓰기 Sonnet, 찾기·읽기 Haiku)이 맡아요', shadow: '일꾼 후보만 기록하고 실제로는 원래 모델이 처리해요', off: '일꾼을 껐어요 (@@ 로 손으로 부르는 건 그대로)' }[m] }
    }
    if (arg === 'log') return { text: await logText($) }
    if (arg === 'ttl' || arg === 'min') {
      const n = Number(rest[0])
      if (!Number.isFinite(n) || n <= 0) return { text: arg === 'ttl' ? '/auto-model ttl <분> (예: 60)' : '/auto-model min <천 토큰> (예: 150)' }
      if (arg === 'ttl') settings.ttlMinutes = n
      else settings.minTokens = n * 1000
      await save()
      shownMinutes = -1
      await check($)
      return { text: arg === 'ttl' ? `캐시 식는 시간을 ${n}분으로 했어요` : `${tokensText(n * 1000)} 이상인 대화에만 제안해요` }
    }
    if (arg === 'compact') return { text: await compactNow($, rest.join(' ')) }
    // 카드의 [압축] 버튼: 이어서 usage-meter 가 압축을 시작한다. 그 압축이 쉬고 온 뒤인지(Sonnet) 작업 중인지 적어 둔다
    if (arg === 'compact-prep') {
      compactMode = rest[0] === 'cold' || rest[0] === 'warm' ? rest[0] : shownKind || 'warm'
      compactModeUntil = (await $.clock.now()) + 60000
      await clearHint($)
      return { text: compactMode }
    }
    if (arg === 'preview') {
      const tokens = last ? last.tokens : 460000
      const model = last ? last.model : MODELS.opus
      previewUntil = (await $.clock.now()) + 60000
      shownMinutes = 72
      await setHint($, { id: -1, idleMinutes: 72, tokens, rewriteUsd: rewriteUsd(model, tokens), model })
      return { text: '제안을 1분 동안 보여 줄게요 (테리 카드 아래)' }
    }
    if (arg === 'dismiss') {
      if (shownKind === 'warm') {
        warmSnoozePct = shownPct + 5 // '나중에': 5%p 더 찰 때까지 다시 안 묻는다
        await clearHint($)
        return { text: `${warmSnoozePct}% 가 되면 다시 알려 드릴게요` }
      }
      if (last) dismissedFor = last.at
      await clearHint($)
      return { text: '이번엔 그냥 계속할게요' }
    }
    if (arg === 'warn') {
      const v = (rest[0] || '').toLowerCase()
      const n = v === 'off' ? 0 : Number(v)
      if (!Number.isFinite(n) || n < 0 || n > 100) return { text: '/auto-model warn <퍼센트> | off (지금: ' + (settings.warnPct || 'off') + ')' }
      settings.warnPct = n
      warmSnoozePct = 0
      await save()
      await check($)
      return { text: n ? `대화가 ${n}% 차면 압축을 권할게요` : '작업 중 압축 알림을 껐어요' }
    }
    return { text: await statusText($) }
  })
}
