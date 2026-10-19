#!/usr/bin/env python3
"""테리 동작을 숫자로 잰다: 프레임마다 몸의 기준점(코·눈·머리 꼭대기·등선·꼬리 끝·땅에 닿은 발)을 찾고,
동작마다 얼마나 움직이는지, 한 장 사이에 튀는지, 머리·꼬리가 몸보다 늦게 따라오는지(겹침 동작)를 본다.

  python3 docs/preview/motion/measure.py [terry-edits.json] [동작 ...]   → 표
  python3 docs/preview/motion/measure.py --json ...                       → 기준점·요약 JSON
  python3 docs/preview/motion/measure.py --breath                          → 숨쉬는 장면을 검사기로 (motion-rules.json)

캐릭터는 오른쪽을 본다. 'N' 이 코, 코 왼쪽의 'E' 가 눈 (눈 감은 장면은 눈 없음).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('check_sprite', HERE.parent / 'check-sprite.py')
cs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cs)

# 처음과 끝이 이어지는 동작 (한 번 하고 끝나는 기지개·원반·짖기는 이음매를 보지 않는다)
LOOPS = {'walk', 'run', 'pant', 'sleep', 'sit', 'wag', 'sniff', 'dig', 'ask', 'sad', 'droop', 'pet', 'door', 'eat'}


def points(rows):
    """한 장의 기준점 (없으면 None)"""
    m = cs.main_component(cs.mask_of(rows))
    cells = [(y, x) for y, r in enumerate(m) for x, v in enumerate(r) if v]
    if not cells:
        return None
    f = cs.features(rows)
    ground = max(y for y, _ in cells)
    nose = [(y, x) for y, x in cells if rows[y][x] == 'N']
    nx = sum(x for _, x in nose) / len(nose) if nose else max(x for _, x in cells)
    ny = sum(y for y, _ in nose) / len(nose) if nose else min(y for y, x in cells if x >= nx - 1)
    eye = [(y, x) for y, x in cells if rows[y][x] == 'E' and nx - 12 <= x < nx - 1]
    head = [(y, x) for y, x in cells if x >= nx - 12]
    left = min(x for _, x in cells)
    tail = [y for y, x in cells if x == left]
    # 몸통 윗선: 몸통으로 잡힌 줄 중 가장 위 (check-sprite 의 features 와 같은 방식)
    wide = [y for y in range(len(m)) if any(e - s + 1 >= cs.BODY_RUN for s, e in cs.runs(m[y]))]
    back = min(wide) if wide else None
    body = [x for y, x in cells if back is not None and back <= y <= back + 4]
    feet = cs.runs(m[ground])
    return {
        'nose': (round(nx, 1), round(ny, 1)),
        'eye': (round(sum(x for _, x in eye) / len(eye), 1), round(sum(y for y, _ in eye) / len(eye), 1)) if eye else None,
        'head_top': min(y for y, _ in head),
        'back': back,
        'body_x': round(sum(body) / len(body), 1) if body else None,
        'tail': (left, round(sum(tail) / len(tail), 1)),
        'feet': len(feet),
        'area': f['area'] if f else len(cells),
    }


def series(frames, key, axis=None):
    out = []
    for p in frames:
        v = p and p[key]
        out.append(None if v is None else (v[axis] if axis is not None else v))
    return out


def steps(vals, loop):
    pairs = list(zip(vals, vals[1:])) + ([(vals[-1], vals[0])] if loop else [])
    return [round(b - a, 1) for a, b in pairs if a is not None and b is not None]


def flicker(vals, loop):
    """한 장만 1칸 갔다가 바로 돌아오는 떨림 (A B A, |B-A| 가 1 이하인데 앞뒤가 같음)"""
    n = len(vals)
    idx = range(n) if loop else range(1, n - 1)
    out = 0
    for i in idx:
        a, b, c = vals[i - 1], vals[i], vals[(i + 1) % n]
        if None not in (a, b, c) and a == c and 0 < abs(b - a) <= 1:
            out += 1
    return out


def lag(lead, follow):
    """follow 가 lead 를 몇 장 늦게 따라가나 (순환 상관이 가장 큰 밀림). 둘 중 하나가 안 움직이면 None"""
    pairs = [(a, b) for a, b in zip(lead, follow) if a is not None and b is not None]
    if len(pairs) < 3:
        return None
    la, fo = [a for a, _ in pairs], [b for _, b in pairs]
    if max(la) == min(la) or max(fo) == min(fo):
        return None
    ma, mf = sum(la) / len(la), sum(fo) / len(fo)
    n = len(la)
    best = max(range(n), key=lambda s: sum((la[i] - ma) * (fo[(i + s) % n] - mf) for i in range(n)))
    return best if best <= n // 2 else best - n


def summary(name, frames_rows):
    pts = [points(r) for r in frames_rows]
    loop = name in LOOPS
    s = {'frames': len(pts)}
    tracks = {
        'nose_y': series(pts, 'nose', 1), 'nose_x': series(pts, 'nose', 0), 'head_top': series(pts, 'head_top'),
        'back': series(pts, 'back'), 'body_x': series(pts, 'body_x'), 'tail_y': series(pts, 'tail', 1), 'tail_x': series(pts, 'tail', 0),
    }
    for k, v in tracks.items():
        vv = [x for x in v if x is not None]
        st = steps(v, loop)
        s[k] = {'range': round(max(vv) - min(vv), 1) if vv else None, 'max_step': max((abs(x) for x in st), default=0), 'flicker': flicker(v, loop)}
        if loop and len(v) > 1 and v[0] is not None and v[-1] is not None:
            s[k]['seam'] = round(v[0] - v[-1], 1)
    s['head_lag'] = lag(tracks['back'], tracks['nose_y'])
    s['tail_lag'] = lag(tracks['back'], tracks['tail_y'])
    areas = [p['area'] for p in pts if p]
    s['area_wobble'] = round((max(areas) - min(areas)) / max(areas), 3) if areas else None
    s['feet'] = [p['feet'] if p else None for p in pts]
    return s, pts, tracks


def breath_check(path):
    """motion-rules.json 의 숨쉬기 두 장(쉬는 장, 다른 숨의 장, breath.py)을 모든 장에 만들어 검사기에 넣는다"""
    import subprocess, tempfile
    sys.path.insert(0, str(HERE))
    from breath import breath_pair
    d = cs.load(path)
    edits = json.loads(Path(path).read_text(encoding='utf-8'))
    rules = json.loads((HERE / 'motion-rules.json').read_text(encoding='utf-8'))['breath']
    out = {}
    for name, b in rules.items():
        if name.startswith('_') or name not in d:
            continue
        out[name] = {}
        for k, f in d[name].items():
            base, alt = breath_pair(b, f, edits)
            out[name][k] = [''.join(r) for r in base]
            out[name][str(100 + int(k))] = [''.join(r) for r in alt]
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as t:
        json.dump(out, t)
    sys.exit(subprocess.run([sys.executable, str(HERE.parent / 'check-sprite.py'), 'check', t.name]).returncode)


def main():
    if '--breath' in sys.argv:
        return breath_check(str(HERE.parent / 'terry-edits.json'))
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = args[0] if args and args[0].endswith('.json') else str(HERE.parent / 'terry-edits.json')
    names = [a for a in args if not a.endswith('.json')]
    d = cs.load(path)
    out = {}
    for name in names or list(d):
        rows = [d[name][k] for k in sorted(d[name], key=int)]
        out[name] = summary(name, rows)
    if '--json' in sys.argv:
        print(json.dumps({k: {'summary': v[0], 'points': v[1], 'tracks': v[2]} for k, v in out.items()}, ensure_ascii=False))
        return
    print(f"{'동작':8} {'장':>2} | {'코↕':>4} {'머리↕':>5} {'등↕':>4} {'꼬리↕':>5} {'꼬리↔':>5} | {'최대한장':>6} {'떨림':>4} | {'머리늦음':>6} {'꼬리늦음':>6} | 면적흔들림")
    for name, (s, _, _) in out.items():
        mx = max(s[k]['max_step'] for k in ('nose_y', 'head_top', 'back', 'tail_y'))
        fl = sum(s[k]['flicker'] for k in ('nose_y', 'head_top', 'back', 'tail_y', 'tail_x'))
        r = lambda k: '-' if s[k]['range'] is None else f"{s[k]['range']:g}"
        lg = lambda v: '-' if v is None else str(v)
        print(f"{name:8} {s['frames']:>2} | {r('nose_y'):>4} {r('head_top'):>5} {r('back'):>4} {r('tail_y'):>5} {r('tail_x'):>5} | {mx:>6g} {fl:>4} | {lg(s['head_lag']):>6} {lg(s['tail_lag']):>6} | {s['area_wobble']}")


if __name__ == '__main__':
    main()
