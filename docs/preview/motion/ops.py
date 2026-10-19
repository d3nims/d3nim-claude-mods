"""움직임 규칙을 그림에 얹는 작은 연산들. propose.py 가 동작마다 골라 쓴다.

- lower(img, band): 다리 위쪽 전체(머리·몸통·꼬리)를 1점 내린다. 다리는 band 줄 중 가장 곧은 줄 하나가 빠져
  짧아진다(곧은 줄이면 빠져도 티가 안 난다). 걷기에서 앞발이 디딜 때 어깨와 머리가 같이 내려가는 데 쓴다.
- nod(img, x0, y1, dy, x1=None): x0~x1 칸(x1 이 없으면 끝까지), y1 줄 위(머리·목, 또는 꼬리)를 dy 점 옮긴다. 다리는 그대로.
- dip(img, x0, x1, y1, dy): x0 칸부터 오른쪽, y1 줄 위의 머리를 앞으로 숙인다. 뒤통수(x0)는 dy 의 0.4, 코(x1~)는 dy 만큼
  내려가 고개가 앞으로 꺾인다. 졸 때 꾸벅이는 데 쓴다.
- face(img, head, ear=None): img 의 머리를 head(테리 머리가 있는 장)의 머리로 바꾼다. 눈을 맞춰 붙인다. ear 각도를 주면
  테리 귀(짙은 회색, 너비 4점)가 머리 위 뿌리를 축으로 그만큼 젖혀진다(0 = 아래로 처짐, 90 = 뒤로 수평, 180 = 위로 섬).
  90 을 넘어 뒤집히면 분홍 속이 보인다. 눈 옆 짙은 무늬가 처진 귀라서, 귀를 젖히면 그 자리는 하얗게 된다.
- ear_lag(frames, loop, ms): 귀(눈 뒤 짙은 회색 S 무늬)가 머리보다 한 박자 늦게 따라온다. 머리가 올라간 장에서는 귀가 덜 올라와
  아래에, 내려간 장에서는 위로 뜬다. 0.1초마다 반씩 제자리로(용수철, 오래 머무는 장일수록 더 가라앉음), 많아야 2점.
  loop 이면 마지막 장 다음이 첫 장.
- soft_eye(img): 위 앞쪽 한 점이 회색인 눈(EO/EE, ED/EE)을 꽉 찬 2x2 로 채운다. 그 회색은 찌푸린 눈썹처럼 보여서
  테리가 화나 보였다(사용자, 10/18). 빌드가 모든 동작에 쓴다.
"""
import math


def _rows(img):
    return [list(r) for r in img]


def _filled(row):
    return [k != '.' for k in row]


def straightest(img, band):
    """band 줄 중 위아래 줄과 칠한 칸이 가장 덜 다른 줄 (빼도 다리가 꺾이지 않는 줄)"""
    best, cost = None, None
    for y in range(band[0], band[1] + 1):
        a, b = _filled(img[y - 1]), _filled(img[y + 1])
        c = sum(x != z for x, z in zip(a, b))
        if cost is None or c < cost:
            best, cost = y, c
    return best


def lower(img, band):
    rows = _rows(img)
    cut = straightest(rows, band)
    out = [['.'] * len(rows[0])] + [r[:] for r in rows[:cut]] + [r[:] for r in rows[cut + 1:]]
    return out, cut


def nod(img, x0, y1, dy, x1=None):
    rows = _rows(img)
    h, w = len(rows), len(rows[0])
    xs = range(x0, w if x1 is None else x1 + 1)
    out = [r[:] for r in rows]
    for y in range(y1 + 1):
        for x in xs:
            out[y][x] = '.'
    for y in range(y1 + 1):
        for x in xs:
            ny = y + dy
            if rows[y][x] != '.' and 0 <= ny < h:
                out[ny][x] = rows[y][x]
    return out


def dip(img, x0, x1, y1, dy):
    rows = _rows(img)
    h, w = len(rows), len(rows[0])
    out = [r[:] for r in rows]

    def shift(x):
        return round(dy * (0.4 + 0.6 * min(1, (x - x0) / (x1 - x0))))
    for x in range(x0, w):
        for y in range(y1 + 1):
            out[y][x] = '.'
    for x in range(x0, w):
        for y in range(y1 + 1):
            if rows[y][x] != '.' and y + shift(x) < h:
                out[y + shift(x)][x] = rows[y][x]
    # 한 칸 더 내려간 칸의 끝이 한 점 폭으로 매달리면(턱 끝, 3점 숙일 때) 지운다
    for x in range(x0 + 1, w - 1):
        for y in range(y1 + 1, h):
            if out[y][x] != '.' and out[y][x - 1] == out[y][x + 1] == '.' and (y + 1 == h or out[y + 1][x] == '.') and out[y - 1][x] != '.':
                if rows[y][x] == '.':
                    out[y][x] = '.'
    return out


def eye(img):
    """눈 맨 위 줄의 왼쪽 끝 (칸, 줄)"""
    for y, r in enumerate(img):
        if 'E' in r:
            return list(r).index('E'), y


def _ear_cells(img):
    ex, ey = eye(img)
    return [(y, x) for y in range(max(0, ey - 6), min(len(img), ey + 5)) for x in range(max(0, ex - 9), ex) if img[y][x] == 'S']


def ear_lag(frames, loop, ms=None, keep=0.5, most=2):
    imgs = [_rows(f) for f in frames]
    eyes = [eye(f)[1] for f in imgs]
    off, out = 0.0, []
    start = len(imgs) if loop else 0   # loop: settle once round first, so frame 0 carries the last frame's swing
    for k in range(start + len(imgs)):
        i = k % len(imgs)
        prev = eyes[i - 1] if (loop or i) else eyes[0]
        settle = keep ** ((ms[i - 1] if ms else 100) / 100)   # 앞 장이 오래 머물수록 그동안 더 가라앉는다
        off = max(-most, min(most, off * settle + (prev - eyes[i])))
        if k >= start:
            out.append(round(off))
    res = []
    for img, dy in zip(imgs, out):
        o = [r[:] for r in img]
        if dy:
            cells = _ear_cells(img)
            for y, x in cells:
                o[y][x] = 'W'
            for y, x in cells:
                if 0 <= y + dy < len(o):
                    o[y + dy][x] = 'S'
        res.append(o)
    return res, out


def soft_eye(img):
    out = _rows(img)
    for y in range(len(out) - 1):
        for x in range(len(out[y]) - 1):
            if out[y][x] == out[y + 1][x] == out[y + 1][x + 1] == 'E' and out[y][x + 1] in ('O', 'D'):
                out[y][x + 1] = 'E'
    return out


def _ear(out, rx, ry, theta, length=5.6, width=4.6, taper=0.3):
    """(rx, ry) 뿌리에서 theta 도 젖혀진 귀를 그린다. 끝으로 갈수록 좁다. 뒤집히면 테두리 짙은 회색, 속 분홍."""
    t = math.radians(theta)
    ux, uy = -math.sin(t), math.cos(t)   # 뿌리에서 끝 쪽
    vx, vy = uy, -ux
    inside = theta > 95
    for y in range(max(0, int(ry) - 9), min(len(out), int(ry) + 9)):
        for x in range(max(0, int(rx) - 9), min(len(out[0]), int(rx) + 9)):
            px, py = x + 0.5 - rx, y + 0.5 - ry
            u, v = px * ux + py * uy, px * vx + py * vy
            half = width / 2 * (1 - taper * max(0, u) / length)
            if -0.3 <= u <= length and abs(v) <= half:
                rim = abs(v) > half - 1 or u > length - 1 or u < 0.6
                out[y][x] = 'P' if inside and not rim else 'S'


def face(img, head, ear=None, top=-6, bot=3, left=-10):
    """눈 기준 top~bot 줄, left 칸부터 오른쪽이 머리. img 의 머리(위로 솟은 귀까지)를 지우고 head 의 머리를 붙인다."""
    out = _rows(img)
    ex, ey = eye(out)
    hx, hy = eye(head)
    for y in range(max(0, ey + top - 5), ey + bot + 1):
        for x in range(ex + left, len(out[0])):
            out[y][x] = '.'
    for y in range(hy + top + 1, hy + bot + 1):
        for x in range(hx + left, len(head[0])):
            X, Y = x - hx + ex, y - hy + ey
            if head[y][x] != '.' and 0 <= X < len(out[0]) and 0 <= Y < len(out):
                out[Y][X] = head[y][x]
    if ear is not None:   # 눈 옆 짙은 무늬가 처진 귀다: 귀가 젖혀지면 그 자리는 하얀 머리. 뿌리는 눈에서 왼쪽 5.5, 위 1.5점(무늬 맨 위에 두니 너무 높고 뒤였다, 사용자 10/18)
        for y in range(hy + top + 1, hy + bot + 1):
            for x in range(hx + left, hx):
                X, Y = x - hx + ex, y - hy + ey
                if head[y][x] == 'S' and 0 <= X < len(out[0]) and 0 <= Y < len(out):
                    out[Y][X] = 'W'
        _ear(out, ex - 5.5, ey - 1.5, ear)
    return out
