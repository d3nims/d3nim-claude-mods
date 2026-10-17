import json, sys
here = __file__.rsplit('/', 1)[0]; sys.path.insert(0, here)
from rock import rock
from curves import terry, CROUP, WITHERS, HEAD
from render import sheet
src, out, gain = sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
d = json.load(open(src))['run']; F = [d[k] for k in sorted(d, key=int)]
R = terry(CROUP, gain=gain)[1]; Fr = terry(WITHERS, gain=gain)[1]; Hd = terry(HEAD, gain=gain)[1]
T = R[:]  # 꼬리를 한 장 늦게 하면 엉덩이 밑과 붙어 덩어리가 져서 같이 움직인다
print('rear', R); print('front', Fr); print('head', Hd); print('tail', T)
C = [rock(f, r, fr, h, t)[0] for f, r, fr, h, t in zip(F, R, Fr, Hd, T)]
json.dump(C, open(out + '.json', 'w'))
for part in (0, 1):
    sl = slice(part * 6, part * 6 + 6)
    sheet([F[sl], C[sl]], f'{out}_{part}.png', k=5, labels=[[f'now {i}' for i in range(part*6, part*6+6)], [f'C {i} r{R[i]:+d} f{Fr[i]:+d} h{Hd[i]:+d}' for i in range(part*6, part*6+6)]])
