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
  // the answer is in: he stops running
  await ui.redraw({ ...(WIDE as object), isWorking: false } as never)
  expect(await ui.find({ type: 'Text', text: /달리는 중/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /다 했어요/ })).toBeDefined()
  await ui.unmount()
})

test('a surface without Raster still gets the percentages as text', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /5시간 38%/ })).toBeDefined()
  await ui.unmount()
})
