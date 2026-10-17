"""C안: 엉덩이와 어깨가 다른 박자로 오르내리는 흔들림 (흔들목마처럼 앞뒤가 번갈아 들림).
열마다 올릴 양이 다르다: 꼬리 = 한 장 전 엉덩이 값(늦게 따라옴), 엉덩이~어깨 = 사이를 고르게, 목~머리 = 어깨에서 머리 값으로.
땅에 닿은 다리는 붙은 자리의 값만큼 늘이거나 줄여 발을 땅에 두고, 떠 있는 다리는 붙은 자리와 같이 움직인다."""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from bounce import split_row, comps, GROUND, FOOT
from anchors import anchors

def lerp(a, b, t): return a + (b - a) * max(0.0, min(1.0, t))

def profile(f, rear, front, head, tail):
    a = anchors(f); W = len(f[0])
    xr0, xc = a['xr0'], a['xr0'] + 3          # 꼬리 끝 / 엉덩이
    xf = a['xf']; xw = xf - 4                 # 머리 뒤 / 어깨
    def dy(x):
        if x < xr0: return tail
        if x <= xc: return rear
        if x <= xw: return round(lerp(rear, front, (x - xc) / max(1, xw - xc)))
        return front  # 머리는 따로 (목·가슴까지 같이 밀면 가슴 윤곽이 끊긴다)
    return [dy(x) for x in range(W)]

def rock(f, rear, front, head, tail):
    H, W = len(f), len(f[0]); g = [['.'] * W for _ in range(H)]
    sp = split_row(f); D = profile(f, rear, front, head, tail)
    def put(y, x, ch):
        if 0 <= y < H and 0 <= x < W: g[y][x] = ch
    for y in range(sp):
        for x in range(W):
            if f[y][x] != '.': put(y - D[x], x, f[y][x])
    leg = {(y, x) for y in range(sp, H) for x in range(W) if f[y][x] != '.'}
    def row_runs(y):
        xs = sorted(x for x in range(W) if (y, x) in leg); out = []
        for x in xs:
            if out and x == out[-1][1] + 1: out[-1][1] = x
            else: out.append([x, x])
        return out
    stance = []
    for a, b in row_runs(GROUND):
        cells, band = set(), (a, b)
        for y in range(GROUND, sp - 1, -1):
            hit = [r for r in row_runs(y) if r[0] <= band[1] + 1 and r[1] >= band[0] - 1]
            if not hit: break
            r = min(hit, key=lambda r: abs((r[0] + r[1]) / 2 - (band[0] + band[1]) / 2))
            r = (max(r[0], band[0] - 2), min(r[1], band[1] + 2))
            cells |= {(y, x) for x in range(r[0], r[1] + 1)}; band = (r[0], r[1])
        stance.append(cells)
    st_all = set().union(*stance) if stance else set()
    # 떠 있는 다리: 덩어리마다 붙은 자리(맨 윗줄 가운데)의 값으로 통째로
    for c in comps(leg - st_all):
        top = min(y for y, _ in c); xs = [x for y, x in c if y == top]
        d = D[round(sum(xs) / len(xs))]
        for y, x in c: put(min(y - d, GROUND), x, f[y][x])
    for c in stance:
        top = min(y for y, _ in c); xs = [x for y, x in c if y == top]
        dy = D[round(sum(xs) / len(xs))]
        seg_end = GROUND - FOOT
        rows = {y: tuple(sorted((x, f[y][x]) for yy, x in c if yy == y)) for y in range(top, GROUND + 1)}
        def same(y):
            a, b = set(rows[y]), set(rows[y + 1])
            return len(a & b) / max(1, len(a | b))
        mid = (top + seg_end) / 2
        cand = sorted(range(top + 1, seg_end), key=lambda y: (-same(y), abs(y - mid)))
        pick = set(cand[:abs(dy)])
        order = []
        for y in range(top, GROUND + 1):
            if dy < 0 and y in pick: continue
            order.append(y)
            if dy > 0 and y in pick: order.append(y)
        for i, sy in enumerate(reversed(order)):
            for x, ch in rows[sy]: put(GROUND - i, x, ch)
    # 다리 윗끝과 배 사이에 한 줄 틈이 생기면 (열마다 값이 달라서) 다리 윗칸으로 메운다
    for x in range(W):
        for y in range(1, H - 1):
            if g[y][x] == '.' and g[y + 1][x] != '.' and g[y - 1][x] != '.' and sp - 3 - D[x] <= y <= sp + 2:
                g[y][x] = g[y + 1][x]
    smooth(g, sp, D, a_xf=anchors(f)['xf'])
    if head != front: move_head(g, head - front)
    return [''.join(r) for r in g], D

def move_head(g, up):
    """머리(뒤통수 뒤 ~ 턱 아래)만 up칸 올린다 (음수면 내린다). 비는 칸은 원래 그림, 밀려난 칸은 머리가 덮는다"""
    H, W = len(g), len(g[0])
    cells = [(y, x) for y in range(H) for x in range(W) if g[y][x] != '.']
    top = min(y for y, _ in cells)
    hc = min(x for y, x in cells if y <= top + 3) - 1
    nose_x = max(x for y, x in cells if y <= top + 8)
    nose_y = min(y for y, x in cells if x == nose_x)
    hr = nose_y + 4
    src = [r[:] for r in g]
    moved = [(y, x, src[y][x]) for y in range(hr + 1) for x in range(hc, W) if src[y][x] != '.']
    for y, x, _ in moved: g[y][x] = '.'
    if up < 0:  # 내릴 때: 머리 아래로 밀려나는 자리는 원래 것을 유지 (위에서 머리가 덮는다)
        for y in range(hr + 1, hr + 1 - up):
            for x in range(hc, W):
                if src[y][x] != '.': g[y][x] = src[y][x]
    else:       # 올릴 때: 턱 밑에 생기는 틈은 목 줄을 늘여 메운다
        for y in range(hr + 1 - up, hr + 1):
            for x in range(hc, W):
                if src[hr + 1][x] != '.' and g[y][x] == '.': g[y][x] = src[hr + 1][x]
    for y, x, ch in moved:
        if 0 <= y - up < H: g[y - up][x] = ch

def smooth(g, sp, D, a_xf):
    """열마다 올린 양이 달라 윗선(등)·밑선(배)에 한 칸짜리 혹이나 파임이 생기면 이웃 열에 맞춘다"""
    H, W = len(g), len(g[0])
    def top(x):
        return next((y for y in range(H) if g[y][x] != '.'), None)
    def bot(x):  # 몸통 밑선: 몸 아래로 두 칸 이상 비는 첫 자리 (다리가 있는 열은 None)
        t = top(x)
        if t is None: return None
        for y in range(t, H - 2):
            if g[y][x] != '.' and g[y + 1][x] == '.' and g[y + 2][x] == '.':
                return y if y <= sp + 2 - D[x] else None
        return None
    for _ in range(2):
        for x in range(1, a_xf - 1):
            t0, t1, t2 = top(x - 1), top(x), top(x + 1)
            if None not in (t0, t1, t2) and t1 < sp - D[x] - 4:
                if t1 < t0 and t1 < t2: g[t1 + 1][x] = g[t1][x]; g[t1][x] = '.'
                elif t1 > t0 and t1 > t2: g[t1 - 1][x] = g[t1][x]; g[t1][x] = g[t1 + 1][x] if g[t1 + 1][x] != '.' else g[t1][x]
            b0, b1, b2 = bot(x - 1), bot(x), bot(x + 1)
            if None not in (b0, b1, b2):
                if b1 > b0 and b1 > b2: g[b1 - 1][x] = g[b1][x]; g[b1][x] = '.'
                elif b1 < b0 and b1 < b2: g[b1 + 1][x] = g[b1][x]; g[b1][x] = g[b1 - 1][x]
