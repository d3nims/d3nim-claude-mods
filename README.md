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

> 공개 저장소라 GitHub 로그인 없이 받을 수 있습니다.

## 업데이트

```
/plugin marketplace update d3nim-claude-mods
/reload-plugins
```

## usage-meter

프롬프트 위에 5시간 · 주간 · 대화 사용량을 보여 주고, 80% · 90% 에서 알려 줍니다.

### `/terry`

![입력하면 짖고 꼬리를 흔들고, 엔터를 치면 응답이 끝날 때까지 달리고, 끝나면 헥헥거리다 조는 테리](docs/images/terry.gif)

### 추론 강도에 따라 달리기가 달라져요

응답하는 동안 테리는 지금 추론 강도(`/effort`)에 맞춰 움직입니다. max 에선 빨간 망토를 휘날리며 날아요. `/terry run max` 처럼 강도를 붙이면 20초 동안 미리 볼 수 있어요.

![low 걷기, medium 빨리 걷기, high 달리기, xhigh 전력 질주, max 망토 달고 날기](docs/images/effort.gif)

### Claude 가 하는 일에 따라 움직여요

파일을 읽거나 찾을 땐 킁킁거리고, 명령을 실행하거나 파일을 고칠 땐 땅을 파고(오래 팔수록 뒤에 흙더미가 쌓여요), 웹에서 가져올 땐 막대기를 물어 와요. 허락을 기다리면 말풍선에 `?` 를 띄우고, 요청이 실패하거나 멈추면 고개를 떨구고 시무룩해져요. `/terry sniff` · `dig` · `fetch` · `ask` · `sad` 로 미리 볼 수 있어요.

![읽기·검색 킁킁, 실행·수정 땅 파기, 웹 물어 오기, 허락 대기 말풍선, 실패 시무룩](docs/images/actions.gif)

### `/flame1`

![5시간 · 주간 · 대화 사용량을 파란 불꽃 높이로 보여 주는 밴드](docs/images/flame1.gif)


| 명령 | 내용 |
| --- | --- |
| `/flame1` | 파란 불꽃 사용량 밴드 + 모델 카드 |
| `/terry` | 입력·응답에 반응하는 베들링턴 테리어, 이번 요청의 시간·토큰 카드, 사용량 표 |
| `/terry run` | 20초 동안 달리는 모습 미리보기 (`sit` `wag` `bark` `happy` `sleep`, `stop` 으로 끝내기) |
| `/terry run max` | 추론 강도별 달리기 미리보기 (`low` `medium` `high` `xhigh` `max`, `middle` · `중간` 도 됨) |
| `/terry dig` | 도구별 동작 미리보기 (`sniff` `dig` `fetch` `ask` `sad`) |
| `/terry stats` | 오늘의 기록: 요청 수, 토큰, 가장 오래 걸린 요청, 테리가 달린 거리 |
| `/terry quad` · `/terry braille` | 그림 방식 바꾸기 (`/flame1` 도 같음) |
| `/terry help` | 사용법 |

테리는 평소엔 앉아 있다가, 입력을 시작하면 짖고, 치는 동안 꼬리를 흔들고, 엔터를 치면 응답이 끝날 때까지 달리고, 다 끝나면 헥헥거리고, 3분 동안 조용하면 졸아요. 하늘은 실제 시계를 따라 낮엔 해, 밤엔 달과 별이 뜨고, 날짜를 따라 봄엔 꽃잎, 여름밤엔 반딧불, 가을엔 낙엽, 겨울엔 눈이 내려요. 12/31 과 1/1 밤엔 불꽃놀이도 터져요.

### 색이 이상하게 보이면

테리가 청록색이나 보라색으로 보이거나 흙길이 회색이면, 터미널이 트루컬러를 알리지 않아 256색으로 줄여 그려진 것입니다. 셸 설정(`~/.bashrc` 등)에 아래 줄을 넣고 Claude Code 를 다시 켜 주세요.

```bash
export COLORTERM=truecolor
```

### Claude 밖에서 테리 보기

```bash
node docs/preview/terry-view.mjs run --slow=4   # 숫자 키로 동작, e 로 강도 바꾸기, q 끝내기
```

## jev

입력이 "기존 화면처럼 해 달라"(G-1)나 "직전 결과가 틀렸다"(G-3)인지 로컬 판정기로 0.1초에 가려, Claude 가 기준을 바꾸거나 추측으로 재시도하지 않게 짧은 알림을 넣습니다. Ollama(`bge-m3`)가 필요하고, 처음엔 기록만 하는 shadow 모드로 동작합니다.

```
/plugin install jev@d3nim-claude-mods
```

준비·모드·로그는 [`plugins/jev/README.md`](plugins/jev/README.md).

## 도구

- [`tools/paste-hotkey`](tools/paste-hotkey): SSH 로 붙어 쓰는 Claude Code 에 Alt+V 로 캡처 이미지를 붙여넣기 (SSH 를 여는 쪽 Windows PC 에 설치)
