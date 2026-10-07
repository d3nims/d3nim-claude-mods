# paste-hotkey: Alt+V 로 원격 PC 에 이미지 붙여넣기

SSH 로 붙어 쓰는 Claude Code 에는 클립보드 이미지가 넘어가지 않습니다. 이 도구를 **SSH 를 여는 쪽 Windows PC**(예: 회사 PC)에 설치하면, Alt+V 를 누를 때 클립보드 이미지를 원격 PC 로 올리고 그 경로를 지금 창에 붙여넣어 줍니다. Claude Code 는 그 경로의 이미지를 읽습니다.

## 설치

1. 이 폴더의 `paste-hotkey.ps1`, `paste-hotkey-install.ps1` 을 같은 폴더에 받습니다.
2. 먼저 PowerShell 에서 `ssh <Host> echo ok` 가 **비밀번호 없이** 되는지 확인합니다(키 인증 필요).
3. 받는 쪽에 맞게 설치합니다.

```powershell
# 집 Windows PC, Claude Code 를 WSL 에서 씀 (dcm)
powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host> -Target WSL
# 집 Windows PC, Claude Code 를 Windows 에서 씀
powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host> -Target Windows
# 리눅스 서버 (예전 방식)
powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host>
```

### 단축키 두 개로 같이 쓰기

받는 쪽마다 단축키를 따로 설치하면 같이 돕니다. 한 집 PC 에서 WSL 의 Claude Code 와 Windows 의 Claude Code 를 둘 다 쓴다면:

```powershell
powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host> -Target WSL               # Alt+V
powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host> -Target Windows -Key B    # Alt+B
```

붙여넣을 경로가 Claude 가 도는 곳(WSL 이면 `/mnt/c/...`, Windows 면 `C:\...`)에 따라 달라서, 한 단축키로 둘 다 할 수는 없습니다. 이미지는 둘 다 같은 `pasted-images` 폴더에 쌓입니다.

`<Host>` 는 `~/.ssh/config` 의 이름이나 `사용자@주소` 를 그대로 써도 됩니다. 이미지는 받는 쪽의 `pasted-images` 폴더(Windows 는 `C:\Users\<사용자>\pasted-images`)에 쌓입니다.

## 쓰기

Win+Shift+S 로 캡처 → 붙여넣을 창(SSH 터미널) 클릭 → Alt+V

로그인할 때마다 뒤에서 자동으로 켜집니다. 다시 설치하면 돌고 있던 것을 끄고 새로 켜고, 한 번에 하나만 돕니다.

- 단축키 바꾸기: `-Key B` (Alt+B)
- 지우기: `-Uninstall` (그 단축키만, `-Key` 와 같이), `-Uninstall -All` (전부)
- 기록: `notepad $env:TEMP\ddalkkak-paste.log`

두 `.ps1` 파일은 BOM 있는 UTF-8 + CRLF 로 저장돼 있어야 Windows PowerShell 5.1 이 한글을 읽습니다(저장소의 `.gitattributes` 가 CRLF 를 지킵니다).
