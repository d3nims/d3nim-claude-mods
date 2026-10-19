"""규칙으로 만든 새 안을 proposals.json 에 쓴다 (studio.py 가 보여 준다). 동작마다 무엇을 왜 바꾸는지는 README.

  python3 docs/preview/motion/propose.py

채택한 땅 파기·달리기·졸기, 순한 눈(ops.soft_eye), 귀 늦게(짖기·원반·기지개), 밥 먹기 핥기는 10/19 terry-edits.json 과 편집기 db 에
넣었다. dig()·run()·sleep()·lagged()·eat() 는 그 전 장에서 만드는 함수라, 지금 저장본에 다시 돌리면 두 번 얹힌다. 기록으로만 둔다.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from ops import dip, ear_lag, face, lower, nod, soft_eye  # noqa: E402

EDITS = json.loads((HERE.parent / 'terry-edits.json').read_text(encoding='utf-8'))


def frames(name):
    return [EDITS[name][k] for k in sorted(EDITS[name], key=int)]


def walk():
    """앞발이 디디기 한 장 전부터 디딘 뒤 한 장까지(3~5, 11~13) 다리 위쪽 전체가 1점 내려간다(그려 둔 4장마다의 반 점 내려앉음과 겹쳐 7→8→9→8→7 로 부드럽게): 머리와 등이 같이 (PixelLab 걷기 초안에서
    머리와 등이 같은 장에 오르내림, 머리 늦음 0). 한 걸음(16장)에 두 번."""
    out = []
    for i, f in enumerate(frames('walk')):
        if i in (3, 4, 5, 11, 12, 13):
            f, _ = lower(f, (27, 32))
        out.append([''.join(r) for r in f])
    return out


SNIFF_NOD = [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, -1, -1, -1, 0, 0]


def sniff():
    """코를 땅에 대고 두 번 콕콕(2~3, 6~7번 장에 머리 1점 아래), 잠깐 들어 냄새를 맡고(11~13번 1점 위) 다시.
    머리가 내려갈 때 꼬리 끝은 1점 올라간다: PixelLab 킁킁 초안에서 코가 내려갈수록 꼬리가 올라갔다(균형)."""
    out = []
    for f, dy in zip(frames('sniff'), SNIFF_NOD):
        if dy:
            f = nod(f, 27, 28, dy)
        if dy > 0:
            f = nod(f, 0, 27, -1, x1=5)
        out.append([''.join(r) for r in f])
    return out


DIG_NOD = [0, 1, 1, 1, 0, 1, 1, 1]


def dig():
    """그려 둔 장은 앞발을 뻗는 동안(1~3, 5~7번) 코만 구멍 쪽으로 내려갔다. 머리 전체가 그 코를 따라 1점 내려갔다가
    발로 긁어 내릴 때(0, 4번) 돌아온다. 반대로 머리를 들면 그려 둔 코 움직임과 상쇄돼 떨림만 남았다(숨쉬기 때와 같은 교훈).
    PixelLab 땅 파기 초안에서도 머리는 발·등보다 한 장 늦게 따라갔다(머리 늦음 1). 턱이 땅(35줄) 밑으로 가지 않게 34줄 위만."""
    out = []
    for f, dy in zip(frames('dig'), DIG_NOD):
        if dy:
            f = nod(f, 27, 34, dy)
        out.append([''.join(r) for r in f])
    return out


def run():
    """달리기는 PixelLab 질주를 다듬은 것이라 얼굴이 테리가 아니었다(분홍 속이 보이게 날리는 귀, 눈 옆 짙은 귀 없음).
    걷기 0번의 테리 머리를 장마다 눈 자리에 맞춰 붙인다. 몸과 다리, 머리 오르내림은 그대로 (사용자, 10/18).
    귀는 테리 귀가 머리 위 뿌리에서 펄럭인다(사용자: 원래 귀를 가져오지 말고 테리 귀가 자연스럽게, 안쪽 분홍도 보이게).
    PixelLab 질주에서 귀가 섰던 장(1~3, 6~8)은 위로 서며 분홍 속이, 누웠던 장(0, 4, 5)은 뒤로 젖혀진다. 착지 직후(5)는
    수평 아래로 내려와 짙은 바깥면이 보인다."""
    head = frames('walk')[0]
    out = []
    for f, a in zip(frames('run'), RUN_EAR):
        f = soft_eye(face(f, head, ear=a))   # 걷기 눈은 위 앞쪽이 회색이라 달릴 때 화나 보였다 (사용자, 10/18)
        out.append([''.join(r) for r in f])
    return out


RUN_EAR = [100, 130, 160, 145, 110, 85, 125, 160, 140]


SLEEP_DIP = [0, 1, 2, 3]
MS = {'sleep': [1500, 800, 800, 600]}


def sleep():
    """꾸벅꾸벅: 엎드려 든 고개가 천천히 앞으로 숙여지다가(1.5초 쉬고 0.8초씩 1, 2점, 3점에서 0.6초) 퍼뜩 제자리로
    돌아온다(다음 바퀴 0번 장). 코가 더 많이 내려가 고개가 앞으로 꺾인다(ops.dip). 그려 둔 두 장은 똑같아서 0번만 쓴다."""
    f = frames('sleep')[0]
    return [[''.join(r) for r in (dip(f, 23, 40, 22, d) if d else f)] for d in SLEEP_DIP]


# 날기(max): 질주 1번(네 발이 다 떠서 앞다리는 앞으로, 뒷다리는 뒤로 뻗은 순간)을 그대로. 망토는 어깨(목이 시작되는 26칸)에서
# 등을 따라 17칸 뒤까지 눕는다
FLY_FRAME, FLY_CAPE = 1, (26, 17)


def fly():
    """max 의 슈퍼맨 비행. 전에는 질주 0번(공중에서 다리를 모은 장)을 그대로 띄워서 다리가 아래로 처지고 머리가 그림 맨 위에서
    잘렸다(사용자, 10/19). 다리를 앞뒤로 쭉 뻗게 새로 그린 안은 '개 골격에서 나올 수 없는 다리'라는 평이라, 실제 질주에서 다 뻗은
    장(1번)을 그대로 쓴다. 따로 한 장짜리 세트라서 카드가 땅에 맞춰 내려 그린 뒤 띄우므로 머리가 잘리지 않는다."""
    return list(frames('run')[FLY_FRAME])


def lagged(name, ms):
    """귀가 머리보다 한 박자 늦게 (ops.ear_lag). 짖기·원반 잡기·기지개처럼 머리가 크게 오르내리는 동작."""
    return [[''.join(r) for r in f] for f in ear_lag(frames(name), False, ms)[0]]


EAT_MS = [160] * 8 + [180, 120, 150, 120, 160]


def eat():
    """두 번 씹고(그려 둔 4장 두 번) 고개를 들어 혀를 내밀고 코를 한 번 핥은 뒤 다시 그릇으로 (PixelLab 밥 먹기 초안에서 고개를 크게
    들어 혀로 입을 핥고 꼬리를 세웠다). 고개는 3점(2점은 안 보였다). 머리는 통째로 들고 목만 비스듬히(칸마다 다르게 들면 턱 밑에 계단이 졌다). 고개를 든 동안 꼬리가 1점씩 흔들린다."""
    eat0 = frames('eat')[0]
    up = dip(eat0, 28, 31, 31, -3)   # 머리(31칸부터)는 통째로 3점, 목 3칸이 이어 준다. 앞다리(27칸까지)는 그대로
    for y in range(1, len(up)):   # 고개를 들면서 턱 밑에 생긴 한 점 구멍은 위 점으로
        for x in range(28, len(up[y]) - 1):
            if up[y][x] == '.' and '.' not in (up[y][x - 1], up[y][x + 1], up[y - 1][x]):
                up[y][x] = up[y - 1][x]
    nose = [(y, x) for y, r in enumerate(up) for x, k in enumerate(r) if k == 'N']
    ny0, ny1 = min(y for y, _ in nose), max(y for y, _ in nose)
    nx0, nx1 = min(x for _, x in nose), max(x for _, x in nose)

    def tongue(img, cells):
        out = [r[:] for r in img]
        for y, x, k in cells:
            out[y][x] = k
        return out
    out_ = tongue(up, [(ny1 + 1, nx0, 'T'), (ny1 + 1, nx0 + 1, 'T'), (ny1 + 2, nx0 + 1, 't')])          # 혀를 내밀고
    lick = tongue(up, [(ny1 + 1, nx1, 'T'), (ny1, nx1 + 1, 'T'), (ny1 - 1, nx1 + 1, 't')])              # 코끝을 핥는다

    def wag(img, dy):
        return nod(img, 0, 27, dy, x1=5) if dy else img
    seq = list(frames('eat')) * 2 + [wag(up, -1), wag(out_, 0), wag(lick, -1), wag(out_, 0), wag(up, -1)]
    return [[''.join(r) for r in f] for f in seq]


def main():
    p = json.loads((HERE / 'proposals.json').read_text(encoding='utf-8'))
    for n in ('walk', 'sniff'):   # 머리와 몸을 같이 움직인 안은 사용자가 보고 지금이 낫다고 함 (10/18)
        p[n].pop('frames', None)
        p[n]['status'] = 'ok'
    p['walk']['note'] = '앞발 디딜 때 머리·등이 같이 1점 내려가는 안을 만들었는데, 보니 지금이 나아서 그대로 둬요.'
    p['sniff']['note'] = '두 번 콕콕 찍고 고개를 드는 안을 만들었는데, 보니 지금이 나아서 그대로 둬요.'
    for n in ('dig', 'run', 'sleep'):   # 채택해서 terry-edits.json 에 들어감 (10/19): 새 안은 저장본 그대로
        p[n].pop('frames', None)
        p[n].pop('ms', None)
    p['run'].update(status='applied',
                    note='움직임은 그대로 두고 얼굴만 테리로 바꿨어요. 걷기의 테리 머리를 장마다 눈 자리에 맞춰 붙였어요. 귀는 테리의 짙은 회색 귀가 머리 위에서 펄럭여요. 위로 젖혀질 때는 분홍 속이 보이고, 착지할 때는 바깥면이 보여요. 눈은 꽉 찬 2x2 로 순하게 바꿨어요(걷기 눈 그대로는 화난 것처럼 보였어요).')
    p['sleep'].update(status='applied',
                      note='꾸벅꾸벅: 고개가 천천히 앞으로 숙여지다가(2.2초 동안 3점, 코가 더 많이) 퍼뜩 들어요. 숨은 등 가운데가 볼록하게 부풀어요.')
    for n in ('sad', 'droop'):
        p[n].update(status='applied', note='쉬는 동안 몸통만 숨쉬어요. 전에는 등 윗줄이 1점 평평하게 올라가 거의 안 보였어요. 이제 등 가운데가 2점 볼록하게 부풀어요.')
    p['dig'].update(status='applied',
                    note='앞발을 뻗는 동안 머리가 구멍 쪽으로 1점 숙여졌다가, 발로 긁어 내릴 때 돌아와요. 원래 그림은 코만 내려가서 머리와 따로 놀았어요. PixelLab 땅 파기 초안에서도 머리가 발보다 한 장 늦게 따라가요. 초안처럼 꼬리를 세우는 것도 할 수 있지만, 그림을 많이 바꿔야 해서 이번엔 하지 않았어요.')
    p['pant'].update(status='ok', note='헥헥 6장(0.42초, 1초에 2.4번)에 머리와 몸이 같은 장에 같이 들썩여요(머리 늦음 0). 실제 개가 헐떡이는 빠르기(1초에 2~5번) 안이라 그대로 둬요.')
    p['eat'].update(status='ok', note='그려 둔 4장에서 이미 머리가 그릇으로 2점 숙였다 올라와요(0.64초에 한 번 씹기). PixelLab 초안은 고개를 크게 들어 혀로 입을 핥고 꼬리를 세웠어요. 핥기나 꼬리를 더할지는 말씀해 주세요.')
    p['bark'].update(status='ok', note='짖을 때 머리와 목이 2점 올라가고 몸이 1~2점 뒤로 물러나요. PixelLab 짖기 초안도 같은 방향(목이 5점 올라가고 몸이 4점 물러나며 앞발을 듦)이었어요. 테리 크기에서는 지금 정도가 맞아 그대로 둬요. 귀가 한 박자 늦게 펄럭이는 건 귀 그림을 새로 그려야 해서 다음 후보로 남겨요.')
    p.setdefault('fly', {}).update(status='applied', note='MAX 일 때 슈퍼맨처럼 나는 장을 따로 만들었어요. 전에는 질주 0번(공중에서 다리를 모은 장)을 그대로 띄워서 다리가 아래로 처지고, 머리가 그림 맨 위에서 잘렸어요. 이제 달리기에서 네 발이 다 떠서 앞다리는 앞으로, 뒷다리는 뒤로 뻗은 장(1번)을 그대로 써요. 다리를 새로 그린 안은 개 골격에 안 맞았어요. 망토는 어깨(목이 시작되는 곳)에서 등을 따라 눕고 꼬리 뒤로 흘러요. 위 네 칸은 몸만, 아래 "카드 그대로"는 망토·구름·바람까지 플러그인이 그리는 그대로예요.')
    for n in ('bark', 'jump', 'stretch', 'eat'):   # 채택해서 terry-edits.json 에 들어감 (10/19)
        p[n].pop('frames', None)
        p[n].pop('ms', None)
    for n, what in (('bark', '짖을 때 머리가 1점 올라갔다 내려와서 귀는 1점만 늦어요.'),
                    ('jump', '웅크릴 때 귀가 머리 위로 살짝 뜨고, 뛰어오를 때 2점 처졌다가 따라오고, 착지할 때 위로 떠요.'),
                    ('stretch', '엎드릴 때 귀가 위로 뜨고, 일어날 때 아래로 처졌다가 따라와요.')):
        p[n].update(status='applied',
                    note='귀가 머리보다 한 박자 늦게 따라와요(눈 뒤 짙은 회색 귀가 머리 움직임을 늦게 따라가고, 0.1초마다 반씩 제자리로, 많아야 2점). ' + what)
    p['eat'].update(status='applied',
                    note='두 번 씹고 고개를 3점 들어(코가 더 많이) 혀를 내밀고 코끝을 한 번 핥은 뒤 다시 그릇으로 가요. 고개를 든 동안 꼬리 끝이 1점씩 흔들려요. PixelLab 초안의 고개 들어 핥기·꼬리를 테리 크기로 옮겼어요.')
    eye = ' 눈은 위 앞쪽 회색 점을 채워 순하게 했어요(그 점이 찌푸린 눈썹처럼 보였어요).'
    for n in ('walk', 'pant', 'bark', 'eat', 'droop', 'stretch', 'dig'):
        if eye not in p[n].get('note', ''):
            p[n]['note'] = p[n].get('note', '') + eye
        if p[n].get('status') != 'ready':   # 새 안이 있으면 '봐 주세요' 그대로
            p[n]['status'] = 'applied'
    for f in sorted((HERE / 'ai').glob('*.json')):
        name = f.stem.split('-')[0]
        d = json.loads(f.read_text(encoding='utf-8'))
        ai = [a for a in p.setdefault(name, {}).get('ai', []) if a['by'] != d['by']]
        p[name]['ai'] = ai + [d]
    (HERE / 'proposals.json').write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
