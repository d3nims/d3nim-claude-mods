"""테리 모션 모음: 모든 동작을 한 페이지에서 '지금 카드'와 '새 안'으로 나란히 보는 페이지를 만든다.

  python3 docs/preview/motion/studio.py <out.html>

- 지금: 배포된 판(RELEASED 커밋)의 terry-edits.json 장과 terrier-frames.json 장 시간 (카드와 같은 박자)
- 새 안: proposals.json 에 동작의 새 장이 있으면 그것, 없으면 지금 저장소의 terry-edits.json(채택한 안은 여기 들어 있다),
  숨쉬기 규칙(motion-rules.json)이 있으면 숨까지 얹어서
- AI 초안: proposals.json 의 ai (PixelLab, Retro Diffusion 이 뽑은 장을 ai.py 로 테리 격자에 옮긴 것)
페이지 틀과 카드 그리기는 studio-template.html (render.js 를 옮긴 것). 색은 편집기 팔레트(terry-editor-data.json)를 그대로 쓴다.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from breath import breath_pair  # noqa: E402
import propose  # noqa: E402

RELEASED = '6127bc0'   # usage-meter 1.2.22

ORDER = [
    ('walk', '걷기', '작업 중 (보통 노력)'), ('run', '달리기', '작업 중 (높은 노력) · 물어 오기'),
    ('sniff', '킁킁', '파일 읽기·찾기'), ('dig', '땅 파기', '명령 실행·파일 고치기'),
    ('wag', '꼬리 흔들기', '입력하는 걸 보는 중'), ('sit', '앉아서 기다리기', '기다리는 중'),
    ('ask', '허락 대기', '허락을 기다릴 때'), ('pant', '헥헥', '다 했어요'), ('bark', '짖기', '알림'),
    ('sad', '시무룩', '실패'), ('droop', '귀 처짐', '테스트 실패'), ('sleep', '졸기', '오래 쉴 때'),
    ('pet', '쓰다듬기', '/terry pet'), ('door', '문 앞 대기', '한도가 풀리길 기다릴 때'),
    ('eat', '밥 먹기', '저녁 시간'), ('jump', '원반 잡기', '테스트 통과'), ('stretch', '기지개', '하루 첫 입력'),
    ('fly', '날기 (MAX)', '노력 max 로 작업 중'),
]
STATUS = {
    'applied': '카드에 넣음 (커밋 전)', 'ready': '카드에 넣음 · 봐 주세요', 'draft': 'AI 초안만', 'todo': '할 차례', 'ok': '그대로 괜찮음',
}


def frames_of(edits, name):
    return [edits[name][k] for k in sorted(edits[name], key=int)]


def released(name):
    return json.loads(subprocess.run(['git', 'show', f'{RELEASED}:docs/preview/{name}'], cwd=HERE, capture_output=True,
                                     text=True, encoding='utf-8', check=True).stdout)


def card_cells(dir, mood, effort, step=60, count=17):
    """카드 그대로(망토·구름·바람까지) dir 의 render.js 로 그린 칸들 (card-cells.mjs)"""
    out = subprocess.run(['node', str(HERE / 'card-cells.mjs'), str(dir), mood, effort, str(step), str(count)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def released_card(mood, effort):
    with tempfile.TemporaryDirectory() as tmp:
        for f in ('render.js', 'terrier-data.js'):
            src = subprocess.run(['git', 'show', f'{RELEASED}:plugins/usage-meter/hooks/{f}'], cwd=HERE, capture_output=True,
                                 text=True, encoding='utf-8', check=True).stdout
            Path(tmp, f).write_text(src, encoding='utf-8')
        return card_cells(tmp, mood, effort)


def build():
    edits = json.loads((HERE.parent / 'terry-edits.json').read_text(encoding='utf-8'))
    card = json.loads((HERE.parent / 'terrier-frames.json').read_text(encoding='utf-8'))['sets']
    old_edits, old_card = released('terry-edits.json'), released('terrier-frames.json')['sets']
    rules = json.loads((HERE / 'motion-rules.json').read_text(encoding='utf-8'))['breath']
    props = json.loads((HERE / 'proposals.json').read_text(encoding='utf-8'))
    out = []
    for name, label, when in ORDER:
        p = props.get(name, {})
        if name == 'fly':   # 1.2.19 held the run's frame 0 (망토·바람은 카드만 그린다)
            item = {'name': name, 'label': label, 'when': when, 'status': p.get('status', 'todo'), 'note': p.get('note', ''),
                    'cur': {'frames': [old_edits['run']['0']], 'ms': [1000]}, 'new': {'frames': [propose.fly()], 'ms': [1000]}, 'ai': [],
                    'cards': {'cur': released_card('run', 'max'), 'new': card_cells(HERE.parents[2] / 'plugins/usage-meter/hooks', 'run', 'max')}}
            out.append(item)
            continue
        cur_frames = frames_of(old_edits, name)
        cur_ms = old_card[name]['durations']
        item = {'name': name, 'label': label, 'when': when, 'status': p.get('status', 'todo'),
                'note': p.get('note', ''), 'cur': {'frames': cur_frames, 'ms': cur_ms}, 'new': None, 'ai': p.get('ai', [])}
        new_frames = p.get('frames') or frames_of(edits, name)
        new_ms = p.get('ms') or card[name]['durations']
        if name in rules:
            b = rules[name]
            src = [new_frames[i % 4] for i in range(len(new_frames))] if name == 'sit' else new_frames
            pairs = [breath_pair(b, f, edits) for f in src]
            phase = card[name]['breath']
            item['new'] = {'frames': [[''.join(r) for r in a] for a, _ in pairs], 'ms': new_ms,
                           'breath': {'ms': phase['ms'], 'from': phase['from'], 'to': phase['to'],
                                      'frames': [[''.join(r) for r in c] for _, c in pairs]}}
        elif new_frames != cur_frames or new_ms != cur_ms:
            item['new'] = {'frames': new_frames, 'ms': new_ms}
        out.append(item)
    return out


BODY = '''<div class="wrap">
  <header style="display:grid;gap:8px">
    <div class="eyebrow">terry motion studio · %%DATE%%</div>
    <h1>Terry 모션 모음</h1>
    <p class="lede">카드의 모든 동작을 한곳에서 봐요. 동작마다 왼쪽 두 칸이 지금 카드(1.2.19), 오른쪽 두 칸이 새 안이에요. 새 안은 실제 개의 움직임과 AI 생성기 초안을 재서 만든 규칙으로 고쳐요. AI 초안이 있으면 그 아래에 같이 보여요.</p>
  </header>
  <nav class="toc" id="toc"></nav>
  <div class="row sticky"><button id="play" aria-pressed="true">재생 중</button><button id="slow" aria-pressed="false">4배 느리게</button><button id="big" aria-pressed="false">도트로 크게 보기</button></div>
  <div id="list" style="display:grid;gap:28px"></div>
  <div class="note"><b>보는 법</b><p>점자와 quad 는 카드 그리기를 그대로 옮긴 것이라 터미널에서 보이는 모양과 같아요. '도트로 크게 보기'는 점 하나하나를 보여 줘요. 움직임이 빠른 동작은 '4배 느리게'로 보면 장마다 무엇이 바뀌는지 잘 보여요.</p></div>
</div>
<style>
.toc { display: flex; flex-wrap: wrap; gap: 6px; }
.toc a { font-size: .8rem; text-decoration: none; color: var(--fg); border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; background: var(--panel); display: inline-flex; gap: 6px; align-items: center; }
.toc a i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.sticky { position: sticky; top: 0; z-index: 2; background: var(--bg); padding-block: 8px; }
.tag { font-size: .74rem; border-radius: 999px; padding: 1px 8px; border: 1px solid currentColor; white-space: nowrap; }
.st-applied { color: var(--accent); } .st-ready { color: var(--warn); } .st-draft { color: var(--warn); } .st-todo { color: var(--muted); } .st-ok { color: var(--muted); }
.dot-applied { background: var(--accent); } .dot-ready, .dot-draft { background: var(--warn); } .dot-todo, .dot-ok { background: var(--line); }
.motion { display: grid; gap: 10px; scroll-margin-top: 56px; }
.motion .why { color: var(--muted); font-size: .88rem; max-width: 80ch; }
.empty { display: grid; place-items: center; color: var(--muted); font-size: .84rem; border: 1px dashed var(--line); border-radius: 10px; min-height: 80px; }
.ai { display: grid; gap: 6px; }
.ai h3 { font-size: .82rem; margin: 0; color: var(--muted); font-weight: 500; }
.ai .grid figure canvas { background: var(--stage); }
.grid.cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 560px) { .grid.cards { grid-template-columns: minmax(0, 1fr); } }
</style>
'''

JS = r'''
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, slow = 1, big = false;
const frameAt = (ms, t) => { const total = ms.reduce((a, b) => a + b, 0); let m = t % total; for (let i = 0; i < ms.length; i++) { if (m < ms[i]) return i; m -= ms[i]; } return 0; };
const altOn = (b, t) => { const ph = (t % b.ms) / b.ms; return ph >= b.from && ph < b.to; };
const STATUS = %%STATUS%%;
const tiles = [];
const fig = (parent, label, src, mode) => {
  const f = document.createElement('figure'), cv = document.createElement('canvas'), cap = document.createElement('figcaption');
  cap.textContent = label; f.append(cv, cap); parent.appendChild(f);
  tiles.push({ cv, src, mode, key: '' });
};
const toc = $('toc'), list = $('list');
for (const d of DATA) {
  const a = document.createElement('a'); a.href = '#m-' + d.name;
  a.innerHTML = `<i class="dot-${d.status}"></i>${d.label}`; toc.appendChild(a);
  const s = document.createElement('section'); s.className = 'motion'; s.id = 'm-' + d.name;
  s.innerHTML = `<div class="rowhead"><h2>${d.label} <small style="color:var(--muted);font-weight:400">· ${d.when}</small></h2><span class="tag st-${d.status}">${STATUS[d.status]}</span></div>` + (d.note ? `<p class="why">${d.note}</p>` : '');
  const g = document.createElement('div'); g.className = 'grid'; s.appendChild(g);
  fig(g, '지금 · 점자', d.cur, 'braille'); fig(g, '지금 · quad', d.cur, 'quad');
  if (d.new) { fig(g, '새 안 · 점자', d.new, 'braille'); fig(g, '새 안 · quad', d.new, 'quad'); }
  else { const e = document.createElement('div'); e.className = 'empty'; e.style.gridColumn = 'span 2'; e.textContent = '새 안 아직 없음'; g.appendChild(e); }
  if (d.cards) {
    const box = document.createElement('div'); box.className = 'ai';
    box.innerHTML = '<h3>카드 그대로 (망토 · 구름 · 바람까지, 플러그인이 그리는 그대로)</h3>';
    const cg = document.createElement('div'); cg.className = 'grid cards'; box.appendChild(cg);
    for (const [k, who] of [['cur', '지금 카드'], ['new', '새 카드']]) for (const mode of ['braille', 'quad'])
      fig(cg, who + ' · ' + (mode === 'braille' ? '점자' : 'quad'), { card: d.cards[k], mode }, mode);
    s.appendChild(box);
  }
  for (const ai of d.ai || []) {
    const box = document.createElement('div'); box.className = 'ai';
    box.innerHTML = `<h3>AI 초안 · ${ai.by} · ${ai.what}</h3>`;
    const ag = document.createElement('div'); ag.className = 'grid'; box.appendChild(ag);
    const src = { frames: ai.frames, ms: ai.frames.map(() => ai.ms) };
    fig(ag, '초안 · 점자', src, 'braille'); fig(ag, '초안 · quad', src, 'quad');
    s.appendChild(box);
  }
  list.appendChild(s);
}
let clock = 0, last = performance.now();
function paintAll(force) {
  for (const p of tiles) {
    if (p.src.card) {
      const c = p.src.card, n = c[p.mode].length, i = ((Math.floor(clock / c.step) % n) + n) % n;   // (the first frame's clock can be a little below 0)
      if (!force && p.key === i) continue;
      p.key = i;
      const flat = c[p.mode][i], cells = [];
      for (let k = 0; k < flat.length; k += 3) cells.push([flat[k], flat[k + 1], flat[k + 2]]);
      paintCells(p.cv, cells, c.cols, c.rows, p.mode);
      continue;
    }
    const i = frameAt(p.src.ms, clock);
    const alt = p.src.breath && altOn(p.src.breath, clock);
    const rows = alt ? p.src.breath.frames[i] : p.src.frames[i];
    const key = i + '|' + alt + '|' + big;
    if (!force && key === p.key) continue;
    p.key = key;
    if (big) drawDots(p.cv, rows, 5); else drawCells(p.cv, rows, p.mode);
  }
}
function tick(now) {
  const dt = now - last; last = now;
  if (playing) { clock += dt / slow; paintAll(false); }
  requestAnimationFrame(tick);
}
paintAll(true); requestAnimationFrame(tick);
const sync = () => { $('play').setAttribute('aria-pressed', playing); $('play').textContent = playing ? '재생 중' : '멈춤'; $('slow').setAttribute('aria-pressed', slow > 1); $('big').setAttribute('aria-pressed', big); };
$('play').onclick = () => { playing = !playing; sync(); };
$('slow').onclick = () => { slow = slow > 1 ? 1 : 4; sync(); };
$('big').onclick = () => { big = !big; sync(); paintAll(true); };
sync();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => paintAll(true));
'''


def main():
    import datetime
    tpl = (HERE / 'studio-template.html').read_text(encoding='utf-8')
    data = build()
    keys = json.loads((HERE.parent / 'terry-editor-data.json').read_text(encoding='utf-8'))['keys']
    html = (tpl.replace('%%BODY%%', BODY.replace('%%DATE%%', datetime.date.today().isoformat()))
            .replace('%%KEYS%%', json.dumps({k: v for k, v in keys.items() if len(k) == 1}))
            .replace('%%DATA%%', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
            .replace('%%JS%%', JS.replace('%%STATUS%%', json.dumps(STATUS, ensure_ascii=False))))
    Path(sys.argv[1]).write_text(html, encoding='utf-8')
    print(f'{len(data)}개 동작, {len(html) // 1024}KB')


if __name__ == '__main__':
    main()
