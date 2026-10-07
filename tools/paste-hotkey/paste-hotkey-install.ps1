# paste-hotkey-install.ps1 — Alt+V 이미지 붙여넣기를 설치한다(로그인할 때마다 뒤에서 자동으로 켜짐).
#
#   리눅스 서버(예전 그대로):      powershell -ep Bypass -File paste-hotkey-install.ps1 -Server ddalkkak
#   집 Windows, WSL 의 Claude Code: powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host> -Target WSL
#   집 Windows, Windows 의 Claude Code: ... -Server <Host> -Target Windows
#   단축키:  ... -Key B        (Alt+B). 단축키마다 따로 설치되고 같이 돈다:
#            예) Alt+V → 집 PC WSL 의 Claude Code,  Alt+B → 집 PC Windows 의 Claude Code
#   지우기: ... -Uninstall            (그 단축키만)     ... -Uninstall -All   (전부)
#
# -Target  Linux   : 원격 ~/pasted-images 에 올리고 /home/.../pasted-images/파일 을 붙여넣는다.
#          Windows : 원격 %USERPROFILE%\pasted-images 에 올리고 C:\Users\...\pasted-images\파일 을 붙여넣는다.
#          WSL     : Windows 와 같은 곳에 올리고, WSL 에서 읽는 /mnt/c/Users/.../pasted-images/파일 을 붙여넣는다.
# 단축키마다 하나만 켜진다. 같은 단축키로 다시 설치하면 돌고 있던 것을 끄고 새로 켠다(다른 단축키는 건드리지 않음). 예전 Ctrl+Alt+V 바로 가기가 있으면 지운다.
# 이 파일은 BOM이 있는 UTF-8이어야 한다.
param(
  [string]$Server = "ddalkkak",
  [ValidateSet("Linux", "Windows", "WSL")][string]$Target = "Linux",
  [string]$Key = "V",
  [switch]$Uninstall,
  [switch]$All
)
$Key = $Key.ToUpper()

$dir = Join-Path $env:USERPROFILE "ddalkkak-tools"
$script = Join-Path $dir "paste-hotkey.ps1"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupLink = Join-Path $startupDir "딸깍 이미지 붙여넣기 (Alt+$Key).lnk"
$legacyLink = Join-Path $startupDir "딸깍 이미지 붙여넣기.lnk"          # 단축키 하나뿐이던 예전 설치
$oldLink = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\서버에 이미지 붙여넣기.lnk"

function Stop-Listener([string]$Which) {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like "*paste-hotkey.ps1*" -and ($Which -eq "" -or $_.CommandLine -match "-Key\s+$Which(\s|$)") } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

Remove-Item $oldLink -ErrorAction SilentlyContinue
# 예전 한-단축키 설치를 단축키 이름이 붙은 바로 가기로 옮긴다
if (Test-Path $legacyLink) {
  $legacy = (New-Object -ComObject WScript.Shell).CreateShortcut($legacyLink)
  $legacyKey = if ($legacy.Arguments -match "-Key\s+(\w)") { $Matches[1].ToUpper() } else { "V" }
  $moved = Join-Path $startupDir "딸깍 이미지 붙여넣기 (Alt+$legacyKey).lnk"
  if (-not (Test-Path $moved)) { Copy-Item $legacyLink $moved }
  Remove-Item $legacyLink -ErrorAction SilentlyContinue
}

if ($Uninstall) {
  if ($All) {
    Stop-Listener ""
    Get-ChildItem $startupDir -Filter "딸깍 이미지 붙여넣기*.lnk" | Remove-Item -ErrorAction SilentlyContinue
    Write-Host "모든 단축키를 지웠습니다."
  } else {
    Stop-Listener $Key
    Remove-Item $startupLink -ErrorAction SilentlyContinue
    Write-Host "Alt+$Key 를 지웠습니다."
  }
  exit 0
}
Stop-Listener $Key

$source = Join-Path $PSScriptRoot "paste-hotkey.ps1"
if (-not (Test-Path $source)) { Write-Host "같은 폴더에 paste-hotkey.ps1 이 필요합니다."; exit 1 }

Write-Host "원격($Server, $Target) 연결 확인 중…"
if ($Target -eq "Linux") {
  $answer = & ssh -o BatchMode=yes -o ConnectTimeout=10 $Server "mkdir -p -m 700 pasted-images && cd pasted-images && pwd" 2>&1
} else {
  # 원격 기본 셸이 cmd 든 PowerShell 이든 똑같이 돌게, 할 일을 -EncodedCommand 로 넘긴다.
  # 진행 표시를 끈다: 끄지 않으면 PowerShell 이 진행 기록(CLIXML)을 오류 출력으로 섞어 보낸다.
  $remoteScript = '$ProgressPreference = "SilentlyContinue"; $d = Join-Path $env:USERPROFILE "pasted-images"; New-Item -ItemType Directory -Force $d | Out-Null; (Resolve-Path $d).Path'
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remoteScript))
  $answer = & ssh -o BatchMode=yes -o ConnectTimeout=10 $Server "powershell -NoProfile -NonInteractive -EncodedCommand $encoded" 2>&1
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "원격에 접속하지 못했습니다: $answer"
  Write-Host "먼저 'ssh $Server echo ok' 가 되게 해야 합니다(~/.ssh/config 의 Host $Server)."
  exit 1
}
# 경로처럼 생긴 마지막 줄만 쓴다(인사말이나 경고가 섞여 와도 괜찮게).
$pattern = if ($Target -eq "Linux") { '^/' } else { '^[A-Za-z]:\\' }
$found = $answer | ForEach-Object { "$_".Trim() } | Where-Object { $_ -match $pattern } | Select-Object -Last 1
if (-not $found) { Write-Host "원격 폴더 경로를 알아내지 못했습니다: $answer"; exit 1 }

switch ($Target) {
  "Linux" {
    $remoteDir = $found; $pasteDir = $found; $winPath = ""
  }
  "Windows" {
    if ($found -notmatch '^[A-Za-z]:\\') { Write-Host "원격 폴더 경로를 알아내지 못했습니다: $found"; exit 1 }
    $remoteDir = $found -replace '\\', '/'; $pasteDir = $found; $winPath = " -WindowsPath"
  }
  "WSL" {
    if ($found -notmatch '^([A-Za-z]):\\(.*)$') { Write-Host "원격 폴더 경로를 알아내지 못했습니다: $found"; exit 1 }
    $remoteDir = $found -replace '\\', '/'
    $pasteDir = "/mnt/" + $Matches[1].ToLower() + "/" + ($Matches[2] -replace '\\', '/')
    $winPath = ""
  }
}

New-Item -ItemType Directory -Force $dir | Out-Null
if ((Resolve-Path $source).Path -ne (Join-Path $dir "paste-hotkey.ps1")) { Copy-Item $source $dir -Force }

$arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Server $Server -RemoteDir `"$remoteDir`" -PasteDir `"$pasteDir`"$winPath -Key $Key"
# 경로를 따옴표로 감쌀 때 역슬래시 바로 뒤에 따옴표가 오면 따옴표가 글자로 바뀌므로, 구분 글자는 따로 넘기지 않는다
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($startupLink)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = $arguments
$shortcut.WindowStyle = 7
$shortcut.Save()

Start-Process -FilePath $shortcut.TargetPath -ArgumentList $arguments -WindowStyle Hidden
Write-Host "설치했습니다: Alt+$Key  →  ${Server}:$remoteDir"
Write-Host ("붙여넣는 경로: " + $pasteDir + $(if ($winPath) { "\" } else { "/" }) + "<파일이름>")
Write-Host "사용: Win+Shift+S 로 캡처 → 붙여넣을 창 클릭 → Alt+$Key"
Write-Host "문제가 있으면: notepad `$env:TEMP\ddalkkak-paste.log"
