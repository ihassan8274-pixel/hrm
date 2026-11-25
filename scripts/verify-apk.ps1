Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk = Join-Path (Get-Location) 'android\app\build\outputs\apk\debug\app-debug.apk'
$item = Get-Item -LiteralPath $apk
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "APK: $($item.FullName)"
Write-Output "SIZE: $($item.Length)"
Write-Output "SHA256: $hash"

$css = (Get-ChildItem (Join-Path (Get-Location) 'dist\assets') -Filter 'index-*.css' | Select-Object -First 1).Name
$js  = (Get-ChildItem (Join-Path (Get-Location) 'dist\assets') -Filter 'index-*.js' | Select-Object -First 1).Name
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
  $names = $zip.Entries | ForEach-Object { $_.FullName }
  Write-Output "DIST_CSS: $css"
  Write-Output "DIST_JS: $js"
  Write-Output "HAS_CURRENT_CSS: $([bool]($names -contains "assets/public/assets/$css"))"
  Write-Output "HAS_CURRENT_JS: $([bool]($names -contains "assets/public/assets/$js"))"
  $wanted = @('assets/public/index.html','assets/public/sw.js','assets/public/m-manifest.json','assets/public/brand/empower-3d-icon.png')
  foreach ($name in $wanted) { Write-Output "ENTRY $name : $([bool]($names -contains $name))" }

  $swEntry = $zip.GetEntry('assets/public/sw.js')
  if ($swEntry) {
    $reader = New-Object System.IO.StreamReader($swEntry.Open())
    $sw = $reader.ReadToEnd(); $reader.Dispose()
    Write-Output "SW_V5: $($sw.Contains('tamkeen-mobile-shell-v5'))"
  }

  $bad = $false
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName -like 'assets/public/assets/*.js') {
      $reader = New-Object System.IO.StreamReader($entry.Open())
      $text = $reader.ReadToEnd(); $reader.Dispose()
      if ($text.Contains('Powered by RestoCost') -or $text.Contains('مدعوم من RestoCost')) { $bad = $true }
    }
  }
  Write-Output "BRANDING_REMOVED: $(-not $bad)"
} finally { $zip.Dispose() }
