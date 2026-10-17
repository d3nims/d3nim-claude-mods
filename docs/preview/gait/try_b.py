import json, sys
sys.path.insert(0, sys.argv[1]); from bounce import bounce, split_row; from render import sheet
d = json.load(open(sys.argv[2]))['run']; F = [d[k] for k in sorted(d, key=int)]
DY = [0, 1, 2, 2, 1, 1, 0, 0, -1, -1, -1, 0]
HEAD = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]
B = [bounce(f, dy, hd) for f, dy, hd in zip(F, DY, HEAD)]
print('split rows', [split_row(f) for f in F])
json.dump(B, open(sys.argv[3] + '/run_b.json', 'w'))
for part in (0, 1):
    sl = slice(part * 6, part * 6 + 6)
    sheet([F[sl], B[sl]], f'{sys.argv[3]}/view/b_{part}.png', k=5, labels=[[f'now {i}' for i in range(part*6, part*6+6)], [f'B {i} dy{DY[i]:+d} h{HEAD[i]}' for i in range(part*6, part*6+6)]])
