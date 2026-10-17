import { expect, mock, test } from 'claude-code/testing'
import { isReadOnlyCommand, missedWorkerOf, outcomeOf, promptHead, ruleOf, setExtraWords, taskOf, wordCandidates, wordsOf } from './route.js'

const OPUS = 'claude-opus-5-5'

// The engine beneath: main steps answer as the model asked for; a spawned subagent finishes right away with
// with `workerAnswer` (core alone hands back the agentId to wait on, see below).
function engine(on: any) {
  mock.store(on)
  mock.clock(on)
  const world = { asked: [] as string[], spawned: [] as any[], workerAnswer: '노션에 추가했어요', texts: [] as string[] }
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.messages', () => ({ value: [{ role: 'user', text: '앞선 이야기' }, { role: 'assistant', text: '앞선 답' }] }))
  on('prompt.submit', (_: unknown, e: any) => (world.texts.push(e.text), e))
  on('turn.step', async function* (_: unknown, e: any) {
    world.asked.push(e.model)
    return {
      turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 10, cache_read_input_tokens: 700000, cache_creation_input_tokens: 2000, output_tokens: 800 },
    }
  })
  on('agent.spawn', ($: any, e: any) => {
    const agentId = 'w' + (world.spawned.length + 1)
    world.spawned.push({ ...e, agentId })
    return { model: e.model, agentId }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  return world
}

let n = 0
// a prompt and its turn's first step: what the turn answered, and whether the main model was asked
async function ask($: any, world: any, text: string) {
  const before = world.asked.length
  await $.prompt.submit({ text } as never)
  const s = $.turn.step({ turnId: 't' + ++n, index: 0, model: OPUS, messageCount: 3 })
  let answer = ''
  for await (const c of s) if ((c as any).kind === 'text') answer += (c as any).text
  return { answer, mainAsked: world.asked.length > before }
}

async function start($: any, on: any, mode?: string) {
  const world = engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  if (mode) await $.command.run({ command: 'auto-model', args: 'worker ' + mode } as never)
  return world
}

test('by default (shadow) a worker-sized request is still answered by Opus, and the log says what a worker would have cost', async ($, on) => {
  const world = await start($, on)
  const r = await ask($, world, '노션에 이 텍스트 추가해줘')
  expect(r.mainAsked).toBe(true)
  expect(world.spawned.length).toBe(0)
  await $.turn.complete({ turnId: 't' + n, answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  const log = ((await $.command.run({ command: 'auto-model', args: 'log' } as never)) as any).text
  expect(log).toMatch(/일꾼 후보 \(shadow\): 1번 \(쓰기 1/)
  const status = ((await $.command.run({ command: 'auto-model', args: '' } as never)) as any).text
  expect(status).toMatch(/일꾼을 켰다면 약 \$[\d.]+ 더 절약 가능 \(shadow\)/)
})

// (A test's own hook beneath stands in for core, and core alone hands back a started subagent's agentId: so a test can
// see who would be spawned and that a worker that cannot be waited on falls back to Opus, not the worker's own answer.
// The full path, the worker's answer as the turn's answer and the dropped hand-back, was checked live with the prototype.)
test('worker on: a write would go to a Sonnet worker, a lookup to Haiku; with no worker to wait on, Opus answers', async ($, on) => {
  const world = await start($, on, 'on')
  const w = await ask($, world, '노션에 이 텍스트 추가해줘')
  expect(world.spawned[0].model).toBe('sonnet')
  expect(world.spawned[0].prompt).toMatch(/## 요청\n노션에 이 텍스트 추가해줘/)
  expect(world.spawned[0].prompt).toMatch(/앞선 이야기/) // the few recent turns, not the whole conversation
  expect(w.mainAsked).toBe(true) // fail open
  await ask($, world, 'docs 폴더 목록 보여줘')
  expect(world.spawned[1].model).toBe('haiku')
  const log = ((await $.command.run({ command: 'auto-model', args: 'log' } as never)) as any).text
  expect(log).toMatch(/일꾼을 못 띄움 → 원래 모델로/)
})

test('judgment, pointing words and approvals stay with Opus even with the worker on', async ($, on) => {
  const world = await start($, on, 'on')
  for (const text of ['이 작업 처리해 주고 끝나면 분석·검증해서 반영해 줘', '그거 노션에 추가해줘', 'ㅇㅋ 진행해', 'render.js 고쳐줘']) {
    expect((await ask($, world, text)).mainAsked).toBe(true)
  }
  expect(world.spawned.length).toBe(0)
})

test('@@ sends a request to a worker by hand even in shadow, without the prefix', async ($, on) => {
  const world = await start($, on)
  await ask($, world, '@@h 이 저장소 tools 폴더에 뭐가 있는지 알려줘')
  expect(world.spawned[0].model).toBe('haiku')
  expect(world.spawned[0].prompt).toMatch(/## 요청\n이 저장소 tools 폴더/)
  expect(world.texts.at(-1)).toBe('이 저장소 tools 폴더에 뭐가 있는지 알려줘')
})

test('a hand-back from someone else is left alone', async ($, on) => {
  await start($, on, 'on')
  const r: any = await $.prompt.submit({ text: '<agent-message from="someone">\n[Subagent hand-back] hi', origin: { kind: 'peer' } } as never)
  expect(r.drop).toBeUndefined()
})

test('making something is not a worker job unless it names where and what: features, reports and tests stay with Opus', () => {
  expect(taskOf('로그인 기능 만들어줘')).toBe('judgment')
  expect(['judgment', 'unsure']).toContain(taskOf('보고서 작성해줘'))
  expect(taskOf('테스트 코드 써줘')).toBe('judgment')
  expect(taskOf('로그인 기능 추가해줘')).toBe('judgment')
  expect(taskOf('파일 하나 만들어줘')).toBe('unsure')
  expect(taskOf('노션에 아래 메모 써줘: 회의 3시')).toBe('write')
  expect(taskOf('이 파일 이름 바꿔줘 a.txt → b.txt')).toBe('write')
  expect(taskOf('README.md에 "설치" 줄 추가해줘')).toBe('write')
  expect(taskOf('이 저장소 tools 폴더에 뭐가 있는지 알려줘')).toBe('search')
})

test('after the fact: a turn of one or two plain reads or writes with a short answer was a worker job; tests and other shell commands were not', () => {
  const short = { output_tokens: 600 }
  expect(missedWorkerOf([{ tool: 'Read', isError: false }, { tool: 'Glob', isError: false }], short)?.task).toBe('search')
  expect(missedWorkerOf([{ tool: 'mcp__notion__notion-update-page', isError: false }], short)?.task).toBe('write')
  expect(missedWorkerOf([{ tool: 'Bash', isError: false }], short)).toBeNull()
  // a shell command that only reads (cat, grep, ls …) is a read like Read or Grep
  const bash = isReadOnlyCommand('cd /x && grep -n foo a.js | head -5')
  expect(bash).toBe(true)
  expect(missedWorkerOf([{ tool: 'Bash', isError: false, ro: bash }], short)?.why).toMatch(/Bash\(읽기\)/)
  expect(missedWorkerOf([{ tool: 'Read', isError: false }], { output_tokens: 4000 })).toBeNull() // long answer: real thinking
  expect(missedWorkerOf([1, 2, 3, 4].map(() => ({ tool: 'Read', isError: false })), short)).toBeNull()
  expect(missedWorkerOf([], short)).toBeNull()
  expect(promptHead('  노션에\n\n  이 텍스트   추가해줘 ' + 'x'.repeat(200))).toHaveLength(80)
})

test('the log keeps the start of each request and marks a missed worker job', async ($, on) => {
  on('tool.call', () => ({ result: 'ok', isError: false }))
  const world = await start($, on)
  await ask($, world, '이 저장소 루트에 있는 파일 확인해줘')
  await $.tool.call({ tool: 'Glob', pattern: '*' } as never)
  await $.turn.complete({ turnId: 't' + n, answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  const log = ((await $.command.run({ command: 'auto-model', args: 'log' } as never)) as any).text
  expect(log).toMatch(/놓친 일꾼 후보 1번 \(쓰기 0 · 찾기 1\)/)
  expect(log).toMatch(/"이 저장소 루트에 있는 파일 확인해줘"/)
})

test('a shell command counts as reading only when nothing in it writes', () => {
  for (const c of ['cat a.txt', 'sed -n 1,20p f.js', 'git status --short', 'grep foo f 2>/dev/null', 'PYTHONHASHSEED=0 head x', 'find . -name "*.md"'])
    expect(isReadOnlyCommand(c)).toBe(true)
  for (const c of ['sed -i s/a/b/ f', 'ls > out.txt', 'find . -name x -delete', 'git push', 'git branch -D x', 'python3 x.py', 'echo $(rm x)', 'npm test', ''])
    expect(isReadOnlyCommand(c)).toBe(false)
})

test('a problem report or a request to go and check is heavy work, never a light recall question', () => {
  for (const t of ['국장 확인좀 ㅋㅋ', 'ja.win이 캐시식었을때 압축이 계속 고장이네', '버튼이 반응이 없어', '지금은 어때 다시 해바', '그 유튜버 찾아봐줘', '로그인이 안 돼'])
    expect(ruleOf(t)).toBe('heavy')
  expect(ruleOf('테리 점 버전이 뭐였지')).toBe('light')
})

test('word candidates: words that keep turning up in requests the rules missed, and seldom on the other side', () => {
  expect(outcomeOf(5, { output_tokens: 300 })).toBe('heavy')
  expect(outcomeOf(0, { output_tokens: 400 })).toBe('light')
  expect(outcomeOf(1, { output_tokens: 1800 })).toBeNull()
  expect(wordsOf('[Image #3] 국장 체크ㄱ ㅋㅋ src/a.js 그럼 어떰?')).toEqual(['국장', '체크', '어떰'])
  const samples = [
    { p: '국장 어떰', k: 'heavy' }, { p: '해외 어떰', k: 'heavy' }, { p: '오늘 장 어떰 ㅋㅋ', k: 'heavy' },
    { p: '좋아 고마워 어떰', k: 'light' },
    { p: '좋아 고마워', k: 'light' }, { p: '오늘 날씨 좋다', k: 'light' },
    { p: '노션 메모 불러와', k: 'search' }, { p: '어제 회의록 불러와', k: 'search' },
    { p: '코드 고쳐줘', k: 'heavy' }, // already heavy by the rules: not a miss
  ]
  const c = wordCandidates(samples)
  expect(c.heavy.map(x => x.word)).toEqual(['어떰'])
  expect(c.heavy[0]).toEqual({ word: '어떰', hits: 3, total: 4 })
  expect(c.search.map(x => x.word)).toEqual(['불러와'])
  expect(c.write).toEqual([])
  // once a word is added it is part of the rules, so it is no longer a candidate
  setExtraWords({ heavy: ['어떰'], search: ['불러와'] })
  expect(ruleOf('국장 어떰')).toBe('heavy')
  expect(taskOf('어제 회의록 불러와')).toBe('search')
  expect(wordCandidates(samples).heavy).toEqual([])
  setExtraWords({})
  expect(ruleOf('국장 어떰')).not.toBe('heavy')
})
