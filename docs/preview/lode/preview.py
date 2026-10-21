#!/usr/bin/env python3
"""The ladder card's preview page (/runner, /monk): what the research found, and the card as the plugin draws it for each
mood (cells.mjs runs lode.js), in blocks and braille. The page frame and the terminal drawing come from
../motion/studio-template.html.

    python3 docs/preview/lode/preview.py <out.html>
"""
import datetime
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# (mood, effort, what it is, when the card shows it, ms per frame, frames)
# (hero, mood, effort, what it is, when the card shows it, ms per frame, frames)
SHOWS = [
    ('runner', 'run', 'high', '사다리 오르기', '응답하는 동안 (high) · 해골 몽크가 뒤쫓아 옴', 80, 200),
    ('runner', 'run', 'max', '쏜살같이', '응답하는 동안 (max: 2.2배, 속도선)', 80, 100),
    ('runner', 'dig', 'high', '레이저로 파기', '명령 실행 · 파일 고치기 · 읽기', 100, 24),
    ('runner', 'sit', 'high', '서서 기다리기', '평소 (가끔 고개를 돌려 화면을 봄)', 150, 40),
    ('runner', 'ask', 'high', '허락 대기', '허락을 기다릴 때', 150, 16),
    ('runner', 'happy', 'high', '금괴 들고 폴짝', '다 했을 때 · 테스트 통과 · 쓰다듬기', 125, 16),
    ('runner', 'sleep', 'high', '졸기', '한참 조용할 때', 175, 28),
    ('runner', 'sad', 'high', '구멍에 빠짐', '실패 · 테스트 실패', 125, 16),
    ('monk', 'run', 'high', '/monk: 해골 수도승이 주인공', '응답하는 동안', 100, 120),
    ('monk', 'dig', 'high', '/monk: 곡괭이질', '명령 실행 · 파일 고치기', 175, 16),
]

BODY = '''<div class="wrap">
  <header style="display:grid;gap:8px">
    <div class="eyebrow">usage-meter · /runner · %%DATE%%</div>
    <h1>가방 멘 런너 (/runner)</h1>
    <p class="lede">테리 카드의 주인공을 <i>Lode Runner: The Legend Returns</i>(1994, MS-DOS)의 주인공처럼 가방을 메고 레이저를 쏘는 런너로 바꾼 화면이에요. 응답하는 동안 오른쪽으로 걷다가 사다리를 만나면 한 층 올라가고, 바닥이 끊긴 곳은 줄에 매달려 건너요. 뒤에서는 빨간 옷의 해골 몽크가 같은 길로 쫓아와요. 카드 · 사용량 표 · 반응(입력, 응답, 끝, 졸기)은 테리와 같아요.</p>
  </header>
  <section class="note">
    <strong>사전 조사</strong>
    <p>'로드런너 2' 로 알려진 건 일본 PS1 의 <i>SuperLite 1500 Series: Lode Runner 2</i>(2000) 이고, 디스크 안은 <i>Lode Runner: The Legend Returns</i>(1994, Presage · Sierra) 와 그 속편이에요. 같은 이름의 1998년 PC 게임 <i>Lode Runner 2</i> 는 비스듬히 내려다보는 3D 풍이라 사다리 화면과 달라요. 해골 캐릭터는 The Legend Returns 의 적 <b>매드 몽크</b>: 빨간 옷(두건)을 입은 해골 수도승이에요. 원작 로드런너의 로봇이 이 게임에서 이렇게 바뀌었어요.</p>
    <p>한 화면짜리 판에 파낼 수 있는 흙 · 벽돌, 못 파는 바위, 사다리, 손으로 잡고 건너는 줄, 금괴가 있어요. 주인공 제이크가 금괴를 다 모으면 문이 열리고, 몽크는 쫓아와요. 레이저로 판 구멍은 15초쯤 뒤 다시 메워지고, 몽크가 빠지면 몇 초 버둥대며 기어 나오고, 들고 있던 금괴를 떨어뜨려요(그 사이 구멍이 메워지면 다른 곳에서 다시 나타남). 끈적이 · 덫 · 곡괭이 · 착암기 · 폭탄 같은 도구도 있어요.</p>
    <p>주인공은 <b>제이크 페릴</b>: 밝은 회색 옷에 검은 머리, 손에 든 레이저로 옆 바닥에 구멍을 파요(1994 리뷰 화면에서 확인). 동료분 기억대로 가방을 멘 모습으로 그렸어요. 2인용 친구 웨스는 파란 옷.</p>
    <p>영상(1994 MS-DOS 플레이)에서 본 대로: 두툼한 형광 연두 잔디 바닥, 가는 흰 사다리, 손으로 잡는 흰 줄, 모으는 보물은 <b>금색 해골</b>, 몸을 숙이고 손을 뻗으며 쫓아오는 빨간 몽크. 레이저로 판 구멍은 잠시 뒤 다시 메워지고, 빠지면 버둥대요. 게임 그림은 가져오지 않았어요: 런너와 몽크는 머리 · 몸통 · 관절 달린 팔다리 뼈대로 새로 짜되 원작 비율(머리가 키의 6분의 1, 가는 몸, 긴 다리)로 맞췄어요(가로 24 · 세로 32점). 런너는 원작처럼 큰 보폭으로 뛰고(8장), 몽크는 둥근 두건 그늘에 얼굴이 묻힌 채 몸을 숙이고 종종걸음해요.</p>
  </section>
  <nav class="toc" id="toc"></nav>
  <div class="row sticky"><button id="play" aria-pressed="true">재생 중</button><button id="slow" aria-pressed="false">4배 느리게</button></div>
  <div id="list" style="display:grid;gap:22px"></div>
  <section class="note">
    <strong>쓰는 법</strong>
    <p><code>/runner</code> 런너로 바꾸기 · <code>/monk</code> 해골 수도승이 주인공 · <code>/terry</code> 테리로 돌아가기 · <code>/runner run max</code>, <code>/runner dig</code> 처럼 /terry 의 미리보기 · 통계 · 메모리 명령을 그대로 써요. 그림 방식을 따로 고르지 않았으면 블록(quad)으로 그려요(옷 · 벽돌이 옛 게임처럼 또렷). <code>/runner braille</code> 로 점자.</p>
  </section>
</div>'''

JS = r'''
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, slow = 1;
const tiles = [];
const unpack = b64 => { const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); const w = new Uint32Array(u8.buffer), out = []; for (let i = 0; i < w.length; i += 3) out.push([w[i], w[i + 1], w[i + 2]]); return out; };
const toc = $('toc'), list = $('list');
DATA.forEach((d, n) => {
  const a = document.createElement('a'); a.href = '#m-' + n; a.textContent = d.label; toc.appendChild(a);
  const s = document.createElement('section'); s.className = 'motion'; s.id = 'm-' + n;
  s.innerHTML = `<div class="rowhead"><h2>${d.label} <small style="color:var(--muted);font-weight:400">· ${d.when}</small></h2></div>`;
  const g = document.createElement('div'); g.className = 'grid cards'; s.appendChild(g);
  for (const mode of ['quad', 'braille']) {
    const f = document.createElement('figure'), cv = document.createElement('canvas'), cap = document.createElement('figcaption');
    cap.textContent = mode === 'quad' ? '블록 (quad, 기본)' : '점자 (braille)'; f.append(cv, cap); g.appendChild(f);
    tiles.push({ cv, mode, card: d.cards, frames: d.cards[mode].map(unpack), key: -1 });
  }
  list.appendChild(s);
});
let clock = 0, last = performance.now();
function paintAll(force) {
  for (const p of tiles) {
    const n = p.frames.length, i = ((Math.floor(clock / p.card.step) % n) + n) % n;
    if (!force && p.key === i) continue;
    p.key = i;
    paintCells(p.cv, p.frames[i], p.card.cols, p.card.rows, p.mode);
  }
}
function tick(now) { const dt = now - last; last = now; if (playing) { clock += dt / slow; paintAll(false); } requestAnimationFrame(tick); }
paintAll(true); requestAnimationFrame(tick);
const sync = () => { $('play').setAttribute('aria-pressed', playing); $('play').textContent = playing ? '재생 중' : '멈춤'; $('slow').setAttribute('aria-pressed', slow > 1); };
$('play').onclick = () => { playing = !playing; sync(); };
$('slow').onclick = () => { slow = slow > 1 ? 1 : 4; sync(); };
sync();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => paintAll(true));
'''

CSS = '''<style>
.grid.cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 560px) { .grid.cards { grid-template-columns: minmax(0, 1fr); } }
.note p { margin: 0; }
.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; }
</style>'''


def cells(hero, mood, effort, step, count):
    out = subprocess.run(['node', str(HERE / 'cells.mjs'), hero, mood, effort, str(step), str(count), '0'],
                         capture_output=True, text=True, check=True, cwd=HERE).stdout
    return json.loads(out)


def main():
    tpl = (HERE.parent / 'motion' / 'studio-template.html').read_text(encoding='utf-8')
    keys = json.loads((HERE.parent / 'terry-editor-data.json').read_text(encoding='utf-8'))['keys']
    data = [{'label': label, 'when': when, 'cards': cells(h, m, e, step, count)} for h, m, e, label, when, step, count in SHOWS]
    html = (tpl.replace('%%BODY%%', CSS + BODY.replace('%%DATE%%', datetime.date.today().isoformat()))
            .replace('%%KEYS%%', json.dumps({k: v for k, v in keys.items() if len(k) == 1}))
            .replace('%%DATA%%', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
            .replace('%%JS%%', JS))
    html = html.replace('<title>Terry 모션 모음</title>', '<title>가방 멘 런너</title>')
    Path(sys.argv[1]).write_text(html, encoding='utf-8')
    print(f'{len(data)}개 장면, {len(html) // 1024}KB')


if __name__ == '__main__':
    main()
