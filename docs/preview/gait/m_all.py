import json, sys
sys.path.insert(0, sys.argv[1]); from gait import measure; from summary import summary
from PIL import Image
S = sys.argv[2]; out = []
d = json.load(open(sys.argv[3])); fr = json.load(open(sys.argv[4]))['sets']
for s in ['walk', 'run']:
    F = [d[s][k] for k in sorted(d[s], key=int)]
    G, R = measure([[ch != '.' for ch in r] for r in f] for f in F)
    out.append((summary('terry_'+s, G, R, fr[s]['durations']), R))
def sheet(path, cw, ch, row, n, mirror=True):
    im = Image.open(path).convert('RGBA'); fs = []
    for i in range(n):
        c = im.crop((i*cw, row*ch, (i+1)*cw, (row+1)*ch))
        if mirror: c = c.transpose(Image.FLIP_LEFT_RIGHT)
        a = c.getchannel('A'); fs.append([[a.getpixel((x, y)) > 0 for x in range(cw)] for y in range(ch)])
    return fs
for name, path, cw, ch, row, n, durs in [
    ('husky_walk', 'dog_medium.png', 60, 38, 1, 6, None),
    ('husky_run', 'dog_medium.png', 60, 38, 2, 5, None),
    ('wolf_run', 'wolf_run.png', 66, 66, 0, 5, [130]*5)]:
    G, R = measure(sheet(f'{S}/{path}', cw, ch, row, n))
    out.append((summary(name, G, R, durs), R))
for s, R in out:
    print(s)
    for i, r in enumerate(R): print('   ', i, {k: r[k] for k in ('feet','feetx','back','head','nose','length')})
json.dump([s for s, _ in out], open(sys.argv[5], 'w'), ensure_ascii=False, indent=1)
