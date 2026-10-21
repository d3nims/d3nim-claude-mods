#!/usr/bin/env python3
"""A test font for drawing pictures with the terminal's own pixels: glyphs in Supplementary Private Use Area-B (U+100000 on: WaveTerm's own Hack is Hack Nerd Font Mono, whose
10,071 icons fill the BMP's Private Use Area and U+F0001-F1AF0, and it is drawn first), each filling one
terminal cell on an 8 x 16 grid, sized to WaveTerm's default font (Hack: advance 1233, ascent 1901, descent 483 per
2048). The terminal renders text at screen resolution, so a picture cut into such glyphs shows at that resolution,
with a foreground and a background colour per cell.

    <python with fontTools> docs/preview/lode/cellfont.py <out.ttf> <out test script>

The script prints the test glyphs (run it in a WaveTerm terminal after installing the font and adding it after Hack
in WaveTerm's term:fontfamily).
"""
import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rig  # noqa: E402

UPM, ADV, ASC, DESC = 2048, 1233, 1901, 483
GW, GH = 8, 16 # the grid in one cell
SIZE = 14 # WaveTerm's default font size: xterm.js makes the cell floor(14 * 1233 / 2048) = 8 pixels wide, 16 high
UX = UY = UPM / SIZE # one grid pixel = one screen pixel, so every edge falls on a pixel boundary (ADV / GW would
# make them 1.05 pixels and smear every edge across two)
# Windows smooths every glyph edge across about half a pixel either side (vertically it leaves them sharp), so where
# two cells of the same colour meet, both edges fade and leave a faint line, fixed on the screen however the picture
# moves. Pixels on a cell's left or right edge reach half a pixel past it: the neighbours overlap and the line goes.
# (A quarter left a 1-pixel line at the seams, lighter than the white either side where both edges overlapped and
# darker where they did not: counted on the same Terry frames, half a pixel had a fifth fewer stray seam pixels and
# none lighter than the colours drawn, 2026-10-21)
BLEED = .5


def glyph(mask):
    """mask: GH rows of GW characters, '#' on. One rectangle per run of lit pixels in a row."""
    pen = TTGlyphPen(None)
    for r, row in enumerate(mask):
        y1 = ASC - r * UY
        y0 = y1 - UY
        x, w = 0, len(row) # a row may run on into the next cell (16 wide): the terminal draws it over that cell
        while x < w:
            if row[x] != '#':
                x += 1
                continue
            s = x
            while x < w and row[x] == '#':
                x += 1
            x0, x1 = s * UX, x * UX
            if s == 0:
                x0 -= UX * BLEED
            if x == GW or x == w:
                x1 += UX * BLEED
            pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
            pen.moveTo(tuple(map(round, pts[0])))
            for p in pts[1:]:
                pen.lineTo(tuple(map(round, p)))
            pen.closePath()
    return pen.glyph()


def lsb(g):
    """a glyph's left side bearing: renderers place the outline by it, so 0 would shove every glyph against the
    cell's left edge (the lit pixels of a cell lit only on its right drawn on its left)"""
    return min(x for x, _ in g.coordinates) if g.numberOfContours > 0 else 0


def cells_of(rows, scale=1):
    """a picture (rows of keys, '.' empty) cut into GW x GH cell masks, row by row"""
    pic = [''.join(c * scale for c in r) for r in rows for _ in range(scale)]
    w = max(len(r) for r in pic)
    pic = [r.ljust(w, '.') for r in pic]
    out = []
    for cy in range(0, len(pic), GH):
        line = []
        for cx in range(0, w, GW):
            mask = []
            for y in range(cy, cy + GH):
                row = pic[y] if y < len(pic) else ''
                mask.append(''.join('#' if x < len(row) and row[x] != '.' else '.' for x in range(cx, cx + GW)))
            line.append(mask)
        out.append(line)
    return out


def mask_rows(key):
    """a gathered cell (32 hex digits: four 32-bit words, bit r*8+c lit) as GH rows of '#' and '.'; 32 more digits are
    the pixels it draws in the next cell, each row then 16 wide"""
    def rows(part):
        words = [int(part[i * 8:i * 8 + 8], 16) for i in range(4)]
        return [''.join('#' if (words[(r * GW + c) >> 5] >> ((r * GW + c) & 31)) & 1 else '.' for c in range(GW)) for r in range(GH)]
    own = rows(key[:32])
    if len(key) == 32:
        return own
    return [a + b for a, b in zip(own, rows(key[32:]))]


def build(glyphs, out_font, family='Lode Cells', version='2.0'):
    """glyphs: {codepoint: GH rows of '#'}"""
    fb = FontBuilder(UPM, isTTF=True)
    order = ['.notdef', 'space'] + ['u%06X' % c for c in sorted(glyphs)]
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: 'space', **{c: 'u%06X' % c for c in glyphs}})
    shapes = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    for c, m in glyphs.items():
        shapes['u%06X' % c] = glyph(m)
    fb.setupGlyf(shapes)
    fb.setupHorizontalMetrics({g: (ADV, lsb(shapes[g])) for g in order})
    fb.setupHorizontalHeader(ascent=ASC, descent=-DESC, lineGap=0)
    ps = family.replace(' ', '')
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular', 'uniqueFontIdentifier': f'{ps}-Regular-{version}',
                       'fullName': f'{family} Regular', 'psName': f'{ps}-Regular', 'version': f'Version {version}'})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=-DESC, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=DESC,
                xAvgCharWidth=ADV, usWeightClass=400, fsSelection=0x40, achVendID='NONE',
                ulUnicodeRange2=1 << 28, ulUnicodeRange3=1 << 26, ulCodePageRange1=1)
    fb.font['OS/2'].panose.bProportion = 9
    fb.setupPost(isFixedPitch=1)
    fb.save(out_font)


def main():
    if sys.argv[1] == '--glyphs':
        # the card's font: glyph i of the gathered list at U+100000 + i
        import json
        # (--more <list.json> <hex base>: another card's list, laid out from that codepoint, as Terry's from U+10A000)
        args = sys.argv[2:]
        more = []
        while '--more' in args:
            i = args.index('--more')
            more.append((args[i + 1], int(args[i + 2], 16)))
            del args[i:i + 3]
        glyphs = {}
        for path, base in [(args[0], 0x100000)] + more:
            keys = json.loads(Path(path).read_text())
            if glyphs and base <= max(glyphs):
                raise SystemExit(f'{path} at U+{base:X} would overlap the glyphs before it (up to U+{max(glyphs):X})')
            glyphs.update({base + i: mask_rows(k) for i, k in enumerate(keys)})
            print(len(keys), 'glyphs from', path, f'at U+{base:X}')
        build(glyphs, args[1], version=args[2] if len(args) > 2 else '2.0')
        print(len(glyphs), 'glyphs ->', args[1])
        return
    out_font, out_sh = sys.argv[1], sys.argv[2]
    glyphs = {}
    full = ['#' * GW] * GH
    checker = [''.join('#' if (x + y) % 2 == 0 else '.' for x in range(GW)) for y in range(GH)]
    border = ['#' * GW] + ['#' + '.' * (GW - 2) + '#'] * (GH - 2) + ['#' * GW]
    diag = [''.join('#' if x == y // 2 else '.' for x in range(GW)) for y in range(GH)]
    for cp, m in ((0x100000, full), (0x100001, checker), (0x100002, border), (0x100003, diag)):
        glyphs[cp] = m
    runner = rig.frames()['runner']['walk'][2]
    blocks = {}
    cp = 0x100010
    for scale in (1, 2):
        lines = []
        for line in cells_of(runner, scale):
            row = []
            for m in line:
                glyphs[cp] = m
                row.append(cp)
                cp += 1
            lines.append(row)
        blocks[scale] = lines

    fb = FontBuilder(UPM, isTTF=True)
    order = ['.notdef', 'space'] + ['u%06X' % c for c in sorted(glyphs)]
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: 'space', **{c: 'u%06X' % c for c in glyphs}})
    shapes = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    for c, m in glyphs.items():
        shapes['u%06X' % c] = glyph(m)
    fb.setupGlyf(shapes)
    fb.setupHorizontalMetrics({g: (ADV, 0) for g in order})
    fb.setupHorizontalHeader(ascent=ASC, descent=-DESC, lineGap=0)
    # Windows refuses a font without the full set of names (full name, PostScript name, version...)
    fb.setupNameTable({'familyName': 'Lode Cells', 'styleName': 'Regular', 'uniqueFontIdentifier': 'LodeCells-Regular-1.2',
                       'fullName': 'Lode Cells Regular', 'psName': 'LodeCells-Regular', 'version': 'Version 1.200'})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=-DESC, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=DESC,
                xAvgCharWidth=ADV, usWeightClass=400, fsSelection=0x40, achVendID='NONE',
                ulUnicodeRange2=1 << 28, ulUnicodeRange3=1 << 26, ulCodePageRange1=1)   # Private Use (planes 0, 15/16), Latin 1
    fb.font['OS/2'].panose.bProportion = 9   # monospaced
    fb.setupPost(isFixedPitch=1)
    fb.save(out_font)

    ch = lambda c: chr(c)
    W, G, R = '\033[97m', '\033[42m', '\033[0m'
    lines = [
        '# Lode Cells: run in a WaveTerm terminal after installing the font',
        "printf '%s\\n' \"1. full cells (no gaps between them?):  " + ch(0x100000) * 6 + '"',
        "printf '%s\\n' \"   two rows of them:                    " + ch(0x100000) * 6 + '"',
        "printf '%s\\n' \"                                        " + ch(0x100000) * 6 + '"',
        "printf '%s\\n' \"2. 1-pixel checker (fine grey texture?): " + ch(0x100001) * 6 + '"',
        "printf '%s\\n' \"3. borders (boxes touching edges?):     " + ch(0x100002) * 6 + '"',
        "printf '%s\\n' \"4. diagonal:                            " + ch(0x100003) * 6 + '"',
        "printf '%s\\n' \"5. runner, 1x and 2x (white on green):\"",
    ]
    for r in range(max(len(blocks[1]), len(blocks[2]))):
        a = ''.join(ch(c) for c in blocks[1][r]) if r < len(blocks[1]) else ' ' * len(blocks[1][0])
        b = ''.join(ch(c) for c in blocks[2][r]) if r < len(blocks[2]) else ''
        lines.append("printf '%b\\n' \"   " + W + G + a + R + "    " + W + G + b + R + '"')
    lines.append("printf '%s\\n' \"(if you see boxes or question marks, the font is not being picked up)\"")
    Path(out_sh).write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('glyphs', len(glyphs), '->', out_font, out_sh)


if __name__ == '__main__':
    main()
