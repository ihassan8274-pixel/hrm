// أدوات الطباعة والتصدير.
//
// مسار واحد لكل مخرجات النظام:
//   1) الطباعة  — نافذة الطباعة في المتصفح (نص عربي حقيقي قابل للتحديد).
//   2) PDF      — نفس الورق محفوظ كملف، للحفظ والأرشفة.
//
// jsPDF يرسم الأرقام اللاتينية بنص، والعربية تُرسم كصورة عبر html2canvas —
// والنتيجة صورة الورق كما هي تماماً، وهو مقبول لأغراض الأرشفة.

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * يطبع الصفحة الحالية.
 *
 * ملاحظة مهمة: استدعاء window.print() يطبع ما هو ظاهر في الصفحة. لذلك على
 * كل شاشة قابلة للطباعة أن تُوضع عناصر التحكم تحت صنف `no-print`، وأن
 * تبقى الورقة وحدها ظاهرة. هذان الصنفان معرّفان في src/index.css.
 */
export function triggerPrint(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", finish);
      resolve();
    };
    window.addEventListener("afterprint", finish);
    window.print();
    // بعض المتصفحات لا تُطلق afterprint (Thunderbird القديم مثلاً) — مهلة
    // قصيرة تضمن ألا يتعطل التنفيذ.
    window.setTimeout(finish, 2000);
  });
}

export interface PdfExportOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
}

/**
 * يحوّل عنصر ورقة (بمقاس A4) إلى ملف PDF متعدد الصفحات.
 *
 * الورقة قد تتجاوز صفحة واحدة (العقد مثلاً). لذلك تُقسَّم الصورة على
 * ارتفاع صفحة A4 بدل تصغيرها، فتبقى الكتابة بحجمها الطبيعي.
 */
export async function exportPaperToPdf(
  element: HTMLElement,
  options: PdfExportOptions = {},
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const orientation = options.orientation ?? "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // بكسل لكل مليمتر عند المقياس المستخدم: ن/mm ثم مضروبة في scale.
  const pixelsPerMm = canvas.width / pageWidth;
  const pageHeightPx = Math.floor(pageHeight * pixelsPerMm);

  const pages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));
  for (let index = 0; index < pages; index++) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - index * pageHeightPx);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const context = slice.getContext("2d");
    if (!context) throw new Error("تعذّر تجهيز ملف PDF");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(
      canvas,
      0,
      index * pageHeightPx,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );
    if (index > 0) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.95),
      "JPEG",
      0,
      0,
      pageWidth,
      (sliceHeight / pixelsPerMm),
    );
  }

  pdf.save(options.filename || "document.pdf");
}
