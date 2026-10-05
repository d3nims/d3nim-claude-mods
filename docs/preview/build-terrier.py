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


ROT = None  # (angle, cx, cy) in design units while the body pitches; legs and paws are drawn unrotated


def turn(x, y):
    if ROT is None:
        return x, y
    a, cx, cy = ROT
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def put(img, x, y, c):
    if ROT is not None:
        dx_, dy_ = turn((x - MARGIN) / S, (y - MARGIN) / S)
        x, y = sub(dx_), sub(dy_)
    x, y = int(round(x)), int(round(y))
    if 0 <= x < CW and 0 <= y < CH:
        img[y][x] = c


def ellipse(img, cx, cy, rx, ry, c, tilt=0.0, clip=None):
    cx, cy = turn(cx, cy)
    tilt += ROT[0] if ROT is not None else 0.0
    cx, cy, rx, ry = sub(cx), sub(cy), max(0.8, rx * S), max(0.8, ry * S)
    ct, st = math.cos(tilt), math.sin(tilt)
    for y in range(CH):
        for x in range(CW):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u, v = dx * ct + dy * st, -dx * st + dy * ct
            if (u / rx) ** 2 + (v / ry) ** 2 <= 1.0 and (clip is None or clip(img[y][x])):
                img[y][x] = c


def polygon(img, pts, c, clip=None):
    pts = [(sub(x), sub(y)) for x, y in (turn(*q) for q in pts)]
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


def paw(img, x, y, far=False):
    # the far paws are shaded, so the near and far legs read apart
    ellipse(img, x + 0.5, y + 0.15, 1.3 if far else 1.4, 0.8, 'm' if far else 'W')
    ellipse(img, x + 0.4, y + 0.55, 1.3 if far else 1.4, 0.35, 'S' if far else 'm')
    for dx in (-0.35, 0.45):                       # toes
        put(img, sub(x + dx), sub(y + 0.45), 'S')


def limb(img, pts, r, c, with_paw=True, far=False):
    global ROT
    # the hip rides on the pitching body; the rest of the leg reaches for the ground unrotated
    pts = [turn(*pts[0])] + list(pts[1:])
    saved, ROT = ROT, None
    _limb(img, pts, r, c, with_paw, far)
    ROT = saved


def _limb(img, pts, r, c, with_paw, far):
    for a, b in zip(pts, pts[1:]):
        line(img, a, b, r, c)
    mid = pts[len(pts) // 2]
    ellipse(img, mid[0] + 0.1, mid[1], r + 0.35, 0.8, 'L' if c == 'O' else c, clip=lambda k: k in 'OD')
    if with_paw:
        paw(img, pts[-1][0], pts[-1][1], far)


def terrier(front, hind, tongue=False, wag=0.0, lying=False, bob=0.0, sit=False, bark=False, dash=False, hx=0.0, st=0.0, pitch=0.0, hy=0.0):
    global ROT
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
        limb(img, [(12.0, 12.6), (12.1, 15.8), (12.2, G)], 0.62, 'S', far=True)                     # far front leg
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
        dy = (0.0 if not lying else 6.2) - bob * 0.6 + (2.6 if dash else 0.0) + hy  # head lowered; running, he stretches it out at body height
        # galloping, the whole body rocks: nose up as the hind legs push, nose down as the front feet land
        ROT = (pitch, 10.6, by) if pitch else None
        # tail: thin, hangs low from the rump and curls out, light tuft at the tip
        if dash:
            # running flat out: the tail streams out behind
            line(img, (3.4 - st, by - 0.6), (1.4 - st, by - 0.4 + wag * 0.3), 0.5, 'O')
            line(img, (1.4 - st, by - 0.4 + wag * 0.3), (-0.2 - st, by - 1.0 + wag * 0.6), 0.42, 'O')
            ellipse(img, -0.2 - st, by - 1.1 + wag * 0.6, 0.8, 0.5, 'W')
        else:
            line(img, (3.2, by - 0.4), (1.8, by + 2.2), 0.5, 'O')
            line(img, (1.8, by + 2.2), (1.9 + wag, by + 4.0), 0.42, 'O')
            ellipse(img, 1.9 + wag, by + 4.2, 0.55, 0.85, 'W')
        # far legs first, then the body, then near legs
        if not lying:
            limb(img, front[1], 0.62, 'D', far=True)
            limb(img, hind[1], 0.62, 'D', far=True)
        # body: deep chest, ribs, roached loin (the highest point of the back), rump sloping down, belly tucked up
        ellipse(img, 14.0 + st, by + 0.3, 2.8, 2.6, 'O')
        ellipse(img, 10.6, by, 5.0 + st * 0.8, 2.5 - max(0.0, st) * 0.25, 'O')
        ellipse(img, 7.8 - st * 0.5, by - 1.3 - min(0.0, st) * 1.4, 3.0, 1.8 - min(0.0, st) * 0.4, 'O')
        ellipse(img, 4.9 - st, by + 0.1, 2.4, 1.9, 'O')
        # shading: dark underneath, lit along the back, deep shadow in the tuck-up
        ellipse(img, 10.4, by + 2.0, 5.6, 1.5, 'D', clip=lambda k: k == 'O')
        ellipse(img, 5.6, by + 1.4, 2.4, 1.1, 'D', clip=lambda k: k == 'O')
        ellipse(img, 8.2, by + 2.0, 1.6, 0.45, 'S', clip=lambda k: k == 'D')
        ellipse(img, 7.9, by - 2.4, 3.4, 0.7, 'L', clip=lambda k: k == 'O')
        if not lying:
            limb(img, front[0], 0.68, 'O')
            limb(img, hind[0], 0.68, 'O')
    # long arched neck rising forward from the shoulders, fluffy ruff at the front of the chest
    nx, ny = hx * 0.6 + st, (dy * 0.45 if dash else 0.0)       # the neck reaches out with the head when he runs
    ellipse(img, 14.4 + nx, by - 2.8 + ny, 1.9, 3.2, 'O', tilt=-0.62 + (0.35 if dash else 0.0))
    ellipse(img, 15.4 + nx, by - 0.6 + ny * 0.5, 1.1, 2.0, 'm', tilt=-0.25, clip=lambda k: k in BODY)
    ellipse(img, 13.4 + nx, by - 3.6 + ny, 0.9, 1.9, 'L', tilt=-0.62, clip=lambda k: k in BODY)
    curls(img, 2.0, 16.6, by - 6.4, by + (6.6 if sit else 3.4))
    # head, dy lowered when asleep. One egg shape tilted toward the nose, so the profile from the crown to the nose
    # is a single smooth, slightly rounded slope: no step at the forehead.
    ellipse(img, 18.6 + hx, 4.4 + dy, 6.0, 3.3, 'W', tilt=0.3)               # skull and muzzle as one egg
    ellipse(img, 16.2 + hx, 3.0 + dy, 3.1, 2.6, 'W', tilt=0.2)               # rounded crown of the topknot
    ellipse(img, 22.2 + hx, 5.5 + dy, 2.2, 1.5, 'W', tilt=0.25)              # nose end
    ellipse(img, 16.6 + hx, 7.3 + dy, 3.0, 1.8, 'W')                          # throat, joins the head to the neck
    # soft shading: under the jaw, along the muzzle, and curls on the topknot
    ellipse(img, 20.6 + hx, 7.1 + dy, 3.4, 0.9, 'm', tilt=0.18, clip=lambda k: k == 'W')
    ellipse(img, 21.9 + hx, 6.5 + dy, 1.9, 0.5, 'm', tilt=0.25, clip=lambda k: k == 'W')
    X0, X1, Y0, Y1 = int(sub(13.0 + hx)), int(sub(19.5 + hx)), int(sub(0.4 + dy - abs(pitch) * 12)), int(sub(4.6 + dy + abs(pitch) * 12))
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            if 0 <= x < CW and 0 <= y < CH and img[y][x] == 'W' and hash2((x + (y // 2) % 2) // 2, y // 2) < 30:
                img[y][x] = 'm'
    # eye: a dark almond
    # kept plain and a little larger than life: on a terminal cell (two colours at most) a socket ring or a spark
    # of light would crowd the eye out
    ellipse(img, 19.9 + hx, 4.4 + dy, 0.8, 0.55, 'E', tilt=0.25)
    # big dark nose at the very tip, with a shine
    ellipse(img, 23.75 + hx, 5.5 + dy, 0.95, 0.8, 'N', tilt=0.2)
    put(img, sub(23.5 + hx), sub(5.2 + dy), 'h')
    if bark:
        # open mouth: dark inside, the lower jaw dropped a little, the tip of the tongue
        polygon(img, [(20.4 + hx, 6.3 + dy), (23.5 + hx, 5.9 + dy), (23.3 + hx, 7.7 + dy), (20.8 + hx, 7.3 + dy)], 'M')
        ellipse(img, 21.6 + hx, 6.9 + dy, 0.8, 0.35, 'T', tilt=0.2)
        ellipse(img, 21.4 + hx, 8.1 + dy, 2.1, 0.6, 'W', tilt=0.22)
    else:
        # mouth line along the lower muzzle
        for i in range(7):
            put(img, sub(22.6 + hx - i * 0.36), sub(6.5 + dy + i * 0.07), 'S')
    # long ear close to the head: wide at the base, tapering and slanting back to a ragged light tassel
    polygon(img, [(15.6 + hx, 2.8 + dy), (17.3 + hx, 3.1 + dy), (17.4 + hx, 5.2 + dy), (16.6 + hx, 7.4 + dy), (15.4 + hx, 9.0 + dy),
                  (14.8 + hx, 7.0 + dy), (14.8 + hx, 4.4 + dy)], 'D')
    ellipse(img, 16.2 + hx, 4.6 + dy, 0.55, 1.4, 'e', tilt=0.12, clip=lambda k: k == 'D')            # inner shade, soft
    ellipse(img, 16.9 + hx, 3.7 + dy, 0.5, 0.7, 'L', clip=lambda k: k == 'D')                         # light on the fold
    polygon(img, [(14.9 + hx, 7.8 + dy), (16.6 + hx, 7.6 + dy), (16.2 + hx, 9.4 + dy), (15.4 + hx, 10.6 + dy), (14.9 + hx, 9.2 + dy)], 'W')
    if tongue:
        polygon(img, [(21.2 + hx, 6.8 + dy), (22.7 + hx, 6.8 + dy), (22.6 + hx, 8.6 + dy), (22.0 + hx, 9.2 + dy), (21.3 + hx, 8.5 + dy)], 'T')
        line(img, (21.95 + hx, 6.9 + dy), (21.95 + hx, 8.7 + dy), 0.06, 't')
    if lying:
        line(img, (12.8, by + 2.4), (19.6, by + 2.6), 0.7, 'W')          # paws stretched forward
        for x in (17.4, 18.6, 19.8):
            put(img, sub(x), sub(by + 2.7), 'S')
    ROT = None
    return outline(img)


G = 19.0  # ground (paw) height
HF, HH = 14.0, 14.0  # shoulder and hip joint heights
STAND_F = [[(13.4, HF), (13.6, 16.6), (13.8, G)], [(12.2, HF), (12.2, 16.6), (12.2, G)]]
STAND_H = [[(5.6, HH), (3.8, 16.6), (4.4, G)], [(6.4, HH), (6.6, 16.6), (6.8, G)]]


def foot(hip_x, phase, stride=2.3, lift=1.9):  # stride/lift are widened for the running trot below
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


def gallop_frame(front_near, front_far, hind_near, hind_far, bob, wag):
    hf, hh = HF - bob, HH - bob
    pts = lambda hip, y, knee, paw: [(hip, y), knee, paw]
    return terrier([pts(13.4, hf, *front_near), pts(12.2, hf, *front_far)],
                   [pts(5.6, hh, *hind_near), pts(6.4, hh, *hind_far)], bob=bob, wag=wag, dash=True)


# A gallop: four key poses, the far legs a beat behind the near ones so all four legs show, and in-between frames
# so it flows. Each leg is (knee, paw) in design units; the far legs are drawn darker, behind the body.
#   1 stretched out: front legs reaching, hind legs pushed back
#   2 front feet land, the far one first; hind legs swing forward
#   3 gathered: all four legs under him, body in the air
#   4 hind feet push off, the far one first; front legs reach out again
GALLOP_KEYS = [
    dict(fn=((16.0, 15.6), (17.9, 17.3)), ff=((14.6, 16.4), (15.4, G - 0.2)),
         hn=((3.0, 15.4), (0.9, 17.3)), hf=((4.6, 16.2), (2.8, G - 0.2)), bob=0.2, wag=-1.0),
    dict(fn=((15.2, 16.0), (16.0, G - 0.5)), ff=((13.6, 16.4), (13.4, G)),
         hn=((5.0, 16.0), (5.4, G - 1.4)), hf=((3.8, 16.2), (3.4, G - 0.7)), bob=0.0, wag=0.0),
    dict(fn=((14.0, 15.8), (12.8, 17.0)), ff=((12.6, 16.0), (11.0, 17.6)),
         hn=((7.6, 15.8), (9.4, 17.1)), hf=((6.8, 16.0), (8.0, 17.8)), bob=1.0, wag=1.0),
    dict(fn=((15.0, 15.7), (16.0, 17.4)), ff=((13.4, 16.2), (14.0, G - 0.6)),
         hn=((7.0, 16.4), (8.2, G)), hf=((5.6, 16.4), (6.4, G)), bob=0.45, wag=0.0),
]


def _mix(a, b, t):
    if isinstance(a, (int, float)):
        return a + (b - a) * t
    return tuple(_mix(x, y, t) for x, y in zip(a, b))


def gallop_frame(k):
    hf_, hh_ = HF - k['bob'], HH - k['bob']
    leg_ = lambda hip, y, kp: [(hip, y), kp[0], kp[1]]
    return terrier([leg_(13.4, hf_, k['fn']), leg_(12.2, hf_, k['ff'])],
                   [leg_(5.6, hh_, k['hn']), leg_(6.4, hh_, k['hf'])], bob=k['bob'], wag=k['wag'], dash=True)


def run_leg(hip_x, hip_y, phase, hind, stride=3.1, lift=2.6):
    p = phase % 1.0
    if p < 0.5:
        fx, fy = hip_x + stride * (1 - 4 * p), G
    else:
        t = (p - 0.5) * 2
        fx, fy = hip_x - stride + 2 * stride * t, G - lift * math.sin(math.pi * t)
    mx, my = (hip_x + fx) / 2 + (-1.1 if hind else -0.3), (hip_y + fy) / 2 - (0.7 if fy < G - 0.2 else 0)
    return [(hip_x, hip_y), (mx, my), (fx, fy)]


RUN_FAST = []
for i in range(6):
    ph = i / 6
    bob = 0.8 * abs(math.sin(2 * math.pi * ph))
    hf_, hh_ = HF - bob, HH - bob
    front = [run_leg(13.6, hf_, ph, False), run_leg(12.4, hf_, ph + 0.5, False)]
    hind = [run_leg(5.8, hh_, ph + 0.5, True), run_leg(6.6, hh_, ph, True)]
    RUN_FAST.append(terrier(front, hind, bob=bob, wag=math.sin(2 * math.pi * ph * 2), dash=True))

# A gallop after Muybridge's 1887 plates of a galloping dog: the head out at body height, the body bunching up and
# stretching out, the legs reaching far forward and far back. Four key poses (st = body stretch, hx = head forward):
#   1 gathered: all four legs under him, body bunched, in the air
#   2 front legs reach out while the hind legs push off behind
#   3 stretched flat out in the air
#   4 front feet land, hind legs swing forward
DASH_KEYS = [
    # far legs sit a beat behind the near ones and at least a cell apart, so each gets a terminal cell of its own
    dict(st=-0.6, bob=1.0, hx=1.0, wag=0.5, pitch=-0.10, hy=-0.5,
         fn=((13.2, 16.0), (12.0, 17.3)), ff=((11.6, 16.3), (9.6, 17.9)),
         hn=((8.2, 15.8), (10.4, 17.1)), hf=((6.6, 16.2), (7.4, 18.0))),
    dict(st=0.2, bob=0.3, hx=1.6, wag=0.0, pitch=-0.07, hy=-0.2,
         fn=((16.0, 15.6), (18.0, 17.3)), ff=((14.2, 16.4), (15.2, G - 0.1)),
         hn=((3.4, 16.2), (2.0, G)), hf=((5.0, 16.4), (4.6, G))),
    dict(st=1.0, bob=0.8, hx=2.0, wag=-1.0, pitch=0.0, hy=0.2,
         fn=((17.2, 15.4), (19.6, 16.9)), ff=((15.4, 16.0), (16.8, 18.0)),
         hn=((2.0, 15.6), (-0.4, 16.9)), hf=((3.6, 16.0), (2.0, 17.9))),
    dict(st=0.4, bob=0.0, hx=1.6, wag=0.0, pitch=0.09, hy=0.7,
         fn=((15.8, 16.2), (16.8, G)), ff=((14.0, 16.4), (14.0, G)),
         hn=((5.4, 16.0), (6.4, 17.5)), hf=((4.0, 16.4), (3.8, 18.2))),
]


def dash_frame(k):
    hf_, hh_ = HF - k['bob'], HH - k['bob']
    leg_ = lambda hip, y, kp: [(hip, y), kp[0], kp[1]]
    return terrier([leg_(13.4 + k['st'], hf_, k['fn']), leg_(12.2 + k['st'], hf_, k['ff'])],
                   [leg_(5.6 - k['st'], hh_, k['hn']), leg_(6.4 - k['st'], hh_, k['hf'])],
                   bob=k['bob'], wag=k['wag'], dash=True, hx=k['hx'], st=k['st'], pitch=k['pitch'], hy=k['hy'])


DASH = []
for i in range(8):
    a_, b_ = DASH_KEYS[i // 2], DASH_KEYS[(i // 2 + 1) % 4]
    t_ = (i % 2) * 0.5
    DASH.append(dash_frame({key: _mix(a_[key], b_[key], t_) for key in a_}))

GALLOP = []
for i in range(8):
    a_, b_ = GALLOP_KEYS[i // 2], GALLOP_KEYS[(i // 2 + 1) % 4]
    t_ = (i % 2) * 0.5
    GALLOP.append(gallop_frame({key: _mix(a_[key], b_[key], t_) for key in a_}))

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


sets = {'walk': pack(RUN, [80] * len(RUN)), 'run': pack(DASH, [60] * len(DASH)), 'trot': pack(RUN_FAST, [55] * len(RUN_FAST)), 'gallop': pack(GALLOP, [55] * len(GALLOP)), 'pant': pack(PANT, [260, 260]), 'sleep': pack(SLEEP, [700, 700]),
        'sit': pack(SIT, [900, 900]), 'wag': pack(WAG, [110] * 4), 'bark': pack(BARK, [170, 170, 260])}
assert len(palette) <= len(ALPHABET), len(palette)
json.dump({'alphabet': ALPHABET, 'palette': palette, 'width': CW, 'height': CH, 'subpixel': True, 'sets': sets},
          open('terrier-frames.json', 'w'), separators=(',', ':'))
print('coat', coat, '| k', K, '|', CW, 'x', CH, 'sub-pixels =', CW // 2, 'columns x', CH // 4, 'rows |', len(palette), 'colors')

if '--preview' in sys.argv:
    from PIL import Image
    Z = max(3, int(round(6 / K)))
    frames = DASH
    sheet = Image.new('RGB', (len(frames) * (CW * Z + 14), CH * Z), (24, 24, 30))
    for n, im in enumerate(frames):
        for y, row in enumerate(im):
            for x, c in enumerate(row):
                if c != '.':
                    for dy in range(Z):
                        for dx in range(Z):
                            sheet.putpixel((n * (CW * Z + 14) + x * Z + dx, y * Z + dy), COL[c])
    sheet.save('terrier-preview.png')
