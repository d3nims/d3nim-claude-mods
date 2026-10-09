"""Bring the frames saved in the Terry dot editor into the build.

The editor (an artifact page, https://claude.ai/artifact/GWYJ2rZZq6iRMs6wL9NoVR) keeps each saved frame as a document
in its `edits` collection: {set, frame, rows}. Claude saves that collection to a folder (ArtifactData list with
out_dir), and this script turns the folder into docs/preview/terry-edits.json, which build-terrier.py reads:

    python3 docs/preview/import-terry-edits.py <folder holding edits/*.json>
    python3 docs/preview/build-terrier.py && ...   (then regenerate terrier-data.js as usual)
"""
import glob
import json
import os
import sys

src = sys.argv[1]
out = {}
for path in sorted(glob.glob(os.path.join(src, '**', 'edits', '*.json'), recursive=True)):
    doc = json.load(open(path, encoding='utf-8'))
    body = doc.get('data', doc)              # (a saved document may wrap its fields)
    name, frame, rows = body.get('set'), body.get('frame'), body.get('rows')
    if not isinstance(name, str) or not isinstance(frame, int) or not isinstance(rows, list):
        print('skipped', path)
        continue
    allowed = set('.WLOmDSeNhETPMtK')
    rows = [''.join(c if c in allowed else '.' for c in str(r)) for r in rows]
    out.setdefault(name, {})[str(frame)] = rows
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terry-edits.json')
json.dump(out, open(dest, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('wrote', dest, {k: sorted(v, key=int) for k, v in out.items()})
