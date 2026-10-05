#!/usr/bin/env python3
"""Draws a detailed side-view Bedlington Terrier facing right, at sub-pixel resolution, and writes terrier-frames.json.

Drawn from photographs: the head is one egg shape, so the line from the crown to the nose is a single smooth slope
(no dip at the forehead); long ear hanging close to the head with a light tassel; long arched neck; roached back
(highest at the loin); deep chest and a belly tucked up behind it; long legs; thin low tail.

The sprite is drawn on a square grid with 2 pixels per terminal column and 4 per row (a braille cell), so the demo
can show it as braille (2x4) or quadrant blocks (2x2).

Sets: run (2 frames, legs alternate), pant (standing, tongue out), sleep (lying down).
Usage: python3 build-terrier.py [--k=0.85] [--coat=silver|blue|liver|sandy] [--preview]
  --k  size factor: 0.7 is 8 rows, 0.85 (default) about 10 rows, 1.05 about 12 rows, 1.4 about 17 rows. Everything is drawn at that size.
"""
import json, math, sys

K = 0.85
coat = 'silver'
for a in sys.argv[1:]:
    if a.startswith('--k='):
        K = float(a[4:])
    if a.startswith('--coat='):
        coat = a[7:]

ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
COATS = {  # base coat, darker shade, light fluff
    # silver: every colour has equal red, green and blue, so a terminal that falls back to 256 colours still shows it
    # grey (a blue-grey turns lavender and teal there)
    'silver': ((176, 176, 176), (112, 112, 112), (242, 242, 242)),
    'blue': ((170, 182, 208), (108, 120, 150), (240, 244, 250)),
    'liver': ((176, 128, 104), (122, 80, 64), (238, 216, 198)),
    'sandy': ((222, 178, 118), (178, 128, 76), (250, 236, 208)),
}
BASE, DARK, FLUFF = COATS[coat]
INK = (44, 44, 44)


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


COL = {
    'O': BASE,                        # coat
    'L': mix(BASE, FLUFF, 0.5),       # lit coat
    'D': DARK,                        # shaded coat
    'S': mix(DARK, INK, 0.45),        # deep shadow
    'W': FLUFF,                       # fluff: head, paws, tassels
    'm': mix(FLUFF, BASE, 0.4),       # shaded fluff
    'e': mix(DARK, FLUFF, 0.35),      # inner ear
    'N': (20, 20, 20),                # nose
    'h': (124, 124, 124),             # shine on the nose
    'E': (24, 24, 24),                # eye
    'T': (236, 112, 128),             # tongue
    'M': (112, 36, 50),               # inside of the open mouth
    't': (196, 78, 98),
    'K': INK,
}

S = 2 * K                       # sub-pixels per design unit (1 unit = 1 terminal column)
MARGIN = 2
CW = int(math.ceil(27 * S)) + 2 * MARGIN
CH = int(math.ceil(21.8 * S / 4.0)) * 4 + 4   # whole terminal rows (4 sub-pixels each)


def new():
    return [['.'] * CW for _ in range(CH)]


def sub(v, off=MARGIN):
    return v * S + off


def put(img, x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < CW and 0 <= y < CH:
        img[y][x] = c


def ellipse(img, cx, cy, rx, ry, c, tilt=0.0, clip=None):
    cx, cy, rx, ry = sub(cx), sub(cy), max(0.8, rx * S), max(0.8, ry * S)
    ct, st = math.cos(tilt), math.sin(tilt)
    for y in range(CH):
        for x in range(CW):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u, v = dx * ct + dy * st, -dx * st + dy * ct
            if (u / rx) ** 2 + (v / ry) ** 2 <= 1.0 and (clip is None or clip(img[y][x])):
                img[y][x] = c


def polygon(img, pts, c, clip=None):
    pts = [(sub(x), sub(y)) for x, y in pts]
    for y in range(CH):
        for x in range(CW):
            px, py = x + 0.5, y + 0.5
            inside = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside and (clip is None or clip(img[y][x])):
                img[y][x] = c


def line(img, a, b, r, c, clip=None):
    n = max(8, int(math.hypot(b[0] - a[0], b[1] - a[1]) * S * 1.5))
    for i in range(n + 1):
        t = i / n
        ellipse(img, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r, r, c, clip=clip)


def hash2(x, y):
    h = (x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995
    h ^= h >> 13
    h = (h * 1274126177) & 0xFFFFFFFF
    return (h ^ (h >> 16)) & 0xFF


BODY = set('OLDS')


def curls(img, x0, x1, y0, y1):
    """Curly coat: small lighter and darker tufts in 2 x 2 sub-pixel clusters, staggered row by row."""
    X0, X1, Y0, Y1 = int(sub(x0)), int(sub(x1)), int(sub(y0)), int(sub(y1))
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            if not (0 <= x < CW and 0 <= y < CH) or img[y][x] not in BODY:
                continue
            cx, cy = (x + (y // 2) % 2) // 2, y // 2
            h = hash2(cx, cy)
            if h < 24:
                img[y][x] = 'L' if img[y][x] in 'OD' else img[y][x]
            elif h > 238:
                img[y][x] = 'D' if img[y][x] == 'O' else img[y][x]


def outline(img):
    """Soft outline: each outline pixel takes a dark mix of the colour it touches, not one flat black."""
    out = [r[:] for r in img]
    for y in range(CH):
        for x in range(CW):
            if img[y][x] != '.':
                continue
            for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < CW and 0 <= ny < CH and img[ny][nx] != '.':
                    k = img[ny][nx]
                    if k in 'NEhTtM':
                        k = 'K'
                    key = 'o' + k
                    if key not in COL:
                        COL[key] = INK if k == 'K' else mix(COL[k], INK, 0.62)
                    out[y][x] = key
                    break
    return out


def paw(img, x, y):
    ellipse(img, x + 0.5, y + 0.15, 1.4, 0.8, 'W')
    ellipse(img, x + 0.4, y + 0.55, 1.4, 0.35, 'm')
    for dx in (-0.35, 0.45):                       # toes
        put(img, sub(x + dx), sub(y + 0.45), 'S')


def limb(img, pts, r, c, with_paw=True):
    for a, b in zip(pts, pts[1:]):
        line(img, a, b, r, c)
    mid = pts[len(pts) // 2]
    ellipse(img, mid[0] + 0.1, mid[1], r + 0.35, 0.8, 'L' if c == 'O' else c, clip=lambda k: k in 'OD')
    if with_paw:
        paw(img, pts[-1][0], pts[-1][1])


def terrier(front, hind, tongue=False, wag=0.0, lying=False, bob=0.0, sit=False, bark=False):
    """front / hind: [(near leg points), (far leg points)] as lists of (x, y) design units; ignored when lying."""
    img = new()
    if sit:
        # sitting: haunch on the ground, torso rising to a raised chest, front legs straight, head a little higher
        by = 11.4
        dy = -0.8
        # tail curls up behind him; `wag` swings its tip
        line(img, (4.4, 16.4), (2.4, 17.4), 0.5, 'O')
        line(img, (2.4, 17.4), (1.2 + wag, 15.2), 0.42, 'O')
        ellipse(img, 1.2 + wag, 14.9, 0.55, 0.85, 'W')
        limb(img, [(12.0, 12.6), (12.1, 15.8), (12.2, G)], 0.62, 'D')                     # far front leg
        ellipse(img, 6.6, 16.0, 3.2, 2.9, 'O')                                             # haunch on the ground
        ellipse(img, 9.6, 13.4, 3.6, 2.7, 'O', tilt=-0.7)                                  # torso rising to the chest
        ellipse(img, 12.6, 12.0, 2.5, 2.8, 'O')                                            # deep chest
        ellipse(img, 6.8, 17.5, 3.0, 1.1, 'D', clip=lambda k: k == 'O')                    # shade under the haunch
        ellipse(img, 8.4, 11.9, 3.0, 0.6, 'L', tilt=-0.7, clip=lambda k: k == 'O')         # light along the back
        ellipse(img, 7.4, 15.4, 1.6, 1.0, 'L', clip=lambda k: k == 'O')                    # the round of the thigh
        paw(img, 8.6, G - 0.1)                                                             # hind paw tucked forward
        limb(img, [(13.0, 12.6), (13.2, 15.8), (13.4, G)], 0.68, 'O')                     # near front leg
    else:
        by = (12.4 if not lying else 16.2) - bob        # rib-cage centre height, lifted by `bob` while trotting
        dy = (0.0 if not lying else 6.2) - bob * 0.6    # how far the head is lowered
        # tail: thin, hangs low from the rump and curls out, light tuft at the tip
        line(img, (3.2, by - 0.4), (1.8, by + 2.2), 0.5, 'O')
        line(img, (1.8, by + 2.2), (1.9 + wag, by + 4.0), 0.42, 'O')
        ellipse(img, 1.9 + wag, by + 4.2, 0.55, 0.85, 'W')
        # far legs first, then the body, then near legs
        if not lying:
            limb(img, front[1], 0.62, 'D')
            limb(img, hind[1], 0.62, 'D')
        # body: deep chest, ribs, roached loin (the highest point of the back), rump sloping down, belly tucked up
        ellipse(img, 14.0, by + 0.3, 2.8, 2.6, 'O')
        ellipse(img, 10.6, by, 5.0, 2.5, 'O')
        ellipse(img, 7.8, by - 1.3, 3.0, 1.8, 'O')
        ellipse(img, 4.9, by + 0.1, 2.4, 1.9, 'O')
        # shading: dark underneath, lit along the back, deep shadow in the tuck-up
        ellipse(img, 10.4, by + 2.0, 5.6, 1.5, 'D', clip=lambda k: k == 'O')
        ellipse(img, 5.6, by + 1.4, 2.4, 1.1, 'D', clip=lambda k: k == 'O')
        ellipse(img, 8.2, by + 2.0, 1.6, 0.45, 'S', clip=lambda k: k == 'D')
        ellipse(img, 7.9, by - 2.4, 3.4, 0.7, 'L', clip=lambda k: k == 'O')
        if not lying:
            limb(img, front[0], 0.68, 'O')
            limb(img, hind[0], 0.68, 'O')
    # long arched neck rising forward from the shoulders, fluffy ruff at the front of the chest
    ellipse(img, 14.4, by - 2.8, 1.9, 3.2, 'O', tilt=-0.62)
    ellipse(img, 15.4, by - 0.6, 1.1, 2.0, 'm', tilt=-0.25, clip=lambda k: k in BODY)
    ellipse(img, 13.4, by - 3.6, 0.9, 1.9, 'L', tilt=-0.62, clip=lambda k: k in BODY)
    curls(img, 2.0, 16.6, by - 6.4, by + (6.6 if sit else 3.4))
    # head, dy lowered when asleep. One egg shape tilted toward the nose, so the profile from the crown to the nose
    # is a single smooth, slightly rounded slope: no step at the forehead.
    ellipse(img, 18.6, 4.4 + dy, 6.0, 3.3, 'W', tilt=0.3)               # skull and muzzle as one egg
    ellipse(img, 16.2, 3.0 + dy, 3.1, 2.6, 'W', tilt=0.2)               # rounded crown of the topknot
    ellipse(img, 22.2, 5.5 + dy, 2.2, 1.5, 'W', tilt=0.25)              # nose end
    ellipse(img, 16.6, 7.3 + dy, 3.0, 1.8, 'W')                          # throat, joins the head to the neck
    # soft shading: under the jaw, along the muzzle, and curls on the topknot
    ellipse(img, 20.6, 7.1 + dy, 3.4, 0.9, 'm', tilt=0.18, clip=lambda k: k == 'W')
    ellipse(img, 21.9, 6.5 + dy, 1.9, 0.5, 'm', tilt=0.25, clip=lambda k: k == 'W')
    X0, X1, Y0, Y1 = int(sub(13.0)), int(sub(19.5)), int(sub(0.4 + dy)), int(sub(4.6 + dy))
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            if 0 <= x < CW and 0 <= y < CH and img[y][x] == 'W' and hash2((x + (y // 2) % 2) // 2, y // 2) < 30:
                img[y][x] = 'm'
    # eye: a dark almond
    # kept plain and a little larger than life: on a terminal cell (two colours at most) a socket ring or a spark
    # of light would crowd the eye out
    ellipse(img, 19.9, 4.4 + dy, 0.8, 0.55, 'E', tilt=0.25)
    # big dark nose at the very tip, with a shine
    ellipse(img, 23.75, 5.5 + dy, 0.95, 0.8, 'N', tilt=0.2)
    put(img, sub(23.5), sub(5.2 + dy), 'h')
    if bark:
        # open mouth: dark inside, the lower jaw dropped a little, the tip of the tongue
        polygon(img, [(20.4, 6.3 + dy), (23.5, 5.9 + dy), (23.3, 7.7 + dy), (20.8, 7.3 + dy)], 'M')
        ellipse(img, 21.6, 6.9 + dy, 0.8, 0.35, 'T', tilt=0.2)
        ellipse(img, 21.4, 8.1 + dy, 2.1, 0.6, 'W', tilt=0.22)
    else:
        # mouth line along the lower muzzle
        for i in range(7):
            put(img, sub(22.6 - i * 0.36), sub(6.5 + dy + i * 0.07), 'S')
    # long ear close to the head: wide at the base, tapering and slanting back to a ragged light tassel
    polygon(img, [(15.6, 2.8 + dy), (17.3, 3.1 + dy), (17.4, 5.2 + dy), (16.6, 7.4 + dy), (15.4, 9.0 + dy),
                  (14.8, 7.0 + dy), (14.8, 4.4 + dy)], 'D')
    ellipse(img, 16.2, 4.6 + dy, 0.55, 1.4, 'e', tilt=0.12, clip=lambda k: k == 'D')            # inner shade, soft
    ellipse(img, 16.9, 3.7 + dy, 0.5, 0.7, 'L', clip=lambda k: k == 'D')                         # light on the fold
    polygon(img, [(14.9, 7.8 + dy), (16.6, 7.6 + dy), (16.2, 9.4 + dy), (15.4, 10.6 + dy), (14.9, 9.2 + dy)], 'W')
    if tongue:
        polygon(img, [(21.2, 6.8 + dy), (22.7, 6.8 + dy), (22.6, 8.6 + dy), (22.0, 9.2 + dy), (21.3, 8.5 + dy)], 'T')
        line(img, (21.95, 6.9 + dy), (21.95, 8.7 + dy), 0.06, 't')
    if lying:
        line(img, (12.8, by + 2.4), (19.6, by + 2.6), 0.7, 'W')          # paws stretched forward
        for x in (17.4, 18.6, 19.8):
            put(img, sub(x), sub(by + 2.7), 'S')
    return outline(img)


G = 19.0  # ground (paw) height
HF, HH = 14.0, 14.0  # shoulder and hip joint heights
STAND_F = [[(13.4, HF), (13.6, 16.6), (13.8, G)], [(12.2, HF), (12.2, 16.6), (12.2, G)]]
STAND_H = [[(5.6, HH), (3.8, 16.6), (4.4, G)], [(6.4, HH), (6.6, 16.6), (6.8, G)]]


def foot(hip_x, phase, stride=2.3, lift=1.9):
    """One foot over a step cycle. First half: planted, the body carries the hip over it (the foot slides back).
    Second half: lifted and swung forward, high in the middle."""
    p = phase % 1.0
    if p < 0.5:
        return hip_x + stride * (1 - 4 * p), G
    t = (p - 0.5) * 2
    return hip_x - stride + 2 * stride * t, G - lift * math.sin(math.pi * t)


def leg(hip_x, hip_y, phase, hind):
    fx, fy = foot(hip_x, phase)
    mx, my = (hip_x + fx) / 2, (hip_y + fy) / 2
    mx += -1.0 if hind else -0.25          # hocks point back, elbows a little
    if fy < G - 0.2:                        # a lifted foot folds its joint up
        my -= 0.5
    return [(hip_x, hip_y), (mx, my), (fx, fy)]


def trot(phase):
    """Diagonal pairs move together: near front with far hind, far front with near hind."""
    bob = 0.45 * abs(math.sin(2 * math.pi * phase))
    hf, hh = HF - bob, HH - bob
    front = [leg(13.6, hf, phase, False), leg(12.4, hf, phase + 0.5, False)]
    hind = [leg(5.8, hh, phase + 0.5, True), leg(6.6, hh, phase, True)]
    return front, hind, bob, 0.7 * math.sin(2 * math.pi * phase * 2)


RUN = []
for i in range(6):
    f, h, bob, wag = trot(i / 6)
    RUN.append(terrier(f, h, bob=bob, wag=wag))
PANT = [terrier(STAND_F, STAND_H, tongue=True), terrier(STAND_F, STAND_H, tongue=True, wag=1.0)]
SLEEP = [terrier(None, None, lying=True), terrier(None, None, lying=True, wag=1.0)]
SIT = [terrier(None, None, sit=True), terrier(None, None, sit=True, wag=0.5)]
WAG = [terrier(None, None, sit=True, wag=w) for w in (-0.9, 0.0, 0.9, 0.0)]
BARK = [terrier(None, None, sit=True, bark=True), terrier(None, None, sit=True, bark=True, wag=0.6), terrier(None, None, sit=True)]

palette, index = [], {}


def encode(img):
    rows = []
    for row in img:
        s = ''
        for c in row:
            if c == '.':
                s += '.'
                continue
            if c not in index:
                index[c] = len(palette)
                palette.append('%02x%02x%02x' % COL[c])
            s += ALPHABET[index[c]]
        rows.append(s)
    return rows


def pack(frames, durations):
    return {'durations': durations, 'frames': [encode(f) for f in frames]}


sets = {'run': pack(RUN, [80] * len(RUN)), 'pant': pack(PANT, [260, 260]), 'sleep': pack(SLEEP, [700, 700]),
        'sit': pack(SIT, [900, 900]), 'wag': pack(WAG, [110] * 4), 'bark': pack(BARK, [170, 170, 260])}
assert len(palette) <= len(ALPHABET), len(palette)
json.dump({'alphabet': ALPHABET, 'palette': palette, 'width': CW, 'height': CH, 'subpixel': True, 'sets': sets},
          open('terrier-frames.json', 'w'), separators=(',', ':'))
print('coat', coat, '| k', K, '|', CW, 'x', CH, 'sub-pixels =', CW // 2, 'columns x', CH // 4, 'rows |', len(palette), 'colors')

if '--preview' in sys.argv:
    from PIL import Image
    Z = max(3, int(round(6 / K)))
    frames = SIT[:1] + WAG[:1] + BARK[:1] + RUN[:1] + PANT[:1] + SLEEP[:1]
    sheet = Image.new('RGB', (len(frames) * (CW * Z + 14), CH * Z), (24, 24, 30))
    for n, im in enumerate(frames):
        for y, row in enumerate(im):
            for x, c in enumerate(row):
                if c != '.':
                    for dy in range(Z):
                        for dx in range(Z):
                            sheet.putpixel((n * (CW * Z + 14) + x * Z + dx, y * Z + dy), COL[c])
    sheet.save('terrier-preview.png')
