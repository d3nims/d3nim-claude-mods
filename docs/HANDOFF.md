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
- 강아지 다시 그리기: `python3 docs/preview/build-terrier.py [--k=1.05] [--coat=blue|liver|sandy]` 후
  `{ printf 'export default '; cat docs/preview/terrier-frames.json; printf ';\n'; } > plugins/usage-meter/hooks/terrier-data.js`

### 확인 못 한 것 (실기 확인 필요)
- 실제 Claude Code 화면에서 밴드/`/dog`가 어떻게 보이는지, 15프레임 갱신이 부담 없는지.
- 파이리(포켓몬) 실험 파일은 저작권 문제로 저장소에 올리기 전에 지웠다. 불꽃·테리 관련만 남김.

### 남은 일
- ~~git init → private repo → push~~ 완료: https://github.com/d3nims/d3nim-claude-mods (private, main). `.gitattributes`로 `* text=auto eol=lf`. 작성자는 저장소 로컬 설정(d3nim / tglaon@gmail.com).
- 동료 설치 테스트: `claude plugin marketplace add d3nims/d3nim-claude-mods` → `claude plugin install usage-meter@d3nim-claude-mods` (private이라 동료가 저장소 접근 권한 + GitHub 로그인 필요)
- 안전장치 mod(2순위)
