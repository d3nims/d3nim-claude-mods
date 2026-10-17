"""블록용 테리: 새 그림(점자와 같은 몸·다리·움직임)에 1.0.2 블록 그림의 큰 머리를 얹는다.
머리는 눈 위치를 맞춰 옮기고(새 그림의 머리 흔들림을 그대로 따라감), 1.0.2 의 같은 동작에서 박자가 맞는 장의 머리를 쓴다.
usage: python3 hybrid.py <old.json> <new.json> <out.json> [set ...]"""
import json, sys

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def decode(sp, frame):
    pal = [rgb(h) for h in sp['palette']]
    return [[None if c == '.' else pal[sp['alphabet'].index(c)] for c in row] for row in frame]

dark = lambda c: c is not None and max(c) < 40

def head_box(f):
    """머리 영역: 뒤통수 x, 턱 줄, 눈 가운데"""
    H, W = len(f), len(f[0])
    cells = [(y, x) for y in range(H) for x in range(W) if f[y][x] is not None]
    top = min(y for y, _ in cells)
    hc = min(x for y, x in cells if y <= top + 3) - 1
    nose_x = max(x for y, x in cells if y <= top + 10)
    nose_y = min(y for y, x in cells if x == nose_x)
    eye = [(y, x) for y, x in cells if top <= y <= nose_y + 2 and hc + 4 <= x <= nose_x - 4 and dark(f[y][x])]
    ey = sum(y for y, _ in eye) / len(eye); ex = sum(x for _, x in eye) / len(eye)
    return dict(top=top, hc=hc, chin=nose_y + 4, nose=(nose_y, nose_x), eye=(ey, ex))

reddish = lambda c: c is not None and c[0] > c[1] * 1.25  # 혀·입·귀 안쪽

def mouth(f, box):
    """머리 아래로 내려온 혀와 그 테두리 (헥헥): 턱 아래라도 머리와 같이 다룬다"""
    H, W = len(f), len(f[0]); out = set()
    for y in range(box['nose'][0], H):
        for x in range(box['hc'], W):
            if reddish(f[y][x]): out.add((y, x))
    for y, x in list(out):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and dark(f[yy][xx]): out.add((yy, xx))
    return out

def swap(new, old):
    H, W = len(new), len(new[0])
    bn, bo = head_box(new), head_box(old)
    dy = round(bn['eye'][0] - bo['eye'][0]); dx = round(bn['eye'][1] - bo['eye'][1])
    g = [r[:] for r in new]
    # 새 머리 지우기: 턱선(코 높이 + 2)까지만. 그 아래 목·가슴·들어 올린 앞발은 새 그림 그대로
    for y in range(0, bn['nose'][0] + 3):
        for x in range(bn['hc'], W): g[y][x] = None
    for y, x in mouth(new, bn): g[y][x] = None
    src = {(y, x) for y in range(0, bo['chin'] + 1) for x in range(bo['hc'], W) if old[y][x] is not None} | mouth(old, bo)
    pasted = set()
    for y, x in src:
        ty, tx = y + dy, x + dx
        if 0 <= ty < H and 0 <= tx < W: g[ty][tx] = old[y][x]; pasted.add((ty, tx))
    # 머리 밑과 새 목 사이 틈: 새 그림의 아래 칸으로 메운다 (두 줄까지)
    for x in range(W):
        ys = [y for y, xx in pasted if xx == x]
        if not ys: continue
        b = max(ys)
        for k in (1, 2):
            if b + k < H and g[b + k][x] is None and any(g[b + j][x] is not None for j in range(k + 1, 4) if b + j < H):
                below = next(g[b + j][x] for j in range(k + 1, 4) if b + j < H and g[b + j][x] is not None)
                g[b + k][x] = below
    # 턱 밑이 비어 있으면 (1.0.2 에선 턱이 가슴으로 이어졌다) 바깥선 한 줄로 닫는다
    line = (0x77, 0x77, 0x77)
    for x in range(W):
        ys = [y for y, xx in pasted if xx == x]
        if not ys: continue
        b = max(ys)
        if b + 1 < H and g[b + 1][x] is None and not dark(g[b][x]) and not reddish(g[b][x]):
            if g[b][x] in (line, (0x6d, 0x6d, 0x6d), (0x70, 0x70, 0x70)): continue
            g[b + 1][x] = line; pasted.add((b + 1, x))
    return g, (dy, dx), pasted

if __name__ == '__main__':
    old, new = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
    sets = sys.argv[4:] or ['run', 'walk', 'pant']
    out = {}
    for s in sets:
        nf, of = new['sets'][s]['frames'], old['sets'][s]['frames']
        frames, shifts, heads = [], [], []
        for i, f in enumerate(nf):
            j = i * len(of) // len(nf)
            g, sh, hd = swap(decode(new, f), decode(old, of[j])); frames.append(g); shifts.append(sh)
            heads.append(sorted(hd))
        # heads: 1.0.2 머리에서 온 칸 (블록용으로 그린 색이라 회색을 밝히지 않는다)
        out[s] = {'durations': new['sets'][s]['durations'], 'frames': frames, 'heads': heads}
        print(s, 'shifts', shifts)
    json.dump(out, open(sys.argv[3], 'w'))
