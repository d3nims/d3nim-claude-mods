// auto-model 2단계의 판단 재료: 요청 문장의 가벼움(로컬 규칙), 모델별 단가, 전환 비용 어림.
// 화면이나 엔진과는 무관한 순수 함수만 둔다 (테스트하기 쉽게).

// 확실히 무거운 일: 코드나 파일을 만들고 고치는 말, 코드 조각·파일 경로, 이미지·파일 첨부, 불만이나 문제 제보, 긴 지시
const HEAVY = /(구현|만들|고쳐|고치|수정|리팩|버그|에러|오류|깨져|깨짐|이상|문제|안 ?나|안 ?보|설계|작성|추가해|바꿔|변경|빌드|테스트|배포|올려|올리|커밋|푸시|삭제|지워|분석|조사|검토|리뷰|최적화|마이그|디버그|implement|refactor|fix|build|deploy|debug|broken|```|\[(?:Image|Pasted)|@\S|[\w-]+\/[\w./-]+|\w+\.(?:js|ts|tsx|py|json|md|go|rs|java|sh|css|html)\b)/i
// 가벼운 질문: '~였던가/뭐였지/어디였지' 처럼 새 일을 시키지 않고 기억을 묻는 짧은 질문 (물음표만 있다고 가볍지 않다)
const LIGHT = /(어디였|뭐였|무엇이었|언제였|누구였|였던가|였더라|였지\??$|했었지\??$|더라\??$|어디까지)/
// 맞장구·인사만 있는 말 (요청이 없다): 모델을 바꿀 이유가 아니다
const ACK = /^(고마워요?|감사(합니다|해요)?|ㅇㅋ|ㅇㅇ|dz|dd|오케이|오키|ok|okay|굿|good|nice|ㅋ+|ㅎ+|넵|네|응|그래|좋아|좋네|오+|와+|대박|thx|thanks)[\s!.~ㅋㅎ]*$/i
// 승인·진행 지시: 짧아도 직전 제안(설계·구현·커밋…)을 실행하라는 말이라 무거운 일이다
const APPROVE = /(해줘|해 줘|해봐|해 봐|해주세요|진행|보내|가자|ㄱㄱ|고고|그걸로|그렇게 해|그렇게 하자|하자\b|하자$|부탁|시작해|맞춰|적용|넘겨|전달해|ㄱ$)/
// 직전 답이 사람에게 묻거나 제안하며 끝났는지 (그 뒤의 짧은 긍정은 승인이다)
const ASKS_BACK = /(\?|할까요|드릴까요|볼까요|갈까요|올릴까요|주세요|주시면|어떨까요|괜찮을까요|원하시면|정해 주|골라 주|알려 주)[\s.)!]*$/
// 싼 모델이 헤맨다는 신호: 결과를 거부하는 말
const REJECT = /(그대로|여전히|안 ?바뀌|아니야|아니라|그게 아니|틀렸|틀린|안 ?돼|안 ?되|다시 해|왜 안|못 ?알아|still|didn'?t work|doesn'?t work|not what)/i

/**
 * 요청 문장의 무게. lastAnswer 는 직전 답의 끝부분 (그게 질문·제안으로 끝났으면 짧은 긍정은 승인이다).
 * 'heavy' 무거운 일 · 'approve' 승인·진행 지시 (무거운 일로 친다) · 'ack' 맞장구만 (그대로 둔다)
 * · 'light' 새 일 없는 기억 확인 질문 (캐시가 식었거나 대화가 짧으면 내릴 후보) · 'unsure' 애매함 (그대로)
 */
export function ruleOf(text, lastAnswer = '') {
  const t = String(text || '').trim()
  if (!t) return 'unsure'
  if (HEAVY.test(t) || t.length > 120) return 'heavy'
  if (t.length <= 40 && APPROVE.test(t)) return 'approve' // 'ㅇㅋ 진행해' 처럼 섞여도 승인이 먼저
  if (ACK.test(t)) return ASKS_BACK.test(String(lastAnswer || '').trim()) ? 'approve' : 'ack'
  if (t.length <= 40 && LIGHT.test(t)) return 'light'
  return 'unsure'
}
export const isRejection = text => REJECT.test(String(text || ''))

// 서브에이전트 중 검색·탐색류 (Haiku 로 보낸다)
const SEARCHY = /(explore|search|find|locate|grep|lookup|look up|찾|검색|탐색|훑어|위치)/i
export const isSearchy = (subagentType, description) => SEARCHY.test(`${subagentType || ''} ${description || ''}`)

export const MODELS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' }
export const familyOf = model => {
  const m = String(model || '')
  return /haiku/.test(m) ? 'haiku' : /sonnet/.test(m) ? 'sonnet' : /fable|mythos/.test(m) ? 'fable' : 'opus'
}
export const prettyName = model => {
  const m = String(model || '').replace(/^claude-/, '').replace(/\[.*\]$/, '')
  const [fam, ...v] = m.split('-')
  return fam ? fam[0].toUpperCase() + fam.slice(1) + (v.length ? ' ' + v.join('.') : '') : '?'
}

// 단가 (달러 / 100만 토큰): 입력, 캐시 읽기, 출력. 캐시 쓰기는 1시간 TTL 이라 입력의 2배.
export function priceOf(model, ctx = 0) {
  const m = String(model || '')
  if (/haiku-5/.test(m)) return ctx > 100000 ? { input: 0.5, read: 0.05, output: 2.5 } : { input: 0.1, read: 0.01, output: 0.5 }
  if (/haiku/.test(m)) return { input: 1, read: 0.1, output: 5 }
  if (/sonnet-4/.test(m)) return { input: 3, read: 0.3, output: 15 }
  if (/sonnet/.test(m)) return { input: 2, read: 0.2, output: 10 }
  if (/fable|mythos/.test(m)) return { input: 10, read: 0.25, output: 50 }
  if (/opus-5-5/.test(m)) return { input: 4, read: 0.2, output: 20 }
  return { input: 5, read: 0.5, output: 25 }
}

/** 한 턴의 어림값: 대화를 캐시에서 읽거나(warm) 다시 쓰고(cold), 답을 outTokens 만큼 쓰는 값 */
export function turnCost(model, ctx, warm, outTokens = 1500) {
  const p = priceOf(model, ctx)
  return (ctx / 1e6) * (warm ? p.read : p.input * 2) + (outTokens / 1e6) * p.output
}

// ---- 3단계: 일꾼에게 맡길 일인지 ----
// 판단이 필요한 일: 분석·검증·설계·원인 찾기, 코드 고치기, 비교·추천 (Opus)
const JUDGE = /(분석|검증|왜|원인|설계|판단|고민|반영|확인하고|비교|리뷰|검토|어떻게 생각|추천|계획|전략|디버그|버그|에러|오류|고쳐|고치|수정해|리팩|구현|최적화|implement|refactor|debug|fix|review|analy[sz]e|design)/i
// 대화 속 무언가를 가리키는 말: 일꾼은 대화 전체를 안 보니 대상이 흐려진다 (Opus)
const DEICTIC = /(이거|그거|저거|이걸|그걸|저걸|이것|그것|아까|위에|방금|앞에서|말한|얘기한|그대로)/
// 원래 기계적인 쓰기 동사 (Sonnet): 옮기고, 붙이고, 이름 바꾸고, 더하기
const MECH = /(복사해|옮겨|이름 ?바꿔|이름을 바꿔|붙여|추가해|넣어|기록해|메모해|정렬해|포맷)/
// 만드는 동사: 큰 구현·작성일 때가 많아서, '어디에 + 무엇을'이 함께 있을 때만 일꾼 (아니면 Opus)
const GEN = /(만들어 ?줘|작성해|써 ?줘|생성해|저장해)/
// 목적지 ('노션에', '파일에', 'README.md에' …)
const DEST = /(노션에|노션 페이지에|파일에|메모에|메모장에|\.\w{1,5}\s*에|시트에|페이지에|문서에|폴더에|README에)/
// 넣을 대상이 주어짐 ('이 텍스트', '아래 내용', '다음을', 따옴표·코드블록, '…: 내용')
const TARGET = /(이 텍스트|이 문장|아래 내용|아래 메모|아래 글|다음을|다음 내용|["'“”‘’`]|```|:\s*\S)/
// 산출물 명사: 이게 붙은 만들기·추가는 구현·작성이라 판단이 필요하다 (Opus)
const PRODUCT = /(기능|코드|테스트|플러그인|화면|api|보고서|스크립트|모듈|함수|클래스|컴포넌트|앱|서비스|설계서|기획|로직|쿼리|프로그램)/i
// 찾기·읽기만 하는 일 (Haiku): 목록, 위치, 내용 보여 주기
const SEARCH = /(찾아|검색|어디 ?있|어디에 있|목록|리스트|뭐가 있|무엇이 있|뭐 있|보여 ?줘|알려 ?줘|몇 개|개수|읽어 ?줘|열어 ?봐)/

/** 'write' (Sonnet 일꾼) · 'search' (Haiku 일꾼) · 'judgment' (Opus) · 'unsure' (Opus). 확실할 때만 일꾼이다 */
export function taskOf(text, lastAnswer = '') {
  const t = String(text || '').trim()
  if (!t) return 'unsure'
  const rule = ruleOf(t, lastAnswer)
  if (rule === 'approve') return 'judgment' // 직전 제안을 실행하라는 말: 판단 맥락이 필요하다
  if (JUDGE.test(t) || t.length > 160) return 'judgment'
  if ((GEN.test(t) || MECH.test(t)) && PRODUCT.test(t) && !(DEST.test(t) && TARGET.test(t))) return 'judgment'
  if (DEICTIC.test(t)) return 'unsure'
  if (MECH.test(t)) return 'write'
  if (GEN.test(t)) return DEST.test(t) && TARGET.test(t) ? 'write' : 'unsure'
  if (SEARCH.test(t)) return 'search'
  return 'unsure'
}

/** 한 턴(여러 단계)의 실제 값: 사용량 합계로 (캐시 쓰기는 1시간 TTL 이라 입력의 2배로 친다) */
export function usageCost(model, u) {
  if (!u) return 0
  const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
  const p = priceOf(model, ctx)
  return ((u.input_tokens || 0) * p.input + (u.cache_read_input_tokens || 0) * p.read + (u.cache_creation_input_tokens || 0) * p.input * 2 + (u.output_tokens || 0) * p.output) / 1e6
}
// 일꾼 한 번의 어림값: 새 대화 약 3만 토큰을 쓰고, 답 약 800 토큰 (시제품 실측: Haiku 약 $0.003, Sonnet 3만 쓰기)
export const workerEstimate = model => turnCost(model, 30000, false, 800)

// ---- 사후 판정: Opus 가 처리한 턴이 사실 일꾼으로 충분했는지 (그 턴의 실제 행동으로, 모델 호출 없이) ----
const WRITE_TOOLS = /^(Write|Edit|MultiEdit|NotebookEdit|mcp__.*(create|update|append|add|insert|write|post|comment).*)$/i
const SEARCH_TOOLS = /^(Read|Glob|Grep|LS|WebFetch|WebSearch|mcp__.*(fetch|search|get|list|read|query).*)$/i
/**
 * tools: 그 턴의 메인 도구 호출 [{ tool, isError }], usage: 그 턴 사용량 합계.
 * 도구 1~3번, 모두 단순 쓰기·찾기, 오류 없음, 출력 짧음(생각 포함 1500 토큰 이하) → { task, why }. 아니면 null
 */
export function missedWorkerOf(tools, usage) {
  if (!tools || !tools.length || tools.length > 3) return null
  if (tools.some(t => t.isError)) return null
  if (!usage || (usage.output_tokens || 0) > 1500) return null
  const writes = tools.filter(t => WRITE_TOOLS.test(t.tool)).length
  const reads = tools.filter(t => SEARCH_TOOLS.test(t.tool)).length
  if (writes + reads !== tools.length) return null // Bash, 서브에이전트, 그 밖의 도구가 끼면 Opus 가 맞다고 본다
  if (writes > 2) return null
  return { task: writes ? 'write' : 'search', why: `도구 ${tools.map(t => t.tool.replace(/^mcp__[^_]+__/, '')).join(', ')} · 출력 ${usage.output_tokens || 0} 토큰` }
}
/** 기록용 요청 앞부분: 공백을 접고 80자까지 (붙여 넣은 긴 글은 잘린다) */
export const promptHead = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80)

// ---- 절약 어림값 (API 환산, 구독제에서는 사용량 게이지를 아낀 만큼) ----
/** 일꾼이 맡은 일을 원래 모델이 했다면: 첫 단계는 대화를 읽거나(캐시 따뜻) 다시 쓰고(식음), 나머지 단계는 캐시로 읽고, 답 약 800 토큰 */
export function opusWouldWorker(model, ctx, warm, task) {
  const p = priceOf(model, ctx)
  const steps = task === 'write' ? 3 : 2
  return (ctx / 1e6) * (warm ? p.read : p.input * 2) + ((steps - 1) * ctx / 1e6) * p.read + (800 / 1e6) * p.output
}
/** 일꾼 턴 뒤 원래 모델이 붙은 부분(요청 + 일꾼 답)을 새로 쓰는 값: 글자 약 2.5자 = 1 토큰 */
export function appendCost(model, chars) {
  return ((chars / 2.5) / 1e6) * priceOf(model, 0).input * 2
}
/** 쉬고 와서 압축을 원래 모델이 했다면: 대화 전체를 다시 쓰고(식음) 요약을 쓰는 값 */
export function opusWouldCompact(model, ctx, outTokens) {
  const p = priceOf(model, ctx)
  return (ctx / 1e6) * p.input * 2 + ((outTokens || 6000) / 1e6) * p.output
}
