# =========================================================
# أداة بناء ملف تثبيت نظام إدارة الرواتب المتكامل (EXE)
# Modern Windows Installer Builder (Powershell Automation)
# =========================================================

$ErrorActionPreference = "Stop"

# 1. إعداد التشفير واللغة العربية
[console]::InputEncoding = [System.Text.Encoding]::UTF8
[console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " جاري إعداد وبناء ملف التثبيت الاحترافي للنظام... " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# 2. تحديد مسار المشروع وأيقونة التطبيق
$PSScriptRoot = Get-Location
$iconPath = Join-Path $PSScriptRoot "app-icon.ico"
$assetsDir = Join-Path $PSScriptRoot "src/assets/images"

# 3. ابتكار الأيقونة (Converting Application Logo to Icon)
Write-Host "[+] جاري معالجة وتوليد أيقونة النظام الرسمية (app-icon.ico)..." -ForegroundColor Yellow

$logoPath = ""
if (Test-Path $assetsDir) {
    $found = Get-ChildItem -Path "$assetsDir/app_logo_*" -Include *.jpg,*.png,*.jpeg | Select-Object -First 1
    if ($found) {
        $logoPath = $found.FullName
    }
}

if (-not $logoPath -and (Test-Path (Join-Path $PSScriptRoot "public/manifest.json"))) {
    # احتياطي في حال لم يتم العثور على اللوجو المولد
    Write-Host "[-] لم يتم العثور على الشعار المولد في مجلد الصور. جاري البحث عن أي ملف صورة بديل..." -ForegroundColor Gray
    $foundAlt = Get-ChildItem -Path $PSScriptRoot -Recurse -Include *.jpg,*.png,*.jpeg | Where-Object { $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "dist" } | Select-Object -First 1
    if ($foundAlt) {
        $logoPath = $foundAlt.FullName
    }
}

if ($logoPath) {
    try {
        Write-Host "[+] جاري تحويل الشعار: $logoPath إلى أيقونة Windows..." -ForegroundColor Gray
        Add-Type -AssemblyName System.Drawing
        $bmp = New-Object System.Drawing.Bitmap($logoPath)
        
        # إنشاء نسخة مصغرة ممتازة 256x256
        $thumb = $bmp.GetThumbnailImage(256, 256, $null, [IntPtr]::Zero)
        $hIcon = $thumb.GetHicon()
        $icon = [System.Drawing.Icon]::FromHandle($hIcon)
        
        # حفظ الأيقونة
        $fileStream = New-Object System.IO.FileStream($iconPath, [System.IO.FileMode]::Create)
        $icon.Save($fileStream)
        $fileStream.Close()
        
        $thumb.Dispose()
        $bmp.Dispose()
        Write-Host "[+] تم إنشاء الأيقونة الرسمية بنجاح!" -ForegroundColor Green
    }
    catch {
        Write-Host "[!] تنبيه: فشل تحويل الأيقونة برمجياً. سيتم استخدام أيقونة افتراضية." -ForegroundColor Yellow
        # إنشاء ملف فارغ أو تجاوزه ليتم البناء بأيقونة افتراضية
    }
} else {
    Write-Host "[!] لم يتم العثور على أي صورة لتصميم الأيقونة. سيتم استخدام أيقونة افتراضية." -ForegroundColor Yellow
}

# 4. التحقق وتنزيل المجمع (Inno Setup Compiler - ISCC)
Write-Host ""
Write-Host "[+] التحقق من وجود مجمع الحزم Inno Setup لنظام Windows..." -ForegroundColor Yellow

# البحث عن مسارات التثبيت الافتراضية لـ Inno Setup
$isccPaths = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    (Join-Path $env:LocalAppData "Programs\Inno Setup 6\ISCC.exe")
)

$isccPath = ""
foreach ($path in $isccPaths) {
    if (Test-Path $path) {
        $isccPath = $path
        break
    }
}

# محاولة استخدام الأمر المباشر إذا كان مضافاً لـ PATH
if (-not $isccPath) {
    $whereResult = Get-Command iscc -ErrorAction SilentlyContinue
    if ($whereResult) {
        $isccPath = $whereResult.Source
    }
}

# تثبيته تلقائياً باستخدام winget في حال عدم وجوده
if (-not $isccPath) {
    Write-Host "[!] مجمع Inno Setup غير موجود على جهازك." -ForegroundColor Yellow
    Write-Host "[+] محاولة تثبيته تلقائياً وآمناً وبدون إزعاج عبر Windows Store (Winget)..." -ForegroundColor Yellow
    
    try {
        Start-Process winget -ArgumentList "install --id JRSoftware.InnoSetup --silent --accept-source-agreements --accept-package-agreements" -NoNewWindow -Wait
        
        # إعادة البحث مجدداً بعد التثبيت
        foreach ($path in $isccPaths) {
            if (Test-Path $path) {
                $isccPath = $path
                break
            }
        }
    }
    catch {
        Write-Host "[-] فشل التثبيت التلقائي." -ForegroundColor Red
    }
}

# 5. بناء التطبيق محلياً للتأكد من جاهزية ملفات dist
Write-Host ""
Write-Host "[+] جاري تشغيل بيئة بناء الواجهة (npm run build)..." -ForegroundColor Yellow
try {
    npm run build
    Write-Host "[+] تم بناء الملفات بنجاح وجاهزة للتعبئة." -ForegroundColor Green
}
catch {
    Write-Host "[!] تنبيه: فشل بناء ملفات الواجهة بنجاح. قد يحتاج العميل لتشغيل npm install أولاً." -ForegroundColor Yellow
}

# 6. التجميع النهائي
if ($isccPath) {
    Write-Host ""
    Write-Host "[+] تم العثور على مجمع Inno Setup: $isccPath" -ForegroundColor Green
    Write-Host "[+] جاري تجميع الملفات وبناء المعالج الإعدادي SalarySystemSetup.exe..." -ForegroundColor Yellow
    
    try {
        & $isccPath "installer.iss"
        Write-Host ""
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host " 🎉🎉 تم بناء برنامج التثبيت السحابي بنجاح! 🎉🎉" -ForegroundColor Green
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host "يمكنك الآن العثور على الملف التنفيذي النهائي في المجلد التالي:" -ForegroundColor Green
        Write-Host " -> $PSScriptRoot\InstallerOutput\SalarySystemSetup.exe" -ForegroundColor Cyan
        Write-Host "ملاحظة: هذا الملف يقوم بتثبيت النظام بنقرة واحدة، ويعطيه أيقونة على سطح المكتب، ويعمل صامتاً تماماً!" -ForegroundColor White
    }
    catch {
        Write-Host "[!] حدث خطأ أثناء خطوة التجميع النهائي." -ForegroundColor Red
        Write-Host "الرمز الخطأ: $_" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Yellow
    Write-Host " ℹ️ تم تحضير السكربتات والأيقونة والمشغلات بنجاح! ولكن..." -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Yellow
    Write-Host "لم نتمكن من العثور على برنامج Inno Setup لبناء ملف الـ EXE النهائي." -ForegroundColor LightYellow
    Write-Host "الرجاء اتباع هذه الخطوة البسيطة لإتمام بناء الملف التنفيذي بنفسك:" -ForegroundColor White
    Write-Host "1. قم بتنزيل البرنامج المجاني Inno Setup من: https://jrsoftware.org/isdownload.php" -ForegroundColor Cyan
    Write-Host "2. قم بتثبيته وتشغيله." -ForegroundColor Cyan
    Write-Host "3. افتح الملف المسمى (installer.iss) الموجود في هذا المجلد داخل البرنامج." -ForegroundColor Cyan
    Write-Host "4. اضغط على زر Build (أو مفتاح F9) وسيتم إنشاء المثبت لك فوراً في ثوانٍ معدودة!" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "اضغط على أي مفتاح للإغلاق..."
Read-Host
