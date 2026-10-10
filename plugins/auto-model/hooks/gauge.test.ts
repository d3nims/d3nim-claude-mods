import { expect, mock, test } from 'claude-code/testing'

// Calibration: this computer's API-priced spend against the 5-hour and weekly gauges, '1% ≈ $X' once 5 samples are in.
test('the gauge calibrates from spend and gauge moves, and ignores a reset', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  const g = { five: 10, week: 30, fiveReset: '2026-10-10T15:00:00Z' }
  let saving: any = null
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.id', () => ({ value: 's1' }))
  on('prompt.submit', (_: unknown, e: unknown) => e)
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 20, window: 1000000, tokens: 200000 }, rateLimits: [
    { kind: 'five_hour', percentUsed: g.five, resetsAt: g.fiveReset },
    { kind: 'seven_day', percentUsed: g.week, resetsAt: '2026-10-14T21:00:00Z' },
  ] } }))
  on('state.set', (_: unknown, e: any, next: any) => (e.plugin === 'auto-model' && e.key === 'saving' && (saving = e.value), next(e)))
  // each main step costs about $1 at Opus 5.5 prices (250K tokens read from cache = $0.05, 40K output = $0.80, ...)
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-opus-5-5', input_tokens: 0, cache_read_input_tokens: 250000, cache_creation_input_tokens: 0, output_tokens: 47500 } }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  let n = 0
  const spend = async () => { for await (const _ of $.turn.step({ turnId: 't' + ++n, index: 0, model: 'claude-opus-5-5', messageCount: 3 } as never)) {} }
  await clock.advance(60000) // baseline
  for (let i = 0; i < 10; i++) {
    await spend(); await spend() // about $2
    g.five += 2; g.week += 1 // 5-hour gauge +2% (≈ $1 per %), weekly +1% (≈ $2 per %)... weekly needs 2 points per sample
    await clock.advance(60000)
  }
  g.fiveReset = '2026-10-10T20:00:00Z'; g.five = 1 // the 5-hour window reset: not read as spending
  await clock.advance(60000)
  const status = ((await $.command.run({ command: 'auto-model', args: '' } as never)) as any).text
  // ≈ $1 per 5-hour percent (2% per $2), ≈ $2 per weekly percent; the reset added no sample
  expect(status).toMatch(/게이지 환산: 5시간 1% ≈ \$1\.00 · 주간 1% ≈ \$2\.00 \(.*표본 10·5개\)/)
  expect(status).toMatch(/다른 사람·다른 PC/)
  expect(saving?.myPct ?? null).toBeNull() // spent, but nothing saved yet: no 'my usage' share to show
})
