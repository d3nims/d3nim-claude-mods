# paste-hotkey-install.ps1 — Alt+V 이미지 붙여넣기를 설치한다(로그인할 때마다 뒤에서 자동으로 켜짐).
#
#   리눅스 서버(예전 그대로):      powershell -ep Bypass -File paste-hotkey-install.ps1 -Server ddalkkak
#   집 Windows, WSL 의 Claude Code: powershell -ep Bypass -File paste-hotkey-install.ps1 -Server <Host> -Target WSL
#   집 Windows, Windows 의 Claude Code: ... -Server <Host> -Target Windows
#   글자 바꾸기:  ... -Key B        (Alt+B)
#   지우기: ... -Uninstall
#
# -Target  Linux   : 원격 ~/pasted-images 에 올리고 /home/.../pasted-images/파일 을 붙여넣는다.
#          Windows : 원격 %USERPROFILE%\pasted-images 에 올리고 C:\Users\...\pasted-images\파일 을 붙여넣는다.
#          WSL     : Windows 와 같은 곳에 올리고, WSL 에서 읽는 /mnt/c/Users/.../pasted-images/파일 을 붙여넣는다.
# 한 번에 하나만 켜진다. 다시 설치하면 돌고 있던 것을 끄고 새로 켠다. 예전 Ctrl+Alt+V 바로 가기가 있으면 지운다.
# 이 파일은 BOM이 있는 UTF-8이어야 한다.
param(
  [string]$Server = "ddalkkak",
  [ValidateSet("Linux", "Windows", "WSL")][string]$Target = "Linux",
  [string]$Key = "V",
  [switch]$Uninstall
)

$dir = Join-Path $env:USERPROFILE "ddalkkak-tools"
$script = Join-Path $dir "paste-hotkey.ps1"
$startupLink = Join-Path ([Environment]::GetFolderPath("Startup")) "딸깍 이미지 붙여넣기.lnk"
$oldLink = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\서버에 이미지 붙여넣기.lnk"

function Stop-Listener {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like "*paste-hotkey.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

Stop-Listener
Remove-Item $oldLink -ErrorAction SilentlyContinue
if ($Uninstall) {
  Remove-Item $startupLink -ErrorAction SilentlyContinue
  Write-Host "지웠습니다."
  exit 0
}

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
