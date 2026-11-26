// Route module. Registered from server/index.ts; the order there is the route order.
import { createNotification, execute, logAction, queryAll, queryOne } from "../config/postgres";
import { getAI } from "../services/ai";
import express from "express";
import { log } from "../lib/logger";

export function registerAi(app: express.Express) {

    // ==========================================
    // 10. SAUDI LABOR LAW AI CONSULTANT (المستشار القانوني الذكي)
    // ==========================================

  app.post('/api/ai/labor-law-consultant', async (req, res) => {
    const { question, context } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'يرجى كتابة السؤال القانوني' });
    }
    const ai = getAI();
    let aiResponse = '';
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `أنت المستشار القانوني المتخصص والخبير في نظام العمل السعودي واللوائح التنفيذية وقرارات وزارة الموارد البشرية والتنمية الاجتماعية وقواعد التأمينات الاجتماعية (GOSI).
  أجب على استفسار الموارد البشرية باللغة العربية بأسلوب رسمي، احترافي، دقيق وقانوني موثق بأرقام المواد النظامية ذات الصلة، مع تقديم خطوات أو حسابات عملية إن تطلب الأمر.
  السؤال:
  ${question}
  ${context ? `معلومات إضافية عن الحالة: ${JSON.stringify(context)}` : ''}
  قم بتنظيم الإجابة مع عناوين واضحة:
  1. الخلاصة القانونية المباشرة
  2. السند النظامي من مواد نظام العمل السعودي
  3. الشروط والإجراءات الواجب اتباعها
  4. أمثلة أو توجيهات عملية لحماية المنشأة والموظف`
        });
        aiResponse = response.text || '';
      } catch (err) {
        log.error("Gemini API error in consultant:", err);
      }
    }
    if (!aiResponse) {
      const q = question.toLowerCase();
      if (q.includes('نهاية الخدمة') || q.includes('مكافأة') || q.includes('84') || q.includes('85')) {
        aiResponse = `### الخلاصة القانونية لمكافأة نهاية الخدمة:
  وفقاً للمادتين (84) و (85) من نظام العمل السعودي:
  1. **في حال انتهاء العقد أو إنهاء الخدمة من صاحب العمل (المادة 84)**:
   - يستحق الموظف أجر نصف شهر عن كل سنة من السنوات الخمس الأولى.
   - يستحق أجر شهر كامل عن كل سنة تالية بعد السنوات الخمس الأولى.
   - تؤخذ كسور السنة بنسبة ما قضاه منها في العمل، وتحسب على أساس **الأجر الأخير الفعلي** (الأساسي + السكن + البدلات الثابتة).
  2. **في حال استقالة الموظف (المادة 85)**:
   - خدمة أقل من سنتين: لا يستحق مكافأة.
   - خدمة من سنتين إلى 5 سنوات: يستحق **ثلث (1/3)** المكافأة.
   - خدمة من 5 سنوات إلى 10 سنوات: يستحق **ثلثي (2/3)** المكافأة.
   - خدمة 10 سنوات فأكثر: يستحق **المكافأة كاملة (100%)**.
  3. **استثناءات الاستحقاق الكامل عند الاستقالة**:
   - ترك العاملة للعمل خلال 6 أشهر من عقد زواجها أو 3 أشهر من تاريخ وضعها.
   - ترك العمل بسبب قوة قاهرة خارجة عن إرادة العامل.`;
      } else if (q.includes('مادة 77') || q.includes('فصل') || q.includes('إنهاء غير مشروع') || q.includes('تعويض')) {
        aiResponse = `### أحكام المادة (77) من نظام العمل (التعويض عن الإنهاء لسبب غير مشروع):
  إذا أُنهي العقد لسبب غير مشروع كان للطرف الذي أصابه الضرر الحق في تعويض:
  1. **العقود غير محددة المدة (للسعوديين)**:
   - أجر 15 يوماً عن كل سنة من سنوات خدمة العامل.
  2. **العقود محددة المدة**:
   - أجر المدة المتبقية من العقد.
  3. **الحد الأدنى للتعويض**:
   - يجب ألا يقل التعويض عن أجر العامل لمدة **شهران (60 يوماً)** في الحالتين.
  4. **شروط التطبيق**:
   - يطبق هذا التعويض ما لم يتضمن عقد العمل تعويضاً محدداً منصوصاً عليه في بنوده.`;
      } else if (q.includes('مادة 80') || q.includes('فصل بدون مكافأة') || q.includes('مخالفة جسيمة')) {
        aiResponse = `### المادة (80) - إنهاء العقد بدون إشعار أو مكافأة نهاية خدمة:
  يجوز لصاحب العمل فسخ العقد دون مكافأة أو إشعار أو تعويض في 9 حالات حصرية محددة نظاماً:
  1. الاعتداء على صاحب العمل أو المدير أثناء العمل أو بسببه.
  2. عدم أداء الالتزامات الجوهرية المترتبة على العقد أو عدم إطاعة الأوامر المشروعة عمداً بعد إنذار كتابي.
  3. ثبوت ارتكاب العامل سلوكاً سيئاً أو عملاً مخلاً بالشرف أو الأمانة.
  4. ارتكاب فعل أو تقصير عمداً بقصد إلحاق خسارة مادية جسيمة بصاحب العمل بشرط إبلاغ الجهات المختصة خلال 24 ساعة.
  5. لجوء العامل للتزوير للحصول على العمل.
  6. إذا كان العامل معيناً تحت الاختبار (فترة التجربة).
  7. الغياب دون سبب مشروع أكثر من 30 يوماً متقطعة خلال السنة الواحدة (إنذار بعد 20 يوماً) أو أكثر من 15 يوماً متتالية (إنذار بعد 10 أيام).
  8. إفشاء الأسرار الصناعية أو التجارية للعمل.
  9. استغلال المركز الوظيفي بطريقة غير مشروعة لتحقيق مكاسب شخصية.`;
      } else if (q.includes('تجربة') || q.includes('53') || q.includes('فترة التجربة')) {
        aiResponse = `### ضوابط فترة التجربة وفق المادة (53) من نظام العمل:
  1. **المدة الأصلية**: يجب ألا تزيد فترة التجربة المنصوص عليها في العقد عن **90 يوماً**.
  2. **التمديد**: يجوز باتفاق كتابي صريح بين الطرفين تمديد فترة التجربة إلى مدة لا تتجاوز **180 يوماً**.
  3. **أيام الإجازات**: لا تدخل إجازتا عيدي الفطر والأضحى والإجازة المرضية في حساب فترة التجربة.
  4. **حق الإنهاء**: لأي من الطرفين الحق في إنهاء العقد خلال فترة التجربة ما لم يتضمن العقد نصاً يمنح الحق لأحدهما فقط.
  5. **المكافأة والتعويض**: لا يستحق أي من الطرفين تعويضاً أو مكافأة نهاية خدمة عن الإنهاء خلال فترة التجربة.`;
      } else if (q.includes('إجازة') || q.includes('سنوية') || q.includes('109') || q.includes('رصيد')) {
        aiResponse = `### حقوق الإجازات السنوية وفق المادة (109) من نظام العمل:
  1. **مدة الإجازة السنوية**:
   - تستحق إجازة سنوية بأجر كامل لا تقل عن **21 يوماً** عن كل عام.
   - تزداد إلى **30 يوماً** إذا أمضى العامل في خدمة صاحب العمل **5 سنوات متصلة**.
  2. **الأجر أثناء الإجازة**: يدفع أجر الإجازة مقدماً قبل القيام بها مع كامل البدلات.
  3. **التأجيل والترحيل**:
   - يجوز تأجيل الإجازة لسنة واحدة بموافقة العامل.
   - لا يجوز التنازل عن الإجازة أو تقاضي بدل نقدي عنها أثناء الخدمة إلا عند انتهاء العقد.
  4. **التعويض عند ترك الخدمة (المادة 111)**:
   - يستحق العامل أجراً عن أيام الإجازة المستحقة له عن كسور السنة غير المستخدمة.`;
      } else if (q.includes('إضافي') || q.includes('ساعات') || q.includes('107') || q.includes('رمضان') || q.includes('98')) {
        aiResponse = `### ساعات العمل والعمل الإضافي (المادتان 98 و 107):
  1. **ساعات العمل الأصلية (المادة 98)**:
   - 8 ساعات يومياً أو 48 ساعة أسبوعياً كحد أقصى.
   - تخفض خلال **شهر رمضان المبارك** للمسلمين إلى **6 ساعات يومياً أو 36 ساعة أسبوعياً**.
  2. **احتساب أجر الساعات الإضافية (المادة 107)**:
   - يستحق العامل عن كل ساعة عمل إضافية: **أجر الساعة الأساسي + 50% من أجره الأساسي (إجمالي 150%)**.
   - ساعات العمل في أيام العطلات والأعياد الرسمية تعتبر بالكامل ساعات إضافية.`;
      } else {
        aiResponse = `### استشارة نظام العمل السعودي:
  استناداً إلى نظام العمل الصادر بالمرسوم الملكي رقم (م/51) وتعديلاته واللوائح التنفيذية لوزارة الموارد البشرية والتنمية الاجتماعية:
  - تسري كافة العقود واللوائح بما يضمن حقوق الطرفين وتوثيق العقود عبر منصة **قوى**.
  - يخضع احتساب الرواتب والبدلات لنظام حماية الأجور (منصة **مدد**).
  - يتطلب إنهاء العقود غير محددة المدة إشعاراً كتابياً مسبقاً بمدة لا تقل عن 60 يوماً للمعينين براتب شهري (المادة 75).
  - يمكنكم استخدام الحاسبات التلقائية المتوفرة بالنظام (مكافأة نهاية الخدمة، العمل الإضافي، رصيد الإجازات، وتكلفة الموظف) للحصول على أدق النتائج الحسابية.`;
      }
    }
    res.json({
      answer: aiResponse,
      timestamp: new Date().toISOString()
    });
  });

    // ==========================================
    // 16. AI HR LETTERS & OFFICIAL NOTICES STUDIO (استوديو الخطابات الإدارية الذكي)
    // ==========================================

  app.get('/api/ai/hr-letters', async (req, res) => {
    const letters = await queryAll(`
      SELECT l.*, e.name as employee_name, e.position as job_title, e.national_id_iqama
      FROM hr_generated_letters l
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.created_at DESC
    `);
    res.json(letters);
  });

  app.post('/api/ai/hr-letter-generator', async (req, res) => {
    const {
      employee_id, letter_type, custom_notes, effective_date,
      target_role, salary_increase_amount, addressed_to
    } = req.body;

    // الواجهة ترسل معرّفات قوالبها، والخادم يعرف قوالبه بأسماء أخرى.
    // التوحيد هنا يمنع أن يقع الخطاب في القالب العام بلا معنى.
    const LETTER_TYPE_ALIASES: Record<string, string> = {
      salary_certificate: 'salary_certificate',
      experience_certificate: 'experience_certificate',
      art75_notice: 'contract_non_renewal',
      art77_termination: 'termination_art77',
      art80_termination: 'termination_art80',
      promotion_decision: 'promotion',
      warning_letter: 'warning',
      delegation_order: 'delegation',
    };
    const resolvedType = LETTER_TYPE_ALIASES[letter_type] || letter_type;

    // اسم المنشأة الحقيقي — لا اسم شركة مخترع في نص الخطاب.
    const brandRow = (await queryOne("SELECT value FROM settings WHERE key = 'org_name'")) as any;
    const orgName = (brandRow?.value || '').trim() || 'إدارة الموارد البشرية';

    const emp = await queryOne(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.id = ?
    `, employee_id) as any;
    if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
    const letterId = `LTR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const dateStr = effective_date || new Date().toISOString().split('T')[0];
    const letterTypeTitles: Record<string, string> = {
      promotion: 'قرار ترقية وتعديل مسمى وظيفي',
      warning: 'إنذار كتابي رسمي ولفت نظر إداري',
      termination_art77: 'إشعار إنهاء عقد العمل لسبب مشروع (المادة 77)',
      termination_art80: 'قرار فسخ عقد العمل بموجب المادة (80)',
      contract_non_renewal: 'إشعار بعدم الرغبة في تجديد عقد العمل (المادة 75)',
      salary_increment: 'قرار زيادة الراتب ومكافأة تميز',
      salary_certificate: 'شهادة تعريف بالراتب موثقة',
      experience_certificate: 'شهادة خبرة وخدمة معتمدة',
      delegation: 'قرار تفويض صلاحيات ومهام إدارية'
    };
    const title = letterTypeTitles[resolvedType] || 'خطاب إداري رسمي';
    let generatedContent = '';
    const ai = getAI();
    if (ai) {
      try {
        const prompt = `أنت مدير إدارة الموارد البشرية والشؤون القانونية في المملكة العربية السعودية.
  اكتب صيغة خطاب إداري رسمي فائق الاحترافية، متوافقاً تماماً مع نظام العمل السعودي واللوائح التنفيذية لوزارة الموارد البشرية.
  نوع الخطاب: ${title} (${letter_type})
  بيانات الموظف:
  - الاسم: ${emp.name}
  - المسمى الوظيفي: ${emp.position || emp.job_title || 'موظف'}
  - الهوية / الإقامة: ${emp.national_id_iqama || 'سجل رسمي'}
  - الإدارة: ${emp.department_name || 'عام'}
  - الفرع: ${emp.branch_name || 'الرئيسي'}
  - تاريخ السريان / النفاذ: ${dateStr}
  - الجهة الموجه إليها: ${addressed_to || 'الموظف المعني / الجهات المختصة'}
  - المسمى الجديد المستهدف: ${target_role || 'غير محدد'}
  - مقدار الزيادة بالراتب: ${salary_increase_amount ? `${salary_increase_amount} ر.س` : 'غير محدد'}
  - ملاحظات ومسوغات إضافية: ${custom_notes || 'بناءً على تقييم الأداء واللوائح المعتمدة'}
  اجعل الخطاب يبدأ بالبسملة، الرقم المرجعي والتاريخ، ثم الديباجة الرسمية، متن القرار والبنود النظامية الملزمة، وينتهي بختم وتوقيع المدير العام وإدارة الموارد البشرية.`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });
        generatedContent = response.text || '';
      } catch (err) {
        log.error("Gemini letter generator error:", err);
      }
    }
    if (!generatedContent) {
      if (resolvedType === 'promotion') {
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  قرار إداري رقم (${letterId})
  بشأن: ترقية وتعديل مسمى وظيفي
  بناءً على الصلاحيات الممنوحة لإدارة الموارد البشرية، واستناداً إلى تقارير تقييم الأداء والتميز الميداني للموظف/ ${emp.name}، وتوصية المدير المباشر:
  تقرر ما يلي:
  أولاً: ترقية الموظف/ ${emp.name} (هوية/إقامة: ${emp.national_id_iqama || '---'}) إلى منصب: [${target_role || 'أخصائي أول'}].
  ثانياً: تعديل الراتب الأساسي والبدلات المقررة وفق سلم الرواتب للمنصب الجديد اعتباراً من تاريخ ${dateStr}.
  ثالثاً: يُبلغ هذا القرار لكافة الإدارات المعنية للاعتماد وتنفيذ مقتضاه.
  شاكرين للموظف جهوده المتميزة، ومتمنين له دوام التوفيق والنجاح.
  إدارة الموارد البشرية
  ${orgName}`;
      } else if (resolvedType === 'warning') {
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  المكرم الموظف/ ${emp.name}  المحترم
  المسمى الوظيفي: ${emp.position || emp.job_title} | الإدارة: ${emp.department_name || 'عام'}
  الموضوع: إنذار كتابي رسمي ولفت نظر إداري
  إشارة إلى المخالفة المنسوبة إليكم والمتعلقة بـ: [${custom_notes || 'عدم الالتزام بساعات العمل والتعليمات الإدارية المعتمدة'}]، واستناداً إلى لائحة تنظيم العمل الداخلية المعتمدة من وزارة الموارد البشرية والتنمية الاجتماعية:
  نود إحاطتكم بتوجيه هذا الإنذار الكتابي، مع التأكيد على ضرورة تلافي هذه الملاحظات والالتزام التام ببنود عقد العمل وسياسات المنشأة مستقبلاً. ونحيطكم علماً بأن تكرار المخالفة سيعرضكم لتطبيق الجزاءات الأشد المنصوص عليها نظاماً.
  إدارة الموارد البشرية
  الختم والتوقيع: .....................`;
      } else if (resolvedType === 'contract_non_renewal') {
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  المكرم الموظف/ ${emp.name}  المحترم
  هوية/إقامة رقم: ${emp.national_id_iqama || '---'}
  الموضوع: إشعار بعدم الرغبة في تجديد عقد العمل وفق المادة (75) من نظام العمل
  نود إحاطتكم بأنه استناداً إلى بنود عقد العمل المبرم بين الطرفين والمسجل عبر منصة (قوى)، وعملاً بأحكام نظام العمل السعودي، فقد تقرر عدم تجديد عقد عملكم للفترة القادمة، ويكون آخر يوم عمل فعلي لكم هو تاريخ [${dateStr}].
  نرجو منكم التنسيق مع إدارة الموارد البشرية لاستكمال إجراءات إخلاء الطرف، وتسليم العهد، وصرف كافة مستحقاتكم المالية ومكافأة نهاية الخدمة وشهادة الخدمة.
  مع خالص الشكر والتقدير لجهودكم خلال فترة عملكم معنا.
  المدير العام / إدارة الموارد البشرية`;
      } else if (resolvedType === 'salary_certificate') {
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  إلى من يهمه الأمر
  attest أن الموظف/ ${emp.name} (هوية/إقامة: ${emp.national_id_iqama || '---'})، ويعمل لدى المنشأة بمسمى: ${emp.position || emp.job_title || 'موظف'}، في الإدارة: ${emp.department_name || 'عام'} — الفرع: ${emp.branch_name || 'الرئيسي'}، وقد صدرت له هذه شهادة بناءً على طلبه.
  وتُعتمد هذه الشهادة لدى الجهات الحكومية والبنكية، وتُعتمد من إدارة الموارد البشرية.
  ${orgName}
  الختم والتوقيع: .....................`;
      } else if (resolvedType === 'experience_certificate') {
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  شهادة خبرة وخدمة
  attest أن الموظف/ ${emp.name} (هوية/إقامة: ${emp.national_id_iqama || '---'})، قد عمل لدى المنشأة بمسمى: ${emp.position || emp.job_title || 'موظف'}، وأثبت جدارته وكفاءه في تأدية أعماله على الوجه المطلوب نظاماً.
  وتُعتمد هذه الشهادة استناداً إلى المادة (64) من نظام العمل السعودي.
  ${orgName}
  الختم والتوقيع: .....................`;
      } else if (resolvedType === 'termination_art77' || resolvedType === 'termination_art80') {
        const art = resolvedType === 'termination_art77' ? '77' : '80';
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  قرار إنهاء علاقة العمل وفق المادة (${art}) من نظام العمل
  المكرم الموظف/ ${emp.name}  المحترم
  هوية/إقامة رقم: ${emp.national_id_iqama || '---'}
  إشارة إلى ${custom_notes || 'الأسباب المشبعة النظامية المنصوص عليها في المادة (' + art + ')'}, وعملاً بأحكام نظام العمل السعودي ولائحته التنفيذية، فقد اتُّخذ القرار المنصوص عليه في المادة (${art}) وتقررت إنهاء علاقة العمل بين الطرفين اعتباراً من تاريخ [${dateStr}].
  ويُبلغ الموظف بهذا القرار بعد استيفاء مستحقاته وصرف مستحقاته المالية ومكافأة نهاية الخدمة وفق النظام.
  ${orgName}
  الختم والتوقيع: .....................`;
      } else {
        generatedContent = `بسم الله الرحمن الرحيم
  الرقم المرجعي: ${letterId}
  التاريخ: ${dateStr}
  ${title}
  بخصوص الموظف/ ${emp.name} (${emp.position || 'موظف'})
  بناءً على مقتضيات مصلحة العمل ولائحة تنظيم العمل الداخلية ونظام العمل السعودي:
  تقرر إصدار هذا الإجراء الإداري رسمياً اعتباراً من ${dateStr}.
  المسوغات والتفاصيل:
  ${custom_notes || 'وفق السياسات والإجراءات المعتمدة.'}
  ${orgName}`;
      }
    }
    await execute(`
      INSERT INTO hr_generated_letters (letter_id, employee_id, letter_type, title, content)
      VALUES (?, ?, ?, ?, ?)
    `, letterId, employee_id, resolvedType, title, generatedContent);
    await logAction('create', 'hr_letter', Number(employee_id), `Generated HR Letter ${letterId} (${title})`);
    await createNotification('توليد قرار وخطاب إداري', `تم إنشاء الخطاب الإداري ${title} للموظف ${emp.name}`, 'success', { employeeId: Number(employee_id) });
    res.json({
      letter_id: letterId,
      title,
      content: generatedContent,
      created_at: new Date().toISOString(),
      employee_name: emp.name,
      employee_id: emp.id,
      letter_type
    });
  });

    // ==========================================
    // 12. RETENTION RISK & ATTRITION PREDICTOR (محلل مخاطر التسرب AI)
    // ==========================================

  app.get('/api/retention/risks', async (req, res) => {
    const emps = await queryAll(`
      SELECT e.*, d.name as department_name, b.name as branch_name,
             (SELECT COUNT(*) FROM leaves WHERE employee_id = e.id AND type = 'sick') as sick_leave_count,
             (SELECT SUM(days) FROM leaves WHERE employee_id = e.id AND type = 'sick') as sick_leave_days,
             (SELECT MAX(promotion_date) FROM promotions WHERE employee_id = e.id) as last_promotion_date,
             (SELECT rating FROM appraisals WHERE employee_id = e.id ORDER BY appraisal_date DESC LIMIT 1) as latest_rating
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `) as any[];
    const deptSalaries: Record<number, { sum: number; count: number }> = {};
    emps.forEach(e => {
      const deptId = e.department_id || 0;
      if (!deptSalaries[deptId]) deptSalaries[deptId] = { sum: 0, count: 0 };
      deptSalaries[deptId].sum += (Number(e.basic_salary) || 0);
      deptSalaries[deptId].count += 1;
    });
    const assessments = emps.map(emp => {
      const deptId = emp.department_id || 0;
      const deptAvg = deptSalaries[deptId] ? (deptSalaries[deptId].sum / deptSalaries[deptId].count) : Number(emp.basic_salary);
      const salaryRatio = deptAvg > 0 ? (Number(emp.basic_salary) / deptAvg) : 1;
      const startDate = emp.contract_start_date ? new Date(emp.contract_start_date) : new Date('2023-01-01');
      const yearsInCompany = Number(((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
      const lastProm = emp.last_promotion_date ? new Date(emp.last_promotion_date) : startDate;
      const monthsSincePromotion = Math.round((Date.now() - lastProm.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const sickDays = Number(emp.sick_leave_days) || 0;
      const rating = Number(emp.latest_rating) || 3;
      let riskScore = 20; // Base baseline risk
      const topRiskFactors: string[] = [];
      const recommendedActions: string[] = [];
      let salaryCompetitiveness: 'below_market' | 'market_average' | 'above_market' = 'market_average';
      if (salaryRatio < 0.85) {
        salaryCompetitiveness = 'below_market';
        riskScore += 30;
        topRiskFactors.push(`الراتب الأساسي أقل بنسبة ${Math.round((1 - salaryRatio) * 100)}% من متوسط القسم وسعر السوق`);
        recommendedActions.push('مراجعة وتعديل حزمة الراتب والبدلات لتكون منافسة للسوق');
      } else if (salaryRatio > 1.15) {
        salaryCompetitiveness = 'above_market';
        riskScore -= 10;
      }
      if (monthsSincePromotion >= 24) {
        riskScore += 25;
        topRiskFactors.push(`لم يحصل على ترقية أو نمو وظيفي منذ أكثر من ${Math.round(monthsSincePromotion / 12)} سنوات (${monthsSincePromotion} شهر)`);
        recommendedActions.push('وضع خطة ترقية وتكليف بمسؤوليات قيادية جديدة');
      } else if (monthsSincePromotion >= 14) {
        riskScore += 10;
        topRiskFactors.push('مرور أكثر من سنة على آخر مراجعة وظيفية');
      }
      if (rating >= 4) {
        riskScore += 15;
        topRiskFactors.push('كفاءة عالية وأداء ممتاز (مستهدف رئيسي للاستقطاب من الشركات المنافسة)');
        recommendedActions.push('إدراج الموظف في برنامج الكفاءات الاستراتيجية والاحتفاظ بالمواهب (Retention Bonus)');
      }
      if (sickDays >= 8) {
        riskScore += 15;
        topRiskFactors.push(`ارتفاع مؤشر الإجازات المرضية (${sickDays} يوم)، مؤشر على الإرهاق الوظيفي أو عدم الرضا`);
        recommendedActions.push('جدولة جلسة استماع ومتابعة بيئة العمل والتوازن بين العمل والحياة');
      }
      riskScore = Math.max(5, Math.min(95, riskScore));
      let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (riskScore >= 75) riskLevel = 'critical';
      else if (riskScore >= 55) riskLevel = 'high';
      else if (riskScore >= 35) riskLevel = 'medium';
      if (topRiskFactors.length === 0) {
        topRiskFactors.push('استقرار الرضا الوظيفي وتنافسية الراتب والبدلات');
      }
      if (recommendedActions.length === 0) {
        recommendedActions.push('الحفاظ على خطة التطوير الحالية والتقييم السنوي المنتظم');
      }
      return {
        employee_id: emp.id,
        employee_name: emp.name,
        job_title: emp.job_title || emp.position,
        department_name: emp.department_name || 'عام',
        nationality: emp.nationality || 'سعودي',
        is_saudi: emp.is_saudi,
        years_in_company: yearsInCompany,
        months_since_last_promotion: monthsSincePromotion,
        salary_competitiveness: salaryCompetitiveness,
        recent_sick_leaves_days: sickDays,
        risk_score: riskScore,
        risk_level: riskLevel,
        top_risk_factors: topRiskFactors,
        recommended_actions: recommendedActions
      };
    });
    assessments.sort((a, b) => b.risk_score - a.risk_score);
    res.json({
      assessments,
      criticalCount: assessments.filter(a => a.risk_level === 'critical').length,
      highCount: assessments.filter(a => a.risk_level === 'high').length,
      averageRiskScore: Math.round(assessments.reduce((acc, c) => acc + c.risk_score, 0) / (assessments.length || 1))
    });
  });

    // ==========================================
    // MODULE 18: AI HR COPILOT & QUICK ACTIONS (المساعد الذكي)
    // ==========================================

  app.post("/api/copilot/chat", async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });
    const empCount = ((await queryOne("SELECT COUNT(*) as count FROM employees")) as any)?.count || 0;
    const saudiCount = ((await queryOne("SELECT COUNT(*) as count FROM employees WHERE is_saudi = 1")) as any)?.count || 0;
    const saudizationRate = empCount > 0 ? Math.round((saudiCount / empCount) * 100) : 0;
    const pendingRequests = ((await queryOne("SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'")) as any)?.count || 0;
    // The expiry date is stored as text (YYYY-MM-DD), so it is compared as text
// against a cutoff computed here. Casting it in SQL would abort the whole
// query on a blank or malformed value, and the date arithmetic would then
// depend on the database dialect.
const iqamaCutoff = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
const expIqamas = ((await queryOne(
  "SELECT COUNT(*) as count FROM employees WHERE is_saudi = 0 AND iqama_expiry_gregorian <> '' AND iqama_expiry_gregorian <= ?",
  iqamaCutoff
)) as any)?.count || 0;
    const ai = getAI();
    let replyText = "";
    let quickCardData: any = null;
    let suggestedActions: any[] = [];
    const lower = message.toLowerCase();
    if (lower.includes("شهادة راتب") || lower.includes("تعريف بالراتب") || lower.includes("خطاب تعريف")) {
      const emp = await queryOne("SELECT * FROM employees ORDER BY id ASC LIMIT 1") as any;
      if (emp) {
        const total = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
        replyText = `تم توليد نموذج شهادة تعريف بالراتب الرسمية المعتمدة للموظف **${emp.name}** بمجموع أجر شهري قدره **${total.toLocaleString()} ر.س**. يمكنك تحميلها أو طباعتها مباشرة مع الختم الرقمي والـ QR Code.`;
        quickCardData = {
          type: 'salary_cert',
          data: {
            employee_name: emp.name,
            national_id: emp.national_id_iqama,
            job_title: emp.job_title || emp.position,
            basic_salary: emp.basic_salary,
            housing_allowance: emp.housing_allowance,
            transport_allowance: emp.transport_allowance,
            total_salary: total,
            join_date: emp.contract_start_date || '2022-01-01',
            qr_ref: `SAR-CERT-SAUDI-${emp.id}-${Date.now().toString().slice(-6)}`
          }
        };
        suggestedActions = [
          { label: 'عرض تفاصيل ملف الموظف', actionType: 'navigate', payload: 'employees' },
          { label: 'استوديو الخطابات الإدارية بالذكاء الاصطناعي', actionType: 'navigate', payload: 'ai_letters' }
        ];
        return res.json({ reply: replyText, quickCard: quickCardData, suggestedActions });
      }
    }
    if (ai) {
      try {
        const systemPrompt = `
  أنت المساعد الذكي الخبير بالموارد البشرية والأنظمة السعودية (Saudi HR Copilot) لمنصة إدارة الموارد البشرية والرواتب.
  معلومات المنشأة الحالية:
  - إجمالي عدد الموظفين: ${empCount} موظف
  - نسبة السعودة الحالية: ${saudizationRate}%
  - الإقامات التي تنتهي خلال 60 يوماً: ${expIqamas} إقامات
  - طلبات الاعتماد المعلقة: ${pendingRequests} طلبات
  أجب بلغة عربية مهنية دقيقة، وقدم استشارات عملية مبنية على نظام العمل السعودي (التأمينات، قوى، مقيم، مدد، حماية الأجور، كود العمل).
  إذا سأل المستخدم عن إحصائية، اذكر الأرقام الحقيقية المذكورة أعلاه.
  كن مختصراً ومنظماً ومفيداً.
  `;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nسؤال المستخدم: ${message}` }] }
          ]
        });
        replyText = response.text || "أهلاً بك، كيف يمكنني مساعدتك في شؤون الموظفين والامتثال لنظام العمل؟";
      } catch (err) {
        log.error("Gemini copilot error:", err);
      }
    }
    if (!replyText) {
      if (lower.includes("سعودة") || lower.includes("نطاقات") || lower.includes("توطين")) {
        replyText = `نسبة التوطين الحالية في المنشأة هي **${saudizationRate}%** (عدد الموظفين السعوديين: ${saudiCount} من أصل ${empCount}). المنشأة في النطاق البلاتيني/الأخضر المرتفع مما يتيح إصدار التأشيرات الفورية ونقل الخدمات دون قيود.`;
        suggestedActions = [
          { label: 'فتح محاكي نطاقات الذكي', actionType: 'navigate', payload: 'nitaqat_sim' },
          { label: 'إدارة عقود منصة قوى', actionType: 'navigate', payload: 'qiwa_contracts' }
        ];
      } else if (lower.includes("إقامة") || lower.includes("اقامة") || lower.includes("جوازات") || lower.includes("مقيم")) {
        replyText = `يوجد حالياً **${expIqamas}** إقامات وافدين قاربت على الانتهاء خلال الـ 60 يوماً القادمة. يرجى المبادرة بالتجديد عبر منصة مقيم وسداد رسوم رخصة العمل (9600 ر.س سنوياً) والتأمين الطبي لتفادي الغرامات ومضاعفة الرسوم.`;
        suggestedActions = [
          { label: 'سجل الموظفين والإقامات', actionType: 'navigate', payload: 'employees' },
          { label: 'التأمين الطبي والضمان الصحي', actionType: 'navigate', payload: 'medical' }
        ];
      } else if (lower.includes("حماية الأجور") || lower.includes("مدد") || lower.includes("wps") || lower.includes("sif")) {
        replyText = `نظام حماية الأجور (WPS) ومطابقة منصة مدد مفعل بنجاح. يتم فحص كل مسير رواتب للتحقق من عدم تجاوز نسبة الاستقطاعات (المادة 92 من نظام العمل) وتوليد ملف SIF البنكي المعتمد تلقائياً.`;
        suggestedActions = [
          { label: 'مدقق حماية الأجور وملفات SIF', actionType: 'navigate', payload: 'wps_audit' },
          { label: 'مسير الرواتب الشهري', actionType: 'navigate', payload: 'payroll' }
        ];
      } else if (lower.includes("مكافأة") || lower.includes("نهاية الخدمة") || lower.includes("مستحقات")) {
        replyText = `طبقاً للمادة (84) و(85) من نظام العمل السعودي، تُحتسب مكافأة نهاية الخدمة بأجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر كامل عن كل سنة تالية، مع احتساب الأجر الإجمالي الأخير (الأساسي + البدلات الثابتة).`;
        suggestedActions = [
          { label: 'مخصصات نهاية الخدمة والميزانية', actionType: 'navigate', payload: 'provisions' },
          { label: 'إخلاء الطرف وإبراء الذمة', actionType: 'navigate', payload: 'clearance' }
        ];
      } else {
        replyText = `مرحباً بك! أنا مساعد الموارد البشرية الذكي (AI HR Copilot). يمكنني مساعدتك في إصدار شهادات الرواتب، حساب مكافأة نهاية الخدمة، متابعة الإقامات والتأشيرات، تدقيق مسيرات مدد، وتحليل مؤشرات التوطين والسلامة المهنية.`;
        suggestedActions = [
          { label: 'لوحة القيادة التنفيذية', actionType: 'navigate', payload: 'executive_board' },
          { label: 'سحب الراتب عند الطلب (EWA)', actionType: 'navigate', payload: 'ewa_wellness' }
        ];
      }
    }
    res.json({
      reply: replyText,
      quickCard: quickCardData,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : [
        { label: 'لوحة التحكم', actionType: 'navigate', payload: 'dashboard' },
        { label: 'الموظفين', actionType: 'navigate', payload: 'employees' }
      ]
    });
  });

    // GET Salary certificate data for printing

  app.get("/api/copilot/salary-certificate/:empId", async (req, res) => {
    const emp = await queryOne(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.id = ?
    `, req.params.empId) as any;
    if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
    const totalSalary = (emp.basic_salary || 0) + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
    res.json({
      employee_id: emp.id,
      employee_name: emp.name,
      nationality: emp.nationality,
      national_id_iqama: emp.national_id_iqama,
      job_title: emp.job_title || emp.position,
      department_name: emp.department_name || 'عام',
      branch_name: emp.branch_name || 'الفرع الرئيسي',
      contract_start_date: emp.contract_start_date || '2022-01-01',
      basic_salary: emp.basic_salary || 0,
      housing_allowance: emp.housing_allowance || 0,
      transport_allowance: emp.transport_allowance || 0,
      other_allowances: emp.other_allowances || 0,
      total_salary: totalSalary,
      issue_date: new Date().toISOString().split('T')[0],
      qr_code_ref: `SAR-CERT-SAUDI-${emp.id}-${Date.now().toString().slice(-6)}`
    });
  });

}
