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
    'P': (226, 156, 168),             # inside of the ear, shown when it flaps up
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
HS = None   # (scale, cx, cy, angle): the head drawn smaller about its neck joint (running: the body stretches, the head
            # must not grow), and turned by `angle` there (stretching, he lifts his chin while his body slopes down)


def turn(x, y):
    if HS is not None:
        s_, hx_, hy_, a_ = HS
        x, y = hx_ + (x - hx_) * s_, hy_ + (y - hy_) * s_
        if a_:
            dx_, dy_ = x - hx_, y - hy_
            x, y = hx_ + dx_ * math.cos(a_) - dy_ * math.sin(a_), hy_ + dx_ * math.sin(a_) + dy_ * math.cos(a_)
    if ROT is None:
        return x, y
    a, cx, cy = ROT
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def put(img, x, y, c):
    if ROT is not None or HS is not None:
        dx_, dy_ = turn((x - MARGIN) / S, (y - MARGIN) / S)
        x, y = sub(dx_), sub(dy_)
    x, y = int(round(x)), int(round(y))
    if 0 <= x < CW and 0 <= y < CH:
        img[y][x] = c


def ellipse(img, cx, cy, rx, ry, c, tilt=0.0, clip=None):
    cx, cy = turn(cx, cy)
    tilt += (ROT[0] if ROT is not None else 0.0) + (HS[3] if HS is not None else 0.0)
    k_ = HS[0] if HS is not None else 1.0
    cx, cy, rx, ry = sub(cx), sub(cy), max(0.8, rx * S * k_), max(0.8, ry * S * k_)
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


def contour(img, pts, key='oO', dotted=False):
    """An inner outline along a polyline, one pixel wide, in the soft outline colour: in braille it is a gap in the
    dots, which is how a shape inside him (an ear, a folded leg) shows against the same white coat."""
    if key not in COL:
        COL[key] = mix(COL[key[1]], INK, 0.62)
    for a_, b_ in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) * S * 1.6))
        for i in range(n + 1):
            t = i / n
            if dotted:
                # every other pixel: a fainter line (a solid one reads, in braille, as a thick groove)
                x, y = turn(a_[0] + (b_[0] - a_[0]) * t, a_[1] + (b_[1] - a_[1]) * t)
                x, y = int(round(sub(x))), int(round(sub(y)))
                if (x + y) % 2 == 0 and 0 <= x < CW and 0 <= y < CH:
                    img[y][x] = key
            else:
                put(img, sub(a_[0] + (b_[0] - a_[0]) * t), sub(a_[1] + (b_[1] - a_[1]) * t), key)


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


# Light from above: the top rim of every body part catches the light, the underside falls into shade, two pixels deep
# with a softer second step. It reuses the coat's own tones, so it adds no colours.
RIM_UP = {'O': 'L', 'D': 'O', 'S': 'D', 'L': 'W', 'm': 'W'}
RIM_DOWN = {'O': 'D', 'L': 'O', 'W': 'm', 'm': 'O', 'D': 'S'}
RIM_DOWN2 = {'O': 'D', 'L': 'O', 'W': 'm'}


# Each body part shaded like a cylinder lit from above: in every column, the top quarter of a run of coat is a tone
# lighter, the lowest third a tone darker and the very bottom two tones darker (where he meets the ground stays lit).
LIGHTER = {'S': 'D', 'D': 'O', 'O': 'L', 'L': 'W', 'm': 'W'}
DARKER = {'W': 'm', 'm': 'O', 'L': 'O', 'O': 'D', 'D': 'S'}
COAT = set('SDOLWm')


def volume(img):
    out = [r[:] for r in img]
    contact = int(sub(G)) - 1
    for x in range(CW):
        y = 0
        while y < CH:
            if img[y][x] not in COAT:
                y += 1
                continue
            top = y
            while y < CH and img[y][x] in COAT:
                y += 1
            bottom = y - 1
            span = bottom - top
            if span < 3:
                continue
            for yy in range(top, bottom + 1):
                t = (yy - top) / span
                k = img[yy][x]
                if t <= 0.25:
                    out[yy][x] = LIGHTER.get(k, k)
                elif yy < contact and t >= 0.9:
                    out[yy][x] = DARKER.get(DARKER.get(k, k), k)
                elif yy < contact and t >= 0.7:
                    out[yy][x] = DARKER.get(k, k)
    return out


def shade(img):
    img = volume(img)
    out = [r[:] for r in img]
    empty = lambda x, y: not (0 <= x < CW and 0 <= y < CH) or img[y][x] == '.'
    contact = int(sub(G)) - 1   # where he meets the ground stays lit: a shaded underside there reads as floating
    for y in range(CH):
        for x in range(CW):
            k = img[y][x]
            if empty(x, y - 1) and k in RIM_UP:
                out[y][x] = RIM_UP[k]
            elif y >= contact:
                continue
            elif empty(x, y + 1) and k in RIM_DOWN:
                out[y][x] = RIM_DOWN[k]
            elif empty(x, y + 2) and k in RIM_DOWN2 and not empty(x, y + 1):
                out[y][x] = RIM_DOWN2[k]
    return out


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


def paw(img, x, y, far=False, small=False):
    # the far paws are shaded, so the near and far legs read apart; a galloping foot is drawn neater (small)
    k = 0.7 if small else 1.0
    ellipse(img, x + 0.5 * k, y + 0.15, (1.3 if far else 1.4) * k, 0.8 * k, 'm' if far else 'W')
    ellipse(img, x + 0.4 * k, y + 0.55, (1.3 if far else 1.4) * k, 0.35, 'S' if far else 'm')
    for dx in (-0.35, 0.45):                       # toes
        put(img, sub(x + dx), sub(y + 0.45), 'S')


def limb(img, pts, r, c, with_paw=True, far=False, thigh=False):
    global ROT
    # the hip rides on the pitching body; the rest of the leg reaches for the ground unrotated
    pts = [turn(*pts[0])] + list(pts[1:])
    saved, ROT = ROT, None
    _limb(img, pts, r, c, with_paw, far, thigh)
    ROT = saved


LEG_W = 1.4  # legs drawn this much thicker than their nominal radius: at braille resolution a 2-pixel leg reads one dot thin


def _limb(img, pts, r, c, with_paw, far, thigh=False):
    r *= LEG_W
    if thigh and len(pts) >= 4:
        # a dog's hind leg: a thick thigh from the hip to the stifle (which points forward), then a slim lower thigh
        # back to the hock (high, pointing back), then the hock-to-paw bone nearly straight down
        (ax, ay), (bx, by_) = pts[0], pts[1]
        # the thigh runs from the point of the buttock (behind and above the hip joint) down to the stifle, so the
        # line from the tail down the back of the leg slopes without a shelf under the tail
        ax, ay = ax - 1.2, ay - 0.5
        # (the thigh as thick as the one drawn by hand on the barking frame, 7-8 dots, and thicker still with r; the
        # leg below it stays slim whatever r is)
        ellipse(img, (ax + bx) / 2, (ay + by_) / 2, math.hypot(bx - ax, by_ - ay) / 2 + 0.3, 2.2 * r, c,
                tilt=math.atan2(by_ - ay, bx - ax))
        slim = min(r, 0.68 * LEG_W)
        for (a, b), rr in zip(zip(pts[1:], pts[2:]), (slim * 0.95, slim * 0.78)):
            line(img, a, b, rr, c)
    elif len(pts) >= 4:
        # a hind leg with its hock (standing, walking): slimmer than the front legs and tapering to the foot, as
        # drawn by hand on the barking frame
        for (a, b), rr in zip(zip(pts, pts[1:]), (r * 1.7, r * 1.05, r * 0.72)):
            line(img, a, b, rr, c)
    else:
        for a, b in zip(pts, pts[1:]):
            line(img, a, b, r, c)
    mid = pts[len(pts) // 2]
    ellipse(img, mid[0] + 0.1, mid[1], r + 0.35, 0.8, 'L' if c == 'O' else c, clip=lambda k: k in 'OD')
    if with_paw:
        paw(img, pts[-1][0], pts[-1][1], far, small=thigh)   # (a full foot on a standing hind leg: shrunk, it read as a toeless stump)


def terrier(front, hind, tongue=False, wag=0.0, lying=False, bob=0.0, sit=False, bark=False, dash=False, hx=0.0, st=0.0, pitch=0.0, hy=0.0, raise_paw=0.0, head_scale=0.86, ear=0.0, smile=False, happy_eyes=False, yawn=False, tuck=False, chin=False, tail_up=False, breath=0.0, head_pitch=0.0, hind_w=1.0):
    global ROT, HS
    """front / hind: [(near leg points), (far leg points)] as lists of (x, y) design units; ignored when lying.
    head_scale: the head a little smaller than drawn (at braille resolution a full-size head made him look big-headed).
    ear: how far the ear flaps up and back (radians), showing its pink inside. smile: mouth open in a grin with the
    tongue out. happy_eyes: eyes squeezed into happy arcs. yawn: mouth wide open. tuck: tail tucked low between the
    hind legs. chin: lying with his chin down on his forepaws, eyes open."""
    img = new()
    if sit:
        # sitting (after the corrected sheet): a big round haunch on the ground at the back, the torso rising from
        # it to a deep chest that rounds forward past the front legs, the front legs straight down from the front of
        # the chest, and a gap under the belly between the haunch and the front legs. (With the haunch, the chest and
        # the legs packed into one upright pillar, and a line drawn down it for the thigh, the front leg read as one
        # thick block and the body as thin.)
        P = SITP
        by = 11.4
        dy = P['dy'] + hy   # hy lowers his head
        hx += P['hx']
        hxs, hys = P['haunch']
        fx = P['leg']       # the near front leg's line
        head_scale *= P['head']   # (a full-size head on the sitting body made the body look thin)
        # tail along the ground behind the haunch, the tip curling up; `wag` swings the tip
        # (rooted well inside the haunch and as thick as two dots where it leaves it: joined by a single dot, it
        # broke off at a braille row and read as a separate lump)
        line(img, (hxs - 1.8, 17.7), (hxs - 4.4, 18.4), 0.55, 'O')
        line(img, (hxs - 4.4, 18.4), (hxs - 5.9, 17.9), 0.4, 'O')
        line(img, (hxs - 5.9, 17.9), (hxs - 6.5 + wag * 0.5, 16.3), 0.36, 'L')
        ellipse(img, hxs - 6.5 + wag * 0.5, 16.1, 0.4, 0.55, 'W')
        limb(img, [(fx - 0.8, 12.8), (fx - 0.8, 15.8), (fx - 0.8, G)], 0.5, 'S', far=True)            # far front leg
        ellipse(img, hxs, hys, 3.2, 2.6, 'O')                                              # haunch on the ground
        ellipse(img, hxs + 0.5, 18.4, 3.4, 0.9, 'O')                                       # its seat, flat and broad on the ground
        ellipse(img, P['torso'][0], P['torso'][1], 3.6, 2.8, 'O', tilt=P['tilt'])           # torso rising to the chest, full
        ellipse(img, P['chest'][0], P['chest'][1], 2.3, 2.8, 'O')                          # deep chest, rounding forward
        ellipse(img, P['torso'][0] - 0.6, P['torso'][1] - 1.6, 2.4, 0.55, 'L', tilt=P['tilt'], clip=lambda k: k == 'O')  # light along the back
        ellipse(img, hxs - 0.6, hys - 1.0, 1.6, 1.0, 'L', clip=lambda k: k == 'O')        # the round of the thigh, lit
        paw(img, hxs + 2.7, G - 0.15)                                                      # the hind foot at the front of the haunch, joined to it
        if raise_paw:   # one front paw raised, asking: the elbow lifts and the paw reaches forward
            limb(img, [(fx, 12.8), (fx + 1.0 * raise_paw, 14.2 - 0.6 * raise_paw), (fx + 2.0 * raise_paw, 13.6 - 1.4 * raise_paw)], 0.6, 'O')
        else:
            limb(img, [(fx, 12.8), (fx + 0.1, 15.8), (fx + 0.2, G)], 0.58, 'O')            # near front leg, straight down
    else:
        by = (12.4 if not lying else 16.2) - bob - (DASH_RISE if dash else 0.0)  # rib-cage centre, lifted by `bob`; galloping, he stands taller on long legs
        dy = (0.0 if not lying else 6.2) - bob * 0.6 + (2.5 - DASH_RISE if dash else 0.0) + hy  # running, the head reaches forward on the long neck, a little above the back
        # galloping, the whole body rocks: nose up as the hind legs push, nose down as the front feet land
        ROT = (pitch, 10.6, by) if pitch else None
        # tail: thin, hangs low from the rump and curls out, light tuft at the tip
        if dash:
            # running flat out: the tail streams out behind
            line(img, (3.9 - st * 0.6, by - 0.9), (1.4 - st, by - 0.4 + wag * 0.3), 0.5, 'O')
            line(img, (1.4 - st, by - 0.4 + wag * 0.3), (-0.2 - st, by - 1.0 + wag * 0.6), 0.42, 'O')
            ellipse(img, -0.2 - st, by - 1.1 + wag * 0.6, 0.8, 0.5, 'W')
        elif lying:
            # lying: the tail rests along the ground behind him, the tip lifting a little
            line(img, (3.4, by - 0.2), (1.6, by + 1.6), 0.5, 'O')
            line(img, (1.6, by + 1.6), (0.0, by + 2.2 - wag * 0.4), 0.42, 'O')
            ellipse(img, -0.2, by + 2.1 - wag * 0.5, 0.8, 0.5, 'W')
        elif tail_up:
            # excited: the tail held up and curving over, the tip wagging
            line(img, (3.4, by - 0.8), (1.8, by - 2.0), 0.5, 'O')
            line(img, (1.8, by - 2.0), (1.4 + wag * 0.5, by - 3.6), 0.42, 'O')
            ellipse(img, 1.5 + wag * 0.5, by - 3.9, 0.55, 0.8, 'W')
        elif tuck:
            # ashamed: the tail tucked down and forward between the hind legs
            line(img, (3.6, by - 0.2), (2.9, by + 2.0), 0.5, 'O')
            line(img, (2.9, by + 2.0), (4.2, by + 4.0), 0.42, 'O')
            ellipse(img, 4.5, by + 4.2, 0.5, 0.75, 'W')
        else:
            # low, curving out and back away from the set-back hind legs (hanging straight down, it closed a hole
            # against them)
            line(img, (3.3, by - 0.5), (1.4, by + 1.3), 0.5, 'O')
            line(img, (1.4, by + 1.3), (0.4 + wag * 0.6, by + 2.7), 0.42, 'O')
            ellipse(img, 0.3 + wag * 0.6, by + 2.9, 0.55, 0.8, 'W')
        # far legs first, then the body, then near legs
        if not lying:
            limb(img, front[1], 0.62, 'D', far=True)
            limb(img, hind[1], 0.62 * hind_w, 'D', far=True, thigh=dash)
        # body: deep chest, ribs, roached loin (the highest point of the back), rump sloping down, and the belly
        # tucked up hard behind the ribs like a sighthound's (lying on the ground, the belly rests flat)
        ellipse(img, 14.0 + st, by + 0.3, 2.8 + (0.3 if dash else 0.0), 2.6 + (0.35 if dash else 0.0), 'O')
        if lying:
            ellipse(img, 10.6, by, 5.0, 2.5, 'O')
        else:
            ellipse(img, 11.6 + st * 0.6, by + 0.15 + breath * 0.15, 3.6 + st * 0.5, (2.55 if dash else 2.4) + breath * 0.3, 'O')  # rib cage, deep (breath swells it)
            ellipse(img, 7.6 - st * 0.3, by - 0.5, 3.4 + st * 0.4, 1.55, 'O', tilt=0.08)                 # the waist, slim
        ellipse(img, 7.8 - st * 0.5, by - 1.3 - min(0.0, st) * 1.4, 3.0, 1.8 - min(0.0, st) * 0.4, 'O')
        if dash:
            # running: the croup slopes down to the tail and the buttock tucks in toward the thigh (a full round rump
            # here bulged out under the tail)
            ellipse(img, 5.5 - st * 0.6, by - 0.4, 1.9, 1.35, 'O', tilt=0.55)
        else:
            ellipse(img, 4.9 - st, by + 0.1, 2.4, 1.9, 'O')
        # the withers, so the back runs on from the loin to the neck without a dip (a one-pixel dip there reads as a
        # dent at braille resolution)
        ellipse(img, 11.4 + st * 0.5, by - 1.5, 3.2, 1.5, 'O')
        # shading: dark underneath, lit along the back, deep shadow in the tuck-up
        ellipse(img, 10.4, by + 2.0, 5.6, 1.5, 'D', clip=lambda k: k == 'O')
        ellipse(img, 5.6, by + 1.4, 2.4, 1.1, 'D', clip=lambda k: k == 'O')
        ellipse(img, 8.2, by + (2.0 if lying else 0.9), 1.6, 0.45, 'S', clip=lambda k: k == 'D')
        ellipse(img, 7.9, by - 2.4, 3.4, 0.7, 'L', clip=lambda k: k == 'O')
        if not lying:
            limb(img, front[0], 0.68, 'O')
            limb(img, hind[0], 0.68 * hind_w, 'O', thigh=dash)
        else:
            # lying: the hind leg folded at his side (the round of the thigh, ringed so it reads), its paw forward
            # under the belly; both forelegs stretched out in front, the far one a little higher and shaded
            # the thigh, outlined round its front, and the hind leg from the hock (at the back, on the ground) to the
            # paw tucked forward under the belly, outlined along its top so it shows against his side
            # (after a lying dog: the haunch a big round, the stifle forward and down, the hock on the ground at the
            # back and the foot laid forward along the ground under the thigh)
            # (after the reference sheet's lying dogs) one low body from the tail to the shoulders, the haunch inside
            # it (raised above the back, it looked like a second lump), the front of the thigh a short curved line
            # low down it, the hind foot just showing in front
            ellipse(img, 5.2, by + 0.4, 2.6, 2.0, 'O', tilt=0.25)
            paw(img, 8.6, by + 2.35)
            contour(img, [(7.4, by - 0.2), (7.9, by + 0.9), (7.5, by + 1.9), (7.0, by + 2.3)])
            line(img, (13.0, by + 1.6), (19.4, by + 2.0), 0.6, 'm')
            paw(img, 19.4, by + 1.9, far=True)
            line(img, (12.6, by + 2.1), (19.0, by + 2.6), 0.66, 'O')
            paw(img, 19.4, by + 2.5)
    # long arched neck rising forward from the shoulders, fluffy ruff at the front of the chest
    # the neck reaches out with the head when he runs, and follows it down when he lowers it to the ground
    nx, ny = hx * 0.6 + st, (dy * 0.45 if dash else dy * 0.55 if ((hy > 2 or hy < -0.5) and not sit) else 0.0)  # (raised with a raised head too, or the neck kinks under it)
    if sit:
        # sitting, the neck stops below the back of the (smaller) head: reaching higher, its top stuck out behind it
        ellipse(img, 15.0 + nx, by - 2.6 + ny, 1.7, 3.3, 'O', tilt=-0.45)   # (after the corrected sheet: a long upright neck)
        # the base of the neck, joined into the shoulders (left open, a one-pixel crack between them read as a dent)
        ellipse(img, 13.6 + nx * 0.7, by - 0.9, 2.0, 1.6, 'O', tilt=-0.6)
    else:
        ellipse(img, 14.4 + nx, by - 2.8 + ny, 1.9, 3.2, 'O', tilt=-0.62 + (0.35 if dash else 0.0))
    if not sit and not lying and not dash and hy < -0.5:
        # the throat, from the chest up under the jaw: the head raised, the neck stays thick to it (left as it was,
        # the neck hung narrow from the back of the head and looked kinked)
        ellipse(img, 16.2 + nx, by - 2.2 + ny * 0.6, 1.7, 2.6, 'O', tilt=-0.55)
    if not sit and not lying and not dash:
        # the nape, filling the notch where the back of the head meets the neck (not running: there the neck reaches
        # forward and it stuck out behind his head)
        ellipse(img, 14.0 + nx, by - 5.6 + ny, 1.3, 1.5, 'O', tilt=-0.5)
    ellipse(img, 15.4 + nx, by - 0.6 + ny * 0.5, 1.1, 2.0, 'm', tilt=-0.25, clip=lambda k: k in BODY)
    ellipse(img, 13.4 + nx, by - 3.6 + ny, 0.9, 1.9, 'L', tilt=-0.62, clip=lambda k: k in BODY)
    curls(img, 2.0, 16.6, by - 6.4, by + (6.6 if sit else 3.4))
    head_pitch += -0.18 if bark else 0.0   # barking, he lifts his nose
    HS = (head_scale, 15.6 + hx, 7.6 + dy, head_pitch) if head_scale != 1.0 or head_pitch else None
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
    if happy_eyes:
        # squeezed shut with joy: a little arc bowed upward
        # (set pixel by pixel: drawn in design units, an arc this small fell between the pixels)
        ex, ey = (int(round(sub(v))) for v in turn(19.9 + hx, 4.5 + dy))
        for ox, oy in ((-1, -1), (0, -1), (1, -1), (-2, 0), (2, 0)):
            if 0 <= ex + ox < CW and 0 <= ey + oy < CH:
                img[ey + oy][ex + ox] = 'E'
    else:
        ellipse(img, 19.9 + hx, 4.4 + dy, 0.8, 0.55, 'E', tilt=0.25)
    # big dark nose at the very tip, with a shine
    ellipse(img, 23.75 + hx, 5.5 + dy, 0.95, 0.8, 'N', tilt=0.2)
    if yawn:
        # a wide yawn: the jaw dropped far open, dark inside, the tongue curled up in the lower jaw
        # the lower jaw swung far down from the corner of the mouth; between the jaws, dark (a gap in braille)
        polygon(img, [(19.5 + hx, 6.0 + dy), (24.0 + hx, 5.9 + dy), (22.6 + hx, 9.0 + dy), (20.2 + hx, 6.9 + dy)], 'N')
        ellipse(img, 21.5 + hx, 9.4 + dy, 2.8, 1.0, 'W', tilt=0.85)
        ellipse(img, 22.0 + hx, 8.7 + dy, 1.5, 0.5, 'T', tilt=0.85)
        # the tongue curling out over the lower teeth and hanging down past the chin, as a yawning dog's does
        polygon(img, [(22.0 + hx, 8.6 + dy), (23.4 + hx, 9.0 + dy), (23.6 + hx, 10.6 + dy), (23.0 + hx, 11.5 + dy),
                      (22.2 + hx, 11.2 + dy), (21.9 + hx, 10.0 + dy)], 'T')
    elif bark:
        # barking: a dog's gape, hinged at the back of the mouth in front of the eye and opening wider toward the
        # front (a V), the lower jaw a long thin bar swung down, dark inside, the tongue along the lower jaw
        # (opened round at the front, it looked like a person's mouth)
        # (opened wide, and the tongue a clear pink along the lower jaw: smaller, the mouth was lost on a small head)
        polygon(img, [(20.1 + hx, 6.35 + dy), (23.7 + hx, 6.5 + dy), (23.1 + hx, 9.7 + dy)], 'N')
        line(img, (20.2 + hx, 6.8 + dy), (22.9 + hx, 9.9 + dy), 0.45, 'W')
        line(img, (20.9 + hx, 7.2 + dy), (22.5 + hx, 9.1 + dy), 0.32, 'T')
    elif smile or tongue:
        # panting, grinning (after a panting corgi seen from the side): the mouth open along the muzzle from in front
        # of the eye, the lower jaw dropped a little; the tongue comes out of the front of the mouth, forward past the
        # lips, and its tip curls down (drawn below). (Hung straight down from under the eye, mouth, eye and tongue ran
        # together into one blot.)
        polygon(img, [(20.6 + hx, 6.2 + dy), (23.2 + hx, 6.3 + dy), (22.9 + hx, 7.3 + dy)], 'M')
        line(img, (20.6 + hx, 6.6 + dy), (22.8 + hx, 7.5 + dy), 0.4, 'W')
    else:
        # mouth line along the lower muzzle
        for i in range(7):
            put(img, sub(22.6 + hx - i * 0.36), sub(6.5 + dy + i * 0.07), 'S')
    # the ear: short and rounded (Terry's own), hanging on the side of the head
    # `ear` swings it up and back about its root (running, it flies up behind him and shows its pink inside)
    ca, sa = math.cos(ear), math.sin(ear)
    E = lambda x, y: (hx + 16.7 + (x - 16.7) * ca - (y - 2.9) * sa, dy + 2.9 + (x - 16.7) * sa + (y - 2.9) * ca)
    # Terry's own ears: about half a usual Bedlington's, folding over from the crown and ending a little below the
    # eye, rounded, with no long tassel
    # (it hangs on the side of the head, inside its outline: hanging behind it, it made a bump on the back of his neck)
    leaf = [(16.1, 2.7), (17.8, 3.0), (18.1, 4.5), (17.6, 5.9), (16.6, 6.6), (15.6, 6.0), (15.3, 4.3)]
    polygon(img, [E(*q) for q in leaf], 'D')
    if ear > 0.45:
        # flipped up far enough to show the inside: pink, inside a rim of the coat
        polygon(img, [E(16.7 + (x - 16.7) * 0.62, 4.7 + (y - 4.7) * 0.7) for x, y in leaf], 'P')
    else:
        ellipse(img, *E(16.7, 4.7), 0.5, 0.9, 'e', tilt=0.12 + ear, clip=lambda k: k == 'D')             # inner shade, soft
        ellipse(img, *E(17.4, 3.5), 0.5, 0.6, 'L', clip=lambda k: k == 'D')                              # light on the fold
    # its outline round the back and the tip (not up the front, next to the eye): the ear is the same white as his
    # head, and the outline is what shows it
    # (no line round it: in braille a dotted line read as stray specks; the ear's darker coat shows it)
    if tongue or smile:
        # hanging out of the front of the open mouth and down past the chin, two dots wide, rounded at the tip
        # (a panting dog seen from the side; a short tongue pointing forward did not read as one)
        polygon(img, [(20.9 + hx, 6.6 + dy), (23.0 + hx, 6.7 + dy), (23.4 + hx, 8.6 + dy), (23.2 + hx, 10.4 + dy),
                      (22.4 + hx, 11.1 + dy), (21.5 + hx, 10.7 + dy), (21.1 + hx, 8.6 + dy)], 'T')
    HS = None
    ROT = None
    return outline(shade(img))


G = 19.0  # ground (paw) height
# the sitting pose's few numbers: where the head sits, the haunch, the torso's middle and its slope
SITP = dict(hx=0.4, dy=-0.4, haunch=(8.0, 16.4), torso=(11.0, 13.5), tilt=-0.85, chest=(14.0, 12.6), leg=15.0, head=0.9)
DASH_RISE = 2.2  # galloping, the body rides this much higher, so the long legs show (a greyhound-like build)
HF, HH = 14.0, 14.0  # shoulder and hip joint heights
STAND_F = [[(13.4, HF), (13.6, 16.6), (13.8, G)], [(12.2, HF), (12.2, 16.6), (12.2, G)]]
# standing, the hind legs are set back the Bedlington way (after a drawing of one): from the hip the thigh comes down a
# little forward to the stifle, the lower thigh runs well back to the hock, and the hock drops near straight to the
# foot, which stands behind the rump. The two legs stand close and parallel (set further apart, they closed a hole
# between them that read, at braille resolution, as one hollow leg).
# (the far hind leg stands right behind the near one, a side view: set apart, the two merged into one thick leg)
STAND_H = [[(5.6, HH), (6.0, 15.8), (3.7, 17.4), (3.4, G)], [(5.9, HH), (6.3, 15.9), (4.0, 17.5), (3.7, G)]]


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


def walk_foot(hip_x, phase, duty=0.7, stride=2.1, lift=1.5):
    """One foot over a walking step: planted for `duty` of the cycle while the body passes over it, then swung forward."""
    p = phase % 1.0
    if p < duty:
        return hip_x + stride * (1 - 2 * p / duty), G
    t = (p - duty) / (1 - duty)
    return hip_x - stride + 2 * stride * t, G - lift * math.sin(math.pi * t)


def walk_leg(hip_x, hip_y, phase, hind):
    fx, fy = walk_foot(hip_x, phase)
    if hind:
        # the Bedlington hind leg (as drawn by hand on the barking frame): the thigh down from the hip to the
        # stifle, the lower thigh back to a hock set well behind, the hock to the foot near vertical; lifted, the hock
        # folds up and back
        up = max(0.0, G - fy)
        sx, sy = hip_x + 0.2, hip_y + 1.6
        kx, ky = fx - 1.0 - 0.3 * up, fy - 1.9 - 0.4 * up
        return [(hip_x, hip_y), (sx, sy), (kx, ky), (fx, fy)]
    mx, my = (hip_x + fx) / 2, (hip_y + fy) / 2
    mx += -0.25
    if fy < G - 0.2:
        my -= 0.5
    return [(hip_x, hip_y), (mx, my), (fx, fy)]


def walk(phase):
    """A dog's four-beat walk: one foot at a time, a quarter cycle apart, near hind, near front, far hind, far front
    (each hind foot steps just before the front foot on its side), so two or three feet are always on the ground."""
    bob = 0.25 * abs(math.sin(4 * math.pi * phase))
    hf, hh = HF - bob, HH - bob
    front = [walk_leg(13.6, hf, phase + 0.75, False), walk_leg(12.4, hf, phase + 0.25, False)]
    hind = [walk_leg(5.8, hh, phase, True), walk_leg(6.6, hh, phase + 0.5, True)]
    return front, hind, bob, 0.7 * math.sin(2 * math.pi * phase * 2)


RUN = []
for i in range(16):
    f, h, bob, wag = walk(i / 16)
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
# The gallop, taken frame by frame from Muybridge's 1887 plates of the dog Dread (a rotary gallop). Each leg has two
# joints after the hip: the front leg an elbow and a wrist (it folds at the wrist on the back-swing), the hind leg a
# stifle and a hock (it folds at the hock on the forward swing). fn/ff: near/far front, hn/hf: near/far hind.
DASH_KEYS = [
    # 1 gathered, in the air: back rounded, forelegs swept back under the belly with the wrists folded,
    #   hind legs reaching far forward past them
    dict(st=-0.8, bob=0.6, hx=1.0, wag=0.6, pitch=-0.03,
         fn=((13.0, 15.8), (12.0, 17.2), (10.8, 17.6)), ff=((12.0, 16.0), (11.0, 17.4), (9.8, 17.9)),
         hn=((9.2, 13.8), (7.8, 15.4), (10.4, 16.8)), hf=((8.4, 14.0), (7.0, 15.8), (9.4, 17.4))),
    # 2 a hind foot lands under the belly, the other hind folded forward; one foreleg reaches, the other is still folded
    dict(st=-0.3, bob=0.3, hx=1.2, wag=0.2, pitch=-0.06,
         fn=((14.8, 15.6), (16.4, 16.8), (17.4, 17.8)), ff=((12.8, 16.0), (12.0, 17.4), (13.0, 17.9)),
         hn=((7.6, 13.8), (6.6, 16.2), (7.6, G)), hf=((7.4, 13.6), (6.0, 15.4), (7.6, 16.6))),
    # 3 both hind feet drive the ground; both forelegs reach high and forward
    dict(st=0.3, bob=0.2, hx=1.6, wag=-0.3, pitch=-0.05,
         fn=((15.6, 15.0), (17.6, 15.6), (19.0, 16.2)), ff=((15.0, 15.6), (16.6, 16.8), (17.6, 17.6)),
         hn=((6.2, 14.2), (4.4, 16.4), (3.6, G)), hf=((7.0, 14.2), (5.6, 16.4), (5.6, G))),
    # 4 stretched flat out in the air: forelegs far forward, hind legs far back
    dict(st=1.0, bob=0.5, hx=2.0, wag=-1.0, pitch=0.0,
         fn=((16.4, 15.2), (18.6, 16.0), (20.2, 16.6)), ff=((15.6, 15.6), (17.4, 16.8), (18.8, 17.8)),
         hn=((4.6, 14.0), (2.6, 15.4), (0.6, 16.4)), hf=((5.4, 14.0), (3.4, 15.6), (1.8, 17.2))),
    # 5 the lead forefoot lands well ahead, the other foreleg reaches down under the chest; hind legs trail behind
    dict(st=0.6, bob=0.0, hx=1.8, wag=-0.4, pitch=0.05,
         fn=((15.6, 16.0), (16.6, 17.6), (17.4, G)), ff=((14.6, 16.0), (15.0, 17.6), (15.6, G - 0.2)),
         hn=((5.2, 14.4), (3.2, 15.8), (2.2, 17.2)), hf=((6.0, 14.4), (4.0, 16.0), (3.2, 17.6))),
    # 6 the forelegs carry him (one upright, one pushing off behind) while the hind legs swing forward, hocks folded
    dict(st=0.0, bob=-0.1, hx=1.4, wag=0.3, pitch=0.03,
         fn=((14.0, 16.2), (13.8, 17.8), (14.0, G)), ff=((13.2, 16.2), (12.2, 17.6), (11.6, G)),
         hn=((7.2, 14.2), (5.4, 15.6), (6.6, 17.0)), hf=((6.8, 14.4), (5.0, 15.8), (6.0, 17.4))),
]
DASH_STEPS = 2   # in-betweens per key pose


def dash_frame(k):
    # a running dog holds his head steady while the body rocks under it: cancel most of what bob and pitch do to the head
    hy_ = 0.65 * (0.6 * k['bob'] - 8.4 * math.sin(k['pitch']))
    # the key poses were drawn for a hip at HF - bob; the body rides DASH_RISE higher, so each leg is stretched between
    # the raised hip and the ground (joints near the hip move up most, paws on the ground not at all)
    base = HF - k['bob']
    hf_, hh_ = base - DASH_RISE, HH - k['bob'] - DASH_RISE
    stretch = lambda y: G - (G - y) * (G - hf_) / (G - base)
    leg_ = lambda hip, y, kp: [(hip, y)] + [(x, stretch(yy)) for x, yy in kp]
    return terrier([leg_(13.4 + k['st'], hf_, k['fn']), leg_(12.2 + k['st'], hf_, k['ff'])],
                   [leg_(5.6 - k['st'], hh_, k['hn']), leg_(6.4 - k['st'], hh_, k['hf'])],
                   bob=k['bob'], wag=k['wag'], dash=True, hx=k['hx'] + 0.6, st=k['st'], pitch=k['pitch'], hy=hy_, head_scale=0.82, ear=k.get('ear', 0.0),
                   hind_w=k.get('hw', 1.0))


# The far legs don't copy the near ones: each pair lands one after the other (the 'ta-dak' of a gallop), so the far leg
# replays the near leg's own path a beat later (DASH_LAG of a key pose behind), moved to its own hip.
DASH_LAG = 1.0


def _dash_at(f):
    n = len(DASH_KEYS)
    f %= n
    a_, b_ = DASH_KEYS[int(f)], DASH_KEYS[(int(f) + 1) % n]
    return {key: _mix(a_[key], b_[key], f - int(f)) for key in a_}


def _shift(leg, dx):
    return tuple((x + dx, y) for x, y in leg)


DASH, DASH_K = [], []   # the frames, and the key each was drawn from (the 'real' style's gallop reuses its legs)
for i in range(len(DASH_KEYS) * DASH_STEPS):
    f_ = i / DASH_STEPS
    k_ = _dash_at(f_)
    late = _dash_at(f_ - DASH_LAG)
    k_['ff'] = _shift(late['fn'], -1.2)   # far front hip sits 1.2 behind the near one
    k_['hf'] = _shift(late['hn'], 0.8)    # far hind hip sits 0.8 ahead of the near one
    # the ear flies up and back as the body drops onto the forelegs and falls back as he gathers, a beat behind
    k_['ear'] = 1.25 + 0.65 * math.sin(2 * math.pi * (f_ - 1.5) / len(DASH_KEYS))
    # (frames 7-10, the hind legs stretched far back, read thinner at the same width: drawn a little thicker)
    k_['hw'] = 1.3 if 6 <= i <= 9 else 1.0
    DASH.append(dash_frame(k_))
    DASH_K.append(k_)

GALLOP = []
for i in range(8):
    a_, b_ = GALLOP_KEYS[i // 2], GALLOP_KEYS[(i // 2 + 1) % 4]
    t_ = (i % 2) * 0.5
    GALLOP.append(gallop_frame({key: _mix(a_[key], b_[key], t_) for key in a_}))

# done, panting: quick shallow breaths heave his chest and rock him a little, head bobbing with each one
PANT = []
for i in range(6):
    b_ = math.sin(math.pi * i / 6) ** 2             # in fast, out
    PANT.append(terrier(STAND_F, STAND_H, tongue=True, wag=math.sin(2 * math.pi * i / 6), bob=0.3 * b_, breath=b_, hy=-0.25 * b_))

# Claude reads or searches: nose down, he sniffs his way along at a slow walk
SNIFF = []
for i in range(16):
    # the same four-beat walk, slower; the nose stays low and steady over the ground while the body bobs under it
    f, h, bob, wag = walk(i / 16)
    SNIFF.append(terrier(f, h, bob=bob * 0.4, wag=wag * 0.6, pitch=0.1, hy=6.8 + 0.6 * bob * 0.4, hx=1.2))

# Claude runs a command or edits a file: nose down at the hole, front paws scraping in turn, hind legs braced
# (the plugin adds the hole, the dirt flying back and the heap growing behind him)
# the hind legs as drawn by hand on the barking frame (thigh, hock set back); braced to dig, the far one stands a
# little forward of the near one so both show (hidden right behind it, he looked to stand on one hind leg)
DIG_H = [STAND_H[0], [(5.9, HH), (7.4, 15.6), (7.8, 17.5), (8.6, G)]]   # the far one reaching forward under him, bearing weight
DIG_PAWS = [(17.4, G - 0.2), (15.6, G - 1.8), (12.6, G - 0.4), (15.0, G - 2.8)]
DIG = []
_paw = lambda k: (lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))(DIG_PAWS[int(k) % 4], DIG_PAWS[(int(k) + 1) % 4], k - int(k))
for i in range(8):   # an in-between for each scrape
    near, far = _paw(i / 2), _paw(i / 2 + 2)
    knee = lambda hip, paw: ((hip + paw[0]) / 2 + 0.4, (HF + paw[1]) / 2 - 0.4)
    front = [[(13.4, HF), knee(13.4, near), near], [(12.2, HF), knee(12.2, far), far]]
    DIG.append(terrier(front, DIG_H, wag=math.sin(math.pi * i / 2), pitch=0.34, hy=7.6 + 0.4 * abs(math.sin(math.pi * i / 4)), hx=1.2))

# the first keystroke of the day: a whole stretch, the way a dog does it. First the front (the bow): he walks his
# forelegs out flat along the ground, chest down, rump high, tail up, shuts his eyes and yawns wide. Then the back:
# he rocks forward onto straight forelegs and stretches both hind legs out behind, and stands up again. The plugin
# plays it from the start each time and closes his eyes on the yawn frames (5-7).
def _lerp_pts(a, b, t):
    return [[(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t) for pa, pb in zip(la, lb)] for la, lb in zip(a, b)]


# keys of the stretch, each (front legs, hind legs, bob, pitch, hy, hx, head_pitch, head_scale); a key's hips sit at
# HF - bob, so they blend
STRETCH_POSES = {
    'stand': (STAND_F, STAND_H, 0.0, 0.0, 0.0, 0.0, 0.0, 0.86),
    # the bow (after a wolf stretching): forelegs walked far out flat along the ground, chest down low, rump high on
    # straight hind legs, the back one long slope; the neck stretched forward and the chin lifted, nose pointing ahead
    'bow': ([[(13.4, HF + 2.0), (15.4, G - 0.45), (23.4, G - 0.35)], [(12.2, HF + 2.0), (14.4, G - 0.4), (22.2, G - 0.35)]],
            [[(5.6, HH + 2.0), (5.4, 15.4), (4.8, 16.6), (5.0, G)], [(6.4, HH + 2.0), (6.3, 15.5), (6.2, 16.8), (6.6, G)]], -2.0, 0.45, 1.6, 3.4, -1.0, 0.8),
    # then forward: weight onto straight forelegs, chest up, both hind legs stretched out behind
    'fwd': ([[(13.4, HF + 0.6), (14.6, 16.6), (14.8, G)], [(12.2, HF + 0.6), (13.4, 16.6), (13.6, G)]],
            [[(5.6, HH + 0.6), (4.4, 15.9), (2.6, 17.2), (0.4, G - 0.2)], [(6.4, HH + 0.6), (5.4, 16.0), (3.8, 17.4), (1.8, G)]], -0.6, -0.12, -0.8, 1.2, 0.0, 0.86),
}


def _stretch_frame(a, b, t, reach=0.0, yawn=False, wag=0.0):
    fa, ha, *ka = STRETCH_POSES[a]
    fb, hb, *kb = STRETCH_POSES[b]
    front, hind = _lerp_pts(fa, fb, t), _lerp_pts(ha, hb, t)
    if reach:
        front = [leg[:-1] + [(leg[-1][0] + reach, leg[-1][1])] for leg in front]
    bob, pitch, hy, hx, hp, hs = (x + (y - x) * t for x, y in zip(ka, kb))
    return terrier(front, hind, bob=bob, pitch=pitch, hy=hy, hx=hx, head_pitch=hp, head_scale=hs, wag=wag, yawn=yawn, tail_up=True)


STRETCH = [
    _stretch_frame('stand', 'stand', 0, wag=0.6),                  # 0 standing
    _stretch_frame('stand', 'bow', 0.4, wag=-0.6),                 # 1-2 walking the forelegs out, chest going down
    _stretch_frame('stand', 'bow', 0.75, wag=0.6),
    _stretch_frame('bow', 'bow', 0, wag=-0.6),                     # 3 the bow
    _stretch_frame('bow', 'bow', 0, reach=0.4, wag=0.8),           # 4 reaching further
    _stretch_frame('bow', 'bow', 0, reach=0.4, yawn=True, wag=-0.8),  # 5-7 eyes shut, a big wide yawn
    _stretch_frame('bow', 'bow', 0, reach=0.4, yawn=True, wag=0.8),
    _stretch_frame('bow', 'bow', 0, reach=0.4, yawn=True, wag=-0.8),
    _stretch_frame('bow', 'bow', 0, wag=0.6),                      # 8 eyes open
    _stretch_frame('bow', 'fwd', 0.5, wag=-0.4),                   # 9 rocking forward
    _stretch_frame('fwd', 'fwd', 0, wag=0.4),                      # 10-11 the hind legs stretched out behind
    _stretch_frame('fwd', 'fwd', 0, wag=-0.4),
    _stretch_frame('fwd', 'stand', 0.5, wag=0.4),                  # 12 back up
    _stretch_frame('stand', 'stand', 0, wag=0.0),
]
STRETCH_MS = [300, 160, 160, 300, 300, 380, 380, 300, 250, 180, 450, 350, 180, 300]

# a test passed: crouch with eyes on the frisbee, leap up stretched out with the mouth open, land with it
JUMP = [
    # crouched to spring, hind legs coiled under him, tail up and going, head up watching it come
    terrier([[(13.4, HF + 0.8), (14.6, 17.2), (13.8, G)], [(12.2, HF + 0.8), (13.4, 17.4), (12.4, G)]],
            [[(5.6, HH + 0.8), (3.6, 17.4), (5.0, G)], [(6.4, HH + 0.8), (4.8, 17.6), (6.6, G)]],
            bob=-0.8, pitch=-0.08, hy=-0.6, wag=1.0, tail_up=True),
    # in the air: body reared up, forelegs tucked to the chest, hind legs stretched out long from the push, mouth open
    terrier([[(13.4, HF - 2), (15.4, 11.0), (16.8, 12.2)], [(12.2, HF - 2), (14.2, 11.4), (15.6, 12.6)]],
            [[(5.6, HH - 2), (4.6, 15.4), (3.0, 17.8)], [(6.4, HH - 2), (5.8, 15.6), (4.4, 18.4)]],
            bob=2.0, pitch=-0.32, hy=1.2, hx=0.6, wag=-1.0, bark=True, tail_up=True),
    # landed, standing proud with it
    terrier(STAND_F, STAND_H, wag=1.0, hy=-0.4, tail_up=True),
]

# dinner time: standing over his bowl, head down, munching
EAT = [terrier(STAND_F, STAND_H, pitch=0.26, hy=6.4 + 0.5 * (1 - math.cos(math.pi * i / 2)) / 2 * 2, hx=0.9, wag=0.6 * math.sin(math.pi * i / 2)) for i in range(4)]

# waiting for a permission: sitting, tail going, waiting on you (the plugin draws a '?' speech bubble by his head)
ASK = [terrier(None, None, sit=True, wag=0.8), terrier(None, None, sit=True, wag=-0.8)]

# the request failed or was stopped: lying down with his chin on his forepaws, eyes open, sniffling
# (the plugin adds a tear and a rain cloud over him)
SAD = [terrier(None, None, lying=True, hy=1.8, hx=1.4), terrier(None, None, lying=True, hy=1.95, hx=1.4, wag=0.3)]
# a test failed: standing with his head hung low and his tail tucked between his legs
DROOP = [terrier(STAND_F, STAND_H, hy=5.6, hx=1.0, tuck=True, pitch=0.06), terrier(STAND_F, STAND_H, hy=5.8, hx=1.0, tuck=True, pitch=0.06)]
# dozing (after the corrected sheet): lying with the head up on the neck, not flat on the paws; a slow breath
SLEEP = [terrier(None, None, lying=True, hy=-2.0, hx=-0.4), terrier(None, None, lying=True, hy=-2.0, hx=-0.4, wag=0.4, breath=0.6)]
# sitting: the tail swinging slowly up and down (four frames), the back rising and falling with a breath (twice that)
SIT = [terrier(None, None, sit=True, wag=w) for w in (0.0, 0.25, 0.5, 0.25, 0.0, 0.25, 0.5, 0.25)]
DOOR = SIT   # waiting at the door: sitting up, watching it
# watching you type: sitting up with a grin and his tongue out, tail going (as if he knew you'd come)
WAG = [terrier(None, None, sit=True, smile=True, wag=0.9 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
# petted: sitting, grinning, eyes squeezed shut with joy, tail going
PET = [terrier(None, None, sit=True, smile=True, happy_eyes=True, wag=0.9 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
# barking (after the corrected sheet): standing, head up, the jaw snapping open and shut, the tail going
BARK = [terrier(STAND_F, STAND_H, hy=-1.2, wag=-0.4), terrier(STAND_F, STAND_H, hy=-1.4, bark=True, wag=0.5),
        terrier(STAND_F, STAND_H, hy=-1.4, bark=True, wag=0.9), terrier(STAND_F, STAND_H, hy=-1.2, wag=0.2)]

# the ground line: the lowest row the original poses (walk, gallop, sit, pant, sleep) reach; new poses must stay above it
GROUND_ROW = max(y for f in RUN + DASH + SIT + PANT + SLEEP + WAG + BARK for y, row in enumerate(f) if any(c != '.' for c in row))


# ---- The 'real' style: poses traced from a reference sheet ----------------------------------------------------------
# docs/preview/terry-poses-ref.png holds one dot-drawn Bedlington per mood (3 x 6 panels; see trace_poses.py). Its
# poses read far more naturally than the ones built from ellipses above, so the 'real' style takes them from it. The
# sets above stay as the 'classic' style. Life comes from the tail (erased and drawn again, swung about its root), a
# jaw that opens to bark, a tongue that flicks, paws that scrape, and the plugin's blinks, marks and props. The
# moving moods put the traced body and head on legs drawn as above: the Muybridge gallop and the four-beat walk.
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trace_poses as TP
COL.setdefault('oO', mix(COL['O'], INK, 0.62))
_SHEET = TP.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terry-poses-ref.png'))
COATK = set('WLOmDS')


# where each traced pose's head is (rows, then columns), to tell its eye and nose from the other dark marks
HEADS = {1: (2, 13, 25, 42), 2: (6, 18, 32, 47), 3: (24, 35, 30, 46), 4: (9, 20, 32, 48), 5: (4, 16, 29, 46), 7: (1, 10, 26, 42),
         8: (19, 35, 29, 44), 9: (5, 14, 29, 46), 10: (2, 10, 24, 40), 11: (9, 22, 27, 44), 12: (6, 13, 24, 40), 13: (0, 8, 20, 40),
         14: (14, 28, 33, 46), 15: (20, 34, 26, 44), 16: (15, 30, 33, 46), 17: (0, 8, 24, 45)}


def traced(n, mirror=False, tongue=False, scale=TP.SCALE, ground=GROUND_ROW - 1, head=None):
    """Panel n of the sheet (1-based, in its order) as rows of keys, facing right, standing on the ground row."""
    return TP.to_keys(TP.trace(_SHEET, n - 1, CW, CH, ground, mirror=mirror, tongue=tongue, scale=scale), COL, head or HEADS.get(n))


# each traced pose's tail, root first, as (row, column) pixels: found by eye on the traced grids (finding it by its
# thinness picked legs and ear tips)
TAILS = {1: [(33, 13), (32, 11), (30, 9), (29, 8)], 2: [(21, 8), (23, 7), (26, 5), (28, 2)], 3: [(30, 6), (31, 4), (33, 2), (34, 2)],
         4: [(18, 12), (17, 9), (15, 6), (13, 4)], 5: [(18, 11), (21, 9), (24, 6), (25, 4)], 7: [(18, 13), (17, 11), (16, 9), (14, 8)],
         8: [(16, 12), (15, 8), (13, 6), (9, 5)], 9: [(18, 13), (17, 10), (15, 7), (12, 6), (10, 5)], 10: [(32, 16), (31, 12), (29, 11), (28, 10)],
         11: [(33, 13), (33, 10), (32, 8), (31, 7)], 12: [(34, 16), (33, 11), (31, 9)], 13: [(21, 16), (21, 14), (20, 12), (19, 11)],
         14: [(15, 11), (18, 10), (21, 8), (25, 5)], 15: [(13, 7), (11, 5), (8, 5), (6, 7)], 16: [(16, 12), (16, 7), (15, 4)],
         17: [(32, 12), (31, 9), (29, 7), (27, 6)]}


def _near_line(y, x, pts, r):
    for (ay, ax), (by_, bx) in zip(pts, pts[1:]):
        dy, dx = by_ - ay, bx - ax
        t = max(0.0, min(1.0, ((y - ay) * dy + (x - ax) * dx) / max(1e-9, dy * dy + dx * dx)))
        if math.hypot(y - (ay + dy * t), x - (ax + dx * t)) <= r:
            return True
    return False


def detail(img):
    return [row[:] for row in img]


def untail(img, n):
    """The pose without its tail (the coat along the tail's line, short of the root, taken away)."""
    out = detail(img)
    pts = TAILS[n]
    ry, rx = pts[0]
    for y in range(CH):
        for x in range(CW):
            if out[y][x] in COATK | {'oO'} and math.hypot(y - ry, x - rx) > 1.1 and _near_line(y, x, pts, 1.45):
                out[y][x] = '.'
    return out


def tail(img, n, angle=0.0, dy=0, dx=0):
    """Draw pose n's tail swung `angle` radians about its root (moved by dy, dx): two pixels thick at the root,
    tapering to one, with a light tip."""
    pts = TAILS[n]
    ry, rx = pts[0]
    ca, sa = math.cos(angle), math.sin(angle)
    rot = [(ry + dy + (x - rx) * sa + (y - ry) * ca, rx + dx + (x - rx) * ca - (y - ry) * sa) for y, x in pts]
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(rot, rot[1:]))
    done = 0.0
    for (ay, ax), (by_, bx) in zip(rot, rot[1:]):
        seg = math.hypot(by_ - ay, bx - ax)
        steps = max(2, int(seg * 3))
        for i in range(steps + 1):
            t = i / steps
            y, x = ay + (by_ - ay) * t, ax + (bx - ax) * t
            along = (done + seg * t) / max(total, 1e-9)
            for oy, ox in ([(0, 0), (1, 0), (0, 1)] if along < 0.45 else [(0, 0)]):
                yy, xx = int(round(y)) + oy, int(round(x)) + ox
                if 0 <= yy < CH and 0 <= xx < CW and img[yy][xx] == '.':
                    img[yy][xx] = 'W' if along > 0.85 else 'L'
        done += seg
    return img


def wagged(base, n, angle, dy=0, dx=0):
    return tail(detail(base), n, angle, dy, dx)


def flick(img):
    """The tongue drawn in a little (its lowest pixels taken away), for a panting flick."""
    out = detail(img)
    ys = [y for y, row in enumerate(img) if 'T' in row]
    if ys:
        out[max(ys)] = ['.' if k == 'T' else k for k in out[max(ys)]]
    return out


def shift_region(img, rows, cols, dy, dx):
    """Move the pixels in a box by (dy, dx), leaving it empty behind."""
    out = detail(img)
    for y in rows:
        for x in cols:
            out[y][x] = '.'
    for y in rows:
        for x in cols:
            k = img[y][x]
            if k != '.' and 0 <= y + dy < CH and 0 <= x + dx < CW:
                out[y + dy][x + dx] = k
    return out


def open_jaw(img, corner, tip, drop):
    """Open the mouth: below the line from the corner to the tip of the mouth, the lower jaw swings down (`drop`
    pixels at the tip, none at the corner), dark between the jaws, the tongue's tip showing at the front."""
    out = detail(img)
    (cy, cx), (ty, tx) = corner, tip
    for x in range(cx, tx + 1):
        t = (x - cx) / max(1, tx - cx)
        d = int(round(drop * t))
        if d <= 0:
            continue
        ly = int(round(cy + (ty - cy) * t))
        col = [img[y][x] for y in range(CH)]
        for y in range(CH - 1, ly, -1):
            if y - d > ly:
                out[y][x] = col[y - d]
        for y in range(ly + 1, ly + 1 + d):
            out[y][x] = 'N'
        if x >= tx - 1:
            out[ly + d][x] = 'T'
    return out


def stand_on(img, ground=GROUND_ROW - 1):
    """The lowest pixel moved onto the ground row."""
    bottom = max(y for y, row in enumerate(img) if any(k != '.' for k in row))
    return shift_region(img, range(CH), range(CW), ground - bottom, 0) if bottom != ground else img


U = lambda px: (px - MARGIN) / S   # sprite pixel -> design units


def body_on_legs(body, n, hips, legs_far, legs_near, lift=0, tail_angle=0.0):
    """A traced body (legs taken away) set on drawn legs: far legs behind it, near legs in front. `hips` are the
    traced body's (front, hind) leg roots as pixels; each leg is a list of points in design units relative to its
    hip; `lift` raises the body that many pixels."""
    img = new()
    (fy, fx), (hy, hx) = hips
    root = {'front': (U(fx), U(fy - lift)), 'hind': (U(hx), U(hy - lift))}
    leg = lambda which, pts: [(root[which][0] + x, root[which][1] + y) for x, y in pts]
    for which, pts in legs_far:
        limb(img, leg(which, pts), 0.6, 'O', far=True)
    for y in range(CH):
        for x in range(CW):
            if body[y][x] != '.' and 0 <= y - lift < CH:
                img[y - lift][x] = body[y][x]
    for which, pts in legs_near:
        limb(img, leg(which, pts), 0.66, 'L', thigh=False)
    tail(img, n, tail_angle, -lift, 0)
    return img


def legless(img, keep_rows, keep_cols=None):
    """The traced pose with everything below its body taken away (rows beyond keep_rows, except the columns kept)."""
    out = detail(img)
    for y in range(keep_rows + 1, CH):
        for x in range(CW):
            if keep_cols is None or x not in keep_cols:
                out[y][x] = '.'
    return out


def short_ears(img):
    """Terry's own ears, half as long as the sheet draws them: each ear's outline (a tall inner line hanging from the
    top of the head) is cut at half its height, and closed there with a short rounded bottom."""
    out = detail(img)
    rows = [y for y, row in enumerate(img) if any(k != '.' for k in row)]
    top = min(rows)
    lines = [[img[y][x] == 'oO' for x in range(CW)] for y in range(CH)]
    lab, sizes = TP._components(np.array(lines))
    stubs = []
    for i in range(1, len(sizes) + 1):
        pts = [(y, x) for y in range(CH) for x in range(CW) if lab[y][x] == i]
        y0, y1 = min(y for y, _ in pts), max(y for y, _ in pts)
        if y1 - y0 < 4 or y0 > top + 9:          # not an ear: short, or starting low on the body
            continue
        cut = y0 + (y1 - y0) // 2
        for y, x in pts:
            if y > cut:
                out[y][x] = 'L'
        low = [p for p in pts if p[0] <= cut]
        stubs.append(max(low))
    # close each ear: join the two nearest stub ends (its back and front edge), bulging down a pixel
    stubs.sort(key=lambda p: p[1])
    for a_, b_ in zip(stubs, stubs[1:]):
        if abs(a_[1] - b_[1]) <= 6 and abs(a_[0] - b_[0]) <= 4:
            for x in range(a_[1], b_[1] + 1):
                t = (x - a_[1]) / max(1, b_[1] - a_[1])
                y = int(round(a_[0] + (b_[0] - a_[0]) * t + math.sin(math.pi * t) * 1.2))
                if 0 <= y < CH and out[y][x] in COATK:
                    out[y][x] = 'oO'
    return out


import numpy as np
R = {n: short_ears(traced(n, mirror=n in (1, 2), tongue=n == 5)) for n in range(1, 18)}
# the leap: traced a little smaller, so it fits under the top of the picture with its feet off the ground
_LEAP = (6.2, 3)   # scale, pixels above the ground
R[13] = short_ears(traced(13, scale=_LEAP[0], ground=GROUND_ROW - 1 - _LEAP[1], head=(0, 10, 20, 38)))   # (its tail in TAILS is for this size)
RT = {n: untail(R[n], n) for n in TAILS}            # the poses without their tails, to draw the tail on again
sway = lambda i, n, amp, ph=0.0: amp * math.sin(2 * math.pi * (i / n + ph))

R_SIT = [wagged(RT[1], 1, sway(i, 2, 0.2)) for i in range(2)]
R_WAG = [wagged(RT[1], 1, sway(i, 8, 0.55)) for i in range(8)]                     # watching you type, tail going
# barking: the jaw snaps open and shut, tail going
R_BARK = [wagged(open_jaw(RT[7], (5, 35), (5, 40), d), 7, sway(i, 4, 0.4)) for i, d in enumerate([0, 2, 1, 0])]
R_PANT = [wagged(flick(RT[5]) if i % 3 == 2 else RT[5], 5, sway(i, 6, 0.4)) for i in range(6)]
R_SLEEP = [wagged(RT[3], 3, 0.0), wagged(RT[3], 3, 0.15)]
# digging: the front paws scrape in turn (lifted off the ground and back), the tail up and going
R_DIG = []
for i in range(8):
    lift_, fwd = [(0, 0), (2, 1), (1, 1), (0, 0), (0, 0), (1, -1), (2, -1), (0, 0)][i]
    R_DIG.append(wagged(shift_region(RT[8], range(30, 36), range(19, 27), -lift_, fwd), 8, sway(i, 8, 0.45)))
R_ASK = [wagged(RT[10], 10, sway(i, 2, 0.3)) for i in range(2)]
R_SAD = [wagged(RT[11], 11, 0.0), wagged(RT[11], 11, 0.08)]
R_DOOR = [wagged(RT[12], 12, sway(i, 2, 0.15)) for i in range(2)]               # sitting at the door, watching it
R_JUMP = [wagged(RT[7], 7, 0.3), wagged(RT[13], 13, -0.2), wagged(RT[7], 7, -0.3)]   # watching it come, the leap, landed
R_DROOP = [wagged(RT[14], 14, 0.0), wagged(RT[14], 14, 0.05)]
# eating: the head dips into the bowl and comes up a little as he chews, tail going
R_EAT = [wagged(shift_region(RT[16], range(14, 31), range(33, CW), d, 0), 16, sway(i, 4, 0.3)) for i, d in enumerate([0, 1, 0, 1])]
R_PET = [wagged(RT[17], 17, sway(i, 8, 0.55)) for i in range(8)]
# the stretch: standing, the head going down, the front sinking, the bow (held; eyes shut through frames 5-7), and
# back up the same way
_st = [(2, 0.2), (14, 0.0), (16, 0.2), (15, 0.3), (15, -0.3), (15, 0.3), (15, -0.3), (15, 0.3), (15, -0.3), (16, 0.2), (14, 0.0), (2, 0.2)]
R_STRETCH = [wagged(RT[n], n, a) for n, a in _st]
R_STRETCH_MS = [350, 260, 260, 320, 320, 420, 420, 420, 320, 260, 260, 350]

# the gallop: the traced running body and head (panel 4) on the Muybridge legs, bobbing as they do
def belly(img, rows, cols):
    """Round off a body's cut underside: fill the empty pixels inside an ellipse spanning the box."""
    out = detail(img)
    cy, cx = (rows[0] + rows[-1]) / 2, (cols[0] + cols[-1]) / 2
    ry, rx = (rows[-1] - rows[0]) / 2 + 0.5, (cols[-1] - cols[0]) / 2 + 0.5
    for y in rows:
        for x in cols:
            if out[y][x] == '.' and ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2 <= 1 and any(out[yy][x] in COATK for yy in range(y)):
                out[y][x] = 'L'
    return out


def rock(img, k, cx=25):
    """Tip the picture a little (a shear: each column moved up or down in proportion to its distance from cx)."""
    out = new()
    for x in range(CW):
        d = int(round(k * (x - cx)))
        for y in range(CH):
            if img[y][x] != '.' and 0 <= y + d < CH:
                out[y + d][x] = img[y][x]
    return out


# (cut level with the body, the underside rounded off where the legs were)
_run_body = belly(legless(RT[4], 23), range(19, 26), range(11, 37))
R_RUN = []
for k in DASH_K:
    bob_ = k['bob']
    base = HF - bob_
    lift_ = int(round(bob_ * S))
    # each leg scaled so the foot that reaches the ground in the drawn gallop reaches it from the traced hip
    sc = (U(GROUND_ROW - 2) - 0.5 - U(23 - lift_)) / (G - base)
    rel = lambda hip_x, kp: [(0.0, 0.0)] + [((x - hip_x) * sc, (y - base) * sc) for x, y in kp]
    front_n, front_f = rel(13.4, k['fn']), rel(12.2, k['ff'])
    hind_n, hind_f = rel(5.6, k['hn']), rel(6.4, k['hf'])
    # the body rocks with the stride as the drawn gallop's does (nose up as the hind legs drive, down on landing)
    R_RUN.append(body_on_legs(rock(_run_body, -k['pitch'] * 0.9), 4, ((24, 31), (23, 14)), [('front', front_f), ('hind', hind_f)],
                              [('front', front_n), ('hind', hind_n)], lift=lift_, tail_angle=0.3 * math.sin(k['wag'])))


def _walk_set(body, n, hips, frames, speed_bob=1.0):
    out = []
    for i in range(frames):
        ph = i / frames
        f, h, bob_, wag_ = walk(ph)
        lift_ = int(round(bob_ * S * speed_bob))
        sc = (U(GROUND_ROW - 2) - 0.5 - U(hips[1][0] - lift_)) / (G - h[0][0][1])   # legs as long as hip to ground (the paw ellipse sits on it)
        rel = lambda leg: [((x - leg[0][0]) * sc, (y - leg[0][1]) * sc) for x, y in leg]
        out.append(body_on_legs(body, n, hips, [('front', rel(f[1])), ('hind', rel(h[1]))], [('front', rel(f[0])), ('hind', rel(h[0]))],
                                lift=lift_, tail_angle=0.35 * math.sin(2 * math.pi * ph * 2)))
    return out


R_WALK = _walk_set(legless(RT[2], 21), 2, ((20, 29), (20, 12)), 16)
# sniffing along: the head-down body of panel 16 on the slow walk
R_SNIFF = _walk_set(legless(RT[16], 24, keep_cols=range(33, CW)), 16, ((22, 28), (21, 13)), 16, 0.5)

OUTLINE_FN = outline
palette, index, outline = [], {}, []


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
                if c.startswith('o'):
                    outline.append(index[c])   # the soft outline: braille leaves these out (they read as dark specks)
            s += ALPHABET[index[c]]
        rows.append(s)
    return rows




def despeckle(img):
    """Fill the lone holes inside him: an empty or inner-line pixel with coat on (nearly) every side reads, in braille,
    as a stray black speck. The eye, the nose, the mouth and the outline stay."""
    out = [row[:] for row in img]
    for y in range(1, CH - 1):
        for x in range(1, CW - 1):
            k = img[y][x]
            if not (k == '.' or k == 'oO' or k == 'oD'):
                continue
            nb = [img[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
            coat = [n for n in nb if n in 'WLOmDS' and len(n) == 1]
            if len(coat) >= 7:
                out[y][x] = max(set(coat), key=coat.count)
    return out


# Frames redrawn dot by dot in the Terry dot editor (an artifact page; docs/preview/terry-edits.json holds what was
# saved there): set name -> {frame index: rows of keys}. An edited frame replaces the drawn one, outlined afresh.
_EDITS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terry-edits.json')
EDITS = json.load(open(_EDITS_PATH, encoding='utf-8')) if os.path.exists(_EDITS_PATH) else {}
EDITOR_SRC = {}  # each classic set's frames as packed, for the editor's data


def edited(name, frames):
    """The set's frames with the editor's saved frames put in place of the drawn ones."""
    out = list(frames)
    EDITOR_SRC[name] = out
    for k, rows in EDITS.get(name, {}).items():
        i = int(k)
        if 0 <= i < len(out):
            img = [list(r.ljust(CW, '.')[:CW]) for r in rows] + [['.'] * CW for _ in range(CH - len(rows))]
            out[i] = OUTLINE_FN(img)
    return out


def pack(frames, durations):
    frames = [despeckle(f) for f in frames]
    for f in frames:
        for y in range(GROUND_ROW + 1, CH):
            if any(c != '.' for c in f[y]):
                raise SystemExit(f'a frame draws below the ground line (row {y} > {GROUND_ROW}): fix the pose, or every pose floats')
    return {'durations': durations, 'frames': [encode(f) for f in frames]}


# twice the frames of the first versions for the moving poses, at half the time each: the same pace, smoother
# ---- catching the frisbee, frame by frame ----------------------------------------------------------------------------
# Starting from the watching pose (as redrawn by hand in the dot editor, when it was): a crouch in two steps
# (anticipation), the push off the ground (the front rising), the rise, the top of the leap held while he catches it,
# the drop, landing with a little give, and standing with it. The plugin plays them over its 1.6 s throw, the
# frisbee reaching his mouth at CATCH_AT.
def _clean(img):
    return [[('.' if len(k) > 1 else k) for k in row] for row in img]


def _rows(img):
    return [list(r) for r in img]


def _shift(img, dy):
    out = new()
    for y in range(CH):
        for x in range(CW):
            if img[y][x] != '.' and 0 <= y + dy < CH:
                out[y + dy][x] = img[y][x]
    return out


def _squash(img, y0, n):
    """A crouch: the rows above y0 lowered n dots (the legs fold), the feet stay."""
    out = [r[:] for r in img]
    for _ in range(n):
        nxt = new()
        for y in range(CH):
            for x in range(CW):
                if y > y0:
                    nxt[y][x] = out[y][x]
                elif y < y0 and out[y][x] != '.':
                    nxt[y + 1][x] = out[y][x]
        for x in range(CW):     # the folded leg: the row at y0 keeps what is under it
            if nxt[y0][x] == '.' and out[y0][x] != '.':
                nxt[y0][x] = out[y0][x]
        out = nxt
    return out


def _rotate(img, deg, px, py):
    """The picture turned about (px, py) (nose up for negative deg), nearest dot."""
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    out = new()
    for y in range(CH):
        for x in range(CW):
            sx = px + (x - px) * ca + (y - py) * sa
            sy = py - (x - px) * sa + (y - py) * ca
            ix, iy = int(round(sx)), int(round(sy))
            if 0 <= ix < CW and 0 <= iy < CH:
                out[y][x] = img[iy][ix]
    return out


def _bottom(img):
    return max(y for y in range(CH) if any(k != '.' for k in img[y]))


def _floor(img):
    """Stood on the ground row."""
    return _shift(img, (GROUND_ROW - 1) - _bottom(img))


_watch = _clean(JUMP[0])
if EDITS.get('jump', {}).get('0'):
    _r = EDITS['jump']['0']
    _watch = [list(r.ljust(CW, '.')[:CW]) for r in _r] + [['.'] * CW for _ in range(CH - len(_r))]
_leap, _land = _clean(JUMP[1]), _clean(JUMP[2])
_knee = GROUND_ROW - 7
def _top(img):
    return min(y for y in range(CH) if any(k != '.' for k in img[y]))


def _cx(img):
    xs = [x for y in range(CH) for x in range(CW) if img[y][x] != '.']
    return sum(xs) / len(xs)


def _hshift(img, dx):
    out = new()
    for y in range(CH):
        for x in range(CW):
            if img[y][x] != '.' and 0 <= x + dx < CW:
                out[y][x + dx] = img[y][x]
    return out


def _air(img, deg, lift):
    """The watching pose reared up `deg` about its middle, kept where he stands (not slid back), and lifted `lift`
    dots off the ground, inside the picture."""
    r = _rotate(img, deg, _cx(img), 24)
    r = _hshift(r, int(round(_cx(img) - _cx(r))))
    r = _floor(r)
    return _shift(r, -min(lift, _top(r)))


def _swing(img, box, pivot, deg, stretch=1.0):
    """The part of the picture inside box (x0, x1, y0, y1) swung about pivot (x, y) by deg (positive: its far end
    moves forward, toward his nose) and stretched along its length; the rest stays."""
    x0, x1, y0, y1 = box
    piece = {(x, y): img[y][x] for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if img[y][x] != '.'}
    out = [r[:] for r in img]
    for (x, y) in piece:
        out[y][x] = '.'
    a = math.radians(-deg)
    ca, sa = math.cos(a), math.sin(a)
    px, py = pivot
    for y in range(CH):
        for x in range(CW):
            dx, dy = x - px, y - py
            # back into the piece: un-rotate, un-stretch
            ux, uy = dx * ca + dy * sa, -dx * sa + dy * ca
            ux, uy = ux, uy / stretch
            sx, sy = int(round(px + ux)), int(round(py + uy))
            k = piece.get((sx, sy))
            if k and out[y][x] == '.':
                out[y][x] = k
    return out


_FRONT = ((19, 30, 27, 35), (25, 27))   # the front legs and the elbow they swing from
_HIND = ((5, 17, 27, 35), (11, 27))     # the hind legs and the stifle


def _strays(img):
    """Drop the loose dots a swing leaves behind (a dot with at most one neighbour)."""
    out = [r[:] for r in img]
    for y in range(CH):
        for x in range(CW):
            if img[y][x] == '.':
                continue
            n = sum(1 for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dx or dy) and 0 <= y + dy < CH and 0 <= x + dx < CW
                    and img[y + dy][x + dx] != '.')
            if n <= 1:
                out[y][x] = '.'
    return out


def _legs(img, front, hind, hind_stretch=1.0):
    img = _swing(img, _FRONT[0], _FRONT[1], front)
    return _strays(_swing(img, _HIND[0], _HIND[1], hind, hind_stretch))


# every frame is the watching pose as finished by hand in the editor (frame 1): crouched, then in the air with its
# legs swung the way a leaping dog's go (hind legs driving back and down, forelegs tucked up to the chest; coming
# down, the forelegs reach for the ground and the hind legs gather under him)
CATCH = [
    _watch,                                                         # 0 watching it come
    _squash(_watch, _knee, 1),                                      # 1-2 crouching to spring
    _squash(_watch, _knee, 2),
    _air(_legs(_watch, 20, -40, 1.1), -6, 0),                       # 3 pushing off: hind legs driving, front lifting
    _air(_legs(_watch, 70, -55, 1.05), -8, 4),                      # 4 rising: forelegs tucked, hind legs trailing
    _air(_legs(_watch, 85, -35, 1.0), -8, 5),                       # 5 the top of the leap: caught (held)
    _air(_legs(_watch, 35, 20, 1.0), -2, 3),                        # 6 dropping: forelegs reaching down
    _squash(_watch, _knee, 1),                                      # 7 landing, with a little give
    _watch,                                                         # 8-9 standing with it
    _watch,
]
CATCH = [f if _bottom(f) <= GROUND_ROW - 1 else _floor(f) for f in CATCH]   # (nothing below the ground)
CATCH_MS = [360, 90, 120, 80, 90, 260, 100, 120, 160, 220]   # 1600 ms: the throw's length in the plugin
CATCH_AT = 5


sets = {'walk': pack(edited('walk', RUN), [40] * len(RUN)), 'run': pack(edited('run', DASH), [40] * len(DASH)), 'pant': pack(edited('pant', PANT), [70] * len(PANT)), 'sleep': pack(edited('sleep', SLEEP), [700, 700]),
        'sit': pack(edited('sit', SIT), [450, 160, 450, 160] * 2), 'wag': pack(edited('wag', WAG), [140, 90, 80, 90, 140, 90, 80, 90]), 'bark': pack(edited('bark', BARK[:1] + BARK[1:2] + BARK[1:3] + BARK[3:] + BARK[3:]), [150, 60, 120, 170, 70, 260]),
        'sniff': pack(edited('sniff', SNIFF), [65] * len(SNIFF)), 'dig': pack(edited('dig', DIG), [45] * len(DIG)), 'ask': pack(edited('ask', ASK), [500, 500]), 'sad': pack(edited('sad', SAD), [1200, 1200]),
        'droop': pack(edited('droop', DROOP), [1000, 1000]), 'pet': pack(edited('pet', PET), [55] * len(PET)), 'door': pack(edited('door', DOOR), [240, 150, 130, 150, 240, 150, 130, 150]),
        'stretch': pack(edited('stretch', STRETCH), STRETCH_MS), 'eat': pack(edited('eat', EAT), [160] * len(EAT)), 'jump': pack(edited('jump', [OUTLINE_FN(f) for f in CATCH]), CATCH_MS)}
sets['jump']['catchAt'] = CATCH_AT


def mouth_of(img):
    """Where his mouth is (column, row): just behind and below the nose, for the frisbee and the stick."""
    ns = [(y, x) for y, row in enumerate(img) for x, k in enumerate(row) if k == 'N']
    if not ns:
        return None
    return [min(x for _, x in ns) - 1, max(y for y, _ in ns) + 1]


# where his mouth is in each catching frame, for the frisbee (found from the nose; an edited frame's own)
sets['jump']['mouth'] = [mouth_of([[('.' if len(k) > 1 else k) for k in r] for r in f]) for f in EDITOR_SRC['jump']]


def pack_real(frames, durations):
    out = pack([OUTLINE_FN(f) for f in frames], durations)
    out['mouth'] = [mouth_of(f) for f in frames]
    return out


real = {'walk': pack_real(R_WALK, [40] * len(R_WALK)), 'run': pack_real(R_RUN, [40] * len(R_RUN)), 'pant': pack_real(R_PANT, [70] * len(R_PANT)),
        'sleep': pack_real(R_SLEEP, [700, 700]), 'sit': pack_real(R_SIT, [900, 900]), 'wag': pack_real(R_WAG, [55] * len(R_WAG)),
        'bark': pack_real(R_BARK, [150, 150, 150, 220]), 'sniff': pack_real(R_SNIFF, [65] * len(R_SNIFF)), 'dig': pack_real(R_DIG, [60] * len(R_DIG)),
        'ask': pack_real(R_ASK, [500, 500]), 'sad': pack_real(R_SAD, [1200, 1200]), 'droop': pack_real(R_DROOP, [1000, 1000]),
        'pet': pack_real(R_PET, [55] * len(R_PET)), 'door': pack_real(R_DOOR, [900, 900]), 'stretch': pack_real(R_STRETCH, R_STRETCH_MS),
        'eat': pack_real(R_EAT, [180] * len(R_EAT)), 'jump': pack_real(R_JUMP, [500, 500, 500])}
assert len(palette) <= len(ALPHABET), len(palette)
# the dot editor's data: every classic frame as rows of single-letter keys (the outline left out: the editor draws
# none and the build outlines an edited frame afresh), each key's colour, each set's frame times
json.dump({'width': CW, 'height': CH, 'ground': GROUND_ROW,
           'keys': {k: '%02x%02x%02x' % v for k, v in COL.items() if len(k) == 1},
           'sets': {n: {'durations': sets[n]['durations'],
                        'frames': [[''.join('.' if len(c) > 1 else c for c in row) for row in f] for f in EDITOR_SRC[n]]}
                    for n in EDITOR_SRC}},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terry-editor-data.json'), 'w'), separators=(',', ':'))
json.dump({'alphabet': ALPHABET, 'palette': palette, 'outline': outline, 'width': CW, 'height': CH, 'subpixel': True, 'sets': sets, 'real': real},
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
