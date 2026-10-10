import { expect, mock, test } from 'claude-code/testing'

const MIN = 60000
const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'

// The engine beneath: every model step answers with the model it was asked for, over `tokens` of conversation,
// and records which model each request named. The session's own model is `session.model`.
function engine(on: any) {
  mock.store(on)
  const clock = mock.clock(on)
  const world = { answer: 'ok', tokens: 200000, sessionModel: OPUS, asked: [] as string[], texts: [] as string[], route: null as any, spawned: [] as any[] }
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('prompt.submit', (_: unknown, e: any) => (world.texts.push(e.text), e))
  on('state.set', (_: unknown, e: any, next: any) => {
    if (e.plugin === 'auto-model' && e.key === 'route') world.route = e.value
    return next(e)
  })
  on('turn.step', async function* (_: unknown, e: any) {
    world.asked.push(e.model)
    const t = world.tokens
    return {
      turnId: e.turnId, index: e.index, answer: world.answer, toolUses: [], stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 10, cache_read_input_tokens: t - 2010, cache_creation_input_tokens: 1000, output_tokens: 1000 },
    }
  })
  on('agent.spawn', (_: unknown, e: any) => (world.spawned.push(e), { model: e.model || 'inherit', agentId: 'a1' }))
  return { clock, world }
}

let turn = 0
// one prompt and the first model step of its turn (and a second step, which keeps the turn's model)
async function ask($: any, world: any, text: string) {
  await $.prompt.submit({ text } as never)
  const id = 'turn-' + ++turn
  for (const index of [0, 1]) {
    const s = $.turn.step({ turnId: id, index, model: world.sessionModel, messageCount: 3 })
    for await (const _ of s) {}
  }
  const a = world.asked.slice(-2)
  expect(a[0]).toBe(a[1]) // decided on the first step, kept for the turn
  return a[0]
}

async function start($: any, on: any) {
  const env = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  return env
}

test('a light request on a warm, long conversation stays on Opus: switching would rewrite the whole cache', async ($, on) => {
  const { world } = await start($, on)
  expect(await ask($, world, '이 작업 시작해서 render.js 고쳐줘')).toBe(OPUS)
  expect(await ask($, world, '어디까지 했었지?')).toBe(OPUS)
  expect(world.route.reason).toMatch(/따뜻/)
})

test('once the cache has gone cold, a light request moves to Sonnet, and heavy work brings Opus back', async ($, on) => {
  const { world, clock } = await start($, on)
  await $.command.run({ command: 'auto-model', args: 'light on' } as never)
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, 'rd3 관련해서 물어본게 여기였던가?')).toBe(SONNET)
  expect(world.route).toMatchObject({ mode: 'auto', base: OPUS, model: SONNET })
  expect(await ask($, world, '고마워 ㅇㅋ')).toBe(SONNET) // light again: the warm Sonnet stays
  expect(await ask($, world, '그럼 build-terrier.py 수정해서 귀 다시 그려줘')).toBe(OPUS)
})

test('rejecting a cheap answer goes back to Opus and holds there for a few turns', async ($, on) => {
  const { world, clock } = await start($, on)
  await $.command.run({ command: 'auto-model', args: 'light on' } as never)
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, '어디까지 했었지?')).toBe(SONNET)
  expect(await ask($, world, '그대로인데?')).toBe(OPUS)
  await clock.advance(61 * MIN)
  expect(await ask($, world, '어디까지 했었지?')).toBe(OPUS) // cooling down after the revert
})

test('unsure requests stay put when the small model cannot be asked, and ~ skips routing', async ($, on) => {
  const { world, clock } = await start($, on)
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, '음 그럼 이런 방향은 어떨지 한번 생각해봐')).toBe(OPUS) // classify fails here: no change
  await clock.advance(61 * MIN)
  expect(await ask($, world, '~어디까지 했었지?')).toBe(OPUS)
  expect(world.texts.at(-1)).toBe('어디까지 했었지?')
})

test('pin holds a model, and /model by hand stops auto for the session', async ($, on) => {
  const { world, clock } = await start($, on)
  await $.command.run({ command: 'auto-model', args: 'pin sonnet' } as never)
  expect(await ask($, world, '이 작업 시작해서 render.js 고쳐줘')).toBe(SONNET)
  await $.command.run({ command: 'auto-model', args: 'unpin' } as never)
  expect(await ask($, world, '이 작업 시작해서 render.js 고쳐줘')).toBe(OPUS)

  world.sessionModel = 'claude-fable-5-1' // the person picked another model with /model
  await clock.advance(61 * MIN)
  expect(await ask($, world, '어디까지 했었지?')).toBe('claude-fable-5-1')
  expect(world.route.mode).toBe('stopped')
})

test('search subagents with no model of their own go to Haiku; a named model is kept', async ($, on) => {
  const { world } = await start($, on)
  await $.agent.spawn({ prompt: 'p', description: 'find where the cape is drawn', subagentType: 'Explore' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'search the docs', subagentType: 'general-purpose', model: 'opus' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'write the release notes', subagentType: 'general-purpose' } as never)
  expect(world.spawned.map((s: any) => s.model ?? null)).toEqual(['haiku', 'opus', null])
})

test('with no model response seen yet (a fresh start or a reload) nothing is switched, however light the prompt', async ($, on) => {
  const { world } = await start($, on)
  expect(await ask($, world, '어디까지 했었지?')).toBe(OPUS)
  expect(world.route.reason).toMatch(/아직 몰라/)
})

test('a question mark alone is not light: bug reports and pasted images keep Opus even on a cold cache', async ($, on) => {
  const { world, clock } = await start($, on)
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, '[Image #151] 별개로 안내 표지에 ? 처럼 깨져보이는게 있음')).toBe(OPUS)
  await clock.advance(61 * MIN)
  expect(await ask($, world, '이게 왜 이렇게 나오지?')).toBe(OPUS) // unsure, and the small model cannot be asked here
})

test('after /reload-plugins the same session picks up where it was (memory kept in session state)', async ($, on) => {
  const { world, clock } = engine(on)
  on('session.id', () => ({ value: 's1' }))
  const memory = { sessionId: 's1', last: { at: 0, tokens: 200000, model: OPUS }, warmAt: { opus: 0 }, current: OPUS, sessionBase: OPUS, stopped: false, cooldown: 0 }
  on('state.get', (_: unknown, e: any, next: any) => (e.plugin === 'auto-model' && e.key === 'memory' ? { value: { value: memory, version: 1 } } : next(e)))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'auto-model', args: 'light on' } as never)
  await clock.advance(61 * MIN)
  expect(await ask($, world, '어디까지 했었지?')).toBe(SONNET) // knew the size and that Opus had gone cold
})

test("another session's memory is not used", async ($, on) => {
  const { world, clock } = engine(on)
  on('session.id', () => ({ value: 's2' }))
  const memory = { sessionId: 's1', last: { at: 0, tokens: 200000, model: OPUS }, warmAt: { opus: 0 }, current: OPUS, sessionBase: OPUS, stopped: false, cooldown: 0 }
  on('state.get', (_: unknown, e: any, next: any) => (e.plugin === 'auto-model' && e.key === 'memory' ? { value: { value: memory, version: 1 } } : next(e)))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await clock.advance(61 * MIN)
  expect(await ask($, world, '어디까지 했었지?')).toBe(OPUS)
})

test('a resumed conversation is judged by how long ago it last answered', async ($, on) => {
  const { world } = engine(on)
  on('session.id', () => ({ value: 's3' }))
  on('classic.SessionStart', (_: unknown, e: unknown) => ({}))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'auto-model', args: 'light on' } as never)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 90, context_tokens: 300000, model: OPUS } as never)
  expect(await ask($, world, '어디까지 했었지?')).toBe(OPUS) // answered 90 s ago: still warm
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 5400, context_tokens: 300000, model: OPUS } as never)
  expect(await ask($, world, '어디까지 했었지?')).toBe(SONNET) // 1.5 h ago: cold
})

test('a bare thank-you is no reason to switch; a short go-ahead carries the weight of what it approves', async ($, on) => {
  const { world, clock } = await start($, on)
  await $.command.run({ command: 'auto-model', args: 'light on' } as never)
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, '고마워')).toBe(OPUS) // cold, but only thanks: no switch (it would cost a round trip)
  await clock.advance(61 * MIN)
  expect(await ask($, world, 'ㅇㅇ 보내')).toBe(OPUS)
  expect(await ask($, world, 'ㅇㅋ 진행해')).toBe(OPUS) // warm
  world.answer = '이대로 올릴까요?'
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘') // the answer ends asking
  await clock.advance(61 * MIN)
  expect(await ask($, world, 'ㅇㅋ')).toBe(OPUS) // a bare ok after a question is an approval
  expect(world.route.reason).toMatch(/승인/)
  world.answer = 'ok'
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, 'rd3 관련해서 물어본게 여기였던가?')).toBe(SONNET) // a standalone recall question, cold
})

test('by default a recall question only records what switching would have done (shadow), with the outcome of the next turn', async ($, on) => {
  const { world, clock } = await start($, on)
  await ask($, world, '이 작업 시작해서 render.js 고쳐줘')
  await clock.advance(61 * MIN)
  expect(await ask($, world, '어디까지 했었지?')).toBe(OPUS) // would have gone to Sonnet
  expect(world.route.reason).toMatch(/shadow/)
  expect(await ask($, world, '그럼 그 다음 단계 구현해줘')).toBe(OPUS)
  const log = ((await $.command.run({ command: 'auto-model', args: 'log' } as never)) as any).text
  expect(log).toMatch(/후보 1번 중 다음 턴이 무거운 일·승인 1번/)
  expect(log).toMatch(/켰다면 예상 손익 −/) // Opus would have had to rewrite the conversation right after
  expect(log).toMatch(/\[shadow\].*다음 턴: heavy/)
})

test("another session's message is passed on untouched (not read as a '~' skip), and '<' typed by hand is not a skip either", async ($, on) => {
  const { world } = await start($, on)
  const peer = '<cross-session-message from="uds:/x">hi</cross-session-message>'
  await $.prompt.submit({ text: peer, origin: { kind: 'peer' } } as never)
  expect(world.texts.at(-1)).toBe(peer)
  await $.prompt.submit({ text: '<div>이거 왜 깨져?</div>' } as never)
  expect(world.texts.at(-1)).toBe('<div>이거 왜 깨져?</div>')
  await $.prompt.submit({ text: '~어디까지 했었지?' } as never)
  expect(world.texts.at(-1)).toBe('어디까지 했었지?')
})
