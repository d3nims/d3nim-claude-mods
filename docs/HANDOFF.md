# HANDOFF

## 목표
Claude Code Mods를 마켓플레이스 형식으로 만들어서, 나(d3nim)와 동료가 각자 환경(WSL/Windows/SSH)에서
`/plugin install`로 설치해 쓸 수 있게 한다.

## 결정된 것
- 저장소 이름: `d3nim-claude-mods`
- GitHub 공개 범위: **Private** (팀/조직 한정)
- 작업 디렉터리: `C:\dev\d3nim-claude-mods` (WSL에서는 `/mnt/c/dev/d3nim-claude-mods`)
  - WSL 네이티브 경로(`~/d3nim-claude-mods`)가 아니라 C드라이브를 명시적으로 선택함
  - 단, `/mnt/c/...` 경로를 WSL과 Windows 양쪽 Git으로 같이 커밋하면 `autocrlf` 설정 차이로
    전체 파일이 변경된 것처럼 보일 수 있음 — 아직 안 맞춰놨으니 커밋 전에 처리 필요
- WSL `~/.bashrc`에 세션 재개 함수 추가함:
  ```bash
  # dcm: open the last Claude Code conversation for d3nim-claude-mods
  dcm() { cd /mnt/c/dev/d3nim-claude-mods && claude --continue; }
  ```
  - 주의: `dcm`은 "이 디렉터리의 마지막 대화"를 이어주는 것이지, 특정 과거 대화를 보장하지 않음
  - 대화 기록은 머신(WSL ~/.claude vs Windows ~/.claude)마다 완전히 분리됨 — 동기화 안 됨
- 만들 mod 우선순위:
  1. **사용량 미터** (지금 작업 중) — 5시간/주간 사용량 + 컨텍스트 사용률을 프롬프트 위 band에 표시,
     80%/90% 임계치에서 toast 알림
  2. 안전장치 — force push, rm -rf 같은 위험 명령 실행 전 차단 (나중에)
  3. 퇴근 명령 — 인수인계 메모 자동 생성 (우선순위 낮음, Mods 없이도 가능해서 보류)

## 환경
- WSL Claude Code를 2.1.223 → **2.1.289**로 업데이트함 (Mods는 2.1.287+ 필요)
  - 업데이트 중 `npm install -g` 가 이전에 실패해서 남은 임시 디렉터리(`.claude-code-w4DY7fqs`)를 지우고 재시도함
- **중요**: 이 업데이트는 실행 중이던 대화 세션에는 바로 반영 안 됨. 새 터미널(`dcm` 등)을 열어야
  2.1.289 기준 `plugin-authoring` 스킬이 보임

## 지금까지 만든 것
`/mnt/c/dev/d3nim-claude-mods/` 구조:
```
d3nim-claude-mods/
├── .claude-plugin/
│   └── marketplace.json          # 마켓플레이스 정의
├── plugins/
│   └── usage-meter/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── hooks/
│           ├── hooks.json
│           └── register.js       # 실제 mod 코드
└── docs/
    └── HANDOFF.md                # 이 파일
```

- `claude plugin validate`로 플러그인/마켓플레이스 둘 다 검증 통과함
- 로컬 마켓플레이스로 등록 + 설치 완료:
  ```bash
  claude plugin marketplace add /mnt/c/dev/d3nim-claude-mods
  claude plugin install usage-meter@d3nim-claude-mods
  ```
  (User 스코프로 설치됨 — 이 WSL 머신의 모든 프로젝트에서 활성화)

## usage-meter mod 동작
- `$.session.usage()`로 `{ context, rateLimits }` 읽어서 프롬프트 위 band에 표시
- `rateLimits`의 정확한 `kind` 값(예: five_hour/weekly 등 실제 문자열)은 아직 실기 확인 안 함 —
  band에는 `limit.kind` 값을 그대로 찍도록 해뒀으니 실제 세션에서 뭐라고 나오는지 확인 필요
- `session.measure` 이벤트(턴 종료 시, 한도 % 변경 시 발화)로 갱신 + 30초 타이머로도 갱신
- 80%/90% 넘을 때 `$.ui.toast`로 1회성 알림 (같은 임계치 반복 알림 안 함)
- 컨텍스트 85% 이상이면 `/compact` 권유 toast

## 다음에 할 일
1. **새 터미널에서 `dcm` 쳐서 실제로 band가 뜨는지 확인.** `rateLimits[].kind`가 실제로 뭐라고
   나오는지 보고, 필요하면 라벨을 "5시간"/"주간" 식으로 한글화
2. `/plugin` 쳐서 `usage-meter`가 active mod로 잡히는지 확인
3. 색상(초록/노랑/빨강)이나 딸깍 톤(충청도 말투, 오로라 색)으로 꾸밀지 결정
4. 잘 되면 git init → GitHub private repo(`d3nim-claude-mods`) 생성 → push
   - 이때 `/mnt/c/...` 경로라 `autocrlf` 설정 맞추기 필요 (`.gitattributes`로 `* text=auto eol=lf` 추천)
5. 동료 설치 테스트: `claude plugin marketplace add <owner>/d3nim-claude-mods` →
   `claude plugin install usage-meter@d3nim-claude-mods`
6. 끝나면 2순위(안전장치: blast-radius 스타일) mod 착수


---

## 진행 상황 (2026-10-05 저녁 갱신)

### 만든 것
- `usage-meter` 0.2.0: 프롬프트 위 **한 줄 밴드**. 5시간 | 주간 | 대화 세 칸, 칸마다 파란 불꽃 + 불씨 게이지, 아래 줄에 이름과 %.
  - 80%부터 주황, 90% 이상은 붉은 쪽. 80%/90% toast, 컨텍스트 85% `/compact` 권유는 그대로.
  - `/flame1`: 불꽃 밴드(기본). `/terry`: 베들링턴 테리어가 5시간 사용량 위치까지 달리는 큰 화면. 80%↑ 헥헥, 97%↑ 잠.
  - 뒤에 `quad` / `braille`을 붙이면 그림 방식 변경(예: `/terry braille`, 기본 quad). 고른 화면과 방식은 `$.store`에 저장됨.
  - 나중에 불꽃 스타일을 더 만들면 `/flame2`처럼 늘릴 계획.
  - 불러올 때(리로드·세션 시작) 사용법 알림창이 뜬다. `/flame1 help`로도 볼 수 있다.
  - 0.3.0: 현재 모델과 추론 강도를 같이 보여준다(0.3.4부터 둥근 테두리 카드에 `Opus 5.5` / `추론 high` 두 줄, flame1은 밴드 오른쪽, terry는 강아지 오른쪽; 0.3.3부터 모델은 연보라, 강도는 low 회색·medium 하늘·high 보라·xhigh 분홍·max 진분홍). 모델은 `$.session.model()`, 강도는 요청마다 오는 `turn.step`의 `e.effort`에서 읽는다(첫 요청 전이거나 강도가 없는 모델이면 모델 이름만).
  - `/terry` (0.5.0) = **3층 땅**: 테리가 서 있는 불꽃 막대 = 5시간(끝에 숫자), 그 아래 얇은 선 두 줄 = 주간·대화(`━` 쓴 만큼, `─` 나머지, 끝에 숫자). 세 층은 폭과 왼쪽 끝이 같아서 길이로 비교. 테리는 0.85배(10줄)로 줄임.
  - (0.6.0의 뼈다귀 게이지는 별로라서 0.6.1에서 되돌림. 코드는 git `9b98f39`.)
  - **0.7.0 `/terry` 방향 전환: 사용량 게이지가 아니라 "지금 일어나는 일"에 반응하는 친구.** 사용량은 `/flame1`이 맡는다.
    - 평소 앉아 있음 → 입력 시작(`prompt.edit`) 시 짖기(`!`, 1.4초) → 치는 동안 꼬리 흔들기 → 엔터(`prompt.submit`/`turn.start`/`isWorking`) 시 응답 끝까지 달리기(점선 땅이 흘러감) → 끝(`turn.complete`, reason=answer) 시 혀 내밀고 `*` 3.5초 → 3분 조용하면 엎드려 졸기(`z Z Z`).
    - 옆 카드(택시 미터기처럼): 상태 문구 / 모델·추론 / 이번(또는 지난) 요청 걸린 시간·tok/s / 입력·출력·캐시 토큰. 응답 중 글자 수로 출력 토큰을 추정하다가, 요청이 끝나면 `turn.step`의 stop 조각에 온 정확한 usage로 바꿈.
    - 아래 한 줄: `5시간 25% · 2시간 13분 뒤   주간 8% · 10/9(금) 14시   대화 12%`.
    - 0.7.1: 계속 달리기만 하던 버그 수정. 달리기 스위치를 `turn.step`(모델 호출마다)에서도 켜서, 턴이 끝난 뒤의 모델 호출(다음 입력 제안 등)에 다시 켜진 채 남았음. 이제 프롬프트 위 영역의 `isWorking`을 기준으로 켜고 끄고, `turn.step`은 토큰만 센다.
    - 0.8.0: 회색 점선 바닥 → 풀+흙 땅(달릴 때 흘러감). 테리 오른쪽 하늘이 **실제 시각**을 따라감: 6~18시 해(새벽 분홍, 낮 노랑, 저녁 주황, 높이는 정오에 가장 높게), 밤엔 초승달과 반짝이는 별. 사용량은 카드 아래 정렬된 표(이름/막대/%/초기화). 카드는 테리와 4칸 띄움. 출력 토큰 추정에 도구 인자(`input` 조각)도 포함(코딩 턴의 출력 대부분).
    - 0.8.1: 카드는 오른쪽 위, 사용량 표는 오른쪽 아래(테리와 같은 높이 안). 폭이 좁으면 초기화 문구를 빼고, 더 좁으면 아래로 쌓음. 엔터 직후 `isWorking`이 늦게 켜지는 틈에 "끝남"으로 판단하던 문제 수정(2.5초 지나야 끝으로 인정, /terry 에선 1초마다 다시 그려 깜빡임 없이 따라감). `/terry debug`로 모델·추론 출처·토큰 진단.
    - 0.8.2: 추론 강도를 `~/.claude/settings.json`의 `effortLevel`에서 읽음(`CLAUDE_EFFORT`는 Claude가 실행하는 명령에만 전달되고 mod엔 안 보임, `/config` 목록에도 effort 항목 없음 — `/terry debug`로 확인). 카드 표기에서 `추론` 글자 뺌(`Opus 5.5 · high`). 진단에 turn.step 호출 수·응답 조각 수 추가.
    - 0.8.3: 털 기본색을 청회색(blue) → **은회색(silver)**으로. 빨강=초록=파랑인 순수 회색은 256색으로 떨어져도 회색으로 남는다(청회색은 연보라·청록으로 바뀜). 윤곽선·코·눈도 순수 회색. 혀·입속만 색 있음. `--coat=blue`로 예전 색 가능.
    - 0.8.4: 눈 깜빡임. 약 4.2초마다 0.14초, 세 번에 한 번은 두 번 연달아. 잘 때는 계속 감음. 그릴 때 눈 픽셀(정확히 (24,24,24))을 얼굴색으로 덮고 아래에 양옆 1픽셀 더 긴 거의 검은 눈꺼풀 선(칸 변환에서 꼭 살아남게)을 그림 — 새 프레임 없이 `render.js`의 `closeEyes`.
    - 0.8.5: 슬래시 명령도 `isWorking`을 잠깐 켜서, 모델 응답이 없는 빈 "요청"이 '지난 요청'을 0으로 덮어쓰던 문제 수정(응답 조각이 하나도 없으면 기록하지 않음). `/terry debug`에 센/건너뛴 조각 수와 지난 요청 숫자 추가.
    - 0.8.6: 응답 중 '달리기'를 종종걸음(trot)에서 **질주(gallop)** 4프레임(75ms)으로: 쭉 뻗기 → 앞발 착지 → 다리 모으고 공중 → 뒷발 박차기, 꼬리는 뒤로 뻗음(`dash=True`), 땅도 두 배 빨리 흐름. 예전 종종걸음은 `walk` 세트로 남겨 둠.
    - 0.8.7: 질주(gallop)는 10줄 크기에선 다리가 겹쳐 두 개만 보여서 어색 → 다리 네 개가 잘 보이는 종종걸음 구조를 **빠른 달리기**로(보폭 3.1, 발 들기 2.6, 들썩임 0.8, 꼬리 뒤로, 55ms). 반대쪽 다리는 더 어둡게(`S`), 발끝도 덜 밝게 해서 앞뒤 구분. 질주는 `gallop` 세트로 남겨 둠.
    - 0.8.8: 녹화(2026-10-05 22:51)를 보니 다리는 움직여도 몸이 꼿꼿해서 총총 걷는 느낌 → 달릴 때 머리를 1.3 낮춰 돌진 자세, 테리 뒤로 밝은 속도선 세 줄(등·배·다리 높이)이 휙휙 지나가고 뒷발 뒤로 흙먼지. 이를 위해 테리 왼쪽에 5칸 여유(TRAIL_COLS).
    - 0.8.9: 달리기를 **머이브리지 1887년 질주 사진**(위키미디어 공용, 퍼블릭 도메인) 박자대로 다시 그림. 머리를 몸 높이까지 낮춰 앞으로 내밀고(`hx`), 몸이 모일 땐 움츠리고 뻗을 땐 늘어나며(`st`), 다리를 머리 앞·꼬리 뒤까지 크게 뻗음. 핵심 4장면(모으기 → 앞발 뻗고 뒷발 박차기 → 공중에서 쭉 뻗기 → 앞발 착지)을 보간해 8장면, 60ms. 예전 빠른 종종걸음은 `trot` 세트로 남김.
    - 0.8.10: 질주에서 반대쪽(왼쪽) 앞·뒷다리가 안 보이던 문제 수정. 한 칸에 두 색만 쓸 수 있어, 앞다리 바로 옆에 붙은 반대쪽 다리 색이 빠지던 것이 원인. 반대쪽 다리를 한 박자 늦게, 한 칸 이상 떨어뜨려 놓고 색을 중간 회색(`D`)으로 바꿈.
    - 0.8.11: /terry 사용량 표의 막대를 꽉 찬 칸(█░) 대신 가는 선(━─)으로 바꿔 세 줄이 한 덩어리로 붙어 보이지 않게 함. 막대 길이는 남는 폭에 맞춰 8~20칸.
    - 0.8.12: 질주 때 몸통이 수평으로 고정된 채 다리만 젓던 어색함 수정. 몸 전체가 앞뒤로 기울도록 `pitch`를 넣고(뒷발로 박찰 때 코가 들리고, 앞발이 닿을 때 숙여짐), 머리는 반대로 끄덕이게 `hy`를 넣음. 다리를 모을 때는 등이 더 둥글게 굽고, 몸이 위아래로 더 크게 출렁임. 기울기는 갈비뼈 중심을 축으로 몸통·머리·꼬리에만 적용하고, 다리는 엉덩이만 따라가고 발은 땅에 그대로 둠(`ROT`, `turn()`).
    - 0.8.13: 응답 중이 아니어도 테리 동작을 볼 수 있게 함. `/terry run`(또는 sit · wag · bark · happy · sleep, 한글 달리기·앉기·꼬리·짖기·헥헥·잠도 됨)은 20초 동안 그 모습을 보여 주고 카드에 `· 미리보기`를 붙이며, `/terry stop`으로 끝냄. Claude 밖에서 보는 뷰어 `docs/preview/terry-view.mjs`도 추가: 같은 `terryCells`를 트루컬러로 그리고, 1~6 키로 동작을 바꾸고, `--slow=4`로 느리게 볼 수 있음. 이 PC에는 bash 함수 `terry`와 WaveTerm 위젯 `terry`를 등록함.
    - 0.8.14: 질주가 너무 들썩거리던 것 수정. 기울기(±0.06)와 출렁임(최대 0.6)을 줄였고, 머리는 기울기와 출렁임으로 생기는 움직임의 65%를 `dash_frame`에서 자동으로 상쇄해 거의 수평을 유지함(실제 개처럼 머리는 고정, 몸통만 흔들림). 머리 꼭대기가 8장면 내내 같은 높이에 있음.
    - 0.8.15: 창이 좁을 때 카드와 사용량 표가 테리 아래로 내려가던 것 수정. 옆자리가 26칸이 안 되면 하늘부터 줄여(`terryCells(…, columns)`, 최소 `TERRY_MIN_COLS` = 31칸, 해·달은 자리가 없으면 생략) 옆에 둔다. 옆자리가 33칸보다 좁으면 카드를 줄인다: 짧은 상태 문구(`MOOD_SHORT`), 토큰 두 줄, '지난 요청' 생략, 안쪽 여백 0. 그래도 옆자리가 22칸이 안 되면 예전처럼 아래로.
    - 0.8.16: 더 좁은 창(창을 여러 개 나눠 띄우는 경우)에서도 옆에 둔다. 테리는 하늘 다음으로 뒤쪽 여백까지 줄여 최소 28칸(`TERRY_MIN_COLS`). 옆자리가 22칸보다 좁으면 mini: 테두리 없이 짧은 상태 · 모델(자리 없으면 추론 강도 생략) · 시간(자리 없으면 tok/s 생략), 토큰 줄 생략, 사용량은 이름·막대·%만. 옆자리가 15칸도 안 될 때만 아래로(창 약 49칸 미만).
    - 0.8.17: `/model`·`/effort`로 바꿔도 다음 요청까지 카드가 예전 값이던 것 수정. 2초마다 `syncModel`이 `$.session.model()`과 `$.settings.read().effortLevel`을 보고, 바뀌었으면 바로 다시 그림. 설정의 effortLevel은 처음 읽은 값은 요청에서 받은 강도가 없을 때만 쓰고, 그 뒤 바뀌면 새 강도로 씀. 애니메이션 blit 실패가 처리 안 된 오류로 남지 않게 함.
    - 2026-10-06: 동료 tgood2920 을 쓰기 권한 협업자로 초대. main 에 저장소 규칙 'main: PR only'(id 24559193)를 걺: 직접 올리기 · 강제 덮어쓰기 · 삭제 차단, 합치려면 PR 과 승인 1개. 저장소 관리자(d3nims)는 예외라 지금처럼 main 에 바로 올릴 수 있음. 끄기: 저장소 Settings → Rules → Rulesets.
    - 0.9.0: 달리기가 추론 강도를 따름(`RUN_STYLES` in render.js): low 걷기(walk 세트, 0.6배), medium 빨리 걷기(trot), high 달리기(run/DASH), xhigh 전력 질주(run 1.5배, 속도선 4줄), max 날기(뻗은 비행 자세 `FLY_FRAME` 고정, 5±1 서브픽셀 떠서 흔들림, 뒷몸 잔상 2개, 풀밭 그림자, 속도선 5줄). 땅이 흐르는 속도도 강도별. 카드 문구는 `RUN_TEXT`. `/terry run max`처럼 강도를 붙여 미리보기. README 그림 `docs/images/effort.gif` 추가, 뷰어는 `--effort=` 와 `e` 키.
    - 1.0.2: 달을 다시 그림. 손으로 찍은 9x9 는 거칠어서(집게·부서진 모양) 달만 해상도를 두 배로: 달 픽셀 하나 = 서브픽셀 1 x 2(쿼터 블록 하나). 칸 비율 1:2 를 넣은 진짜 원 두 개로 깎은 초승달(바깥 반지름 7.5, 베어 내는 원 6.3, 18도 기울임), 안쪽 곡선에 본색과 가까운 얇은 음영. 생성 코드는 대화 기록의 python crescent() (R, off, br, tilt, shade_w). 계절 효과(낙엽·눈)는 해·달 뒤로 지나가게 그리는 순서 바꿈.
    - 1.0.1: 해와 달을 손으로 그린 정사각형 픽셀 그림으로 바꿈(`SUN_ART` 9x9 둥근 몸통 + 번갈아 반짝이는 햇살 8개, `MOON_ART` 음영 넣은 초승달). 터미널 칸이 1:2라 quad 에선 그림 한 픽셀 = 2x2 서브픽셀, braille 에선 1x1. 하늘이 좁으면 작은 그림(`SUN_SMALL`, `MOON_SMALL`), 더 좁으면 생략. README 그림 다시 만듦.
    - 1.0.0: (사용자 확인 뒤 올림)
      - max 날기에 슈퍼맨 빨간 망토(어깨에서 꼬리 뒤까지 펄럭임), 구름·바람 줄기. 잔상은 뺌.
      - medium 은 꼬이던 trot 대신 walk 1.5배. `/terry run middle` · `중간` 등 강도 별칭(`EFFORT_ALIASES`).
      - 도구별 동작(`tool.call` 훅, `toolKind`): 읽기·검색 sniff(코 박고 킁킁), 실행·수정 dig(고개 숙여 파기, 구멍 · 뒤로 튀는 흙 · 오래 팔수록 커지는 흙더미 `moodMs`), 웹·MCP fetch(달려 나갔다 막대기 물고 돌아옴, 좌우 뒤집기). 최소 2초 표시(`ACTIVITY_MS`).
      - 허락 대기(`tool.check` 가 ask): 앉아서 꼬리 흔들며 흰 말풍선에 실제 글자 `?`. 오른쪽에 자리 없으면 등 위로.
      - 실패·취소(`turn.complete` reason error/aborted): 6초 동안 고개 떨구고 눈물 · 비구름. 카드 문구도 구분.
      - 계절 하늘(`terryCells` 7번째 인자 date): 봄 꽃잎, 여름밤 반딧불, 가을 낙엽, 겨울 눈, 12/31·1/1 밤 불꽃놀이.
      - `/terry stats`: 날짜별 `$.store` 'stats:YYYY-MM-DD' 에 요청 수 · 토큰 · 최장 요청 · 달린 거리(강도별 땅 속도 × 0.25m).
      - build-terrier.py 에 안전장치: 어떤 자세도 원래 땅선(38줄) 아래로 그리면 생성이 멈춤(땅이 내려가 모든 자세가 뜨던 사고 방지).
      - 허락 창이 떠 있는 동안 프롬프트 위 영역이 보이는지는 실제로 확인 못 함.
      - README 그림 `actions.gif` 추가, 뷰어 키 7~0, -.
    - 저장소에 `tools/paste-hotkey` 추가: SSH 로 붙어 쓰는 Claude Code 에 Alt+V 로 캡처 이미지를 붙여넣는 도구. 원래 ddalkkak 서버용이던 것을 `-Target Linux|Windows|WSL` 로 넓힘. 회사 PC 에 설치해 집 PC(WSL, dcm)로 붙여넣기 확인함.
    - 새 자세: 앉기, 앉아서 꼬리 흔들기, 짖기(입 벌림)를 `build-terrier.py`에 추가(`sit=True`, `bark=True`).
  - 0.6.2: 초기화 시각 표시. 5시간은 `2시간 13분 뒤`, 주간은 `10/9(금) 14시`(한도 정보의 `resetsAt`, 컴퓨터 시간대 기준). flame1은 이름 줄 칸에 자리가 있을 때만 붙이고, terry는 각 층 끝에 `· … 초기화`.
  - 0%에 불이 붙어 보이던 문제 수정: 불꽃 길이 = 정확히 사용량, 테리는 그 끝에 앞발을 둔다.
  - (0.4.0의 "테리의 산책"(흙길·해·뼈다귀)은 의도와 달라서 되돌림. 코드는 git `150a420`.)
  - 모델 카드는 강아지 오른쪽(폭이 좁으면 아래 줄로). 추론 강도는 불러온 직후에도 `CLAUDE_EFFORT` 환경 변수나 설정의 effort 값으로 먼저 채운다.
  - 눈·코처럼 거의 검은 점은 칸 변환 때 항상 살린다(`render.js`의 `isFeature`). 안 그러면 사분블록에서 눈이 사라진다.
  - 실제 Raster 칸을 그림으로 확인하는 법: `render.js`의 함수로 칸을 만들어 base64를 풀어 그리면 된다(작업 때 쓴 `rastershot.py`는 scratchpad에만 있었음).
  - 불꽃 색은 10단계로 고정: `Raster`가 색 조합 약 1024개까지만 정확히 칠하기 때문(안 그러면 강아지 색이 틀어짐).

### 팀원이 업데이트 받는 법
```bash
claude plugin marketplace update d3nim-claude-mods
claude plugin update usage-meter@d3nim-claude-mods
# 그 뒤 Claude Code를 다시 시작 (help에 'restart required to apply'라고 나옴)
```
- 고칠 때마다 `plugin.json`의 `version`을 올려 두자(올리지 않으면 업데이트가 안 잡힐 수 있음. 확인은 못 함).
- 파일: `hooks/register.js`(훅·명령·타이머), `hooks/render.js`(그림 계산, 순수 함수), `hooks/terrier-data.js`(강아지 프레임 데이터, 생성 파일).
- 테스트 `hooks/usage-meter.test.ts` 3개 통과(`claude plugin test plugins/usage-meter`), `claude plugin validate` 통과.

### 그림 방식 메모
- **색이 이상하면(테리가 청록·연보라, 흙길이 회색) `COLORTERM`부터 확인.** 비어 있으면 Claude Code가 터미널을 256색으로 보고 색을 256색 표의 가까운 색으로 바꿔 그린다. WaveTerm은 트루컬러를 지원하지만 알리지 않으므로 `~/.bashrc`에 `export COLORTERM=truecolor`를 넣었다(2026-10-05). Claude Code를 **다시 시작**해야 적용(`/reload-plugins`로는 안 됨). mod도 불러올 때 이 값이 없으면 안내 알림을 띄운다(0.4.1).
- 한 터미널 칸을 가로 2 x 세로 4 서브픽셀로 쪼개 그리고, 칸당 색 2개로 줄여 사분블록(quad) 또는 점자(braille) 글자로 만든다. `Raster`가 이 글자들을 받는다.
- **WaveTerm은 `Image` 요소(진짜 픽셀 그림)를 지원하지 않는다**(2026-10-05 실기 확인). kitty/Ghostty에서는 가능하다고 문서에 있음.
- `Raster`는 색을 한 번에 1024가지 조합까지만 정확히 칠한다. 불꽃 그라데이션이 단순해질 수 있음.

### 미리보기 데모 (`docs/preview/`, 터미널에서 따로 실행)
- `flame5-demo.js --rows=3 --mode=quad` ← 지금 쓰는 밴드의 원형
- `terry-demo.js [pct] --mode=braille|quad` (강아지), `flame4-demo.js`, `flame3-demo.js` 등 이전 불꽃 버전들
- 강아지 다시 그리기: `PYTHONHASHSEED=0 python3 docs/preview/build-terrier.py && mv terrier-frames.json docs/preview/` 후 (집합 순서 때문에 PYTHONHASHSEED 없이는 돌릴 때마다 몇 점씩 달라짐)
  `{ printf '// Generated by docs/preview/build-terrier.py; do not edit by hand. See docs/HANDOFF.md to regenerate.\nexport default '; cat docs/preview/terrier-frames.json; printf ';\n'; } > plugins/usage-meter/hooks/terrier-data.js`
- 테리 따로 보기: `node docs/preview/terry-view.mjs` (그림이 바뀌면 알아서 다시 불러옴). README 그림: `python3 docs/preview/make-readme-gifs.py`

### 테리 도트 표준 (2026-10-09 완성, usage-meter 1.1.0)
- **표준:** 지금 클래식 그림(`/terry classic`, 기본)을 강아지 캐릭터 도트 애니메이션의 표준으로 삼는다. 동작마다 포즈, 표정, 점, 명암, 프레임 수, 타이밍이 기준이다.
- **완성 프레임의 원본:** 사용자가 손으로 다듬은 프레임은 `docs/preview/terry-edits.json` 에 있다(동작 이름 → 프레임 번호 → 점 행). `build-terrier.py` 가 그 프레임으로 그린 그림을 바꿔 끼운다. 그린 그림(타원과 다리 계산)은 바탕일 뿐이고, 기준은 이 파일이다.
- **점자(braille) 기준:** 점 하나가 터미널 점자의 점 하나다(50x40, 칸 2x4). 칸마다 색은 하나뿐이라 혀와 흰 털이 한 칸에 섞이면 많은 쪽 색이 나온다. 테리는 고른 방식이 없으면 점자로 그린다(불꽃 밴드는 그대로 quad).
- **quad(블록)도 같은 그림 (1.2.19~):** quad · fine 도 점자와 같은 프레임을 쓰고, 회색만 밝혀(`BLOCK_GREY_LO` 110) 그린다. 그대로면 손으로 넣은 음영이 칸마다 2색으로 줄며 얼룩지고, 150 이면 얼룩은 없지만 납작했다. 110 은 다리 음영이 남는 중간값(사용자 선택, 2026-10-14, 비교 페이지 https://claude.ai/artifact/3mWARhMhgtmmvTzo4NWb5Y, 도구 `docs/preview/blocks/`). 1.0.2 블록 그림(`terrier-quad-data.js`)은 지움 (git `9d3fa5d` 까지 있음).
- **귀:** 테리 귀는 보통 베들링턴의 절반, 끝이 가로로 반듯하게 잘림. 눈 뒤에 폭 4점 · 정수리 한 줄 + 몸통 5줄, 털의 가장 진한 회색(`S`)만으로(테두리 없음). 몸통 4줄을 점자 칸 한 줄에 맞추면 칸 경계에서 일자로 끊겨 보인다. 앉기에서 정하고 눈 위치 기준으로 모든 자세에 넣음(달리기는 1.2.20 부터 이 귀가 머리 위 뿌리에서 젖혀져 펄럭이고, 뒤집히면 분홍 속이 보임). 더 진한 전용 색(140)은 '너무 구분져서' 되돌림.
- **도트 편집기:** https://claude.ai/artifact/GWYJ2rZZq6iRMs6wL9NoVR (본인 전용). 프레임을 점 단위로 고치고 메모를 남긴다. 저장한 프레임은 편집기 db(`edits`)에 있다.
  - 빌드로 가져오기: Claude 가 `edits` 를 폴더로 받아 `python3 docs/preview/import-terry-edits.py <폴더>` → `terry-edits.json` → 위 '강아지 다시 그리기'.
  - 편집기에 새 그림 넣기: 빌드가 쓰는 `docs/preview/terry-editor-data.json` 을 `docs/preview/terry-editor-template.html` 의 `/*DATA*/null` 자리에 넣어 다시 올린다.
- **잘 된 방법:** 사용자가 한 프레임을 손으로 그리면, Claude 가 그 점(폭, 관절 위치)을 줄마다 재서 나머지 프레임에 맞춘다. 꼬리 흔들기, 짖기, 걷기, 달리기 뒷다리, 원반 캐치가 이렇게 됐다.
- **'real' 그림체:** 참고 그림(`terry-poses-ref.png`, `trace_poses.py`)에서 딴 자세. 보류 중이라 `/terry real` 을 쳐야만 켜진다.

- **1.2.0** (2026-10-09): 귀(위), quad 는 1.0.2 그림, 테리 기본 점자, 허락 대기 말풍선을 4칸으로 키워 `?` 가 테두리와 칸을 나누지 않게(한 칸 한 색이라 테두리 흰색이 물음표를 덮었음), 편집기에서 다듬은 달리기 12장 · 헥헥(가슴 앞 그늘, 혀 가운데 진한 줄) · 쓰다듬기 뒷목. 편집기 db 에 모든 프레임(132장)이 들어 있음.
- **1.2.1**: 쓰다듬기 첫 프레임에 남아 있던 뒷목(저장 안 된 한 장)을 나머지 7장처럼 고침.
- **1.2.2**: max 망토가 등 바깥(꼬리 뒤)으로만 보이던 것 수정. 예전 비행 자세 기준 고정 위치에 테리 뒤로 그려서 몸에 가려졌음. 이제 프레임마다 털 맨 윗줄을 따라 어깨(`CAPE_X` 27)부터 엉덩이(`CAPE_BACK` 19)까지 테리 위에 덮고, 아래 끝을 점자 칸 경계에 맞춰 흰 털과 칸을 나누지 않게 함. 휘날리는 끝도 테리 위에 그려 꼬리를 덮으며 이어짐.

### auto-model (2026-10-10, 0.2.1) · usage-meter 1.2.3
- 하네스 세션("범용 개발 하네스 설계")과 같이 설계. 대표님 jev 는 보류하고 손대지 않음.
- 1단계: 마지막 메인 호출 뒤 TTL(60분) 지남 + 대화 15만 토큰 이상이면 `$.state` auto-model/hint → usage-meter 가 카드 아래 한 줄 + [압축][계속]. /compact 도 대화 전체를 한 번 읽으므로 그 순간 비용은 안 사라짐: 압축 요청의 실제 usage 를 store 'compactions' 에 기록.
- 2단계: turn.step index 0 에서 모델 결정, 턴 동안 유지. 그대로 vs 바꿈 어림값(캐시 warm 이면 읽기, cold 면 1시간 쓰기 2배 + 답 1500토큰)에서 바꾸는 쪽이 30% 넘게 쌀 때만. 규칙: heavy/approve(승인·진행, 직전 답이 질문이면 짧은 긍정도) → 원래 모델, ack(맞장구) → 그대로, light(기억 확인 질문) → 기본 shadow(켰다면만 기록, `light on` 으로 켜기), unsure → 그대로(바꿀 만하면 `$.model.classify`). 메인 하한 Sonnet, 거부 표현·도구 오류 2번 → 복귀 후 3턴 유지, `/model` 직접 변경 → 세션 자동 중지, `~` 건너뛰기. 검색·탐색 서브에이전트(모델 미지정)는 haiku.
- 기억: last/warmAt 등은 `$.state` auto-model/memory 에 세션 id 와 함께(reload 에도 유지), /resume 은 `classic.SessionStart` 의 seconds_since_last_response·context_tokens 로 추정. 모르면 그대로.
- 첫 실사용 오판(10/10 16:05): reload 직후 대화 0토큰으로 계산 + 물음표를 가볍다고 봄 → Sonnet 이 46만 토큰 다시 씀(API 환산 약 $1.8). 위 수정으로 막고 회귀 테스트.
- 10/17 이후 로그 검토하기로 함(메모리 auto-model-review). 로그: `/auto-model log`, store `~/.claude/plugins/store/auto-model_*.json`.
- usage-meter 1.2.3: 카드 모델 줄에 자동 상태(🔄 📌 ✋), 압축 제안 줄, 불러올 때 알림을 한 줄로(알림창은 줄바꿈을 '�' 로 그림).

### auto-model 0.3.0 (일꾼) · usage-meter 1.2.4 (2026-10-10)
- 일꾼: turn.step index 0 에서 Opus 대신 `$.agent.spawn` 으로 서브에이전트(쓰기 Sonnet, 찾기·읽기 Haiku)를 띄우고 그 turn.complete(agentId)를 기다려 답을 그 턴의 답으로 yield(usage null). 일꾼에겐 최근 메시지 6개(각 1500자)만. 플러그인의 spawn 은 늘 background 라 끝나면 결과가 `<agent-message from="agentId">` 로 prompt.submit(origin peer)에 또 들어오므로 우리 일꾼 id 면 drop(session.receive 로는 안 잡힘).
- 시제품 실측: 일꾼 뒤 Opus 는 71~74만 토큰을 캐시로 읽고 새로 쓴 건 6~7천. Haiku 일꾼 약 $0.003. 권한 창 정상(플러그인 이름 표시), Esc 로 턴과 일꾼이 같이 취소됨.
- 분류(route.js taskOf, 로컬 규칙): 승인·판단어·160자 초과 → Opus, 지시어(그거·아까…) → Opus, 기계적 동사 → write, 만드는 동사는 목적지+대상이 있을 때만 write, 산출물 명사(기능·코드·보고서…) → Opus, 찾기 → search. 기본 shadow(기록만), `worker on` 으로 켬. 실패·시간 초과·중단은 그 턴을 Opus 가, "맥락이 부족해요"면 다음 턴 Opus.
- 사후 판정: 원래 모델이 처리한 턴이 도구 1~3번·단순 쓰기/찾기·출력 1500토큰 이하면 log 에 '놓친 일꾼 후보'. 모든 판단에 요청 앞 80자 저장(로컬).
- 테스트 한계: 테스트의 바닥 훅은 core 가 아니라 spawn 결과에 agentId 가 없음 → 일꾼 답이 턴의 답이 되는 전체 경로는 시제품 실측으로 확인.
- usage-meter 1.2.4: 서브에이전트 단계는 카드의 모델·강도를 안 바꿈(작업자 medium 이 새던 문제), 🔄 는 실제로 다른 모델일 때만, 한도 정보 없는 응답 뒤 '5시간 --' 안 됨, 응답 중엔 tok/s 대신 출력 토큰 수.
- auto-model 압축: `$.session.compact` 는 턴(명령 포함) 중엔 reject → 명령이 끝난 뒤 시작하고 토스트로 결과.

### auto-model 0.4.0 · usage-meter 1.2.5 (2026-10-10): 압축
- 요약 비교 시험(claude -p, 사용자 설정·플러그인 끔, Opus 채점; 하네스 24.5만·stock 50만 토큰, 비용 합계 $20.09): Opus 사실 48/50·틀림 0, Sonnet 47/50·틀림 1(금지 규칙을 일반화), Haiku 21/25·틀림 1(승인 범위) → Haiku 제외. Sonnet 에 '모든 사용자 메시지' 섹션을 넣으니 stock 에서 24/25·틀림 0. 결과물: 그 세션 scratchpad sumtest/.
- 쉬고 와서(cold) 카드 [압축]: Sonnet 요약(1~8 섹션) + 사용자 메시지 원문 섹션(코드가 결정적으로 추출: 시스템 알림·명령 출력·다른 세션 메시지·이전 압축 요약·이미지 경로 제외, `!` 명령은 '(! 실행)' 앞 120자, 300자 넘는 글은 앞 200자 + […N자 생략]). 실패하면 core.
- 작업 중(warm) 85%(`/auto-model warn`) 알림, [나중에] 는 +5%p. [압축] 은 core(원래 모델) + 사용자 메시지 섹션 메시지 추가. manual/auto trigger 는 손대지 않음.
- 제약: 플러그인이 스스로 시작한 $.session.compact 에는 자기 session.compact 훅이 안 돈다 → 카드 버튼에서 usage-meter 가 `/auto-model compact-prep`(종류, 60초 유효) 후 직접 compact 를 부르고 auto-model 이 가로챈다. `/auto-model compact` 로 친 건 core 가 처리.

### auto-model 0.5.0 · usage-meter 1.2.6 (2026-10-10): 절약 표시
- 턴마다: 일꾼 답 끝에 "💰 Sonnet 처리 · 실제 약 $A · Opus였다면 약 $B → 약 $C 절약", Sonnet 압축은 같은 내용의 토스트. 누적은 store 'savings' 날짜별(14일): net(절약 − 일꾼 실패 손해), spent(이 컴퓨터가 그날 실제로 쓴 API 환산 값: 메인·서브에이전트·일꾼·압축), shadow 의 '켰다면' 잠재 절약은 따로.
- 카드: `💰 오늘 내 사용량의 약 N% 아낌` = net ÷ (spent + net). 이 컴퓨터 숫자만 써서 계정을 같이 써도 정확. spent 를 아직 모르면 달러.
- 게이지 환산(상세에만, 참고용): 세션마다 누적 비용을 store `cost:<세션>` 에 적고 합쳐서, 1분마다 5시간·주간 % 가 2%p 이상 오를 때의 Δ$/Δ% 를 표본으로(창 초기화·% 하락이면 기준점 다시). 1% ≈ $X 는 표본 5개 이상에서 **80번째 백분위**: 같은 계정을 다른 사람·다른 PC 가 쓰면 게이지만 같이 올라 Δ$/Δ% 가 작은 쪽으로만 치우치므로 높은 쪽을 쓴다.
- 한계: 다른 PC 의 비용은 볼 수도 합칠 수도 없어 표시는 PC 별. 계정 공유 시 게이지 환산은 어림값(상세에 한 줄로 안내).

### auto-model 0.5.1 · usage-meter 1.2.7 (2026-10-10): 압축 버튼이 Windows 에서 멈춤 → 고침
- 제보: Windows Claude Code 2.1.296 세션에서 [압축] 이 눌림(흰 글자) 상태로 굳고 [계속] 으로 포커스도 안 넘어감. 힌트 줄 그대로, transcript 변화 없음, 입력창은 정상. → 클릭 핸들러가 `$.command.run('auto-model compact-prep')` 을 기다리다 매달린 것(테스트에선 재현 안 됨). 명령 훅 안의 `$.command.run` 은 host 가 아예 거절한다는 것도 확인.
- 이제: onPress 는 아무것도 기다리지 않는다(모듈 변수만 바꾸고 invalidate). usage-meter 의 1초 타이머가 압축을 시작. compact-prep 은 안 부르고, auto-model 이 다른 플러그인이 시작한 압축(trigger plugin)을 보고 종류를 스스로 판단(떠 있는 힌트 → 없으면 마지막 호출 뒤 TTL 지났으면 cold). [계속] 의 dismiss 도 타이머에서 5초 제한으로.
- 피드백: 누르는 즉시 버튼 자리에 "📦 압축 중… (Sonnet 요약 · N초)", 시작하면 토스트, 끝나면 토스트, 20분 넘으면 표시를 풀고 안내. Sonnet 실패 시 이유 + "원래 모델이 압축해요".
- 키보드: `/terry compact`, `/auto-model compact`(지시 없음 → 상태 auto-model/ask 로 usage-meter 에 부탁, 3초 안에 안 시작되면 core).

### auto-model 0.5.2 · usage-meter 1.2.8 (2026-10-10): 압축 절약 부풀림
- 제보: Windows 카드에 "오늘 내 사용량의 약 65% 아낌". 수동 /compact 로 1.7만이 된 뒤 /reload-plugins → 세션 상태의 압축 전 크기(65만)가 되살아나 cold 힌트가 다시 뜸 → [압축] 의 Sonnet 은 1만만 읽었는데 절약은 65만 기준 $5.29 로 기록(실제 $0.14).
- 고침: 압축 절약은 Sonnet 이 실제로 읽은 양(usage 입력+캐시)으로만. 모든 압축 뒤 크기를 새로 적고 saveMemory + 힌트 지움. 힌트 판단에 $.session.usage().context.tokens 가 더 작으면 그것.
- 카드: "💰 오늘 이 PC 합계 약 N% 아낌" (이 PC 모든 세션 합계라 범위 명시). 오늘 쓴 값 $1 미만이면 "$X 아낌 (비율 집계 중)".
- Windows store 의 2026-10-10 잘못된 기록(net 5.285, 맞는 값 약 0.145)은 정정하지 않음: 자동 권한 검사가 공유 자원 수정으로 막음. 오늘 값은 자정에 리셋, 7일 합계엔 남음.

### auto-model 0.5.3 · usage-meter 1.2.9 (2026-10-10): 이 대화 기준 절약, 진행 줄 깨짐
- 카드: "💰 이 대화 약 N% 아낌" = 이 세션 순절약 ÷ (이 세션 실제 비용 + 순절약). 이 세션 비용 $1 미만이면 "💰 이 대화 약 $X 아낌", 아낀 게 없으면 줄 없음. 세션 누적은 store `cost:<세션>` 의 {cum, net} (reload 뒤 되살림: 전엔 0 부터 다시 세어 누적을 덮었다). PC 합계·게이지 환산은 `/auto-model` 상세("이 PC 합계 · …").
- 진행 줄: Windows 에서 "📦압축9중…" 처럼 밀리고 지난 숫자가 남음 → 1초마다 다시 그리는 줄에서 이모지·…·· 를 빼고 초를 두 자리로.

### auto-model 0.5.4 (2026-10-10): '<' 로 시작하는 글을 건드리지 않음
- 0.2.1 부터 `/^[~<]/` 를 건너뛰기로 봐서, 다른 세션 메시지(`<cross-session-message …>`)나 붙여넣은 HTML 의 맨 앞 '<' 를 지우고 판단도 건너뜀(log 에 "~ 로 건너뜀"). 이제 사람이 친 '~' 만.
- 이름·설명: "요청마다 맞는 모델이 처리해요. 메인(Opus)은 그대로 두고 단순한 일은 Sonnet·Haiku 일꾼에게…" 로 plugin.json·marketplace·README·노션(제목 "auto-model: Claude 오토 모델 플러그인") 통일.

### usage-meter 1.2.10 (2026-10-11): 카드 윗줄 버튼 뺌
- 카드 맨 윗줄의 🐾(쓰다듬기)·🐕(옆 창) 버튼을 뺌: 터미널에서 이모지 버튼이 겹쳐 보이고 쓸 일이 적음. `/terry pet`·`/terry pane` 은 그대로.

### auto-model 0.5.5 (2026-10-12): 파일 로그, 판단 기록 덮어쓰기
- `/auto-model logdir <폴더> [noprompt] | off` (기본 꺼짐): 요청마다 판단을 `<폴더>/auto-model/<날짜>/<wsl|win|local>-<세션 앞 8자>.jsonl` 에 한 줄(JSON). kind: turn(이유·일꾼·usage·실제/원래 모델 비용·놓친 일꾼 후보·프롬프트 앞 80자) · compact(모드·크기·비용·Sonnet 실패 이유) · agent(서브에이전트 요청/실제 모델) · logdir. `noprompt` 면 프롬프트 문구를 뺌. `$.fs.write` 는 통째 쓰기라 줄을 들고 있다가 다시 씀(파일당 최근 500줄), reload 뒤엔 파일을 읽어 이어 붙임.
- 집 PC: WSL `/mnt/c/dev/d3nim-claude-mods/logs`, Windows `C:\dev\d3nim-claude-mods\logs` (같은 폴더). 저장소 `.gitignore` 에 `logs/` (공개 저장소라 프롬프트가 올라가면 안 됨). 회사 PC 로그는 그 PC 에서 따로 분석.
- 고침: store 'decisions' 를 세션마다 제 목록으로 통째로 덮어써서 터미널을 여럿 띄우거나 /reload-plugins 하면 `/auto-model log` 기록이 사라졌다 → 항목에 세션 id 를 달고 다른 세션 것은 두고 합침, session.start 에서 이 세션 것을 되살림.

### auto-model 0.5.6 (2026-10-12): 작업 중 압축에 원문 목록을 붙이지 않음
- 작업 중(warm) 카드 [압축]과 Sonnet 이 실패해 원래 모델로 넘어간 압축에는 '모든 사용자 메시지' 메시지를 더 붙이지 않는다. 플러그인이 만든 메시지는 화면에 전부 보이고 숨길 방법이 Mods API(2.1.296)에 없어서, 압축 뒤 긴 목록이 화면을 덮었다. core 요약(handle 있는 메시지)은 "압축됨" 한 줄로만 보인다.
- 쉬고 와서(cold) Sonnet 요약은 그대로 원문 목록 포함: 요약 글 자체를 플러그인이 넣어야 해서 어차피 화면에 보이고, 원문 목록은 Sonnet 의 승인 범위 일반화를 막으려고 붙인 것.
- Windows 'dk' 터미널에서 카드 버튼([압축]·[계속])에 포인터를 올려도 반응 없음 (2026-10-12 사용자 확인). 그 터미널에서 마우스 입력이 안 들어오는 것으로 보임 (미확인) → `/terry compact` 로 대신.
  - 원인 (2026-10-13): 버튼 클릭은 전체 화면 렌더러에서만 들어온다. Windows 설치는 전체 화면 제안을 세 번 받고 답하지 않아(`~/.claude.json` 의 `fullscreenUpsellSeenCount: 3`) 기본 렌더러로 남았고, WSL 은 전체 화면이었다. Windows `~/.claude/settings.json` 에 `"tui": "fullscreen"` 을 넣음 (세션 재시작 뒤 적용, `/tui default` 로 되돌림).
  - 단, 회사에서 Tailscale SSH 로 집 Windows 세션을 쓸 때는 Claude Code 가 전체 화면을 스스로 끈다("Windows over SSH (ConPTY re-rendering)", `CLAUDE_CODE_NO_FLICKER=1` 로만 강제). 그 경우 버튼은 안 되고 `/terry compact`.

### usage-meter 1.2.13 · 검사기 (2026-10-12): 달리기 목 앞, 견종 실험에서 나온 검사
- 달리기 #1·#2: 사용자가 목 앞(턱과 목이 만나는 곳)을 채움(2칸·4칸). #3 의 + 모양 코를 #2 와 같은 3+2칸으로(편집기 db 도 고침).
- `check-sprite.py`: 목 앞·가슴선(턱 밑 꺾이는 줄부터), 배 밑선(다리 사이만), 엉덩이(몸통 아래쪽 뒤끝이 뒷다리 시작보다 몇 칸 뒤인지, 서거나 걷는 동작만), `--generic`(완성본 없는 캐릭터용 일반 값). 고친 버그: 큰 머리를 몸통으로 읽어 등 검사가 머리 윗선을 재던 것, 선 귀 밑을 목 꺾임으로, 목·등 모서리, 비스듬한 다리를 배로, 허벅지 가늘어짐을 굵기 급변으로 읽던 것.
- 견종 실험(코기·닥스·시바·푸들 걷기, 사진 + 일반 지식, 테리 완성본 안 씀) 기록: https://claude.ai/artifact/Jd5igQotGq3M56XfAYVEvq. 사용자 지적 1차: 시바가 테리어 체형(잘록한 허리) → 스피츠 체형으로, 코기·닥스 엉덩이 튀어나옴 → 엉덩이 검사 추가. 견종 그리는 도구는 저장소에 없음(임시 폴더).

### auto-model 0.5.8 (2026-10-12): Sonnet 요약에도 원문 목록을 붙이지 않음
- 쉬고 와서(cold) Sonnet 요약 뒤에 붙이던 '모든 사용자 메시지' 목록을 뺐다. 화면에 다 보여 장황했고, 이전 요약 전체를 '사용자 메시지 1번'으로 다시 넣어 압축할수록 목록이 겹쳐 쌓였다(st 세션, 사용자 확인).
- 대신 요약 프롬프트 5번: 승인·금지는 사용자 말을 따옴표로 짧게(한 줄 80자 안) 인용하고 무엇에 대한 승인인지 붙인다. 다른 사용자 메시지는 옮겨 적지 않는다. '빠짐없이, 하지만 짧게'.

### auto-model 0.5.7 · usage-meter 1.2.11 (2026-10-12): 절약 줄은 두 턴만, 초록 글씨
- 카드의 '이 대화 약 N% 아낌' 이 계속 남아 턴마다 % 가 줄었다(아낀 값은 그대로인데 쓴 값만 늘어서) → auto-model 이 새로 아낀(일꾼·Sonnet 압축) 뒤 메인 턴 두 번이 끝날 때까지만 `saving.sessionShow: true`. usage-meter 는 `sessionShow === false` 면 줄을 숨김(값이 없는 예전 auto-model 이면 계속 보임). 금액·비율은 `/auto-model` 상세에 그대로. reload 뒤엔 0부터(숨김).
- Windows 에서 '💰 이 대화 약 4349 아낌' 처럼 기호가 빠지고 숫자가 겹쳐 보임 → 💰 를 빼고 초록(#9be08a) 굵은 글씨로. 진행 줄(0.5.3)과 같은 이모지 폭 문제로 보임.

### usage-meter 1.2.12 (2026-10-12): 좁은 화면 사용량 한 줄, 기지개 목
- 옆자리가 없을 만큼 좁으면(테리만) 테리 밑에 한 줄: `5h ━── 42%  주간 ━── 30%  대화 ━── 12%` (막대 3칸 고정, 38칸). 더 좁으면 막대를 빼고, 그래도 넘치면 `5h · 주 · 대`.
- 기지개 #1·#11~#14 목: 귀 밑 뒷목 파임 채움, 앞목 파임·두께 → 사용자가 #11 을 그려 저장(뒷목 24칸, 앞목 31칸 직선, 굵기 8, 가슴 앞 1칸 안으로) → #12 는 복사, #13·#14·#1 은 같은 원칙(앞목 30칸 직선, 턱 밑 한 줄만 +1)으로 옮김. 편집기 db → import → build.
- 검사기(`docs/preview/check-sprite.py`)가 옛 #11·#12 목 꺾임을 2.0칸으로 정확히 쟀지만, 기준을 그 프레임이 든 완성본에서 뽑아 '정상'으로 넘어갔다 → 고친 그림으로 기준(`sprite-rules.json`)을 다시 뽑음(기지개 목 한도 2.0 → 1.3). 앞목(턱 아래) 윤곽은 아직 재지 않음: 턱 끝을 파임으로 읽어서.
- `import-terry-edits.py` 가 이제 기존 파일의 동작·프레임 순서를 지킨다 (다시 가져와도 바뀐 프레임만 diff 에 보이게).

### 확인 못 한 것 (실기 확인 필요)
- 실제 Claude Code 화면에서 밴드/`/dog`가 어떻게 보이는지, 15프레임 갱신이 부담 없는지.
- 파이리(포켓몬) 실험 파일은 저작권 문제로 저장소에 올리기 전에 지웠다. 불꽃·테리 관련만 남김.

### 남은 일
- ~~git init → private repo → push~~ 완료: https://github.com/d3nims/d3nim-claude-mods (main). `.gitattributes`로 `* text=auto eol=lf`. 작성자는 저장소 로컬 git 설정을 따름.
- 동료 설치 테스트: `claude plugin marketplace add d3nims/d3nim-claude-mods` → `claude plugin install usage-meter@d3nim-claude-mods` (2026-10-05 공개 저장소로 전환, 로그인 없이 설치 가능)
- 안전장치 mod(2순위)

### auto-model 0.5.9 · usage-meter 1.2.14 (2026-10-13): /clear 뒤 크기, 안내 줄 깨짐
- auto-model: /clear 는 같은 프로세스가 새 세션으로 이어지고 session.start 가 안 돈다 → 지운 대화의 크기·시각(last)을 들고 있어 새 대화 첫 답 전까지 지운 대화 기준 '캐시 식음' 이 뜰 수 있었다. 이제 session.end(reason 'clear') 에서 버림. (대표님 PC 의 '61만 캐시 식음' 은 /clear 뒤 새벽 루프가 같은 대화에 쌓은 크기로 보임: 그 세션 `/context` 로 확인 안내)
- usage-meter: 압축 안내 줄에서 ⏰·📦 와 · 를 뺌. 분이 바뀔 때만 몇 칸 다시 그리는 줄이라 SSH 너머 Windows 에서 '⏰14시간 341 쉬어' 처럼 밀리고 지난 글자가 남았다 (마우스를 움직이면 바로잡힘 = 부분 다시 그리기 문제).

### usage-meter 1.2.15 (2026-10-13): 메모리 표시와 정리
- 동료 건의(8GB 노트북에서 메모리가 차 꺼짐). 30초마다 읽음(테리 화면일 때만): WSL·Linux `/proc/meminfo` MemAvailable, Windows PowerShell + VisualBasic ComputerInfo (약 0.6~1초; Get-CimInstance 는 1초 넘고 처음엔 10초). Mac 은 아직 없음. Claude 합계는 `ps -C claude` / Windows 는 경로가 claude-code 또는 `.local\bin` 인 claude.exe 만 (데스크톱 앱 제외; PowerShell `-match` 의 `\b` 가 단어 경계라 처음엔 하나도 못 찾음).
- 카드: 남은 양 15% 미만일 때만 한 줄 (사용자 결정: 늘 띄우지 않음), 8% 미만 빨강. 폭에 맞춰 `메모리 1.4/31GB 남음 (5%)  Claude 2개 0.8GB` → … → `램 1.4G 5%` → `램 5%`. 테리만 들어가는 폭이면 사용량 줄 밑. 이모지·· 없음(부분 다시 그리기 밀림).
- `/terry mem`: 제목 + 들여 쓴 줄 + 빈 줄로 나눔(사용자 요청). 같은 이름 프로세스는 묶고 0.05GB 미만은 뺌. '앞으로': 남은 비율별로 무엇이 꺼질 수 있는지 (Linux 는 가장 큰 프로세스를 커널이, Windows 는 메모리 부족 경고 뒤 더 달라는 프로그램).
- `/terry mem clean`: `~/.claude/sessions/<pid>.json`(이름·status idle/busy·statusUpdatedAt)으로 다른 Claude 세션을 찾음. 이 세션은 제외(Linux 는 /proc/self/stat 의 pid, Windows 는 세션 id). 추천: 30분 넘게 쉼, 같은 대화가 둘 이상인데 5분 넘게 쉼, 부모가 죽은 MCP 도우미. 작업 중은 추천 안 함. `$.ui.ask` multiSelect 창(4개까지, 명령이 끝난 뒤 띄움) + 번호/`추천`. 끄기 직전 pid·종류·세션 id 다시 확인, Linux `kill`, Windows `taskkill /F`.
- 1.2.16: 후보가 하나면 창을 안 띄우던 것(창은 선택지 둘 이상) → '끄기 / 그대로 두기' 창. Windows 에서 세션 둘만 띄우면 늘 하나라 창이 안 떴다 (사용자 확인).
- 1.2.17: 응답 중 카드에 '출력' 이 시간 줄과 토큰 줄에 두 번 → 토큰 줄이 보이면 시간 줄엔 시간만 (mini·nano 는 그대로). 토큰 수 백만부터 M ('캐시 15046k' → '15M').
- 1.2.18: 사용량 % 색 기준 80·90% → 70%(주황)·85%(진한 주황), 넓은 화면 이름 옆 '!' 도 85%부터. 80·90% 알림은 그대로. Windows 카드 버튼이 안 눌린 건 settings.json 의 tui 가 다시 default 로 돌아가 있어서였음 (fullscreen 으로 되돌림; SSH 너머로는 마우스가 안 올 수 있어 /terry compact).
- 1.2.19: quad · fine 도 점자와 같은 그림(위 'quad(블록)도 같은 그림'). 달리기를 PixelLab 으로 뽑은 질주(B)를 다듬은 E안으로 바꿈: 9장 · 60ms, 0번은 예전 key pose 4(쭉 뻗은 자세, max 비행이 잡는 장, 빌드가 `flyFrame` 0 을 씀). B 는 C안 6번을 첫 그림으로 준 PixelLab animate_image 결과를 Terry 격자·팔레트로 되돌린 것이고, 가슴 파임 2 · 배 파임 1 · 떨어진 점 · 코 색만 고침(검사기 0건). 사용자: "리얼하고 애기 강아지가 뛰는 거 같아서 귀엽다", Retro Diffusion 은 "토끼 같다". 비교 https://claude.ai/artifact/2UYkJL7yNfXcT5nwicWuaK. 타이머 FRAME_MS 40 → 30 (60ms 한 장이 딱 두 틱; 40 이면 2·1 틱 번갈아 박자가 고르지 않음). 걸음 연구 도구 `docs/preview/gait/`, 블록 비교 도구 `docs/preview/blocks/`. 편집기 db 의 run-0~11 은 아직 1.2.18 달리기라, db 에서 import 하면 달리기가 되돌아감(맞출지 사용자 확인 대기).
- 1.2.20 (2026-10-19): 움직임 규칙 모음(`docs/preview/motion/`, README 에 규칙과 사용자 판정, 비교 페이지 https://claude.ai/artifact/15EwHdrvAfUo4vbQ2FQsdj). 쉬는 동안 몸통만 숨쉬기(앉은 자세는 그려 둔 등 숨, 엎드린·선 자세는 등 가운데 볼록, render.js `breathFrames`). 땅 파기는 머리가 코를 따라 숙임. 달리기 얼굴을 테리로(걷기 머리, 귀가 펄럭이며 분홍 속). 졸기 꾸벅꾸벅 4장. 모든 동작의 눈을 순하게(위 앞쪽 회색 점이 찌푸린 눈썹처럼 보였음). 귀가 머리보다 한 박자 늦게(짖기·원반·기지개). 밥 먹기에 고개 들어 코 핥기와 꼬리(13장). max 날기는 질주에서 네 발이 다 뜬 장(1번)을 한 장짜리 `fly` 세트로, 망토는 그 장의 어깨(`cape`)에서 아랫단 한 줄로. 좁은 카드(mini)도 입력/출력/캐시 세 줄. 채택한 안은 terry-edits.json 과 편집기 db 에 모두 넣어서 편집기 = 카드(140장); run-9~11 은 지움. 카드 그대로 보기 `docs/preview/motion/card-cells.mjs`.

- 1.2.21 (2026-10-21): 점자 카드 다듬기. 짖기(1~3)·하품(기지개 5~7) 입을 실제 짖는 사진과 CC0 도트로 다시 그림(아래턱 1줄), 털의 외톨이 점 정리, 걷기 뒷다리 스윙(13~15번 발을 2점 들어 고르게 앞으로, 먼 뒷다리는 진하게; 참고 Muybridge plate 704), 원반 5번 다리 잘록함. terry-edits.json 과 편집기 db 둘 다(백업 `docs/preview/terry-edits.json.bak-20261021-*`, git 에는 안 올림). 달은 render.js `moonShape`(원 두 개로 깎은 초승달, 추석은 크레이터 보름달), 점자에서 점 하나 = 픽셀 하나; quad 는 옛 그림 그대로.

### usage-meter 1.2.21 (2026-10-21): /runner · /monk 사다리 카드, 셀 글꼴 실험
- 동료 건의("로드런너2 해골"): 실제로는 Lode Runner: The Legend Returns(1994)의 주인공과 Mad Monk. 상용 게임 그림은 안 씀(저장소 공개), 구조만 빌리고 그림은 새로 그림.
- `/runner`: 가방 멘 런너가 오른쪽으로 걷다 사다리를 오르고 줄을 건넘, 빨간 해골 수도승이 1.4초 뒤에 같은 길로 쫓아옴, dig 기분엔 레이저로 앞 바닥을 팜. `/monk`: 수도승이 주인공. `/terry` 로 돌아옴. register.js `character`(store 키 `character`), `heroCells`, 말은 `LODE_TEXT`·`LODE_SHORT`·`LODE_RUN`(강아지에게만 맞는 말만 바꿈). 기본 그림 방식은 quad.
- 그림: `docs/preview/lode/rig.py`(관절 rig, 24x32: 걷기 8·오르기 4·매달리기 4) → `build-lode.py` → `hooks/lode-data.js`, 장면 `hooks/lode.js`(라임 잔디, 흰 사다리·줄, 금 해골 보물, 카메라가 따라감). 미리보기 `docs/preview/lode/preview.py` + `cells.mjs`.
- **셀 글꼴(아직 플러그인에 연결 안 함, 이번 배포에서 카드에 안 보임):** 터미널 칸 하나 = 8x16 글리프로 그림을 잘라 글꼴로 만들면 터미널이 화면 픽셀 해상도로 그려 줌. 사이드 창이나 다른 터미널 없이 도트가 또렷함.
  - 글리프는 Supplementary PUA-B (사다리 U+100000~, 테리 U+10A000~; WaveTerm 의 Hack Nerd Font 가 BMP PUA 와 U+F0001~ 를 먼저 씀). 글자 크기 14, WaveTerm 기본 Hack 기준(adv 1233, asc 1901, desc 483 /2048).
  - 칸당 3색: 글리프를 16px 폭으로 만들어 오른쪽 칸 위에 넘쳐 그림 → 자기 바탕 + 자기 글자색 + 왼쪽 칸 글자색. `hooks/lode-fine.js` `cellsOf` 가 줄마다 DP 로 색을 고름.
  - DirectWrite 가 글리프 가장자리를 ±0.5px 번지게 해 칸 경계에 고정된 줄이 생김 → `cellfont.py` BLEED(가로만). 10/20 런너 장면 측정은 .25, 10/21 테리 장면 측정은 .5 가 가장 고르고 흰색보다 밝은 픽셀 0 → 지금 .5. 사다리 카드에 줄이 다시 보이면 그 장면에서 다시 잴 것.
  - 흐름: 장면(`lode-fine.js` / `terry-fine.js`: 점자 테리 → Scale2x 한 번, 달은 반 점 픽셀로 다시) → `harvest.mjs` · `harvest-terry.mjs` 가 나오는 모든 칸을 모아 `hooks/lode-glyphs.js` · `terry-glyphs.js` (+ json) → `python cellfont.py --glyphs glyphs.json <out.ttf> 7.0 --more terry-glyphs.json 10a000` (fontTools 필요). 없는 칸은 가장 가까운 글리프. 지금 39,168조각(글꼴 하나 최대 65,535).
  - 설치(Windows 사용자 글꼴): `%LOCALAPPDATA%\Microsoft\Windows\Fonts\LodeCells7.ttf` + HKCU Fonts 'Lode Cells (TrueType)'. WaveTerm `term:fontfamily` 를 `"Hack, Lode Cells"` 로. 새 글꼴 파일은 WaveTerm 을 다시 켜야 보임(쓰던 옛 파일은 그때까지 잠김).
  - 보기: `node docs/preview/lode/play.mjs [runner|monk|terry] [mood] [effort]` (WaveTerm 안에서).
  - 시험 장치: xterm.js 6.0.0 + addon-webgl 0.19.0 을 Windows Chrome headless 로 띄워 WaveTerm 과 같은 화면을 찍음(term.open 전에 'W' 글꼴을 먼저 불러야 칸이 8px).
  - 2배 도트 편집기 https://claude.ai/artifact/YRPp1sdui1VZEivLnyrDeZ (`docs/preview/terry2x-editor-template.html` + `terry2x-editor-data.json`), `docs/preview/lode/terry2x.mjs import <폴더>` → `hooks/terry-2x-data.js` (손본 장만 Scale2x 대신).
  - 다음: 플러그인 그림 방식 `font`(글꼴이 없으면 점자로), 동료용 글꼴 설치 스크립트. → 1.2.22

### usage-meter 1.2.22 (2026-10-21): /terry font
- `/terry font` (`/runner font`, `/monk font`): 카드 그림을 Lode Cells 글리프로. 기본은 그대로 점자이고, 고른 사람만. 불꽃 밴드는 글꼴 방식이 없어 블록(`drawMode`).
- **Raster 로는 못 그림:** Raster 는 칸마다 'printable width-1 BMP' 글자만 받고(엔진 코드 `cell N holds code point …, beyond the Basic Multilingual Plane`), 글리프는 U+100000~ 라 거절. BMP 에 옮길 자리도 없음(좁은 BMP 글자는 다 합쳐도 약 1.8만, PUA 6,400 은 Hack Nerd Font 아이콘이 먼저). 그래서 Text 로 그림: Text 는 U+10A000 을 받고 엔진 너비(Bun.stringWidth, ambiguousIsNarrow true)도 1칸.
- **Client 로 그림:** Text 는 blit 이 없어 장마다 다시 그려야 함. `$.ui.invalidate` 로 카드 전체를 다시 그리면 CPU 가 한 코어의 약 74%(점자 약 12~30%). 그래서 `hooks/hero-font.js` 를 Client 모듈로 띄워(register.js `heroPicture`) 자기 칸만 60ms 마다, 그림이 바뀐 때만 다시 그림 → 앉기 약 20%, 달리기 약 32% (pty 로 띄운 Claude Code 에서 5초 CPU 측정).
- 가볍게: `lode-fine.js` `cellsOf` 가 한 번 본 줄은 그대로 씀(줄 픽셀 해시) + 색 거리 기억. 달은 둘째 장면(noMoon)을 그리지 않고 `moon.under`(달이 덮은 점)로 다시 깜(픽셀 차이: 달 상자 가장자리 낙엽 몇 점).
- **모듈 파일 1MB 제한:** 엔진은 1MB 넘는 모듈을 안 읽음(`is over 1048576 bytes and was not read`). 글리프 표를 hex 목록(1.2MB) → base64 한 줄(글리프당 32바이트; lode 약 0.9MB, terry 약 0.78MB)로. `packKeys`/`unpackKeys`(lode-fine.js), 첫 사용 때 풀어서 글꼴을 안 쓰면 시작이 느려지지 않음. 글리프를 더 모아 1MB 를 넘기면 파일을 나눌 것.
- **확인:** pty 로 `claude --plugin-dir plugins/usage-meter` 를 띄워 `/terry font` 출력을 받고(글리프 그대로 나감, 바뀌거나 거절 없음), xterm.js 6 + webgl 하네스에 다시 그려 찍음(깨짐·경계 줄 없음). WaveTerm 실기 확인은 사용자.
- **글꼴 배포:** `plugins/usage-meter/fonts/LodeCells.ttf` (= LodeCells7, 'Lode Cells' 7.0) + `install-font.ps1` (내 계정 글꼴 폴더에 `LodeCells-<버전>.ttf`, HKCU Fonts 'Lode Cells (TrueType)', 옛 LodeCells*.ttf 삭제(쓰는 중이면 남김), WaveTerm `term:fontfamily` 에 ', Lode Cells' 추가(백업 `settings.json.bak-lodecells`), 크기 14·Hack 이 아니면 알림). README 의 `irm … | iex` 한 줄은 GitHub main 에서 스크립트와 글꼴을 받음. **글리프 표를 다시 모으면(harvest) 글꼴과 스크립트의 `$Version` 도 같이 올릴 것** (표와 글꼴이 어긋나면 엉뚱한 조각이 나옴).

- 1.2.23 (2026-10-21): 회사 PC(SSH·tmux 로 이 PC 에 붙어 봄)에서 글꼴 그림이 빈 네모로 나옴. 원인: 글자는 **화면을 보여 주는 PC 의 터미널**이 그림 → 그 PC 에 글꼴이 있어야 하고, 깐 뒤 WaveTerm 을 완전히 다시 켜야 함(켜질 때 글꼴 목록을 읽음). 거기서 확인한 것: 파일·HKCU 등록·GDI(System.Drawing) 다 정상, Edge 시험 페이지도 그림 → WaveTerm 이 깔기 전부터 켜져 있었던 것. 내가 준 `wsh setconfig term:fontfamily="Hack, Lode Cells"` 가 원래 글꼴 설정을 덮어써 점자·한글이 깨졌다가 설치 스크립트 백업으로 되돌림(설정은 읽고 덧붙이기만). 고친 것: 설치 스크립트가 Windows 설치처럼 AddFontResourceW + WM_FONTCHANGE 를 보내고, WaveTerm 이 켜져 있으면 완전 종료를 알리고, settings.json 이 없으면 `Hack, Lode Cells` 로 만듦. `/terry font` 답에 시험 글자(U+100000, 흰 가로 막대) — 플러그인은 화면 쪽 글꼴을 알 수 없어서 보는 사람이 바로 가림. tmux 안의 이 세션에서는 WSL_INTEROP 가 죽은 소켓을 가리켜 powershell.exe 가 `UtilAcceptVsock ... failed 110` 로 실패: `/run/WSL/*_interop` 중 살아 있는 것으로 `export WSL_INTEROP=...`.

- 1.2.24 (2026-10-21): 동료(8GB 노트북, 내장 그래픽)가 글꼴 테리를 쓰다 얼마 뒤 **모든 한글 글자 자리에 테리 조각**이 찍힘. 원인 재현(lode-repro/atlas, GPU 한도를 16장·4096 으로 낮춤): xterm.js addon-webgl 0.19.0 의 글리프 아틀라스는 페이지가 텍스처 장수 한도(16)에 닿으면 4장씩 합치는데, GPU 텍스처를 다시 올릴지 페이지 `version` 을 슬롯별로 비교해서 합친 뒤 자리를 옮긴 페이지가 같은 번호면 옛 그림이 남음. 버전을 전역 번호로 바꾸면 같은 조건에서 멀쩡(위쪽 0.20.0-beta 가 똑같이 고침 `Q.nextVersion`, 정식 0.19.0 엔 없음, WaveTerm 은 0.19.0). 아틀라스는 설정이 같은 WaveTerm 터미널끼리 공유라 창이 여러 개면 더 빨리 참. **우리 쪽 대책: 땅을 84 서브픽셀(가장 넓은 카드 폭)마다 반복**(render.js `GROUND_PERIOD`, 계절 낙엽·눈 포함). 끝없는 땅이 달리는 동안 칸마다 새 글리프·색 조합을 만들어 10분에 1만 개 넘게 계속 늘던 것이 약 2.7천에서 멈춤. 10분 혼합 시험(달리기 high·max·xhigh, fetch, sniff)에서 아틀라스 14장→8장, 합치기 없음. 바뀐 땅 조각은 지금 글꼴(7.0)에 99.8% 있음(나머지는 가장 가까운 조각) → 글꼴 재설치 불필요. 남은 것: 사다리 카드 글꼴 그림은 아직 느리게 늘어남(카메라 위치, 5분 1.5만).

### auto-model 0.5.10 (2026-10-17): 1주 로그 검토 뒤 고침, 최신 모델, 단어 후보
- 1주 검토(10/12~17, 324턴): 전환 0번(잘못 바꾼 것 없음). 쉬고 와서 압축 9번 Sonnet 약 $2.5 vs Opus 약 $8. 기억 질문 shadow 23번, 켰다면 +$2.3(1.3%)뿐이고 작은 모델이 '고장'·'국장 확인' 을 가볍다고 봄 → light 는 계속 꺼 둠. 일꾼 켜짐이지만 0번, 놓친 후보 0번.
- 놓친 일꾼 판정: 읽기만 하는 셸 명령(cat·grep·ls·sed -n·git status/log/diff…, 쓰기 >·sed -i·find -delete 없음)도 '찾기'로 침(`isReadOnlyCommand`). 전엔 Bash 가 끼면 무조건 원래 모델이 맞다고 봐서 늘 0.
- HEAVY 에 문제 신고·확인 부탁(고장·먹통·반응 없·안 돼·확인좀·확인해·봐줘·해바·찾아봐·알아봐): 작은 모델에게 묻기 전에 무거운 일로.
- 파일 로그: 턴 줄에 `tools`(예 `Bash(읽기), Edit`), shadow 다음 턴은 `kind:"next"` 줄로 덧붙임.
- 최신 모델 (사용자 원칙 "어떤 모델이든 최신 버전"): 메인 모델이 옛 버전이면 같은 종류의 최신(`latestOf`, 이유 끝에 'Opus 4.7 → 최신 Opus 5.5'). 서브에이전트도 지정 모델이나 에이전트 정의(`<cwd>/.claude/agents/<종류>.md`, `~/.claude/agents/`)의 model 이 옛 버전이면 종류 별칭(`opus` 등, 최신으로 풀림)으로 넘김. 그래도 옛 모델로 돌면 로그 '⚠ 메인보다 옛 모델' + 종류마다 토스트 한 번. (stock-trader 의 에이전트 두 개가 claude-opus-4-7 로 고정돼 있던 게 계기)
- 단어 후보: 턴마다 {요청, 실제로 어떤 일(도구 3번↑이나 긴 답=무거움, 도구 없이 짧음=가벼움, 놓친 일꾼=찾기·쓰기)} 을 store `wordSamples`(400개)에 모으고, 지금 규칙이 놓친 문장에 2번 이상 나오고 반대쪽엔 드문 낱말을 `/auto-model word` · `log` 에 보여 줌. `/auto-model word add|remove heavy|search|write <단어>` 로 사람이 넣을 때만 규칙에 들어감(settings.words). 자동 학습은 안 함(잘못 배운 단어 하나로 무거운 일이 Sonnet 으로 갈 수 있어서).

