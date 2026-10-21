#!/usr/bin/env python3
"""The ladder card's two heroes, built from a small rig (a head, a torso and jointed limbs, posed by angles) the way
Terry's first frames were built from ellipses and limbs: the runner, in a white suit with a backpack and a laser gun,
like Jake Peril of Lode Runner: The Legend Returns (1994), and the skeleton monk in a red hooded robe, like its Mad
Monks. Both are drawn afresh, nothing is taken from the game.

    python3 docs/preview/lode/rig.py --sheet x.png      (a picture of every frame; build-lode.py writes the data)

Angles are in degrees from straight down, positive towards where he faces (right). Sizes are in sub-pixels.
"""
import math
import sys

W, H = 24, 32

# the runner: hair, skin, the white suit in three tones, shoes, the backpack and its strap, the gun and its glowing tip
# the monk: robe in three tones, bone in two, the dark of the skull's eyes. Both: E the eye, gold and its light
KEYS = {
    'A': '2e2018', 'a': '5a4030', 'K': 'f0bc92', 'k': 'c88e66', 'E': '141414',
    'U': 'f2f4f8', 'u': 'c4cad4', 'q': '8e96a4', 'V': '262630', 'v': '50505e',
    'N': '9a6636', 'n': '64401e', 'O': '3a2614', 'M': '707888', 'm': '3e4450', 'L': 'ff8a3c',
    'R': 'd03030', 'r': '8a1a1a', 'Z': '560c0c', 'B': 'f2ecd8', 'b': 'bcb096',
    'G': 'f5c542', 'g': 'b8860b', 'Y': 'fff2a8',
}


# the drawing scale: 1 for the card's dots and blocks; 3 for the cell font, where a sub-pixel is a screen pixel and
# the same shapes are drawn three times finer (every size below stays in base units)
S = 1


def set_scale(s):
    global S
    S = s


class Pic:
    def __init__(self, w=W, h=H):
        self.s = S
        self.w, self.h = w * S, h * S
        self.px = [['.'] * self.w for _ in range(self.h)]

    def _cells(self):
        s = self.s
        for y in range(self.h):
            for x in range(self.w):
                yield x, y, (x + .5) / s, (y + .5) / s

    def put(self, x, y, k):
        x, y = int(round(x)), int(round(y))
        for dy in range(self.s):
            for dx in range(self.s):
                X, Y = x * self.s + dx, y * self.s + dy
                if 0 <= X < self.w and 0 <= Y < self.h:
                    self.px[Y][X] = k

    def disc(self, cx, cy, rx, ry, k, clip=None):
        for x, y, bx, by in self._cells():
            if ((bx - cx) / rx) ** 2 + ((by - cy) / ry) ** 2 <= 1 and (clip is None or clip(bx - .5, by - .5)):
                self.px[y][x] = k

    def limb(self, a, b, r0, r1, k):
        """a capsule from a to b, r0 thick at a, r1 at b"""
        (x0, y0), (x1, y1) = a, b
        L = max(1e-6, math.hypot(x1 - x0, y1 - y0))
        for x, y, bx, by in self._cells():
            px, py = bx - x0, by - y0
            t = max(0, min(1, (px * (x1 - x0) + py * (y1 - y0)) / (L * L)))
            d = math.hypot(px - t * (x1 - x0), py - t * (y1 - y0))
            if d <= r0 + (r1 - r0) * t:
                self.px[y][x] = k

    def fill(self, fn):
        """fn(x, y) in base units gives the key at that point (or None): for shapes made row by row, like the robes"""
        for x, y, bx, by in self._cells():
            k = fn(bx, by)
            if k:
                self.px[y][x] = k

    def rect(self, x0, y0, x1, y1, k):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, k)

    def rows(self):
        return [''.join(r) for r in self.px]


def joint(p, ang, length):
    a = math.radians(ang)
    return (p[0] + math.sin(a) * length, p[1] + math.cos(a) * length)


def shaded_limb(pic, a, b, r0, r1, light, shade):
    """a limb with its lower/back half in shade: the shade capsule, then the light one nudged up and forward"""
    pic.limb(a, b, r0, r1, shade)
    pic.limb((a[0] + .35, a[1] - .45), (b[0] + .35, b[1] - .45), max(.6, r0 - .55), max(.5, r1 - .55), light)


# ---- the runner, from the side ------------------------------------------------------------------------------------
# a grown man's proportions, as in the game (its runner is slim with a small head, long legs and a long stride):
# the head about a sixth of his height
THIGH, SHIN, TORSO = 7.6, 7.3, 8.4
UPPER, FORE = 4.6, 4.4
HEAD_RX, HEAD_RY = 2.3, 2.6


def runner_side(thigh_near=0, knee_near=0, thigh_far=0, knee_far=0, arm_near=(20, 60), arm_far=(-20, 60),
                lean=8, bob=0, crouch=0, gun=False, aim=None, head_down=0):
    """thigh: the hip's angle; knee: how far the shin folds back from it. arm: (shoulder, elbow fold forward).
    aim: point the near arm straight along this angle with the gun (shooting)."""
    p = Pic()
    hip = (11.5, 31.2 - THIGH - SHIN - .4 + bob + crouch)
    tl = math.radians(lean)
    neck = (hip[0] + math.sin(tl) * TORSO, hip[1] - math.cos(tl) * TORSO)
    shoulder = (neck[0] - .2, neck[1] + 1.2)

    def leg(thigh, knee, near):
        k = joint(hip, thigh, THIGH)
        f = joint(k, thigh - knee, SHIN)
        light, shade = ('U', 'u') if near else ('u', 'q')
        shaded_limb(p, hip, k, 1.45, 1.15, light, shade)
        shaded_limb(p, k, f, 1.15, .9, light, shade)
        toe = joint(f, thigh - knee + 90, 2.2)
        p.limb(f, toe, .85, .75, 'V' if near else 'm')

    def arm(sh, fold, near):
        e = joint(shoulder, sh, UPPER)
        hnd = joint(e, sh + fold, FORE)
        light, shade = ('U', 'u') if near else ('u', 'q')
        shaded_limb(p, shoulder, e, 1.05, .95, light, shade)
        shaded_limb(p, e, hnd, .95, .8, light, shade)
        p.disc(hnd[0], hnd[1], .9, .9, 'K' if near else 'k')
        return hnd, sh + fold

    leg(thigh_far, knee_far, False)
    arm(arm_far[0], arm_far[1], False)
    # a small pack on his back
    bx = neck[0] - 3.0
    p.limb((bx - .6, neck[1] + 2.0), (bx - 1.2, neck[1] + 6.4), 1.3, 1.3, 'n')
    p.limb((bx - .2, neck[1] + 2.0), (bx - .8, neck[1] + 6.0), .9, .9, 'N')
    # the torso, slim, shaded on its back; the belt
    p.limb((hip[0] - .2, hip[1] - .4), neck, 2.2, 2.3, 'u')
    p.limb((hip[0] + .3, hip[1] - .7), (neck[0] + .4, neck[1] + .3), 1.5, 1.6, 'U')
    p.limb((hip[0] - 2.0, hip[1] - .3), (hip[0] + 2.1, hip[1] - .5), .45, .45, 'q')
    leg(thigh_near, knee_near, True)
    # the head: small, dark hair on the crown and the back, the face forward
    hc = (neck[0] + .9, neck[1] - 2.6 + head_down)
    p.disc(hc[0], hc[1], HEAD_RX, HEAD_RY, 'K')
    p.disc(hc[0] - .7, hc[1] - .3, HEAD_RX, HEAD_RY, 'A', clip=lambda x, y: x + .5 < hc[0] + .3 or y + .5 < hc[1] - .9)
    p.put(hc[0] + 1.3, hc[1] - .1, 'E')
    p.put(hc[0] + .6, hc[1] + 1.7, 'k')
    p.limb((neck[0] + .2, neck[1] + .4), (hc[0] - .2, hc[1] + 2.0), .7, .7, 'k')
    if aim is not None:
        hnd, d = arm(aim, 0, True)
    else:
        hnd, d = arm(arm_near[0], arm_near[1], True)
    g1 = None
    if gun:
        g1 = joint(hnd, d if aim is not None else 90, 2.8)
        p.limb(hnd, g1, .7, .6, 'M')
        p.put(g1[0], g1[1], 'm')
    return p, g1


def runner_walk():
    """eight frames of a run, as the game's runner goes: a long stride, the knee of the leg coming through folded high,
    the arms pumping against the legs, leaning into it"""
    out = []
    for i in range(8):
        ph = i / 8 * 2 * math.pi
        sn, sf = math.sin(ph), math.sin(ph + math.pi)
        knee = lambda q: 12 + 100 * max(0, math.sin(q - 4.0)) ** 1.2   # folded most as the leg swings back to front
        bob = -round(abs(math.sin(ph)) * 1.0)
        p, _ = runner_side(thigh_near=38 * sn, knee_near=knee(ph), thigh_far=38 * sf, knee_far=knee(ph + math.pi),
                           arm_near=(-40 * sn, 75), arm_far=(-40 * sf, 75), lean=12, bob=bob)
        out.append(p.rows())
    return out


def runner_shoot():
    """aiming the laser down at the turf in front of him, crouched a little; the second frame kicks back"""
    out, muzzles = [], []
    for kick in (0, 1):
        p, muzzle = runner_side(thigh_near=24, knee_near=40, thigh_far=-16, knee_far=24, arm_far=(-10, 50),
                                crouch=1 + kick, lean=14, aim=50 + kick * 8, gun=True)
        out.append(p.rows())
        muzzles.append([round(muzzle[0]), round(muzzle[1])])
    return out, muzzles


def runner_stand():
    p, _ = runner_side(thigh_near=3, knee_near=3, thigh_far=-3, knee_far=3, arm_near=(8, 10), arm_far=(-6, 8), lean=2,
                       gun=True)
    return p.rows()


# ---- the runner, from behind and from the front --------------------------------------------------------------------
def _body_front(p, cx, y0, arms, legs, back=False):
    """front or back view: arms = [(shoulder→elbow→hand) points per side], legs likewise"""
    for (sh, el, hand) in arms:
        shaded_limb(p, sh, el, 1.05, .95, 'U', 'u')
        shaded_limb(p, el, hand, .95, .8, 'U', 'u')
        p.disc(hand[0], hand[1], .9, .9, 'K')
    for (hp, kn, ft) in legs:
        shaded_limb(p, hp, kn, 1.45, 1.15, 'U', 'u')
        shaded_limb(p, kn, ft, 1.15, .9, 'U', 'u')
        p.rect(ft[0] - 1.0, ft[1] - .2, ft[0] + 1.0, ft[1] + .7, 'V')
    p.limb((cx, y0 + 16), (cx, y0 + 8.5), 2.6, 2.7, 'u')
    p.limb((cx, y0 + 15.6), (cx, y0 + 8.8), 1.9, 2.0, 'U')
    p.limb((cx - 2.4, y0 + 16), (cx + 2.4, y0 + 16), .45, .45, 'q')
    if back:
        p.rect(cx - 2.0, y0 + 9.0, cx + 2.0, y0 + 14.4, 'N')
        p.rect(cx - 2.0, y0 + 13.6, cx + 2.0, y0 + 14.4, 'n')
        p.disc(cx, y0 + 5.0, HEAD_RX, HEAD_RY, 'A')
    else:
        for side in (-1, 1):
            p.limb((cx + side * 1.8, y0 + 8.4), (cx + side * 1.4, y0 + 13), .4, .4, 'O')
        p.disc(cx, y0 + 5.0, HEAD_RX, HEAD_RY, 'K')
        p.disc(cx, y0 + 4.0, HEAD_RX + .1, 1.9, 'A', clip=lambda x, y: y + .5 < y0 + 4.4 or abs(x + .5 - cx) > 1.9)
        p.put(cx - .9, y0 + 5.2, 'E')
        p.put(cx + .9, y0 + 5.2, 'E')
    p.rect(cx - .6, y0 + 7.4, cx + .6, y0 + 8.0, 'k')


def runner_back(phase):
    """climbing, seen from behind: one hand high and the other low, the knee on the same side up"""
    p = Pic()
    cx, y0 = 12, 1.5
    s = math.sin(phase)
    arms, legs = [], []
    for side in (-1, 1):
        up = side * s
        sh = (cx + side * 2.4, y0 + 9.4)
        hand = (cx + side * 3.4, y0 + 2.0 - up * 3.2)
        arms.append((sh, (cx + side * 4.6, (sh[1] + hand[1]) / 2 + 1), hand))
        hp = (cx + side * 1.3, y0 + 16.5)
        kn = (cx + side * 2.0, y0 + 23.6 - up * 2.8)
        legs.append((hp, kn, (cx + side * 1.9, y0 + 29.6 - up * 2.4)))
    _body_front(p, cx, y0, arms, legs, back=True)
    return p.rows()


def runner_front(arms_up=0, gold=False, hop=0):
    """facing you, arms down (the gun in his right hand) or up"""
    p = Pic()
    cx, y0 = 12, 1.5 + hop
    arms, legs = [], []
    for side in (-1, 1):
        sh = (cx + side * 2.6, y0 + 9.4)
        if arms_up:
            arms.append((sh, (cx + side * 4.6, y0 + 5.6), (cx + side * 4.0, y0 + 1.0)))
        else:
            arms.append((sh, (cx + side * 3.3, y0 + 13.6), (cx + side * 3.4, y0 + 17.4)))
        hp = (cx + side * 1.3, y0 + 16.5)
        legs.append((hp, (cx + side * 1.5, y0 + 23.4), (cx + side * 1.5, y0 + 29.6)))
    _body_front(p, cx, y0, arms, legs)
    if not arms_up:
        p.limb((cx + 3.4, y0 + 17.6), (cx + 3.6, y0 + 20.2), .7, .6, 'M')
    if gold:
        skull(p, cx - 2.5, y0 - 2.4)
    return p.rows()


def skull(p, x, y):
    """the golden skull, the game's treasure: a round top, two eye holes, the jaw"""
    p.disc(x + 2.5, y + 2.2, 2.6, 2.3, 'G')
    p.put(x + 1.5, y + 1.0, 'Y')
    p.put(x + 1.5, y + 2.6, 'g')
    p.put(x + 3.5, y + 2.6, 'g')
    p.rect(x + 1.5, y + 4.2, x + 3.5, y + 4.8, 'G')
    p.put(x + 2.5, y + 4.6, 'g')


def runner_hang(phase):
    """hand over hand along a bar: both arms up to it, the legs swinging under him"""
    s = math.sin(phase)
    p, _ = runner_side(thigh_near=16 * s, knee_near=20, thigh_far=-16 * s, knee_far=20, arm_near=(165 - 8 * s, 0),
                       arm_far=(172 + 8 * s, 0), lean=0, bob=0)
    return p.rows()


def runner_sit(nod):
    """asleep, sat with his back to his pack and his knees up, the head nodding on his chest"""
    p, _ = runner_side(thigh_near=100, knee_near=95, thigh_far=104, knee_far=100, arm_near=(40, 60), arm_far=(30, 60),
                       lean=-8, crouch=12, head_down=1.2 + nod * .8)
    return p.rows()


def runner_stuck(wave):
    p = Pic(W, 18)
    full = runner_front(arms_up=1, hop=0)
    for y in range(18 * S):
        p.px[y] = list(full[y + S])
    if wave:
        p.px = [r[S:] + ['.'] * S for r in p.px[:5 * S]] + p.px[5 * S:]
    return p.rows()


# ---- the monk -------------------------------------------------------------------------------------------------------
def monk_side(step=0.0, reach=0.0, lean=12, arms_up=False, hem=0):
    """hunched forward in his robe, the hood up round the skull, bony hands reaching; feet peep under the hem"""
    p = Pic()
    base = 29.5
    tl = math.radians(lean)
    top = (11.5 + math.sin(tl) * 16, base - math.cos(tl) * 16)
    # the robe: a bell from the shoulders to the hem, shaded on the back
    def robe(bx, by):
        y = by - .5
        if not int(top[1]) + 2 <= y < 31:
            return None
        t = (y - top[1]) / (base - top[1])
        cx = top[0] + (11.5 + hem * .6 - top[0]) * t
        half = 2.6 + 3.6 * t ** 1.3
        d = bx - cx
        if -half <= d <= half:
            return 'r' if d < -half * .35 else 'Z' if y >= 29 else 'R'
    p.fill(robe)
    # bony feet stepping out under the hem, one ahead one behind (the hem lifts over the one that steps)
    for s, k in ((math.sin(step + math.pi), 'b'), (math.sin(step), 'B')):
        fx = 11.5 + hem * .6 + s * 4.2
        lift = max(0, math.cos(step if k == 'B' else step + math.pi)) * 1.2
        p.limb((fx - 1.2, 30.6 - lift), (fx + 1.4, 30.8 - lift), .75, .7, k)
    # the arms reaching out (or up to a bar), sleeves red, bony hands
    if arms_up:
        for dx, k in ((.8, 'r'), (2.2, 'R')):
            p.limb((top[0] + dx - 1, top[1] + 4), (top[0] + dx, 0.8), 1.2, 1.0, k)
            p.disc(top[0] + dx, 0.8, 1.1, 1.1, 'B')
    else:
        for off, k, kb in ((-.6, 'r', 'b'), (.6, 'R', 'B')):
            sh = (top[0] + .5, top[1] + 4.5)
            hand = joint(sh, 70 + reach * 25 + off * 15, 6.0)
            p.limb(sh, hand, 1.4, 1.1, k)
            p.disc(hand[0] + .5, hand[1], 1.1, 1.0, kb)
            p.put(hand[0] + 1.5, hand[1] + .5, kb)
    # the hood, and the skull in it facing forward
    # the hood: a round red cowl pulled forward, the face deep in its shadow, only the skull's pale front showing
    hc = (top[0] + 1.2, top[1] - .5)
    p.disc(hc[0] - .6, hc[1], 4.2, 4.4, 'R')
    p.disc(hc[0] - 1.8, hc[1] - .6, 3.2, 3.6, 'r', clip=lambda x, y: x + .5 < hc[0] - 2.2)
    p.disc(hc[0] + 1.5, hc[1] + .9, 2.0, 2.4, 'Z')
    p.disc(hc[0] + 2.0, hc[1] + 1.1, 1.2, 1.7, 'b')
    p.put(hc[0] + 2.4, hc[1] + .4, 'E')
    p.put(hc[0] + 2.0, hc[1] + 2.2, 'E')
    return p.rows()


def monk_back(phase):
    p = Pic()
    cx = 12
    s = math.sin(phase)
    for side in (-1, 1):
        up = side * s
        hand = (cx + side * 4.8, 4.5 - up * 3.5)
        p.limb((cx + side * 3, 12), hand, 1.4, 1.1, 'R' if side > 0 else 'r')
        p.disc(hand[0], hand[1], 1.2, 1.2, 'B')
        p.limb((cx + side * 2.2, 29.6 - up * 1.6), (cx + side * 2.6, 30.6 - up * 1.6), .9, .8, 'b')
    def robe(bx, by):
        y = by - .5
        if not 9 <= y < 30:
            return None
        half = 3.4 + 2.6 * ((y - 9) / 20) ** 1.2
        if abs(bx - cx) <= half:
            return 'r' if bx < cx - half * .4 else 'Z' if y >= 28 else 'R'
    p.fill(robe)
    p.disc(cx, 7.5, 4.3, 4.6, 'R')
    p.disc(cx - 1.4, 6.8, 2.6, 3.4, 'r')
    return p.rows()


def monk_front(arms_up=False, gold=False, hop=0, sunk=False):
    p = Pic()
    cx, y0 = 12, hop
    for side in (-1, 1):
        if arms_up:
            hand = (cx + side * 4.5, y0 + 3.5)
            p.limb((cx + side * 3.2, y0 + 13), hand, 1.4, 1.1, 'R' if side > 0 else 'r')
        else:
            hand = (cx + side * 6.2, y0 + 21)
            p.limb((cx + side * 3.4, y0 + 13), hand, 1.4, 1.1, 'R' if side > 0 else 'r')
        p.disc(hand[0], hand[1], 1.2, 1.2, 'B')
        p.limb((cx + side * 2.2, y0 + 30.2), (cx + side * 3.2, y0 + 30.4), .9, .8, 'b')
    def robe(bx, by):
        y = by - .5
        if not y0 + 10 <= y < y0 + 30:
            return None
        half = 3.4 + 3.0 * ((y - y0 - 10) / 20) ** 1.2
        if abs(bx - cx) <= half:
            return 'r' if bx < cx - half * .55 else 'Z' if y >= y0 + 28 else 'R'
    p.fill(robe)
    p.disc(cx, y0 + 7.5, 4.6, 4.8, 'R')
    p.disc(cx, y0 + 8.2, 3.0, 3.3, 'B')
    for dx in (-1.3, 1.3):
        p.put(cx + dx - .5, y0 + 7.6, 'E')
        p.put(cx + dx + .2, y0 + 7.6, 'E')
    p.put(cx, y0 + 9.4, 'E')
    for dx in (-1.2, 0, 1.2):
        p.put(cx + dx, y0 + 10.8, 'E' if dx == 0 else 'b')
    if gold:
        skull(p, cx - 2.5, y0 - 1.2)
    return p.rows()


# ---- the monk for the cell font -------------------------------------------------------------------------------------
# The terminal gives each 8 x 16 cell two colours. Shaded in three reds, most of the monk's cells needed three or more,
# and each such cell drew one of them wrong over its own square, a different square every pixel he moved. So here he
# is one red, his folds and the dark of his hood drawn in nothing at all (the background), his hands kept in his
# sleeves, and bone only for the skull: almost every cell he crosses is red and background.
LINE = .36 # a dark line's half width: two screen pixels (one would blur away)


def gap(p, a, b, r=LINE):
    p.limb(a, b, r, r, '.')


def monk_side_cells(step=0.0, reach=0.0, lean=12, arms_up=False, hem=0):
    p = Pic()
    base = 29.5
    tl = math.radians(lean)
    top = (11.5 + math.sin(tl) * 16, base - math.cos(tl) * 16)
    hx = 11.5 + hem * .6 # the hem's centre
    feet = [(hx + math.sin(step + math.pi) * 3.0, max(0, math.cos(step + math.pi)) * 1.1),
            (hx + math.sin(step) * 3.0, max(0, math.cos(step)) * 1.1)]

    def robe(bx, by):
        y = by - .5
        if not int(top[1]) + 2 <= y < 31.2:
            return None
        if y >= 29.4: # under the hem only his robed feet, the one that steps lifted
            return 'R' if any(abs(bx - fx) <= 1.5 and y < 31.2 - lift for fx, lift in feet) else None
        t = (y - top[1]) / (base - top[1])
        cx = top[0] + (hx - top[0]) * t
        half = 2.6 + 3.6 * t ** 1.3
        return 'R' if abs(bx - cx) <= half else None
    p.fill(robe)
    # a fold down his back and one at the front of the skirt
    gap(p, (top[0] - 1.6, top[1] + 4.6), (hx - 3.4, 28.6))
    gap(p, (hx + 1.2, 24.0), (hx + 1.9, 28.8))
    # the arms: a dark edge round the near one parts it from the robe; the hands in the sleeves
    if arms_up:
        for dx in (.8, 2.4):
            a, b = (top[0] + dx - 1, top[1] + 4), (top[0] + dx, 1.4)
            p.limb(a, b, 1.2 + LINE * 2, 1.0 + LINE * 2, '.')
            p.limb(a, b, 1.2, 1.0, 'R')
            p.disc(top[0] + dx, .9, 1.0, 1.0, 'R')
    else:
        for n, off in enumerate((-.7, .7)):
            sh = (top[0] + .5, top[1] + 4.5)
            hand = joint(sh, 70 + reach * 25 + off * 15, 5.6)
            if n:
                p.limb(sh, hand, 1.4 + LINE * 2, 1.1 + LINE * 2, '.')
            p.limb(sh, hand, 1.4, 1.1, 'R')
            p.disc(hand[0] + .7, hand[1], .9, .8, 'R')
    # the hood: a round red cowl, a dark line where it falls on the shoulders, the face a dark hole with the skull in it
    hc = (top[0] + 1.2, top[1] - .5)
    p.disc(hc[0] - .6, hc[1], 4.2 + LINE, 4.4 + LINE, '.', clip=lambda x, y: y + .5 > hc[1] + 1.5)
    p.disc(hc[0] - .6, hc[1], 4.2, 4.4, 'R')
    gap(p, (hc[0] - 2.6, hc[1] - 2.4), (hc[0] - 3.4, hc[1] + 1.2))
    p.disc(hc[0] + 1.6, hc[1] + .9, 2.1, 2.5, '.')
    p.disc(hc[0] + 2.1, hc[1] + 1.0, 1.4, 1.9, 'B')
    p.disc(hc[0] + 2.7, hc[1] + .3, .55, .6, '.') # the eye socket, high at the front
    gap(p, (hc[0] + 2.0, hc[1] + 2.0), (hc[0] + 3.4, hc[1] + 2.0), .3) # the teeth
    return p.rows()


def monk_back_cells(phase):
    p = Pic()
    cx = 12
    s = math.sin(phase)
    for side in (-1, 1):
        up = side * s
        hand = (cx + side * 4.8, 4.5 - up * 3.5)
        p.limb((cx + side * 3, 12), hand, 1.4, 1.1, 'R')
        p.limb((cx + side * 2.2, 29.8 - up * 1.6), (cx + side * 2.4, 30.6 - up * 1.6), 1.2, 1.1, 'R')

    def robe(bx, by):
        y = by - .5
        if not 9 <= y < 29.6:
            return None
        half = 3.4 + 2.6 * ((y - 9) / 20) ** 1.2
        return 'R' if abs(bx - cx) <= half else None
    p.fill(robe)
    for side in (-1, 1): # the arms part from the back, the seam down the middle, the hood on the shoulders
        gap(p, (cx + side * 3.3, 11.4), (cx + side * 4.2, 15.5))
    gap(p, (cx, 13.5), (cx + .3, 28.8))
    p.disc(cx, 7.5, 4.3 + LINE, 4.6 + LINE, '.', clip=lambda x, y: y + .5 > 9.5)
    p.disc(cx, 7.5, 4.3, 4.6, 'R')
    gap(p, (cx - 1.6, 4.4), (cx - 2.6, 8.6))
    return p.rows()


def frames():
    shoot, muzzles = runner_shoot()
    stuck_runner = [runner_stuck(w) for w in (0, 1)]
    side, back = (monk_side_cells, monk_back_cells) if S >= 3 else (monk_side, monk_back) # the cell font's own monk
    return {
        'runner': {
            'walk': runner_walk(),
            'climb': [runner_back(0.0), runner_back(math.pi / 2), runner_back(math.pi), runner_back(3 * math.pi / 2)],
            'hang': [runner_hang(i / 4 * 2 * math.pi) for i in range(4)],
            'idle': [runner_stand(), runner_front()],
            'happy': [runner_front(arms_up=1, gold=True, hop=1), runner_front(arms_up=1, gold=True, hop=0)],
            'sleep': [runner_sit(0), runner_sit(1)],
            'stuck': stuck_runner,
            'dig': shoot,
        },
        'monk': {
            'walk': [side(step=i / 8 * 2 * math.pi, reach=math.sin(i / 8 * 2 * math.pi) * .3, hem=math.sin(i / 8 * 2 * math.pi)) for i in range(8)],
            'climb': [back(i / 4 * 2 * math.pi) for i in range(4)],
            'hang': [side(arms_up=True, lean=0, hem=math.sin(i / 4 * 2 * math.pi), step=i / 4 * 2 * math.pi) for i in range(4)],
            'idle': [side(lean=6, reach=-.6), monk_front()],
            'happy': [monk_front(arms_up=True, gold=True, hop=1), monk_front(arms_up=True, gold=True, hop=0)],
            'sleep': [side(lean=30, reach=-1.2), side(lean=34, reach=-1.2)],
            'stuck': [monk_front(arms_up=True)[S:19 * S], [r[S:] + '.' * S for r in monk_front(arms_up=True)[S:19 * S]]],
            'dig': [side(lean=4, reach=-1.8), side(lean=22, reach=1.6)],
        },
        'muzzle': muzzles,
    }


def sheet(path, data, Z=8):
    from PIL import Image, ImageDraw
    rows = [(h + ' ' + n, f) for h in ('runner', 'monk') for n, f in data[h].items()]
    n = max(len(f) for _, f in rows)
    im = Image.new('RGB', (n * (W * Z + 8) + 110, len(rows) * (H * Z + 8)), (30, 30, 42))
    d = ImageDraw.Draw(im)
    for r, (name, fr) in enumerate(rows):
        d.text((4, r * (H * Z + 8) + 4), name, fill=(255, 230, 0))
        for i, f in enumerate(fr):
            ox, oy = 110 + i * (W * Z + 8), r * (H * Z + 8) + (H - len(f)) * Z
            for y, row in enumerate(f):
                for x, c in enumerate(row):
                    if c != '.':
                        im.paste(tuple(int(KEYS[c][k:k + 2], 16) for k in (0, 2, 4)), (ox + x * Z, oy + y * Z, ox + x * Z + Z, oy + y * Z + Z))
    im.save(path)


if __name__ == '__main__':
    if '--sheet' in sys.argv:
        sheet(sys.argv[sys.argv.index('--sheet') + 1], frames())
