import { expect, mock, test } from 'claude-code/testing'

const OPUS = 'claude-opus-5-5'

// The engine beneath, with a small file system so the file log can be read back
function engine(on: any, files: Record<string, string>) {
  mock.store(on)
  mock.clock(on)
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('prompt.submit', (_: unknown, e: any) => e)
  on('env.get', () => ({ value: null }))
  on('fs.exists', (_: unknown, e: any) => ({ value: e.path in files }))
  on('fs.read', (_: unknown, e: any) => (e.path in files ? { value: files[e.path] } : { error: 'missing' }))
  on('fs.write', (_: unknown, e: any) => ((files[e.path] = e.text), { value: undefined }))
  on('turn.step', async function* (_: unknown, e: any) {
    return {
      turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 10, cache_read_input_tokens: 50000, cache_creation_input_tokens: 2000, output_tokens: 800 },
    }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
}

let n = 0
async function turn($: any, text: string) {
  await $.prompt.submit({ text } as never)
  const id = 't' + ++n
  for await (const _ of $.turn.step({ turnId: id, index: 0, model: OPUS, messageCount: 3 })) void _
  await $.turn.complete({ turnId: id, answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer' } as never)
}
const rows = (files: Record<string, string>) => {
  const paths = Object.keys(files).filter(p => p.endsWith('.jsonl'))
  return { paths, rows: paths.flatMap(p => files[p].trim().split('\n').map(l => JSON.parse(l))) }
}

test('with a log folder set, every request leaves one line in that conversation\'s file', async ($, on) => {
  const files: Record<string, string> = {}
  engine(on, files)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const set = ((await $.command.run({ command: 'auto-model', args: 'logdir /logs' } as never)) as any).text
  expect(set).toMatch(/요청마다 판단을 기록해요: \/logs\/auto-model\/\d{4}-\d{2}-\d{2}\/local-.+\.jsonl/)
  await turn($, '이 함수 왜 느려?')
  await turn($, '그럼 고쳐줘')
  const { paths, rows: r } = rows(files)
  expect(paths.length).toBe(1)
  const turns = r.filter(x => x.kind === 'turn')
  expect(turns.length).toBe(2)
  expect(turns[0].prompt).toBe('이 함수 왜 느려?')
  expect(turns[0].from).toBeTruthy()
  expect(turns[0].reason).toBeTruthy()
  expect(turns[0].usage.cache_read_input_tokens).toBe(50000)
  expect(turns[0].sid).toBeUndefined()
})

test('noprompt keeps the numbers and drops what was typed; off stops writing', async ($, on) => {
  const files: Record<string, string> = {}
  engine(on, files)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'auto-model', args: 'logdir C:\\dev\\logs noprompt' } as never)
  await turn($, '회사 일 비밀 내용')
  const { paths, rows: r } = rows(files)
  expect(paths[0]).toMatch(/C:\\dev\\logs\\auto-model\\\d{4}-\d{2}-\d{2}\\win-/)
  expect(JSON.stringify(r)).not.toMatch(/비밀/)
  expect(r.find(x => x.kind === 'turn').usage).toBeTruthy()
  await $.command.run({ command: 'auto-model', args: 'logdir off' } as never)
  const before = files[paths[0]]
  await turn($, '다음 요청')
  expect(files[paths[0]]).toBe(before)
})

test('a reload keeps adding to the same file and keeps this session\'s /auto-model log', async ($, on) => {
  const files: Record<string, string> = {}
  engine(on, files)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'auto-model', args: 'logdir /logs' } as never)
  await turn($, '첫 요청')
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true }) // (a reload runs session.start again)
  await turn($, '두 번째 요청')
  const { rows: r } = rows(files)
  expect(r.filter(x => x.kind === 'turn').map(x => x.prompt)).toEqual(['첫 요청', '두 번째 요청'])
  const log = ((await $.command.run({ command: 'auto-model', args: 'log' } as never)) as any).text
  expect(log).toMatch(/첫 요청/)
  expect(log).toMatch(/두 번째 요청/)
})
