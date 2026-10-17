"""걸음 측정: 마스크(True=몸) 프레임 목록 -> 프레임별 발 닿음 수, 등 높이, 머리 높이, 몸 길이"""
def comp(m):
    h, w = len(m), len(m[0]); seen = set(); best = set()
    for y in range(h):
        for x in range(w):
            if m[y][x] and (y, x) not in seen:
                c, st = set([(y, x)]), [(y, x)]; seen.add((y, x))
                while st:
                    cy, cx = st.pop()
                    for ny, nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1),(cy+1,cx+1),(cy-1,cx-1),(cy+1,cx-1),(cy-1,cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny][nx] and (ny, nx) not in seen:
                            seen.add((ny, nx)); c.add((ny, nx)); st.append((ny, nx))
                if len(c) > len(best): best = c
    return best

def runs(xs, gap=2):
    xs = sorted(xs); out = []
    for x in xs:
        if out and x - out[-1][1] <= gap: out[-1][1] = x
        else: out.append([x, x])
    return out

def measure(frames, ground=None, tol=0):
    """frames: 오른쪽을 보는 마스크들. ground: 땅 줄(없으면 전체 최저점)"""
    cs = [comp(m) for m in frames]
    G = ground if ground is not None else max(y for c in cs for y, _ in c)
    res = []
    for c in cs:
        ys = [y for y, _ in c]; xs = [x for _, x in c]
        x0, x1 = min(xs), max(xs); W = x1 - x0 + 1
        feet = runs([x for y, x in c if y >= G - tol], gap=1)
        nosey = min(y for y, x in c if x >= x1 - 1)
        # 등: 몸 왼쪽 20%~55% 칸 (꼬리 끝과 머리를 피함)의 가장 높은 점
        a, b = x0 + int(W*0.25), x0 + int(W*0.45)
        back = min(y for y, x in c if a <= x <= b)
        head = min(ys)
        # 몸 길이: 등선 아래 2~5줄에서 가장 긴 연속 구간
        best = 0
        for yy in range(back + 2, back + 6):
            rx = sorted(x for y, x in c if y == yy)
            for r in runs(rx, gap=1): best = max(best, r[1] - r[0] + 1)
        res.append(dict(nose=nosey, feet=len(feet), feetx=[(r[0]-x0, r[1]-x0) for r in feet], back=back, head=head, low=max(ys), length=best, width=W, area=len(c)))
    return G, res
