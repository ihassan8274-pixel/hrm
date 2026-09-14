' ==========================================
' مشغل نظام إدارة الرواتب الصامت
' Salary Management System Silent Launcher
' ==========================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' الحصول على مسار دليل التطبيق
strScriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strScriptPath

' التحقق من وجود Node.js
On Error Resume Next
Set objExec = WshShell.Exec("node -v")
If Err.Number <> 0 Then
    MsgBox "خطأ: برنامج Node.js غير مثبت على هذا الجهاز." & vbCrLf & _
           "الرجاء تنزيل وتثبيت النسخة المستقرة (LTS) من الموقع الرسمي ليتم تشغيل النظام." & vbCrLf & _
           "سيتم فتح موقع التنزيل الآن.", 48, "نظام إدارة الرواتب"
    WshShell.Run "https://nodejs.org/"
    WScript.Quit
End If
On Error GoTo 0

' التحقق من تثبيت مكتبات النظام
If Not fso.FolderExists("node_modules") Then
    MsgBox "جاري تهيئة النظام وتثبيت بعض الملفات اللازمة لأول مرة." & vbCrLf & _
           "قد يستغرق ذلك دقيقة واحدة، الرجاء الانتظار...", 64, "نظام إدارة الرواتب"
    WshShell.Run "cmd /c npm install", 0, True
End If

' التحقق من بناء واجهة النظام
If Not fso.FolderExists("dist") Then
    WshShell.Run "cmd /c npm run build", 0, True
End If

' تشغيل الخادم في الخلفية بشكل صامت تماماً (بدون نافذة سوداء)
WshShell.Run "cmd /c set PORT=8090 && npm start", 0, False

' الانتظار لمدة ثانيتين لضمان إقلاع السيرفر بنجاح
WScript.Sleep 2500

' فتح النظام تلقائياً في المتصفح الافتراضي
WshShell.Run "cmd /c start http://localhost:8090", 0, False
