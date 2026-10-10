import { expect, mock, test } from 'claude-code/testing'

// What the band is asked to draw with: a terminal 80 columns wide, no survey in the way
const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 } as never

// Nothing sits beneath the plugin in a test, so the engine's own answers are given here
let currentModel = 'claude-opus-5-5'
let currentEffort = 'high'
function engine(on: any, five = 38, week = 71) {
  currentModel = 'claude-opus-5-5'
  currentEffort = 'high'
  mock.store(on)
  const clock = mock.clock(on)
  mock.env(on, { COLORTERM: 'truecolor', TERRY_HOUR: '14' }) // mid-afternoon, so no dinner or night nap gets in the way
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.model', () => ({ value: currentModel }))
  on('settings.read', () => ({ value: { effortLevel: currentEffort } }))
  on('ui.toast', () => ({ value: {} }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { percent: 12, window: 200000, tokens: 24000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: five, resetsAt: new Date(Date.now() + (2 * 60 + 13) * 60000 + 30000).toISOString() },
        { kind: 'seven_day', percentUsed: week, resetsAt: '2026-10-09T05:00:00.000Z' },
      ],
    },
  }))
  return clock
}

test('the band draws three flames and three labels on the terminal', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Raster', key: 'band' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5시간 38%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /주간 71%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /대화 12%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  await ui.unmount()
})

const WIDE = { ...(BAND as object), bodyColumns: 120 } as never

test('the reset times show on /terry', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: WIDE })
  await $.command.run({ command: 'terry', args: '' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /2시간 1[23]분 뒤/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /10\/9\(금\) 14시/ })).toBeDefined()
  await ui.unmount()
})

test('/terry shows Terry sitting with the turn card, and /flame1 brings the flames back', async ($, on) => {
  engine(on, 55)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: WIDE })
  await $.command.run({ command: 'terry', args: '' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Raster', key: 'terry' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /앉아서 기다리는 중/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /아직 요청이 없어요/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^주간/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /71%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12%/ })).toBeDefined()
  await $.command.run({ command: 'flame1', args: '' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Raster', key: 'band' })).toBeDefined()
  await ui.unmount()
})

test('Terry runs while Claude is working', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(WIDE as object), isWorking: true } as never })
  expect(await ui.find({ type: 'Text', text: /달리는 중/ })).toBeDefined()
  // the answer is in: he stops running (a run the band reports finished ends once it has lasted 2.5 s)
  await new Promise(r => setTimeout(r, 2600))
  await ui.redraw({ ...(WIDE as object), isWorking: false } as never)
  expect(await ui.find({ type: 'Text', text: /달리는 중/ })).toBeUndefined()
  // no model answer came in during this run (as with a slash command), so it is not kept as the last request
  expect(await ui.find({ type: 'Text', text: /앉아서 기다리는 중/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /아직 요청이 없어요/ })).toBeDefined()
  await ui.unmount()
})

test('/terry run shows him running without a request, and /terry stop ends it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: WIDE })
  await $.command.run({ command: 'terry', args: 'run' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /달리는 중 · 미리보기/ })).toBeDefined()
  await $.command.run({ command: 'terry', args: 'stop' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /앉아서 기다리는 중/ })).toBeDefined()
  await ui.unmount()
})

test('in a narrow window the card and the table stay beside Terry, who gives up the sky', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(BAND as object), bodyColumns: 58 } as never })
  await $.command.run({ command: 'terry', args: '' } as never)
  await ui.redraw()
  const dog = (await ui.find({ type: 'Raster', key: 'terry' })) as { props: { columns: number } }
  expect(dog.props.columns).toBeLessThan(42)
  expect(await ui.find({ key: 'terry-row' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^기다리는 중$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^주간/ })).toBeDefined()
  await ui.unmount()
})

test('a very narrow window still keeps a short summary beside Terry', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(BAND as object), bodyColumns: 50 } as never })
  await $.command.run({ command: 'terry', args: '' } as never)
  await ui.redraw()
  expect(await ui.find({ key: 'terry-row' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^기다리는 중$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^요청 없음$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5시간/ })).toBeDefined()
  await ui.unmount()
})

test('a /model or /effort change shows on the card without waiting for a request', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: WIDE })
  await $.command.run({ command: 'terry', args: '' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^high$/ })).toBeDefined()
  currentModel = 'claude-sonnet-5-5'
  currentEffort = 'medium'
  await clock.advance(2100)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^Sonnet 5\.5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^medium$/ })).toBeDefined()
  await ui.unmount()
})

test('how Terry runs follows the effort: /terry run max flies, /terry run low walks', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: WIDE })
  await $.command.run({ command: 'terry', args: 'run max' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /날아가는 중!/ })).toBeDefined()
  await $.command.run({ command: 'terry', args: 'run low' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /걷는 중/ })).toBeDefined()
  await ui.unmount()
})

test('while Claude reads a file Terry sniffs, and the new poses can be previewed', async ($, on) => {
  engine(on)
  let release = () => {}
  on('tool.call', () => new Promise(r => { release = () => r({ result: 'ok' }) }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(WIDE as object), isWorking: true } as never })
  expect(await ui.find({ type: 'Text', text: /달리는 중/ })).toBeDefined()
  const call = $.tool.call({ tool: 'Read', file_path: '/tmp/a.txt' } as never)
  await new Promise(r => setTimeout(r, 20))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /킁킁/ })).toBeDefined()
  release()
  await call
  for (const [word, text] of [['dig', /열심히 파는 중/], ['fetch', /물어 오는 중/], ['ask', /허락을 기다려요/], ['sad', /실패했어요/]] as const) {
    await $.command.run({ command: 'terry', args: word } as never)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  }
  await ui.unmount()
})

test('/terry stats tells the day so far', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const answer = (await $.command.run({ command: 'terry', args: 'stats' } as never)) as { text: string }
  expect(answer.text).toMatch(/오늘의 테리/)
  expect(answer.text).toMatch(/아직 오늘 요청이 없어요/)
})

test('a passing test run makes Terry catch a frisbee, a failing one droops his ears', async ($, on) => {
  engine(on)
  let output = ' 12 pass\n 0 fail'
  on('tool.call', () => ({ result: output, text: output }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(WIDE as object), isWorking: true } as never })
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /원반/ })).toBeDefined()
  output = 'Tests: 2 failed, 10 passed'
  await $.tool.call({ tool: 'Bash', command: 'npx vitest run' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /테스트 실패/ })).toBeDefined()
  await ui.unmount()
})

test('with the 5-hour limit used up he waits at the door; /terry pet makes him happy', async ($, on) => {
  engine(on, 100)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: WIDE })
  expect(await ui.find({ type: 'Text', text: /한도가 풀리길 기다리는 중/ })).toBeDefined()
  await $.command.run({ command: 'terry', args: 'pet' } as never)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /쓰다듬어 줘서 좋아요/ })).toBeDefined()
  await ui.unmount()
})

test('very narrow: name and percent beside Terry; narrower still, Terry alone', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(BAND as object), bodyColumns: 44 } as never })
  expect(await ui.find({ key: 'terry-row' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5시간/ })).toBeDefined()
  await ui.redraw({ ...(BAND as object), bodyColumns: 38 } as never)
  expect(await ui.find({ key: 'terry-alone' })).toBeDefined()
  await ui.unmount()
})

test('a surface without Raster still gets the percentages as text', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /5시간 38%/ })).toBeDefined()
  await ui.unmount()
})

test('/terry pane opens Terry in a pane of his own, with what he is doing and the usage under him', async ($, on) => {
  engine(on, 38)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const said = await $.command.run({ command: 'terry', args: 'pane' } as never)
  expect(JSON.stringify(said)).toContain('옆 창')
  const pane = await $.ui.mount({
    plugin: 'usage-meter', surface: 'terminal', component: 'Pane', requestId: 'terry',
    props: { title: '테리', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } as never,
  })
  expect(await pane.find({ type: 'Raster', key: 'pane-terry' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /5시간 38%/ })).toBeDefined()
  await pane.unmount()
})

test("auto-model's compact hint shows under Terry, with its two buttons", async ($, on) => {
  engine(on)
  const hint = { id: 1, idleMinutes: 72, tokens: 460000, rewriteUsd: 3.68, model: 'claude-opus-5-5' }
  on('state.get', (_: unknown, e: any, next: any) => (e.plugin === 'auto-model' && e.key === 'hint' ? { value: { value: hint, version: 1 } } : next(e)))
  const ran: string[] = []
  on('command.run', (_: unknown, e: any, next: any) => (e.command === 'auto-model' ? (ran.push(e.args), { text: 'ok' }) : next(e)))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(BAND as object), bodyColumns: 160 } as never })
  expect(await ui.find({ type: 'Text', text: /1시간 12분 쉬어서 캐시가 식었어요.*46만 토큰.*\$3\.7/ })).toBeDefined()
  await ui.press({ key: 'ah-compact' } as never)
  await ui.press({ key: 'ah-skip' } as never)
  expect(ran).toEqual(['compact', 'dismiss'])
  await ui.unmount()
})

test("auto-model's route shows on the card's model row", async ($, on) => {
  engine(on)
  let route: any = { mode: 'auto', base: 'claude-opus-5-5', model: 'claude-sonnet-5-5', reason: '가벼움' }
  on('state.get', (_: unknown, e: any, next: any) => (e.plugin === 'auto-model' && e.key === 'route' ? { value: { value: route, version: 1 } } : next(e)))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'terry', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...(BAND as object), bodyColumns: 120 } as never })
  expect(await ui.find({ type: 'Text', text: /🔄 Sonnet 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /← Opus/ })).toBeDefined()
  route = { ...route, mode: 'pin', model: 'claude-opus-5-5' }
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /📌 Opus 5\.5/ })).toBeDefined()
  await ui.unmount()
})
