"""Terry's still poses, traced from a reference sheet (docs/preview/terry-poses-ref.png: 17 panels of a dot-drawn
Bedlington, one per mood, in a 3 x 6 grid). Each panel's dog is cut out of its dark background, scaled to the sprite
grid and turned into the generator's colour keys, so build-terrier.py can use it as a frame like any drawn one.

Coat greys keep the drawing's own shading (mapped to the nearest coat key); dark marks inside the dog become the eye
('E'), the nose ('N') or an inner line ('oO': a gap in braille, the soft outline colour in quad); red becomes the
tongue ('T'). The tail is found as the thin part sticking out of the back, so it can be swung to wag.
"""
import math
from collections import deque

import numpy as np
from PIL import Image

PANEL_X = [(9, 340), (350, 676), (687, 1016)]
PANEL_Y = [(8, 233), (243, 468), (478, 703), (714, 943), (955, 1196), (1209, 1458)]
SCALE = 5.0   # reference pixels per sprite pixel (the sheet's dots are ~5.4 px apart)


def _dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def _components(m):
    h, w = m.shape
    lab = np.zeros((h, w), int)
    sizes = []
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                n = len(sizes) + 1
                q = deque([(y, x)])
                lab[y, x] = n
                c = 0
                while q:
                    cy, cx = q.popleft()
                    c += 1
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
                sizes.append(c)
    return lab, sizes


def _panel(sheet, n):
    (x0, x1), (y0, y1) = PANEL_X[n % 3], PANEL_Y[n // 3]
    return sheet[y0 + 26:y1 - 2, x0 + 3:x1 - 3]   # below the panel's title


def _dog(p, tongue=False):
    """The dog in a panel: its light, unsaturated coat (the biggest such patch, small gaps closed), with the holes
    inside it (eye, nose, mouth) filled in, and with `tongue` the pink tongue hanging out of it."""
    lum = p.mean(axis=2)
    sat = p.max(axis=2) - p.min(axis=2)
    coat = (lum > 105) & (sat < 45)
    closed = ~_dilate(~_dilate(coat, 2), 2)
    lab, sizes = _components(closed)
    m = lab == int(np.argmax(sizes)) + 1
    filled = m.copy()
    blab, bs = _components(~m)
    edge = set(blab[0, :]) | set(blab[-1, :]) | set(blab[:, 0]) | set(blab[:, -1])
    for i in range(1, len(bs) + 1):
        if i not in edge and bs[i - 1] < 400:
            filled |= blab == i
    if tongue:
        r, g, b = p[:, :, 0], p[:, :, 1], p[:, :, 2]
        pink = (r > 140) & (r > g * 1.6) & (b > g * 0.8)
        pink = ~_dilate(~_dilate(pink, 2), 2)   # (the sheet's dots are apart: close the gaps between them)
        tlab, ts = _components(pink)
        near = _dilate(filled, 3)
        for i in range(1, len(ts) + 1):
            if ts[i - 1] > 20 and (near & (tlab == i)).any():
                filled |= tlab == i
    return filled


def trace(sheet, n, cw, ch, ground, mirror=False, scale=SCALE, tongue=False):
    """Panel n (0-based) -> a cw x ch grid of None / ('coat', lum) / ('dark',) / ('red', rgb), the dog's lowest row
    on `ground`, centred across the width; `mirror` turns a dog facing left to face right."""
    p = _panel(sheet, n)
    if mirror:
        p = p[:, ::-1]
    filled = _dog(p, tongue)
    ys, xs = np.where(filled)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    lum = p.mean(axis=2)
    red = (p[:, :, 0] > 120) & (p[:, :, 0] > p[:, :, 1] * 1.5)
    w, h = int(math.ceil((x1 - x0) / scale)), int(math.ceil((y1 - y0) / scale))
    ox, oy = (cw - w) // 2, ground + 1 - h
    grid = [[None] * cw for _ in range(ch)]
    for sy in range(h):
        for sx in range(w):
            a, b = y0 + int(sy * scale), y0 + int((sy + 1) * scale)
            c, d = x0 + int(sx * scale), x0 + int((sx + 1) * scale)
            inside = filled[a:b, c:d]
            gx, gy = ox + sx, oy + sy
            if inside.size == 0 or inside.mean() < 0.4 or not (0 <= gx < cw and 0 <= gy < ch):
                continue
            rr = red[a:b, c:d] & inside
            if rr.mean() > 0.3:
                grid[gy][gx] = ('red', tuple(int(v) for v in p[a:b, c:d][rr].mean(axis=0)))
            elif (lum[a:b, c:d][inside] < 95).mean() > 0.42:
                grid[gy][gx] = ('dark',)
            else:
                grid[gy][gx] = ('coat', float(lum[a:b, c:d][inside].mean()))
    return grid


def to_keys(grid, col, head=None):
    """Traced grid -> rows of colour keys ('.' empty). Coat greys take the coat key nearest in brightness; of the dark
    marks, the one at the tip of the muzzle is the nose, the small one nearest behind it in the head is the eye, and
    the rest are inner lines."""
    h, w = len(grid), len(grid[0])
    coat_keys = [k for k in 'WLOmDS' if k in col]
    lum_of = {k: sum(col[k]) / 3 for k in coat_keys}
    img = [['.'] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            c = grid[y][x]
            if c is None:
                continue
            if c[0] == 'coat':
                img[y][x] = min(coat_keys, key=lambda k: abs(lum_of[k] - (c[1] * 1.04 + 4)))
            elif c[0] == 'red':
                img[y][x] = 'T'
    dark = np.array([[c is not None and c[0] == 'dark' for c in row] for row in grid])
    lab, sizes = _components(dark)
    occupied = [(y, x) for y in range(h) for x in range(w) if grid[y][x] is not None]
    top = min(y for y, _ in occupied)
    bottom = max(y for y, _ in occupied)
    head_rows = range(top, top + max(4, (bottom - top) * 45 // 100))
    head_cols = range(0, w)
    if head:   # (row0, row1, col0, col1): where the head is, for poses that hold it low
        head_rows, head_cols = range(head[0], head[1] + 1), range(head[2], head[3] + 1)
    front = max(x for y, x in occupied if y in head_rows and x in head_cols)
    comps = []
    for i in range(1, len(sizes) + 1):
        pts = list(zip(*np.where(lab == i)))
        comps.append(pts)
    # nose: the dark mark reaching furthest forward in the head; eye: the small head mark nearest behind it
    in_head = [c for c in comps if any(y in head_rows and x in head_cols for y, x in c)]
    nose = max(in_head, key=lambda c: max(x for _, x in c), default=None)
    if nose is not None and max(x for _, x in nose) < front - 3:
        nose = None
    eye = None
    if nose is not None:
        ny = sum(y for y, _ in nose) / len(nose)
        nx = sum(x for _, x in nose) / len(nose)
        cand = [c for c in in_head if c is not nose and len(c) <= 6 and sum(y for y, _ in c) / len(c) < ny + 1]
        eye = min(cand, key=lambda c: abs(sum(x for _, x in c) / len(c) - (nx - 6)) + abs(sum(y for y, _ in c) / len(c) - ny), default=None)
    for c in comps:
        key = 'N' if c is nose else 'E' if c is eye else 'oO'
        for y, x in c:
            img[y][x] = key
    return img


def tail_of(img, body_keys='WLOmDS'):
    """The tail: coat pixels behind the rump that a one-pixel opening removes (it is thin), connected to the back.
    Returns (pixels, root) or (None, None)."""
    h, w = len(img), len(img[0])
    m = np.array([[k in body_keys for k in row] for row in img])
    opened = _dilate(~_dilate(~m, 1), 1) & m
    thin = m & ~opened
    lab, sizes = _components(thin)
    xs_body = np.where(opened.any(axis=0))[0]
    if not len(sizes) or not len(xs_body):
        return None, None
    back = xs_body.min() + (xs_body.max() - xs_body.min()) * 0.3
    best = None
    for i in range(1, len(sizes) + 1):
        pts = list(zip(*np.where(lab == i)))
        if len(pts) < 3 or sum(x for _, x in pts) / len(pts) > back:
            continue
        if best is None or len(pts) > len(best):
            best = pts
    if best is None:
        return None, None
    # the root: the tail pixel touching the body
    root = min(best, key=lambda p: min(abs(p[0] - y) + abs(p[1] - x) for y, x in zip(*np.where(opened))))
    return best, root


def wag(img, angle, body_keys='WLOmDS'):
    """A copy with the tail swung about its root by `angle` radians."""
    pts, root = tail_of(img, body_keys)
    if not pts:
        return [row[:] for row in img]
    out = [row[:] for row in img]
    keys = {p: img[p[0]][p[1]] for p in pts}
    for y, x in pts:
        out[y][x] = '.'
    ry, rx = root
    ca, sa = math.cos(angle), math.sin(angle)
    # each pixel moved along the swing, and the gaps between consecutive ones (by distance from the root) filled
    order = sorted(pts, key=lambda p: (p[0] - ry) ** 2 + (p[1] - rx) ** 2)
    moved = []
    for y, x in order:
        dx, dy = x - rx, y - ry
        moved.append((ry + dx * sa + dy * ca, rx + dx * ca - dy * sa, keys[(y, x)]))
    prev = (ry, rx)
    for my, mx, k in moved:
        steps = max(1, int(max(abs(my - prev[0]), abs(mx - prev[1])) * 2))
        for i in range(1, steps + 1):
            t = i / steps
            yy, xx = int(round(prev[0] + (my - prev[0]) * t)), int(round(prev[1] + (mx - prev[1]) * t))
            if 0 <= yy < len(out) and 0 <= xx < len(out[0]) and out[yy][xx] == '.':
                out[yy][xx] = k
        prev = (my, mx)
    return out


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(float)
