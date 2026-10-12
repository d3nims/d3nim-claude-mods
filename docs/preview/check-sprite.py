#!/usr/bin/env python3
"""도트 애니메이션 자동 검사기: 사람 눈 대신 숫자로, 테리를 고칠 때 반복해서 나온 문제를 잡는다.

  - 목 혹 · 목 꺾임: 머리~목 줄의 뒤쪽(왼쪽) 윤곽이 몇 줄만 툭 튀어나오거나 들어감
  - 목 앞·가슴 파임/혹: 턱 아래부터 가슴까지 앞쪽(오른쪽) 윤곽이 몇 줄만 들어가거나 튀어나옴
  - 배 처짐/파임: 다리 사이 밑선이 몇 칸만 처지거나 들어감
  - 등 혹: 몸통 위쪽 윤곽이 몇 칸만 툭 솟음
  - 엉덩이 튀어나옴: 몸통 아래쪽 뒤끝이 뒷다리가 시작되는 곳보다 너무 뒤에 있음 (다리 뒤로 몸 덩어리가 남음)
  - 다리 얇음: 다리 굵기가 기준보다 가늚
  - 다리 굵기 급변: 한 다리가 바로 아래 줄에서 갑자기 굵어지거나 가늘어짐 (관절이 어색함)
  - 크기 흔들림: 같은 동작의 프레임끼리 몸 면적이 크게 다름 (움직이기만 해야 하는데 몸이 변함)

기준값(얼마나 튀어야 문제인지, 다리가 얼마나 가늘면 문제인지)은 완성된 테리에서 뽑는다:
  python3 check-sprite.py learn terry-edits.json            → sprite-rules.json
  python3 check-sprite.py check <프레임 파일> [--rules sprite-rules.json | --generic] [--show 동작:프레임]
  (--generic: 완성본 없이 개라면 지켜야 할 일반 값으로 검사. 새 캐릭터나 다른 견종용)

프레임 파일은 두 형식을 읽는다: terry-edits.json ({동작: {프레임: [줄...]}}) 과 빌드 결과 terrier-frames.json
({sets: {동작: {frames: [[줄...]]}}}). '.' 이 빈칸, 나머지는 몸. 캐릭터는 오른쪽을 본다고 가정한다.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 네 다리로 서는 동작 (앉기·엎드리기·자기 같은 동작은 다리가 접혀 있어 다리 검사를 하지 않는다)
LEG_SETS = {'walk', 'run', 'trot', 'gallop', 'pant', 'bark', 'sniff', 'eat', 'droop', 'jump', 'stretch'}
RUMP_SETS = {'walk', 'trot', 'pant', 'bark', 'droop'}  # 다리를 몸 아래 두고 서거나 걷는 동작 (엉덩이 검사용)
BODY_RUN = 14  # 이 폭 이상 이어진 줄을 몸통으로 본다
MOUTH = set('TtMP')  # 혀·입: 앞선(턱 아래) 윤곽으로 치지 않는다


def load(path):
    d = json.loads(Path(path).read_text(encoding='utf-8'))
    if 'sets' in d:
        return {name: {str(i): f for i, f in enumerate(s['frames'])} for name, s in d['sets'].items()}
    return d


def mask_of(rows):
    return [[ch != '.' for ch in r] for r in rows]


def main_component(m):
    """가장 큰 덩어리만 (속도선·먼지·Zzz 같은 효과는 뺀다)"""
    h, w = len(m), len(m[0])
    seen = [[False] * w for _ in range(h)]
    best = []
    for y in range(h):
        for x in range(w):
            if m[y][x] and not seen[y][x]:
                comp, stack = [], [(y, x)]
                seen[y][x] = True
                while stack:
                    cy, cx = stack.pop()
                    comp.append((cy, cx))
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((ny, nx))
                if len(comp) > len(best):
                    best = comp
    out = [[False] * w for _ in range(h)]
    for y, x in best:
        out[y][x] = True
    return out


def runs(row):
    """한 줄의 칠해진 구간들 [(시작, 끝)] (끝 포함)"""
    out, start = [], None
    for x, v in enumerate(row + [False]):
        if v and start is None:
            start = x
        elif not v and start is not None:
            out.append((start, x - 1))
            start = None
    return out


def bumps(profile, sign):
    """윤곽 줄(profile: 위치 목록, None 은 없음)에서 짧게 툭 튀어나온 곳: 앞뒤 줄을 이은 선보다 sign 방향으로 얼마나 나왔나.
    1~4줄짜리 구간만 본다 (더 길면 원래 생김새). [(시작 인덱스, 끝 인덱스, 튀어나온 칸)]"""
    out = []
    n = len(profile)
    for i in range(1, n - 1):
        for j in range(i, min(n - 1, i + 4)):
            a, b = profile[i - 1], profile[j + 1]
            seg = profile[i:j + 1]
            if a is None or b is None or any(v is None for v in seg):
                continue
            worst = 0
            for k, v in enumerate(seg):
                line = a + (b - a) * (k + 1) / (j - i + 2)
                d = (line - v) * sign
                if d <= 0:
                    worst = 0
                    break
                worst = max(worst, d) if k else d
            # 구간 전체가 선보다 나와 있어야 '혹': 가장 덜 나온 곳 기준
            if worst > 0:
                least = min((a + (b - a) * (k + 1) / (j - i + 2) - v) * sign for k, v in enumerate(seg))
                if least >= 1:
                    out.append((i, j, round(least, 1)))
    # 겹치는 구간은 가장 크게 튀어나온 것 하나만
    out.sort(key=lambda t: -t[2])
    kept = []
    for t in out:
        if all(t[1] < k[0] or t[0] > k[1] for k in kept):
            kept.append(t)
    return kept


def features(rows):
    m = main_component(mask_of(rows))
    h = len(m)
    filled = [y for y in range(h) if any(m[y])]
    if not filled:
        return None
    top, bottom = filled[0], filled[-1]
    wide = [y for y in range(h) if any(e - s + 1 >= BODY_RUN for s, e in runs(m[y]))]
    # 머리가 큰 캐릭터는 머리 줄도 넓다: 넓은 줄이 이어진 덩어리 중 가장 큰 것(몸통)만
    blocks = []
    for y in wide:
        if blocks and y == blocks[-1][-1] + 1:
            blocks[-1].append(y)
        else:
            blocks.append([y])
    if blocks:
        wide = max(blocks, key=lambda b: sum(max(e - s + 1 for s, e in runs(m[y])) for y in b))
    body_top = wide[0] if wide else bottom
    belly = wide[-1] if wide else bottom
    f = {'area': sum(map(sum, m)), 'neck': [], 'front': [], 'belly': [], 'back': [], 'legs': [], 'leg_jumps': [], 'rump': None}

    # 목: 머리 꼭대기의 가장 오른쪽 구간부터 아래로, 겹치는 구간을 따라가며 왼쪽 윤곽을 잰다.
    # 왼쪽 끝이 한 줄에 4칸 넘게 튀면 몸통 등선에 닿은 것이라 멈춘다. 최대 16줄 (머리 + 목)
    # 선 귀(코기·시바)는 머리 위로 좁게 솟아 귀 밑이 원래 오목하다: 머리 폭(6칸)이 되는 줄부터 잰다
    neck_rows, left = [], []
    start = top
    while start < bottom and max(e - s + 1 for s, e in runs(m[start])) < 6:
        start += 1
    if start - top > 8:  # 머리가 그렇게 좁을 리 없다: 귀가 아니라 다른 것 (꼬리를 든 동작 등) 이면 위에서부터
        start = top
    cur = max(runs(m[start]), key=lambda r: r[1])
    for y in range(start, min(h, start + 16)):
        if y > start:
            over = [r for r in runs(m[y]) if r[0] <= cur[1] and r[1] >= cur[0]]
            if not over or cur[0] - over[0][0] > 4 or (wide and y >= wide[0]):
                break  # 몸통 등선에 닿음 (목과 등이 만나는 모서리는 꺾임이 아니다)
            cur = over[0]  # 뒷목을 따라가야 하니 겹치는 구간 중 왼쪽 것 (오른쪽은 턱·혀로 갈라진다)
        neck_rows.append(y)
        left.append(cur[0])
    for i, j, size in bumps(left, +1):
        f['neck'].append({'rows': [neck_rows[i], neck_rows[j]], 'size': size, 'kind': '혹 (뒤로 튀어나옴)'})
    for i, j, size in bumps(left, -1):
        f['neck'].append({'rows': [neck_rows[i], neck_rows[j]], 'size': size, 'kind': '꺾임 (안으로 파임)'})

    # 앞선: 턱 아래(목 앞)부터 가슴까지 오른쪽 윤곽. 턱 끝에서 목으로 꺾이는 곳(오른쪽 끝이 한 줄에 2칸 넘게 물러나는
    # 마지막 줄)부터 재야 턱 끝을 파임으로 읽지 않는다. 혀가 늘어진 줄은 혀를 빼고 본다
    right = []
    for y in range(h):
        xs = [x for x in range(len(m[y])) if m[y][x] and rows[y][x] not in MOUTH]
        right.append(xs[-1] if xs else None)
    jaw = None
    for y in range(top, min(belly, top + 18)):
        if right[y] is not None and right[y + 1] is not None and right[y] - right[y + 1] >= 2:
            jaw = y + 1
    # 가슴 아래에서 앞다리·앞발이 앞으로 뻗으면(오른쪽 끝이 한 줄에 3칸 넘게 나감) 거기까지만 (기지개·엎드리기)
    end = belly
    if jaw is not None:
        for y in range(jaw, belly):
            if right[y] is not None and right[y + 1] is not None and right[y + 1] - right[y] >= 3:
                end = y
                break
    if jaw is not None and end - jaw >= 4:
        front_rows = list(range(jaw, end + 1))
        front = [right[y] for y in front_rows]
        for i, j, size in bumps(front, +1):
            f['front'].append({'rows': [front_rows[i], front_rows[j]], 'size': size, 'kind': '파임 (안으로 들어감)'})
        for i, j, size in bumps(front, -1):
            f['front'].append({'rows': [front_rows[i], front_rows[j]], 'size': size, 'kind': '혹 (앞으로 튀어나옴)'})

    # 배: 몸통 가장 넓은 줄 아래로 이어지는 밑선. 다리가 시작되는 칸(2줄 넘게 내려가는 칸)은 빼고 다리 사이만 본다
    if wide:
        s, e = max(runs(m[belly]), key=lambda r: r[1] - r[0])
        cols, under = list(range(s, e + 1)), []
        for x in cols:
            y = belly
            while y + 1 < h and m[y + 1][x]:
                y += 1
            under.append(y if y - belly <= 2 else None)
        # 다리와 맞닿은 칸은 사타구니 모서리라 뺀다
        under = [None if v is not None and ((i and under[i - 1] is None) or (i + 1 < len(under) and under[i + 1] is None)) else v
                 for i, v in enumerate(under)]
        for i, j, size in bumps(under, -1):
            f['belly'].append({'cols': [cols[i], cols[j]], 'size': size, 'kind': '처짐 (아래로 튀어나옴)'})
        for i, j, size in bumps(under, +1):
            f['belly'].append({'cols': [cols[i], cols[j]], 'size': size, 'kind': '파임 (위로 들어감)'})

    # 등: 몸통 줄의 가장 넓은 구간 위에서, 위쪽 윤곽 (꼬리 쪽 3칸과 목 쪽은 뺀다)
    if wide:
        s, e = max(runs(m[body_top]), key=lambda r: r[1] - r[0])
        cols = list(range(s + 3, e - 2))
        topline = []
        for x in cols:
            ys = [y for y in range(body_top - 3, belly + 1) if 0 <= y < h and m[y][x]]
            topline.append(ys[0] if ys else None)
        for i, j, size in bumps(topline, +1):
            f['back'].append({'cols': [cols[i], cols[j]], 'size': size})

    # 엉덩이: 몸통 아래쪽 절반의 뒤끝(꼬리가 붙는 위쪽은 뺀다)이 배 바로 아래 두 줄의 뒤끝(뒷다리)보다 몇 칸 뒤에 있나
    if wide:
        # 한 줄짜리 털 삐침 하나로 정하지 않게 두 번째로 뒤에 있는 줄
        lefts = sorted(runs(m[y])[0][0] for y in range((body_top + belly) // 2, belly + 1))
        rear = lefts[1] if len(lefts) > 1 else lefts[0]
        under_rows = [runs(m[y]) for y in (belly + 1, belly + 2) if y < h and runs(m[y])]
        if under_rows:
            f['rump'] = min(r[0][0] for r in under_rows) - rear

    # 다리: 배 아래 줄들의 구간을 위에서 아래로 이어 다리 하나씩 따라간다 (발끝 2줄은 빼고 굵기를 본다)
    # 옆에서 본 다리는 앞뒤 다리가 겹쳤다 갈라진다: 두 다리가 합쳐지거나 한 다리가 갈라지는 줄에서는 그 다리를 끝내고 새로 센다
    legs, open_ = [], []  # 각 다리: [(y, 시작, 끝)]
    for y in range(belly + 1, bottom + 1):
        rs = runs(m[y])
        nxt = []
        for s, e in rs:
            prev = [lg for lg in open_ if s <= lg[-1][2] and e >= lg[-1][1]]
            if len(prev) == 1 and sum(1 for s2, e2 in rs if s2 <= prev[0][-1][2] and e2 >= prev[0][-1][1]) == 1:
                prev[0].append((y, s, e))
                nxt.append(prev[0])
            else:
                lg = [(y, s, e)]
                legs.append(lg)
                nxt.append(lg)
        open_ = nxt
    legs = [lg for lg in legs if len(lg) >= 5]
    for lg in legs:
        body = lg[:-2]
        widths = [e - s + 1 for _, s, e in body]
        f['legs'].append({'x': lg[0][1], 'rows': [lg[0][0], lg[-1][0]], 'min': min(widths), 'min_row': body[widths.index(min(widths))][0]})
        for k in range(3, len(body)):  # 맨 위 두 줄은 허벅지에서 다리로 가늘어지는 곳이라 원래 크게 바뀐다
            d = widths[k] - widths[k - 1]
            f['leg_jumps'].append({'x': lg[0][1], 'row': body[k][0], 'change': d})
    return f


def learn(path, out):
    """동작별 기준: 완성본의 그 동작에서 본 가장 큰 혹·급변, 가장 가는 다리, 면적 차이까지가 정상.
    처음 보는 동작 이름이면 'default' (걷기·달리기처럼 다리로 서는 동작들의 가장 엄한 값이 아니라 가장 너그러운 값)"""
    frames = load(path)
    sets = {}
    for name, fs in frames.items():
        r = {'neck_bump': 0, 'front_bump': 0, 'belly_bump': 0, 'back_bump': 0, 'leg_min_width': 99, 'leg_jump': 0, 'area_spread': 0, 'rump': -99}
        areas = []
        for k, rows in fs.items():
            f = features(rows)
            if not f:
                continue
            areas.append(f['area'])
            r['neck_bump'] = max([r['neck_bump']] + [b['size'] for b in f['neck']])
            r['front_bump'] = max([r['front_bump']] + [b['size'] for b in f['front']])
            r['belly_bump'] = max([r['belly_bump']] + [b['size'] for b in f['belly']])
            r['back_bump'] = max([r['back_bump']] + [b['size'] for b in f['back']])
            r['leg_min_width'] = min([r['leg_min_width']] + [lg['min'] for lg in f['legs']])
            r['leg_jump'] = max([r['leg_jump']] + [abs(j['change']) for j in f['leg_jumps']])
            if f['rump'] is not None:
                r['rump'] = max(r['rump'], f['rump'])
        if areas:
            med = sorted(areas)[len(areas) // 2]
            r['area_spread'] = round(max(abs(a - med) / med for a in areas), 3)
        sets[name] = r
    standing = [sets[n] for n in sets if n in LEG_SETS] or list(sets.values())
    default = {
        'neck_bump': max(r['neck_bump'] for r in standing),
        'front_bump': max(r['front_bump'] for r in standing),
        'belly_bump': max(r['belly_bump'] for r in standing),
        'back_bump': max(r['back_bump'] for r in standing),
        'leg_min_width': min(r['leg_min_width'] for r in standing),
        'leg_jump': max(r['leg_jump'] for r in standing),
        'area_spread': max(r['area_spread'] for r in standing),
        'rump': max(r['rump'] for r in standing),
    }
    rules = {'from': str(path), 'default': default, 'sets': sets}
    Path(out).write_text(json.dumps(rules, ensure_ascii=False, indent=1), encoding='utf-8')
    return rules


# 완성본이 없을 때 (새 캐릭터·다른 견종): 그림체와 상관없이 개라면 지켜야 할 값. 윤곽 선은 1~4줄짜리 구간이 앞뒤를 이은 선에서
# 1.5칸까지 (털 한 칸 삐침은 괜찮고 두 칸은 아니다), 다리는 2칸 넘게, 관절에서 한 줄에 3칸 넘게 굵기가 바뀌지 않고, 몸 크기는 5% 안.
# 엉덩이는 뒷다리 시작보다 2칸 뒤까지 (사진의 코기·닥스·시바 걷기는 0~2칸, 테리 걷기는 -3~-1. 3칸부터 엉덩이가 튀어 보인다)
GENERIC = {'from': 'generic', 'default': {'neck_bump': 1.5, 'front_bump': 1.5, 'belly_bump': 1.5, 'back_bump': 1.5,
                                         'leg_min_width': 2, 'leg_jump': 3, 'area_spread': 0.05, 'rump': 2}, 'sets': {}}


def check(path, rules):
    frames = load(path)
    problems = []
    for name, fs in frames.items():
        feats = {k: features(rows) for k, rows in fs.items()}
        feats = {k: f for k, f in feats.items() if f}
        areas = sorted(f['area'] for f in feats.values())
        med = areas[len(areas) // 2] if areas else 0
        r = rules['sets'].get(name, rules['default'])
        limit = max(r['area_spread'], 0.03)
        for k, f in feats.items():
            at = f'{name}:{k}'
            for b in f['neck']:
                if b['size'] > r['neck_bump']:
                    problems.append((at, f"목 {b['kind']}: {b['rows'][0]}~{b['rows'][1]}줄, {b['size']}칸 (완성본 최대 {r['neck_bump']})", ('rows', b['rows'])))
            for b in f['front']:
                if b['size'] > r.get('front_bump', 1.0):
                    problems.append((at, f"목 앞·가슴 {b['kind']}: {b['rows'][0]}~{b['rows'][1]}줄, {b['size']}칸 (완성본 최대 {r.get('front_bump', 1.0)})", ('rows', b['rows'])))
            for b in f['belly']:
                if b['size'] > r.get('belly_bump', 1.0):
                    problems.append((at, f"배 {b['kind']}: {b['cols'][0]}~{b['cols'][1]}칸째, {b['size']}칸 (완성본 최대 {r.get('belly_bump', 1.0)})", ('cols', b['cols'])))
            for b in f['back']:
                if b['size'] > r['back_bump']:
                    problems.append((at, f"등 혹: {b['cols'][0]}~{b['cols'][1]}칸째, {b['size']}칸 솟음 (완성본 최대 {r['back_bump']})", ('cols', b['cols'])))
            if name in LEG_SETS:
                for lg in f['legs']:
                    if lg['min'] < r['leg_min_width']:
                        problems.append((at, f"다리 얇음: {lg['x']}칸째 다리가 {lg['min_row']}줄에서 {lg['min']}칸 (완성본 최소 {r['leg_min_width']})", ('rows', [lg['min_row'], lg['min_row']])))
                # 달리기·킁킁 같은 동작은 다리를 앞뒤로 크게 뻗어 원래 값이 크다: 완성본에서 배운 동작이거나 서서 걷는 동작만 본다
                if f['rump'] is not None and 'rump' in r and (name in rules['sets'] or name in RUMP_SETS) and f['rump'] > r['rump']:
                    problems.append((at, f"엉덩이 튀어나옴: 몸통 뒤끝이 뒷다리보다 {f['rump']}칸 뒤 (완성본 최대 {r['rump']})", None))
                for j in f['leg_jumps']:
                    if abs(j['change']) > r['leg_jump']:
                        problems.append((at, f"다리 굵기 급변: {j['x']}칸째 다리 {j['row']}줄에서 {j['change']:+d}칸 (완성본 최대 ±{r['leg_jump']})", ('rows', [j['row'], j['row']])))
            if med and abs(f['area'] - med) / med > limit * 1.5:
                problems.append((at, f"크기 흔들림: 면적 {f['area']} (이 동작 가운데값 {med}, {abs(f['area'] - med) / med:.0%} 차이)", None))
    return problems


def show(path, target, marks):
    name, k = target.split(':')
    rows = load(path)[name][k]
    flag_rows = set()
    for at, _, where in marks:
        if at == target and where and where[0] == 'rows':
            flag_rows.update(range(where[1][0], where[1][1] + 1))
    for y, r in enumerate(rows):
        print(f"{y:2d} {'▶' if y in flag_rows else ' '} {r}")


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) >= 2 and args[0] == 'learn':
        out = args[args.index('--out') + 1] if '--out' in args else str(HERE / 'sprite-rules.json')
        print(json.dumps(learn(args[1], out), ensure_ascii=False, indent=1))
    elif len(args) >= 2 and args[0] == 'check':
        rules_path = args[args.index('--rules') + 1] if '--rules' in args else str(HERE / 'sprite-rules.json')
        rules = GENERIC if '--generic' in args else json.loads(Path(rules_path).read_text(encoding='utf-8'))
        probs = check(args[1], rules)
        for at, msg, _ in probs:
            print(f'{at:12s} {msg}')
        bad = len({p[0] for p in probs})
        total = sum(len(v) for v in load(args[1]).values())
        print(f'\n프레임 {total}개 중 {bad}개에서 {len(probs)}건' if probs else f'\n프레임 {total}개 모두 통과')
        if '--show' in args:
            show(args[1], args[args.index('--show') + 1], probs)
    else:
        print(__doc__)
