"""숨쉬기: 몸통(등·옆구리)만 부풀었다 들어간다. 머리와 다리는 그대로.

실제 개는 쉴 때 가슴과 배가 같이 부드럽게 오르내리고 머리는 가만히 둔다. 처음 방식은 머리·목·가슴을 1점 들어
올렸는데, 앉기 그림에 이미 그려 둔 '등이 부풀었다 들어가는 숨'과 따로 놀아 어색했다(사용자, 2026-10-17).
그래서 숨은 한 가지로만: 몸통 테두리가 바깥으로 나갔다 들어온다.

- 앉은 자세: 사용자가 그린 앉기 4~7번(숨을 내쉰 등)을 그대로 따른다. 등 테두리를 그 장의 자리까지 깎는다.
- 엎드린·선 자세: 등 윗선을 정한 칸들에서 1점 올린다(들이쉼). 칸마다 따로 올려서 비스듬한 선도 끊기지 않는다.
  bulge 면 가운데 1/3 은 1점 더 올려 등이 볼록해진다. 등 전체가 1점 평평하게 올라가면 카드에서 거의 안 보였다(사용자, 10/18).
build-terrier.py 가 카드용 숨 장면을 만들 때, measure.py --breath 가 검사할 때 같이 쓴다.
"""


def _rows(img):
    return [list(r) for r in img]


def left_edges(img, rows):
    """줄마다 몸통 왼쪽 끝: 오른쪽에서 가장 긴 덩어리(꼬리 같은 작은 조각 말고)의 시작"""
    out = {}
    for y in rows:
        runs, start = [], None
        for x, k in enumerate(list(img[y]) + ['.']):
            if k != '.' and start is None:
                start = x
            elif k == '.' and start is not None:
                runs.append((start, x - 1))
                start = None
        if runs:
            out[y] = max(runs, key=lambda r: r[1] - r[0])[0]
    return out


def exhale_to(img, edges):
    """숨을 내쉰 장: 줄마다 몸통 왼쪽 끝을 edges[y] 까지 깎는다(이미 그 안이면 그대로). 꼬리처럼 떨어진 조각은 둔다."""
    out = _rows(img)
    for y, e in edges.items():
        x = e - 1
        while x >= 0 and out[y][x] != '.':
            out[y][x] = '.'
            x -= 1
    return out


def inhale_top(img, cols, band):
    """숨을 들이쉰 장: cols 칸마다 band 줄 안의 맨 위 점 위에 같은 색 한 점을 더한다(등이 1점 올라간다)."""
    out = _rows(img)
    for x in range(cols[0], cols[1] + 1):
        for y in range(band[0], band[1] + 1):
            if out[y][x] != '.':
                if y > 0 and out[y - 1][x] == '.':
                    out[y - 1][x] = out[y][x]
                break
    return out


def breath_pair(rule, img, edits):
    """(쉬는 장, 다른 숨의 장). rule 은 motion-rules.json 의 한 동작"""
    if 'exhale_like' in rule:
        name, a, b = rule['exhale_like']          # [동작, 들이쉰 장, 내쉰 장]: 사용자가 그린 두 장의 등 테두리 차이
        full, out = edits[name][a], edits[name][b]
        ys = [y for y in range(len(full)) if full[y] != out[y]]
        edges = left_edges(out, ys)
        return _rows(img), exhale_to(img, edges)
    cols, band = rule['cols'], rule['band']
    out = inhale_top(img, cols, band)
    if rule.get('bulge'):
        third = (cols[1] - cols[0]) // 3
        out = inhale_top(out, [cols[0] + third, cols[1] - third], [band[0] - 1, band[1]])
    return _rows(img), out
