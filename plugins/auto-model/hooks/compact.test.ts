import { expect, mock, test } from 'claude-code/testing'
import { userMessagesSection } from './register.js'

const MIN = 60000
const OPUS = 'claude-opus-5-5'

// The engine beneath: a long conversation, the context fill reported by session.usage, core's compaction (Opus), and
// a small model that answers $.model.complete with a summary.
function engine(on: any) {
  mock.store(on)
  const clock = mock.clock(on)
  const world: any = { completeUsage: { input_tokens: 400000, output_tokens: 6000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, percent: 40, coreCompactions: 0, completions: [] as any[], hint: null, compacted: null, asks: [] as any[] }
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('ui.toast', () => ({ value: {} }))
  on('prompt.submit', (_: unknown, e: unknown) => e)
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: world.percent, window: 1000000, tokens: world.percent * 10000 }, rateLimits: [] } }))
  on('state.set', (_: unknown, e: any, next: any) => {
    if (e.plugin === 'auto-model' && e.key === 'hint') world.hint = e.value
    if (e.plugin === 'auto-model' && e.key === 'ask') world.asks.push(e.value)
    if (e.plugin === 'auto-model' && e.key === 'memory') world.memory = e.value
    return next(e)
  })
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: e.model, input_tokens: 10, cache_read_input_tokens: 400000, cache_creation_input_tokens: 2000, output_tokens: 500 } }
  })
  on('session.compact', (_: unknown, e: any) => {
    world.coreCompactions++
    return { messages: [{ role: 'user', text: 'Opus 요약', toolUses: [] }], tokensBefore: 400000, tokensAfter: 30000 }
  })
  on('model.complete', (_: unknown, e: any) => {
    world.completions.push(e)
    return { value: { isAnswered: true, text: '1. 목표 …\n5. 승인·금지 …', usage: world.completeUsage } }
  })
  return { clock, world }
}

const MESSAGES = [
  { role: 'user', text: 'ㅇㅇ 보내', toolUses: [] },
  { role: 'assistant', text: '보냈어요', toolUses: [] },
  { role: 'user', text: '<system-reminder>무시할 알림</system-reminder>', toolUses: [] },
  { role: 'user', text: 'x'.repeat(1000), toolUses: [] },
  { role: 'user', text: 'push 는 하지 마', toolUses: [] },
  { role: 'user', text: 'This session is being continued from a previous conversation that ran out of context. …', toolUses: [] },
  { role: 'user', text: '<bash-input>gh pr merge 62 --squash</bash-input>', toolUses: [] },
  { role: 'user', text: '<bash-stdout>merged</bash-stdout><bash-stderr></bash-stderr>', toolUses: [] },
  { role: 'user', text: 'Another Claude session sent a message: <agent-message from="x">hi</agent-message>', toolUses: [] },
  { role: 'user', text: '[Image #12] 이게 뭔뜻이 [Image: source: /tmp/a.png]', toolUses: [] },
]

async function step($: any, n: number) {
  for await (const _ of $.turn.step({ turnId: 't' + n, index: 0, model: OPUS, messageCount: 3 })) {}
}

test('while working, a nearly full conversation gets the compact hint; later snoozes it by 5 points', async ($, on) => {
  const { clock, world } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1)
  world.percent = 86
  await clock.advance(31000)
  expect(world.hint).toMatchObject({ kind: 'warm', percent: 86 })
  await $.command.run({ command: 'auto-model', args: 'dismiss' } as never)
  expect(world.hint ?? null).toBeNull()
  world.percent = 89
  await clock.advance(31000)
  expect(world.hint ?? null).toBeNull() // under 91
  world.percent = 91
  await clock.advance(31000)
  expect(world.hint).toMatchObject({ kind: 'warm', percent: 91 })
})

test('after a break, the card\'s compact button has Sonnet summarize, with the user messages copied verbatim', async ($, on) => {
  const { clock, world } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1)
  await clock.advance(61 * MIN)
  expect(world.hint).toMatchObject({ kind: 'cold' })
  // what the card's button does: tell auto-model what this compaction is, then start it (from another plugin's call)
  await $.command.run({ command: 'auto-model', args: 'compact-prep' } as never)
  const r: any = await $.session.compact({ trigger: 'plugin', messages: MESSAGES } as never)
  expect(world.completions.at(-1)?.model).toBe('sonnet')
  expect(world.coreCompactions).toBe(0) // core's Opus summarizer was not used
  expect(r.messages[0].text).toMatch(/1\. 목표/)
  expect(r.messages[0].text).toMatch(/3\. push 는 하지 마/)
  const status = ((await $.command.run({ command: 'auto-model', args: '' } as never)) as any).text
  expect(status).toMatch(/쉬고 와서 · Sonnet 요약/)
  expect(status).toMatch(/오늘 약 \$[\d.]+ 절약 \(일꾼 0번 · 압축 1번\)/) // Opus would have rewritten 400K at $8/MTok
  expect(status).not.toMatch(/합계 약 \d+% 아낌/) // under $1 spent today on this PC: too little to give a share yet
})

test('while working, the card\'s button keeps the main model but adds the user messages verbatim', async ($, on) => {
  const { clock, world } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1)
  world.percent = 88
  await clock.advance(31000)
  await $.command.run({ command: 'auto-model', args: 'compact-prep' } as never)
  const r: any = await $.session.compact({ trigger: 'plugin', messages: MESSAGES } as never)
  expect(world.coreCompactions).toBe(1)
  expect(world.completions.length).toBe(0)
  expect(r.messages[0].text).toBe('Opus 요약')
  expect(r.messages[1].text).toMatch(/모든 사용자 메시지[\s\S]*1\. ㅇㅇ 보내/)
})

test('the user messages are copied by code, not left to the model: short ones whole, long pastes clipped, notices left out', () => {
  const text = userMessagesSection(MESSAGES as never)
  expect(text).toMatch(/1\. ㅇㅇ 보내/)
  expect(text).toMatch(/2\. x{200}\[…800자 생략\]/)
  expect(text).toMatch(/3\. push 는 하지 마/)
  expect(text).not.toMatch(/무시할 알림/)
  expect(text).toMatch(/4\. \(! 실행\) gh pr merge 62 --squash/)
  expect(text).toMatch(/5\. \[Image #12\] 이게 뭔뜻이$/m)
  expect(text).not.toMatch(/continued from a previous|merged|agent-message|source:/)
})

test('a /compact typed by hand or the automatic one is left to the main model as before', async ($, on) => {
  const { clock, world } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1)
  await clock.advance(61 * MIN)
  const r: any = await $.session.compact({ trigger: 'manual', messages: MESSAGES } as never)
  expect(r.messages[0].text).toBe('Opus 요약')
  expect(r.messages.length).toBe(1)
  expect(world.completions.length).toBe(0)
})

test('/auto-model compact typed by hand asks usage-meter (so a cold one can still go to Sonnet); with nobody to take it, the main model compacts', async ($, on) => {
  const { clock, world } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1)
  await clock.advance(61 * MIN)
  const r: any = await $.command.run({ command: 'auto-model', args: 'compact' } as never)
  expect(r.text).toMatch(/압축을 시작할게요/)
  expect(world.asks.length).toBe(1)
  // usage-meter takes it: a compaction from another plugin, with no word beforehand, is judged cold here
  const c: any = await $.session.compact({ trigger: 'plugin', messages: MESSAGES } as never)
  expect(world.completions.at(-1)?.model).toBe('sonnet')
  expect(c.messages[0].text).toMatch(/3\. push 는 하지 마/)
  await clock.advance(3500)
  expect(world.coreCompactions).toBe(0) // taken, so no fallback
  // nobody takes it
  await $.command.run({ command: 'auto-model', args: 'compact' } as never)
  await clock.advance(3500)
  await clock.advance(400)
  expect(world.coreCompactions).toBe(1)
})

test('after a /compact typed by hand the break hint does not come back, even after a reload; a later small compaction saves little', async ($, on) => {
  const { clock, world } = engine(on)
  on('session.id', () => ({ value: 's1' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1)
  await clock.advance(61 * MIN)
  expect(world.hint).toMatchObject({ kind: 'cold' })
  await $.session.compact({ trigger: 'manual', messages: MESSAGES } as never) // core: 40만 → 3만
  expect(world.hint ?? null).toBeNull()
  await clock.advance(31000)
  expect(world.hint ?? null).toBeNull()
  // the remembered size is the compacted one
  const status = ((await $.command.run({ command: 'auto-model', args: '' } as never)) as any).text
  expect(status).toMatch(/대화 3만 토큰/)
  expect(world.memory?.last?.tokens).toBe(30000) // what a reload brings back
})

test('a Sonnet compaction counts its saving from what it actually read, not a size remembered from before', async ($, on) => {
  const { clock, world } = engine(on)
  world.completeUsage = { input_tokens: 10704, output_tokens: 8044, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($, 1) // remembered: 40만
  await clock.advance(61 * MIN)
  await $.command.run({ command: 'auto-model', args: 'compact-prep' } as never)
  await $.session.compact({ trigger: 'plugin', messages: MESSAGES } as never)
  const status = ((await $.command.run({ command: 'auto-model', args: '' } as never)) as any).text
  const saved = Number(status.match(/오늘 약 \$([\d.]+) 절약/)?.[1])
  expect(saved).toBeLessThan(0.5) // Opus reading ~1만 tokens would have cost cents, not the $5 of 65만
  expect(status).toMatch(/1만 토큰 →/)
})
