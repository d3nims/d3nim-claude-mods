"""Muybridge 질주(plate 707, 8장)에서 잰 엉덩이·어깨·머리 높이를 테리 12장에 옮긴다 (도트 단위, 위로 +).
사진 값은 울타리 점줄 기준 높이(원본 픽셀). 테리 몸높이 31줄 / 사진 개 몸높이 약 127px -> 0.244배"""
CROUP = [95.6, 96.5, 91.0, 83.5, 82.5, 86.0, 88.5, 88.5]
WITHERS = [88.6, 91.5, 93.0, 93.5, 87.5, 84.0, 83.5, 84.5]
HEAD = [96.6, 104.5, 107.0, 108.5, 100.5, 97.0, 93.5, 99.5]  # 5번은 머리가 돌아가 못 재서 앞뒤로 어림
SCALE = 31 / 127

def at(series, f):
    n = len(series); f %= n; i = int(f); t = f - i
    return series[i] * (1 - t) + series[(i + 1) % n] * t

def terry(series, shift=1.5, gain=1.0):
    """테리 k번 = 사진 (k - shift) * 8/12 번. 1번(모은 채 공중) ≈ 사진 0번, 7번(뻗은 채 공중) ≈ 사진 3.7번"""
    m = sum(series) / len(series)
    raw = [(at(series, (k - shift) * 8 / 12) - m) * SCALE * gain for k in range(12)]
    out = [round(v) for v in raw]
    # 한 장에 2칸 넘게 뛰면 덜컹거린다 (A안): 이웃과(12번→0번 포함) 1칸 차이 안에서 원래 값과 가장 가까운 정수 줄을 고른다
    best = None
    vals = range(-5, 6)
    for first in vals:
        cost = {v: ((raw[0] - v) ** 2, [v]) for v in vals if v == first}
        for k in range(1, 12):
            cost = {v: min(((c + (raw[k] - v) ** 2, p + [v]) for u, (c, p) in cost.items() if abs(u - v) <= 1), default=(1e9, []))
                    for v in vals}
        for v, (c, p) in cost.items():
            if abs(v - first) <= 1 and p and (best is None or c < best[0]): best = (c, p)
    out = best[1]
    return raw, out

if __name__ == '__main__':
    for name, s in (('croup', CROUP), ('withers', WITHERS), ('head', HEAD)):
        raw, out = terry(s)
        print(f'{name:8s}', ' '.join(f'{v:+.1f}' for v in raw)); print(' ' * 9, out)
