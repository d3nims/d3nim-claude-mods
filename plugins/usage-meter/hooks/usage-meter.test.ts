import { expect, mock, test } from 'claude-code/testing'

// What the band is asked to draw with: a terminal 80 columns wide, no survey in the way
const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 } as never

// Nothing sits beneath the plugin in a test, so the engine's own answers are given here
function engine(on: any, five = 38, week = 71) {
  mock.store(on)
  mock.clock(on)
  mock.env(on, { COLORTERM: 'truecolor' })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.toast', () => ({ value: {} }))
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

test('a surface without Raster still gets the percentages as text', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /5시간 38%/ })).toBeDefined()
  await ui.unmount()
})
