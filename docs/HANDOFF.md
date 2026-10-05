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
  - `/terry` (0.6.0): 테리가 불꽃 막대(5시간) 위를 달리고 막대 끝에 `5h 25%`(칸 글자, 한글은 Raster에 못 넣음). 오른쪽에 모델 카드, 그 아래 **뼈다귀 게이지 두 개**(주간, 대화): 쓴 만큼 왼쪽부터 크림색(80% 노랑, 90% 빨강)으로 차고 몸통 가운데 칸에 `8%` 같은 숫자. 뼈다귀는 5줄 높이(혹이 위아래 2줄씩, 몸통 1줄) — 3줄로는 아령처럼 보여서 늘림. 테리는 0.85배(10줄).
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
