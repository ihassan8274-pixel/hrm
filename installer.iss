; =========================================================
; ملف إعداد وتثبيت نظام إدارة الرواتب المتكامل
; Inno Setup Script for Salary Management System (HR & Payroll)
; =========================================================

#define AppName "نظام إدارة الرواتب"
#define AppEngName "Salary Management System"
#define AppVersion "1.0.0"
#define AppPublisher "Integrated Systems"
#define AppExeName "launcher.vbs"
#define AppIconName "app-icon.ico"

[Setup]
; معلومات التطبيق الأساسية
AppId={{D3F9CD22-FBBE-4CD0-B3B8-433E31FFECE8}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\SalaryManagementSystem
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=InstallerOutput
OutputBaseFilename=SalarySystemSetup
SetupIconFile={#AppIconName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes

[Languages]
; اللغات المدعومة للتثبيت بالترتيب (دعم كامل للغة العربية والإنجليزية)
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "إنشاء أيقونة على سطح المكتب (Create Desktop Shortcut)"; GroupDescription: "أيقونات إضافية:"; Flags: checkedonce

[Files]
; الملفات الأساسية والتشغيلية للنظام
Source: "launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop-app.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "server.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "tsconfig.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "vite.config.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "app-icon.ico"; DestDir: "{app}"; Flags: ignoreversion

; نسخ المجلدات والملفات الفرعية المهمة
Source: "dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

; نسخ ملف قاعدة بيانات الرواتب في أول مرة فقط (لمنع مسح بيانات المستخدم عند إعادة التثبيت أو التحديث)
Source: "payroll.db"; DestDir: "{app}"; Flags: onlyifdoesntexist

[Icons]
; اختصارات قائمة ابدأ وسطح المكتب للمشغل الصامت ومفتاح الإيقاف الإجباري للسيرفر
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppIconName}"
Name: "{group}\إيقاف خادم النظام (Stop Server)"; Filename: "{app}\stop-app.bat"; IconFilename: "{app}\{#AppIconName}"
Name: "{group}\إلغاء التثبيت (Uninstall)"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppIconName}"; Tasks: desktopicon

[Run]
; التثبيت والتهيئة التلقائية للمكتبات وبناء الواجهة مخفياً في الخلفية أثناء Progress Bar التثبيت
Filename: "cmd.exe"; Parameters: "/c npm install"; WorkingDir: "{app}"; StatusMsg: "جاري ربط وتثبيت مكتبات النظام اللازمة (سيتطلب برهة)..."; Flags: runhidden
Filename: "cmd.exe"; Parameters: "/c npm run build"; WorkingDir: "{app}"; StatusMsg: "جاري إعداد واجهة المستخدم وبناء الخادم الأساسي بشكل آمن..."; Flags: runhidden

; تشغيل البرنامج تلقائياً بعد اكتمال التثبيت بنجاح
Filename: "wscript.exe"; Parameters: """{app}\launcher.vbs"""; Description: "تشغيل نظام إدارة الرواتب فوراً (Run System Now)"; Flags: postinstall nowait skipifsilent
