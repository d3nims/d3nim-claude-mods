#!/usr/bin/env python3
"""Draws the README pictures: docs/images/terry.gif and docs/images/flame1.gif.

The pictures come from the plugin's own drawing code (render.js, through node), laid out the way the
plugin lays them out above the prompt, with the card and the labels drawn as terminal text.

Run:  python3 docs/preview/make-readme-gifs.py      (needs node and Pillow; Korean text uses Malgun Gothic)
"""
import base64
import json
import os
import struct
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RENDER = os.path.join(ROOT, 'plugins', 'usage-meter', 'hooks', 'render.js')
OUT = os.path.join(ROOT, 'docs', 'images')
STEP_MS = 70          # one GIF frame
CW, CH = 10, 20       # one terminal cell in pixels
HOUR = 21             # a night sky: moon and twinkling stars

BG = (22, 22, 26)
FG = (230, 230, 230)
DIM = (138, 143, 152)
BORDER = (90, 95, 115)
MODEL = (180, 160, 255)
EFFORT = (199, 146, 234)
BLUE = (80, 170, 255)
QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

# Terry's day: (mood, seconds, card line 1 colour, what the prompt shows)
STORY = [
    ('sit', 1.6, FG, ''),
    ('bark', 0.8, (255, 209, 102), '테'),
    ('wag', 1.8, FG, '테리 산책 코스 추천해줘'),
    ('run', 3.0, (127, 178, 255), ''),
    ('happy', 1.8, (155, 224, 138), ''),
    ('sleep', 2.2, FG, ''),
]
MOOD_TEXT = {'sit': '앉아서 기다리는 중', 'wag': '입력하는 걸 보고 있어요', 'bark': '멍! 멍!', 'run': '달리는 중',
             'happy': '다 했어요!', 'sleep': '졸고 있어요 zZ'}
USAGE = [('5시간', 38, '2시간 13분 뒤'), ('주간', 71, '10/9(금) 14시'), ('대화', 12, None)]

NODE = r"""
import { terryCells, TERRY_COLS, TERRY_ROWS, makeBand } from %s
const story = %s, step = %d
const terry = []
let ms = 0
for (const [mood, secs] of story) {
  for (let k = 0; k < Math.round(secs * 1000 / step); k++, ms += step) terry.push({ mood, k, cells: terryCells(mood, ms, 'quad', %d) })
}
const band = makeBand(72, 3, 'quad')
const flames = []
for (let k = 0; k < 40; k++) flames.push(band.cells([38, 71, 12], k * step / 1000))
console.log(JSON.stringify({ terry: { cols: TERRY_COLS, rows: TERRY_ROWS, frames: terry },
  band: { cols: band.columns, rows: band.rows, widths: band.widths, frames: flames } }))
"""


def font(name, size):
    for path in (f'/mnt/c/Windows/Fonts/{name}', f'C:/Windows/Fonts/{name}'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


LATIN, LATIN_B = font('consola.ttf', 17), font('consolab.ttf', 17)
HANGUL, HANGUL_B = font('malgun.ttf', 18), font('malgunbd.ttf', 18)


def wide(ch):
    return 0xAC00 <= ord(ch) <= 0xD7A3 or 0x3130 <= ord(ch) <= 0x318F


def text(d, col, row, s, color, bold=False):
    """Writes s on the cell grid: Hangul takes two cells, everything else one. Returns the next column."""
    for ch in s:
        x, y = col * CW, row * CH
        if wide(ch):
            d.text((x, y - 1), ch, font=HANGUL_B if bold else HANGUL, fill=color)
            col += 2
        else:
            d.text((x + 1, y + 1), ch, font=LATIN_B if bold else LATIN, fill=color)
            col += 1
    return col


def width(s):
    return sum(2 if wide(ch) else 1 for ch in s)


def raster(d, col0, row0, packed, cols, rows):
    """Draws Raster cells (quadrant blocks, LE u32 [codePoint, fg, bg]) at a cell position."""
    raw = base64.b64decode(packed)
    colour = lambda v: BG if v & 0x01000000 else ((v >> 16) & 255, (v >> 8) & 255, v & 255)
    for i in range(cols * rows):
        code, fg, bg = struct.unpack_from('<III', raw, i * 12)
        x, y = (col0 + i % cols) * CW, (row0 + i // cols) * CH
        ch = chr(code)
        if ch in QUAD:
            bits = QUAD.index(ch)
            for q in range(4):
                c = colour(fg) if bits & (1 << q) else colour(bg)
                qx, qy = x + (q % 2) * CW // 2, y + (q // 2) * CH // 2
                d.rectangle([qx, qy, qx + CW // 2 - 1, qy + CH // 2 - 1], fill=c)
        elif ch != ' ':
            d.rectangle([x, y, x + CW - 1, y + CH - 1], fill=colour(bg))
            text(d, col0 + i % cols, row0 + i // cols, ch, colour(fg), bold=True)


def card(d, col, row, w, h):
    """A round-cornered border like Ink's borderStyle 'round'."""
    x0, y0, x1, y1 = col * CW + CW // 2, row * CH + CH // 2, (col + w) * CW - CW // 2, (row + h) * CH - CH // 2
    d.rounded_rectangle([x0, y0, x1, y1], radius=7, outline=BORDER, width=1)


def bar(d, col, row, n, filled, color):
    y = row * CH + CH // 2
    for k in range(n):
        x = (col + k) * CW
        if k < filled:
            d.rectangle([x, y - 1, x + CW - 1, y + 1], fill=color)
        else:
            d.line([x, y, x + CW - 1, y], fill=(70, 72, 82))


def save_gif(frames, path):
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=STEP_MS, loop=0, optimize=True, disposal=1)
    print(path, len(frames), 'frames', os.path.getsize(path) // 1024, 'KB')


def terry_gif(data):
    cols, rows = data['cols'], data['rows']
    side, side_w, mini = cols + 4, 40, 14
    W, H = (side + side_w + 1) * CW, (rows + 3) * CH
    frames = []
    elapsed = {}
    for f in data['frames']:
        mood, k = f['mood'], f['k']
        img = Image.new('RGB', (W, H), BG)
        d = ImageDraw.Draw(img)
        raster(d, 0, 0, f['cells'], cols, rows)
        # the turn card, top right
        card(d, side, 0, side_w, 6)
        colour = next(c for m, _, c, _ in STORY if m == mood)
        text(d, side + 2, 1, MOOD_TEXT[mood], colour, bold=True)
        c = text(d, side + 2, 2, 'Opus 5.5', MODEL, bold=True)
        c = text(d, c, 2, ' · ', DIM)
        text(d, c, 2, 'high', EFFORT)
        if mood in ('sit', 'bark', 'wag'):
            text(d, side + 2, 3, '아직 요청이 없어요', DIM)
        elif mood == 'run':
            secs = (k + 1) * STEP_MS / 1000
            out = int(max(0, secs - 0.6) * 128)
            text(d, side + 2, 3, f'{secs:.1f}초' + (f' · {min(132, 90 + k)} tok/s' if out else ''), FG)
            text(d, side + 2, 4, f'입력 2 · 출력 {out} · 캐시 47k', DIM)
            elapsed['secs'], elapsed['out'] = secs, out
        else:
            text(d, side + 2, 3, f"지난 요청 {elapsed['secs']:.1f}초 · 128 tok/s", DIM)
            text(d, side + 2, 4, f"입력 2 · 출력 {elapsed['out']} · 캐시 47k", DIM)
        # usage, bottom right
        for i, (name, pct, reset) in enumerate(USAGE):
            r = rows - 3 + i
            text(d, side, r, name, DIM)
            bar(d, side + 6, r, mini, max(1, round(pct / 100 * mini)), BLUE)
            text(d, side + 6 + mini, r, f' {pct:>3}%', BLUE, bold=True)
            if reset:
                text(d, side + 6 + mini + 7, r, reset, DIM)
        # the prompt underneath: typing makes him bark and wag, Enter sends him running
        d.line([0, (rows + 1) * CH - 4, W, (rows + 1) * CH - 4], fill=(60, 62, 72))
        typed = next(p for m, _, _, p in STORY if m == mood)
        if mood == 'wag':
            typed = typed[:min(len(typed), 1 + k // 2)]
        c = text(d, 0, rows + 1, '> ', DIM)
        c = text(d, c, rows + 1, typed, FG)
        if (k // 7) % 2 == 0:
            d.rectangle([c * CW + 1, (rows + 1) * CH + 3, c * CW + CW - 1, (rows + 2) * CH - 3], fill=FG)
        frames.append(img)
    save_gif(frames, os.path.join(OUT, 'terry.gif'))


def flame_gif(data):
    cols, rows, widths = data['cols'], data['rows'], data['widths']
    W, H = (cols + 2 + 14) * CW, (rows + 2) * CH
    frames = []
    for packed in data['frames']:
        img = Image.new('RGB', (W, H), BG)
        d = ImageDraw.Draw(img)
        raster(d, 0, 0, packed, cols, rows)
        card(d, cols + 2, 0, 12, 4)
        text(d, cols + 4, 1, 'Opus 5.5', MODEL, bold=True)
        text(d, cols + 4, 2, 'high', EFFORT)
        c0 = 0
        for (name, pct, reset), w in zip(USAGE, widths):
            label = f'{name} {pct}%'
            text(d, c0, rows, label, BLUE)
            if reset and width(label + ' · ' + reset) <= w + 2:
                text(d, c0 + width(label), rows, ' · ' + reset, DIM)
            c0 += w + 3
        frames.append(img)
    save_gif(frames, os.path.join(OUT, 'flame1.gif'))


def main():
    os.makedirs(OUT, exist_ok=True)
    script = NODE % (json.dumps(RENDER), json.dumps([[m, s] for m, s, _, _ in STORY]), STEP_MS, HOUR)
    data = json.loads(subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, check=True).stdout)
    terry_gif(data['terry'])
    flame_gif(data['band'])


if __name__ == '__main__':
    main()
