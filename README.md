# d3nim-claude-mods

d3nim 팀이 같이 쓰는 Claude Code mods 모음입니다.

## 설치

Claude Code 안에서:

```
/plugin marketplace add d3nims/d3nim-claude-mods
/plugin install usage-meter@d3nim-claude-mods
/reload-plugins
```

터미널에서 해도 됩니다:

```bash
claude plugin marketplace add d3nims/d3nim-claude-mods
claude plugin install usage-meter@d3nim-claude-mods
```

> 비공개 저장소라면 GitHub 계정에 이 저장소 접근 권한이 있어야 하고, `gh auth login` 이나 git 자격 증명으로 로그인돼 있어야 합니다.

## 업데이트

```
/plugin marketplace update d3nim-claude-mods
/reload-plugins
```

## usage-meter

프롬프트 위에 5시간 · 주간 · 대화 사용량을 보여 주고, 80% · 90% 에서 알려 줍니다.

| 명령 | 내용 |
| --- | --- |
| `/flame1` | 파란 불꽃 사용량 밴드 + 모델 카드 |
| `/terry` | 입력·응답에 반응하는 베들링턴 테리어, 이번 요청의 시간·토큰 카드, 사용량 표 |
| `/terry run` | 20초 동안 달리는 모습 미리보기 (`sit` `wag` `bark` `happy` `sleep`, `stop` 으로 끝내기) |
| `/terry quad` · `/terry braille` | 그림 방식 바꾸기 (`/flame1` 도 같음) |
| `/terry help` | 사용법 |

테리는 평소엔 앉아 있다가, 입력을 시작하면 짖고, 치는 동안 꼬리를 흔들고, 엔터를 치면 응답이 끝날 때까지 달리고, 다 끝나면 헥헥거리고, 3분 동안 조용하면 졸아요. 하늘은 실제 시계를 따라 낮엔 해, 밤엔 달과 별이 뜹니다.

### 색이 이상하게 보이면

테리가 청록색이나 보라색으로 보이거나 흙길이 회색이면, 터미널이 트루컬러를 알리지 않아 256색으로 줄여 그려진 것입니다. 셸 설정(`~/.bashrc` 등)에 아래 줄을 넣고 Claude Code 를 다시 켜 주세요.

```bash
export COLORTERM=truecolor
```

### Claude 밖에서 테리 보기

```bash
node docs/preview/terry-view.mjs run --slow=4   # 1~6 키로 동작 바꾸기, q 끝내기
```
