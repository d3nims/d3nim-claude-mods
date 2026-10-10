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
