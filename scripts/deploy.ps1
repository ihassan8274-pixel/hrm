<#
.SYNOPSIS
  نشر نظام HR Payroll على خادم Oracle بضغطة واحدة.
.DESCRIPTION
  يتحقق من الكود، يبني dist، يعمل نسخة احتياطية على الخادم، يرفع الملفات،
  يستبدل dist، يعيد تشغيل PM2 ويفحص الصحة. مع تراجع تلقائي عند الفشل.
  لا يضيف موظفين ولا يلمس بيانات الإنتاج. لا يعمل git commit / push.
.PARAMETER SkipVerify
  تخطي lint/test/build (لا تنصح به).
.PARAMETER NoPrototypes
  عدم رفع ملفات المعاينة HTML إلى المجلد الخاص غير العام.
.PARAMETER NoRestart
  رفع الملفات فقط بدون تبديل dist ولا إعادة تشغيل PM2.
.PARAMETER Rollback
  استعادة آخر نسخة احتياطية dist والعودة إليها.
.EXAMPLE
  .\scripts\deploy.ps1
  .\scripts\deploy.ps1 -Rollback
#>
[CmdletBinding()]
param(
  [switch]$SkipVerify,
  [switch]$NoPrototypes,
  [switch]$NoRestart,
  [switch]$Rollback
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ---- إعدادات الخادم (لا كلمات مرور هنا؛ بيانات الاتصال من .env على الخادم) ----
$HostName   = '145.241.109.15'
$User       = 'ubuntu'
$Remote     = '/opt/hr-payroll'
$PM2Name    = 'hr-payroll'
$Target     = "$User@$HostName"
$Key        = Join-Path $env:USERPROFILE '.ssh\oracle_restocost'
$Repo       = Split-Path -Parent $PSScriptRoot
$Ts         = Get-Date -Format 'yyyyMMdd-HHmmss'

function Test-LastOk {
  if ($LASTEXITCODE -ne 0) { throw "فشل الأمر الاخير برمز الخروج $LASTEXITCODE" }
}

function Invoke-Remote {
  param([Parameter(Mandatory=$true)][string]$Script)
  # كتابة السكربت في ملف ثم رفعه: يتجنب مشاكل CRLF واقتباس PowerShell مع bash
  $id = [guid]::NewGuid().ToString('N')
  $localFile = Join-Path $env:TEMP "hr-remote-$id.sh"
  $remoteFile = "/tmp/hr-remote-$id.sh"
  [System.IO.File]::WriteAllText($localFile, ($Script -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
  try {
    & scp.exe -i $Key -o StrictHostKeyChecking=no -o BatchMode=yes $localFile "${Target}:$remoteFile"
    Test-LastOk
    $cmd = 'bash {0}; rc=$?; rm -f {0}; exit $rc' -f $remoteFile
    & ssh.exe -i $Key -o StrictHostKeyChecking=no -o BatchMode=yes $Target $cmd
    Test-LastOk
  }
  finally {
    Remove-Item $localFile -Force -ErrorAction SilentlyContinue
  }
}

function Write-Step {
  param([string]$Text)
  Write-Host "`n==> $Text" -ForegroundColor Cyan
}

# ---- فحص المتطلبات ----
foreach ($exe in @('ssh.exe','scp.exe')) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "غير موجود: $exe" }
}
if (-not (Test-Path $Key)) { throw "مفتاح SSH غير موجود: $Key" }
if (-not (Test-Path (Join-Path $Repo 'package.json'))) { throw "لم يتم العثور على المشروع في: $Repo" }

# ---- استعادة ----
if ($Rollback) {
  Write-Step 'استعادة آخر نسخة احتياطية على الخادم'
  Invoke-Remote @'
set -e
cd /opt/hr-payroll
LATEST=$(ls -1 backups/dist-*.tar.gz 2>/dev/null | tail -1)
[ -n "$LATEST" ] || { echo "لا توجد نسخة احتياطية"; exit 1; }
rm -rf dist.rollback
mv dist dist.rollback
tar xzf "$LATEST" -C /opt/hr-payroll
pm2 restart hr-payroll >/dev/null
sleep 4
curl -fsS http://127.0.0.1:8090/api/health
echo
echo "تمت الاستعادة من: $LATEST"
'@
  Write-Host 'تمت الاستعادة.' -ForegroundColor Green
  exit 0
}

# ---- التحقق والبناء محلياً ----
Push-Location $Repo
try {
  if ($SkipVerify) {
    Write-Step 'build فقط (تم تخطي التحقق)'
    & npm run build
  } else {
    Write-Step 'lint + test + drift + env + build'
    & npm run verify
  }
  Test-LastOk

  # ---- تجهيز الخادم ----
  Write-Step "نسخ احتياطي وتجهيز dist.new ($Ts)"
  Invoke-Remote (@'
set -e
cd /opt/hr-payroll
mkdir -p backups
tar czf "backups/dist-__TS__.tar.gz" dist
rm -rf dist.new
mkdir -p dist.new
echo "BACKUP backups/dist-__TS__.tar.gz"
'@ -replace '__TS__', $Ts)

  # ---- رفع dist (أرشيف واحد لتجنب انقطاع scp مع عشرات الملفات) ----
  Write-Step 'رفع dist'
  $archive = Join-Path $env:TEMP "hr-dist-$Ts.tar.gz"
  Push-Location (Join-Path $Repo 'dist')
  try {
    & tar.exe -czf $archive .
    Test-LastOk
  }
  finally { Pop-Location }
  & scp.exe -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $archive "${Target}:${Remote}/dist-upload-$Ts.tar.gz"
  Test-LastOk
  Invoke-Remote (@'
set -e
cd /opt/hr-payroll
tar xzf "dist-upload-__TS__.tar.gz" -C dist.new
rm -f "dist-upload-__TS__.tar.gz"
'@ -replace '__TS__', $Ts)
  Remove-Item $archive -Force -ErrorAction SilentlyContinue

  # ---- رفع ملفات PostgreSQL (idempotent) ----
  Write-Step 'رفع migrations'
  $sqlDir = Join-Path $Repo 'server\db\postgres'
  Get-ChildItem -Path $sqlDir -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
    & scp.exe -i $Key -o StrictHostKeyChecking=no $_.FullName "${Target}:${Remote}/server/db/postgres/"
    Test-LastOk
  }

  # ---- رفع المعاينات إلى مجلد خاص غير عام ----
  if (-not $NoPrototypes) {
    Write-Step 'رفع ملفات المعاينة إلى مجلد خاص (غير متاح للعموم)'
    Invoke-Remote 'mkdir -p /opt/hr-payroll/private-prototypes && chmod 700 /opt/hr-payroll/private-prototypes'
    & scp.exe -i $Key -o StrictHostKeyChecking=no `
        (Join-Path $Repo 'RBAC_PROTOTYPE.html') `
        (Join-Path $Repo 'SALARY_XLSX_PREVIEW.html') `
        (Join-Path $Repo 'FORMS_TEMPLATES_PREVIEW.html') `
        (Join-Path $Repo 'NAV_MENU_PREVIEW.html') `
        (Join-Path $Repo 'SYSTEM_DESIGN_PREVIEW.html') `
        (Join-Path $Repo 'TAMKEEN_AUTH_SCREEN_MODELS.html') `
        (Join-Path $Repo 'TRAINING_INDEX.html') `
        (Join-Path $Repo 'TRAINING_EMPLOYEE.html') `
        (Join-Path $Repo 'TRAINING_HR.html') `
        (Join-Path $Repo 'TRAINING_FINANCE.html') `
        (Join-Path $Repo 'TRAINING_SETTINGS.html') `
        "${Target}:${Remote}/private-prototypes/"
    Test-LastOk
    Invoke-Remote 'chmod 600 /opt/hr-payroll/private-prototypes/*.html'
  }
}
finally {
  Pop-Location
}

if ($NoRestart) {
  Write-Host 'تم الرفع إلى dist.new فقط — لم يتم التبديل ولا إعادة التشغيل.' -ForegroundColor Yellow
  exit 0
}

# ---- التبديل وإعادة التشغيل مع فحص وتراجع ----
Write-Step 'تبديل dist وإعادة تشغيل PM2'
$swapScript = @'
set -e
cd /opt/hr-payroll
rm -rf dist.prev
mv dist dist.prev
mv dist.new dist
pm2 restart hr-payroll >/dev/null
sleep 4
curl -fsS http://127.0.0.1:8090/api/health
echo
curl -fsS http://127.0.0.1:8090/api/ready
echo
'@
$ok = $true
try {
  Invoke-Remote $swapScript
} catch {
  $ok = $false
  Write-Warning "فشل النشر: $_"
  Write-Step 'تراجع تلقائي'
  Invoke-Remote @'
set -e
cd /opt/hr-payroll
if [ -d dist.prev ]; then
  rm -rf dist.rollback
  mv dist dist.rollback
  mv dist.prev dist
  pm2 restart hr-payroll >/dev/null
  sleep 4
  curl -fsS http://127.0.0.1:8090/api/health
fi
'@
}
if (-not $ok) { throw 'تم التراجع عن النشر. راجع السجلات.' }

# ---- فحص عام وتقرير ----
Write-Step 'فحص الرابط العام وعدد الموظفين'
try {
  $health = Invoke-RestMethod -Uri 'https://hr.restocost.shop/api/health' -TimeoutSec 20
  Write-Host "public health: $($health.status)"
} catch {
  Write-Warning "فحص الرابط العام فشل: $_"
}
Invoke-Remote @'
set -a
. <(sed '1s/^\xEF\xBB\xBF//' /opt/hr-payroll/.env)
set +a
printf 'employees: '
psql "$DATABASE_URL" -tAc "select count(*) from payroll.employees"
pm2 list | grep hr-payroll || true
'@

Write-Host "`nتم النشر بنجاح: $Ts" -ForegroundColor Green
Write-Host 'للتراجع: .\scripts\deploy.ps1 -Rollback' -ForegroundColor DarkGray
