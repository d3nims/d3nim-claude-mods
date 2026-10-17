"""테리 달리기 프레임마다 엉덩이(croup)·어깨(withers) 윗선 높이를 잰다"""
import json, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from bounce import split_row

def anchors(f):
    H, W = len(f), len(f[0]); sp = split_row(f)
    cells = {(y, x) for y in range(H) for x in range(W) if f[y][x] != '.'}
    top = min(y for y, _ in cells)
    xf = min(x for y, x in cells if y <= top + 2) - 1          # 뒤통수 바로 뒤 = 목/어깨
    thick = {x: sum(1 for y in range(sp) if (y, x) in cells) for x in range(W)}
    xr0 = min(x for x in range(W) if thick[x] >= 5)            # 꼬리가 끝나고 엉덩이가 시작
    xr = xr0 + 3
    col_top = lambda x: min((y for y in range(sp) if (y, x) in cells), default=None)
    xw = xf - 2
    return dict(sp=sp, xr0=xr0, xr=xr, xf=xf, croup=col_top(xr), withers=min(col_top(x) for x in range(xw - 2, xw + 1)))

if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))['run']
    for k in sorted(d, key=int):
        print(k, anchors(d[k]))
