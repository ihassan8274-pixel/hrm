@echo off
title إيقاف نظام إدارة الرواتب - Stop Salary Management System
chcp 65001 > nul

echo ==================================================
echo جاري إيقاف خادم نظام إدارة الرواتب...
echo Stopping Salary Management System Server...
echo ==================================================
echo.

:: البحث عن معرف العملية (PID) التي تستمع على منفذ 8090
set "srvpid="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /C:":8090 " ^| findstr "LISTENING"') do set "srvpid=%%a"

:: التحقق من أن العملية المالكة للمنفذ هي node.exe قبل أي taskkill /f
:: يمنع هذا توجيه الإنهاء إلى خدمة نظام ويندوز (مثال: iphlpsvc على المنفذ 8080)
set "srvimg="
if defined srvpid (
    for /f "tokens=1 delims=," %%b in ('tasklist /FI "PID eq %srvpid%" /FO CSV /NH 2^>nul') do set "srvimg=%%~b"
)

if not defined srvpid (
    echo [i] النظام غير نشط أو تم إيقاف الخادم بالفعل.
    echo [i] The server is not running or already stopped.
) else if /i not "%srvimg%"=="node.exe" (
    echo [!] تم رفض الإيقاف: العملية المالكة للمنفذ 8090 ليست node.exe - النوع المكتشف: "%srvimg%"
    echo [!] Stop refused: the process listening on port 8090 is not node.exe.
    echo [!] لم يتم إنهاء أي عملية. أوقف الخادم يدوياً بعد التأكد من نوع العملية.
) else (
    echo [+] تم العثور على خادم Node.js بالمعرف: %srvpid% - جاري الإغلاق...
    taskkill /f /pid %srvpid% >nul 2>&1
    echo [+] تم إيقاف نظام إدارة الرواتب بنجاح!
    echo [+] Server stopped successfully!
)

echo.
echo ==================================================
echo اضغط على أي مفتاح لإغلاق هذه النافذة...
pause > nul
