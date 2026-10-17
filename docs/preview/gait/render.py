from PIL import Image, ImageDraw
COL = {'W':(242,242,242),'S':(110,110,110),'L':(200,200,200),'O':(176,176,176),'D':(70,70,70),'m':(140,140,140),
       'E':(20,20,20),'N':(30,30,30),'T':(226,156,168),'t':(236,112,128),'M':(112,36,50),'P':(196,78,98)}
def sheet(rows_of_frames, path, k=6, labels=None, ground=35):
    """rows_of_frames: [[frame,...], [frame,...]] 행마다 한 줄"""
    nf = max(len(r) for r in rows_of_frames); h, w = len(rows_of_frames[0][0]), len(rows_of_frames[0][0][0])
    im = Image.new('RGB', (nf * (w + 2) * k, len(rows_of_frames) * (h + 2) * k), (38, 52, 62)); d = ImageDraw.Draw(im)
    for ri, frames in enumerate(rows_of_frames):
        for i, f in enumerate(frames):
            ox, oy = i * (w + 2) * k, ri * (h + 2) * k
            d.line([(ox, oy + (ground + 1) * k), (ox + w * k, oy + (ground + 1) * k)], fill=(90, 110, 120))
            for y in range(4, 6): d.line([(ox, oy + y * k), (ox + w * k, oy + y * k)], fill=(50, 66, 76)) if False else None
            for y, r in enumerate(f):
                for x, ch in enumerate(r):
                    if ch != '.': d.rectangle([ox + x * k, oy + y * k, ox + x * k + k - 1, oy + y * k + k - 1], fill=COL.get(ch, (255, 0, 255)))
            if labels: d.text((ox + 4, oy + 4), labels[ri][i] if isinstance(labels[ri], list) else f'{labels[ri]} {i}', fill=(255, 220, 120))
    im.save(path)
