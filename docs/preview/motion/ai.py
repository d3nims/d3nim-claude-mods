"""AI 도트 생성기(PixelLab, Retro Diffusion)와 테리 격자 사이를 오가는 도구.

- to_png(frame): 편집기 키 줄(50x40) → 64x64 투명 PNG (테리 (0,0) 이 PNG 의 (OX, OY)). 생성기에 첫 그림으로 준다.
- from_pngs(images): 생성기가 돌려준 장들 → 키 줄. 색은 테리 팔레트에서 가장 가까운 것으로 (코는 눈 색으로 합쳐짐:
  check-sprite 로 다듬을 때 다시 나눈다). 격자 밖으로 나간 점 수도 돌려준다.
  python3 docs/preview/motion/ai.py png <동작> <장> <out.png>   첫 그림 만들기
  python3 docs/preview/motion/ai.py back <out.json> <png>...    생성 결과를 키 줄로
AI 결과는 재서 우리 규칙으로 옮기는 초안이다 (README '새 동작이나 새 견종을 만들 때').
"""
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OX, OY = 7, 24
W, H = 50, 40
_keys = json.loads((HERE.parent / 'terry-editor-data.json').read_text(encoding='utf-8'))['keys']
PAL = {k: tuple(int(v[i:i + 2], 16) for i in (0, 2, 4)) for k, v in _keys.items() if len(k) == 1}


def to_png(frame, size=64):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y, row in enumerate(frame):
        for x, k in enumerate(row):
            if k != '.' and 0 <= x + OX < size and 0 <= y + OY < size:
                im.putpixel((x + OX, y + OY), PAL[k] + (255,))
    return im


def data_url(im):
    b = io.BytesIO()
    im.save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


def from_pngs(images, keys='SDOLmWETP'):
    pal = {k: PAL[k] for k in keys if k in PAL}
    out, lost = [], 0
    for im in images:
        im = im.convert('RGBA')
        g = [['.'] * W for _ in range(H)]
        for py in range(im.height):
            for px in range(im.width):
                r, gg, b, a = im.getpixel((px, py))
                if a < 128:
                    continue
                x, y = px - OX, py - OY
                if not (0 <= x < W and 0 <= y < H):
                    lost += 1
                    continue
                g[y][x] = min(pal, key=lambda k: sum((pal[k][j] - (r, gg, b)[j]) ** 2 for j in range(3)))
        out.append([''.join(r) for r in g])
    return out, lost


if __name__ == '__main__':
    if sys.argv[1] == 'png':
        e = json.loads((HERE.parent / 'terry-edits.json').read_text(encoding='utf-8'))
        to_png(e[sys.argv[2]][sys.argv[3]]).save(sys.argv[4])
    elif sys.argv[1] == 'back':
        frames, lost = from_pngs([Image.open(p) for p in sys.argv[3:]])
        Path(sys.argv[2]).write_text(json.dumps(frames))
        print(f'{len(frames)}장, 격자 밖 {lost}점')
