// auto-model 이 세션 동안 들고 있는 값. usage-meter 가 hint 를 읽어 테리 카드 아래에 그린다.
export type AutoModelHint = {
  /** 이 제안이 가리키는 마지막 모델 호출 시각 (ms). 같은 쉼에 대한 제안은 같은 id */
  id: number
  /** 마지막 모델 호출 뒤 지난 시간 (분) */
  idleMinutes: number
  /** 다음 요청이 다시 보내는 대화 크기 (토큰) */
  tokens: number
  /** 그 대화를 캐시에 다시 쓰는 값, API 환산 달러 (1시간 캐시 쓰기 단가) */
  rewriteUsd: number
  /** 마지막으로 답한 모델 id */
  model: string
}

// 자동 전환 상태. usage-meter 가 카드 모델 줄에 그린다.
export type AutoModelRoute = {
  /** auto: 자동 전환 중 · pin: 고정 · stopped: /model 로 직접 골라 멈춤 · off: 꺼짐 */
  mode: 'auto' | 'pin' | 'stopped' | 'off'
  /** 사람이 고른 세션 모델 */
  base: string
  /** 이번 요청에 쓰는 모델 */
  model: string
  /** 왜 그 모델인지 한 줄 */
  reason: string
}

// 판단 근거: 모듈 변수는 /reload-plugins 때 비워지므로, 세션 상태에도 적어 두고 같은 세션이면 되살린다
export type AutoModelMemory = {
  sessionId: string
  last: { at: number; tokens: number; model: string } | null
  warmAt: Record<string, number>
  current: string | null
  sessionBase: string | null
  stopped: boolean
  cooldown: number
  /** 메인 대화의 직전 답 끝부분 (짧은 긍정이 승인인지 볼 때) */
  lastAnswer: string
}

declare module 'claude-code' {
  interface PluginState {
    'auto-model': { hint: AutoModelHint | null; route: AutoModelRoute | null; memory: AutoModelMemory | null }
  }
}
