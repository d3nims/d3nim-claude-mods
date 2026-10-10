import { expect, mock, test } from 'claude-code/testing'

const MIN = 60000
// the hint as the plugin last wrote it (read off the state writes beneath it)
let hintNow: any = null
const hint = () => hintNow

// The engine beneath: a model step that reports `tokens` of conversation, answered by Opus 5.5
function engine(on: any) {
  mock.store(on)
  const clock = mock.clock(on)
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('prompt.submit', (_: unknown, e: unknown) => e)
  hintNow = null
  on('state.set', (_: unknown, e: any, next: any) => {
    if (e.plugin === 'auto-model' && e.key === 'hint') hintNow = e.value
    return next(e)
  })
  let tokens = 200000
  on('turn.step', async function* (_: unknown, e: any) {
    return {
      turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 10, cache_read_input_tokens: tokens - 2010, cache_creation_input_tokens: 1000, output_tokens: 1000 },
    }
  })
  return { clock, setTokens: (n: number) => (tokens = n) }
}

async function step($: any, agentId?: string) {
  const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) {}
  return s.result
}

test('a long conversation left for over an hour gets the compact hint, with the rewrite cost', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($)
  await clock.advance(30 * MIN)
  expect(hint()).toBeNull() // still warm
  await clock.advance(31 * MIN)
  const h = hint()
  expect(h?.tokens).toBe(200000)
  expect(h?.idleMinutes).toBeGreaterThanOrEqual(60)
  expect(Math.round((h?.rewriteUsd ?? 0) * 100)).toBe(160) // 200K at Opus 5.5's 1-hour cache write, $8 / MTok
})

test('typing a prompt clears the hint, and so does a new model call', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($)
  await clock.advance(61 * MIN)
  expect(hint()).toBeTruthy()
  await $.prompt.submit({ text: '오케이 확인해보자' } as never)
  expect(hint()).toBeNull()
})

test('a short conversation, a subagent call or /auto-model off gets no hint', async ($, on) => {
  const { clock, setTokens } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  setTokens(50000)
  await step($)
  await clock.advance(61 * MIN)
  expect(hint()).toBeNull()

  setTokens(400000)
  await step($, 'agent-1') // a subagent's own loop: not the main conversation's cache
  await clock.advance(MIN)
  expect(hint()).toBeNull()

  await step($)
  await $.command.run({ command: 'auto-model', args: 'off' } as never)
  await clock.advance(61 * MIN)
  expect(hint()).toBeNull()
})

test('dismissing keeps the hint closed for that break only', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await step($)
  await clock.advance(61 * MIN)
  await $.command.run({ command: 'auto-model', args: 'dismiss' } as never)
  await clock.advance(5 * MIN)
  expect(hint()).toBeNull()
  await step($) // back to work, then another long break
  await clock.advance(61 * MIN)
  expect(hint()).toBeTruthy()
})
