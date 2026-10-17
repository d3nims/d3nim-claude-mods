"""달리기 높이 곡선: 몸(배선 위)은 dy만큼 올리고, 땅에 닿은 다리는 늘이거나 줄여 발을 땅에 붙여 둔다.
떠 있는 다리는 몸과 같이 움직인다. head: 머리만 추가로 내리는 양(아래로 +)."""
import json, sys
GROUND = 35
FOOT = 3  # 발끝 몇 줄은 모양 그대로 둔다

def split_row(f):
    """몸통 아래끝: 가장 긴 줄(몸통)에서 내려가다 처음으로 12칸 미만이 되는 줄"""
    def best(r):
        run = b = 0
        for ch in r:
            run = run + 1 if ch != '.' else 0; b = max(b, run)
        return b
    bs = [best(r) for r in f]
    y = max(range(len(f)), key=lambda i: (bs[i], i <= 22))
    while y < len(f) and bs[y] >= 12: y += 1
    return y

def comps(cells):
    cells = set(cells); out = []
    while cells:
        st = [cells.pop()]; c = set(st)
        while st:
            y, x = st.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    n = (y + dy, x + dx)
                    if n in cells: cells.remove(n); c.add(n); st.append(n)
        out.append(c)
    return out

def bounce(f, dy, head=0):
    H, W = len(f), len(f[0]); g = [['.'] * W for _ in range(H)]
    sp = split_row(f)
    def put(y, x, ch):
        if 0 <= y < H and 0 <= x < W: g[y][x] = ch
    # 몸
    for y in range(sp):
        for x in range(W):
            if f[y][x] != '.': put(y - dy, x, f[y][x])
    # 다리: 땅에 닿은 발에서 위로 따라 올라간 칸만 디딤다리로 본다
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
            # 바로 아래 칸과 겹치는 묶음 중 발 띠에 가장 가까운 하나만 (옆 다리로 새지 않게)
            r = min(hit, key=lambda r: abs((r[0] + r[1]) / 2 - (band[0] + band[1]) / 2))
            # 아래 줄 띠에서 옆으로 2칸까지만 (붙어 있는 다른 발은 떼어 낸다)
            r = (max(r[0], band[0] - 2), min(r[1], band[1] + 2))
            cells |= {(y, x) for x in range(r[0], r[1] + 1)}; band = (r[0], r[1])
        stance.append(cells)
    st_all = set().union(*stance) if stance else set()
    for y, x in leg - st_all:  # 떠 있는 다리: 몸과 같이
        put(min(y - dy, GROUND), x, f[y][x])
    for c in stance:
        top = min(y for y, _ in c); seg_end = GROUND - FOOT
        rows = {y: tuple(sorted((x, f[y][x]) for yy, x in c if yy == y)) for y in range(top, GROUND + 1)}
        def same(y):  # 바로 아래 줄과 얼마나 같은지: 같은 줄을 빼거나 겹치면 티가 안 난다
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
        # 발끝이 땅에 오도록 아래에서부터 채운다
        for i, sy in enumerate(reversed(order)):
            for x, ch in rows[sy]: put(GROUND - i, x, ch)
    if head:
        cells = [(y, x) for y in range(H) for x in range(W) if g[y][x] != '.']
        top = min(y for y, _ in cells)
        nose_x = max(x for _, x in cells if _ < split_row(f) - dy)
        nose_y = min(y for y, x in cells if x == nose_x)
        hc = min(x for y, x in cells if y <= top + 3) - 1  # 머리 뒤통수 바로 뒤에서 자른다
        hr = nose_y + 4                                     # 턱 아래까지
        src = [r[:] for r in g]
        moved = [(y, x, src[y][x]) for y in range(hr + 1) for x in range(hc, W) if src[y][x] != '.']
        for y, x, _ in moved: g[y][x] = '.'
        for y in range(hr + 1, hr + 1 + head):  # 머리 아래로 밀려난 칸은 원래 것을 유지
            for x in range(hc, W):
                if src[y][x] != '.': g[y][x] = src[y][x]
        for y, x, ch in moved: put(y + head, x, ch)
    return [''.join(r) for r in g]
