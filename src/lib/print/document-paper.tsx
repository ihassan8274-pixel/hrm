// ورقة A4 جاهزة للطباعة — على مقاس وترويسة وتذييل ورقة الشركة.
//
// المكوّن يضمن مقاس الورقة (210mm × 297mm) وهوامش ثابتة، فيخرج المستند
// من المتصفح بنفس المسافات التي يخرج بها من أي برنامج آخر — لا يتغير
// الشكل بين شاشة ومعاينة.
//
// الاستخدام:
//   <DocumentPaper company={company} title="خطاب راتب" reference="DOC-…">
//     ...المحتوى...
//   </DocumentPaper>

import React from "react";
import { DocumentFooter, Letterhead, type LetterheadData } from "./letterhead";

interface DocumentPaperProps {
  company?: LetterheadData;
  /** عنوان المستند (يظهر في الترويسة). */
  title?: string;
  /** المرجع / رقم الإصدار — يظهر في التذييل. */
  reference?: string;
  /** سطر ختامي فوق التوقيع (اسم المُصدر ووظيفته). */
  signatory?: string;
  /** شعار watermarked في منتصف الورقة (كما في ورقة الشركة). */
  watermark?: string;
  children: React.ReactNode;
}

export const DocumentPaper: React.FC<DocumentPaperProps> = ({
  company,
  title,
  reference,
  signatory,
  watermark,
  children,
}) => {
  const logo = watermark || company?.org_logo_url || "/brand/masoob-logo.png";

  return (
    <div className="print-page bg-white text-slate-900 flex flex-col">
      {/* العلامة المائية — تظهر خلف النص ولا تُطبع إلا في الورقة */}
      {logo ? (
        <img src={logo} alt="" aria-hidden="true" className="print-watermark" />
      ) : null}

      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        <Letterhead company={company} title={title} />

        <div className="print-body mt-6 space-y-4 text-[15px] leading-[2]">{children}</div>

        {signatory ? (
          <div className="print-signature mt-10">
            <div className="text-sm text-slate-800">{signatory}</div>
            <div className="mt-8 w-56 border-t border-slate-700 pt-1 text-center text-xs text-slate-600">
              التوقيع والختم
            </div>
          </div>
        ) : null}

        <div className="mt-auto" />

        <DocumentFooter company={company} reference={reference} />
      </div>
    </div>
  );
};

export default DocumentPaper;
