# usage-meter: installs the Lode Cells font for /terry font (Windows, for the current user; no administrator needed)
# and adds it to WaveTerm's terminal fonts. Restart WaveTerm afterwards (its open terminals close with it).
#
#   irm https://raw.githubusercontent.com/d3nims/d3nim-claude-mods/main/plugins/usage-meter/fonts/install-font.ps1 | iex
#
# The glyphs are cut for WaveTerm's own font (Hack) at size 14: a cell 8 x 16 pixels, at 100% display scaling.
# Each font version matches the plugin's glyph tables (hooks/lode-glyphs.js, terry-glyphs.js): bump $Version with them.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$Version = '7.0'
$Url = 'https://raw.githubusercontent.com/d3nims/d3nim-claude-mods/main/plugins/usage-meter/fonts/LodeCells.ttf'
$Dir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
$Dest = Join-Path $Dir "LodeCells-$Version.ttf"
$Key = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
$Name = 'Lode Cells (TrueType)'

function Say($text) { Write-Host "  $text" }
Write-Host 'Lode Cells font for usage-meter /terry font'

# 1. the font file: next to this script when run from a copy of the repository, else downloaded
if (Test-Path $Dest) {
  Say "already installed: $Dest"
} else {
  $here = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'LodeCells.ttf' } else { $null }
  if ($DryRun) { Say "would install $Dest" }
  else {
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    if ($here -and (Test-Path $here)) { Copy-Item $here $Dest }
    else {
      Say 'downloading the font (8 MB)...'
      Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Dest
    }
    Say "installed: $Dest"
  }
}

# 2. registered for this user, under the family name the terminal asks for
if ($DryRun) { Say "would register '$Name' -> $Dest" }
else {
  New-ItemProperty -Path $Key -Name $Name -Value $Dest -PropertyType String -Force | Out-Null
  Say "registered: $Name"
}

# 2b. told to Windows the way its own installer does, so programs started from now on (and ones listening) see it
if (-not $DryRun) {
  Add-Type -Namespace LodeCells -Name Win -MemberDefinition @'
[DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResourceW(string file);
[DllImport("user32.dll")] public static extern IntPtr SendMessageTimeoutW(IntPtr hWnd, uint msg, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr result);
'@
  [void][LodeCells.Win]::AddFontResourceW($Dest)
  $r = [IntPtr]::Zero
  [void][LodeCells.Win]::SendMessageTimeoutW([IntPtr]0xffff, 0x1D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$r) # WM_FONTCHANGE to all
}

# 3. older versions removed (one a running terminal still holds stays until it closes; run this again then)
foreach ($old in Get-ChildItem -Path $Dir -Filter 'LodeCells*.ttf' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $Dest }) {
  if ($DryRun) { Say "would remove old $($old.Name)" }
  else {
    try { Remove-Item $old.FullName -ErrorAction Stop; Say "removed old $($old.Name)" }
    catch { Say "old $($old.Name) is in use; close WaveTerm and run this again to remove it" }
  }
}

# 4. WaveTerm: Lode Cells after its own font, which draws all ordinary text
$settings = Join-Path $env:USERPROFILE '.config\waveterm\settings.json'
if (Test-Path $settings) {
  $json = Get-Content -Raw -Encoding UTF8 $settings | ConvertFrom-Json
  $family = $json.'term:fontfamily'
  if ($family -and $family -match 'Lode Cells') { Say "WaveTerm already lists it: $family" }
  else {
    $next = if ($family) { "$family, Lode Cells" } else { 'Hack, Lode Cells' }
    if ($DryRun) { Say "would set WaveTerm term:fontfamily to: $next" }
    else {
      Copy-Item $settings "$settings.bak-lodecells" -Force
      $json | Add-Member -NotePropertyName 'term:fontfamily' -NotePropertyValue $next -Force
      [IO.File]::WriteAllText($settings, ($json | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding $false))
      Say "WaveTerm term:fontfamily: $next (backup: settings.json.bak-lodecells)"
    }
  }
  $size = $json.'term:fontsize'
  if ($size -and $size -ne 14) { Say "note: WaveTerm term:fontsize is $size; the picture is drawn for 14" }
  if ($family -and $family -notmatch '^\s*Hack') { Say "note: the picture is drawn for Hack (WaveTerm's own font); with $family it may show gaps" }
} elseif (Test-Path (Split-Path $settings)) {
  if ($DryRun) { Say "would create WaveTerm settings with term:fontfamily: Hack, Lode Cells" }
  else {
    [IO.File]::WriteAllText($settings, "{`n  `"term:fontfamily`": `"Hack, Lode Cells`"`n}`n", (New-Object Text.UTF8Encoding $false))
    Say 'WaveTerm term:fontfamily: Hack, Lode Cells (new settings.json)'
  }
} else {
  Say "WaveTerm settings not found ($settings): add 'Lode Cells' after your terminal's font yourself"
}

# 5. a running WaveTerm read its fonts when it started: it has to be quit (every window) and started again
$running = Get-Process -Name 'Wave' -ErrorAction SilentlyContinue
Write-Host ''
if ($running) { Write-Host 'WaveTerm is running: quit it completely (every window; no Wave left in Task Manager) and start it again.' }
Write-Host 'Done. Restart WaveTerm (its open terminals close), then type /terry font in Claude Code.'
Write-Host 'Boxes or question marks instead of Terry: the font is not picked up; /terry braille goes back.'
