# paste-hotkey.ps1 — Alt+V: 클립보드의 이미지를 원격 PC 에 올리고, 그 경로를 지금 창에 붙여넣는다.
#
# 설치는 paste-hotkey-install.ps1 이 한다(로그인할 때 자동으로 뒤에서 켜짐).
# 시험 삼아 한 번만:
#   리눅스 서버:  powershell -STA -ep Bypass -File paste-hotkey.ps1 -Server ddalkkak -RemoteDir /home/ubuntu/pasted-images -Once
#   집 Windows (WSL 의 Claude Code 로):
#     powershell -STA -ep Bypass -File paste-hotkey.ps1 -Server home -RemoteDir C:/Users/me/pasted-images -PasteDir /mnt/c/Users/me/pasted-images -Once
#
# - 캡처(Win+Shift+S)한 이미지, 또는 탐색기에서 복사한 이미지 파일을 올린다.
# - RemoteDir 은 scp 로 올릴 곳, PasteDir 은 붙여넣을 경로 글자(받는 쪽에서 읽는 경로). 비우면 RemoteDir 그대로.
#   -WindowsPath 면 붙여넣는 경로를 역슬래시로 잇는다(C:\Users\...\파일).
# - 경로는 키보드로 치지 않고 붙여넣는다(Ctrl+V). 한/영 상태와 상관없이 들어간다.
# - 기록: %TEMP%\ddalkkak-paste.log
# 이 파일은 BOM이 있는 UTF-8이어야 한다(Windows PowerShell 5.1이 한글을 제대로 읽게).
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$RemoteDir,
  [string]$PasteDir = "",
  [switch]$WindowsPath,
  [string]$Key = "V",
  [switch]$Once
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DdkHotkey {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [StructLayout(LayoutKind.Sequential)]
  public struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int ptX; public int ptY; }
}
"@

if (-not $PasteDir) { $PasteDir = $RemoteDir }
$PasteSep = if ($WindowsPath) { "\" } else { "/" }
$logFile = Join-Path $env:TEMP "ddalkkak-paste.log"
function Write-Log([string]$Text) { Add-Content -Path $logFile -Encoding UTF8 -Value ("{0:MM-dd HH:mm:ss} {1}" -f (Get-Date), $Text) }
function Show-Message([string]$Text) { [System.Windows.Forms.MessageBox]::Show($Text, "원격 PC 에 이미지 붙여넣기") | Out-Null }

$imageExtensions = @(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")

function Send-Image {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $temp = $null
  if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $name = "paste-$stamp.png"
    $temp = Join-Path $env:TEMP $name
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    $image.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose()
    $local = $temp
  } elseif ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
    $file = [System.Windows.Forms.Clipboard]::GetFileDropList() | Select-Object -First 1
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    if ($imageExtensions -notcontains $ext) { Show-Message "복사한 파일이 이미지가 아닙니다: $file"; return }
    $name = "paste-$stamp$ext"
    $local = $file
  } else {
    Show-Message "클립보드에 이미지가 없습니다.`nWin+Shift+S 로 캡처한 뒤 Alt+$Key 를 누르세요."
    return
  }

  # 받는 쪽이 Windows 여도 scp 대상은 C:/Users/... 처럼 슬래시로 쓴다(Windows OpenSSH 가 알아듣는다).
  $output = & scp -q -o BatchMode=yes -o ConnectTimeout=10 $local "${Server}:$RemoteDir/$name" 2>&1
  $code = $LASTEXITCODE
  if ($temp) { Remove-Item $temp -ErrorAction SilentlyContinue }
  if ($code -ne 0) {
    Write-Log "업로드 실패 exit=$code $output"
    Show-Message "업로드 실패 (exit $code)`n$output`n`nPowerShell 에서 'ssh $Server echo ok' 가 되는지 확인하세요."
    return
  }

  $pasted = "$PasteDir$PasteSep$name"
  [System.Windows.Forms.Clipboard]::SetText($pasted)
  # Alt 를 뗄 때까지 기다린다. 누른 채로 Ctrl+V 를 보내면 Ctrl+Alt+V 가 된다.
  for ($i = 0; $i -lt 100 -and ([DdkHotkey]::GetAsyncKeyState(0x12) -band 0x8000); $i++) { Start-Sleep -Milliseconds 20 }
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Write-Log "올림 ${Server}:$RemoteDir/$name → 붙여넣음 $pasted"
}

if ($Once) { Send-Image; exit 0 }

# 한 번만 켜져 있게 한다.
$mutex = New-Object System.Threading.Mutex($false, "Local\DdalkkakPasteHotkey")
if (-not $mutex.WaitOne(0)) { exit 0 }

$MOD_ALT = 0x1; $MOD_NOREPEAT = 0x4000; $WM_HOTKEY = 0x0312
$vk = [int][char]$Key.ToUpper()
if (-not [DdkHotkey]::RegisterHotKey([IntPtr]::Zero, 1, $MOD_ALT -bor $MOD_NOREPEAT, $vk)) {
  Write-Log "단축키 등록 실패 Alt+$Key"
  Show-Message "Alt+$Key 를 다른 프로그램이 이미 쓰고 있습니다. 설치할 때 -Key 로 다른 글자를 고르세요."
  exit 1
}
Write-Log "대기 시작 Alt+$Key → ${Server}:$RemoteDir (붙여넣는 경로 $PasteDir)"
$msg = New-Object DdkHotkey+MSG
while ([DdkHotkey]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0) -gt 0) {
  if ($msg.message -eq $WM_HOTKEY) {
    try { Send-Image } catch { Write-Log "오류 $_"; Show-Message "오류: $_" }
  }
}
