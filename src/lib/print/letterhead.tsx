// ترويسة المنشأة الموحّدة لكل المستندات المطبوعة.
//
// التصميم مأخوذ من ورقة الشركة الفعلية:
//   يمين الصفحة  — الاسم العربي والرقم الموحد والرقم الضريبي
//   الوسط        — شعار معصوب
//   يسار الصفحة  — الاسم الإنجليزي والسجل التجاري والضريبة
//   سطر فاصل تحت الترويسة
//
// كل مستند يخرج من النظام يبدأ بهذه الترويسة، فيبدو الورق واحداً لا مجمّعاً
// من شاشات مختلفة. البيانات تأتي من جدول settings، فتغيير بيانات المنشأة
// ينعكس على كل المخرجات دفعة واحدة.

import React from "react";
import { DEFAULT_BRAND } from "./brand";

export interface LetterheadData {
  org_name?: string;
  org_name_en?: string;
  cr_number?: string;
  vat_number?: string;
  unified_number_700?: string;
  country?: string;
  org_address?: string;
  org_address_ar?: string;
  org_address_en?: string;
  po_box?: string;
  establishment_subscription_number?: string;
  org_email?: string;
  org_phone?: string;
  org_logo_url?: string;
}

interface LetterheadProps {
  company?: LetterheadData;
  /** نسخة مضغوطة تُستعمل في ترويسة الجداول والكشوف. */
  compact?: boolean;
  /** عنوان يظهر أسفل اسم المنشأة (نوع المستند). */
  title?: string;
}

export const Letterhead: React.FC<LetterheadProps> = ({ company, compact = false, title }) => {
  const name = company?.org_name || DEFAULT_BRAND.org_name;
  const nameEn = company?.org_name_en || DEFAULT_BRAND.org_name_en;
  const logo = company?.org_logo_url || DEFAULT_BRAND.org_logo_url;

  return (
    <div className={`print-letterhead ${compact ? "print-letterhead--compact" : ""}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* العمود العربي — يمين الورقة */}
        <div className="text-right leading-tight">
          <div className="font-black text-slate-900 text-[15px]">{name}</div>
          {company?.unified_number_700 ? (
            <div className="text-[11px] text-slate-700 mt-1">
              الرقم الموحد: {company.unified_number_700}
            </div>
          ) : null}
          {company?.vat_number ? (
            <div className="text-[11px] text-slate-700">الرقم الضريبي: {company.vat_number}</div>
          ) : null}
        </div>

        {/* الشعار */}
        <img
          src={logo}
          alt={name}
          className="h-14 w-auto object-contain print-logo"
          // تعطّل تحميل الشعار لا يصح أن يقطع المستند: نخفيه فقط.
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />

        {/* العمود الإنجليزي — يسار الورقة */}
        <div className="text-left leading-tight">
          <div className="font-black text-slate-900 text-[15px]">{nameEn}</div>
          {company?.cr_number ? (
            <div className="text-[11px] text-slate-700 mt-1">C.R: {company.cr_number}</div>
          ) : null}
          {company?.vat_number ? (
            <div className="text-[11px] text-slate-700">VAT: {company.vat_number}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 border-b-2 border-slate-900" />

      {title ? (
        <div className="mt-2 text-center font-black text-slate-800 text-[15px]">{title}</div>
      ) : null}
    </div>
  );
};

/**
 * تذييل الورقة — العنوان الوطني ورقم اشتراك المنشأة والصندوق البريدي.
 * يوضع أسفل الورقة تماماً كما في ورقة الشركة.
 */
export const DocumentFooter: React.FC<{
  company?: LetterheadData;
  reference?: string;
}> = ({ company, reference }) => {
  const addressAr =
    company?.org_address_ar ||
    company?.org_address ||
    DEFAULT_BRAND.org_address_ar;
  const addressEn =
    company?.org_address_en ||
    DEFAULT_BRAND.org_address_en;
  const subscription = company?.establishment_subscription_number;
  const poBox = company?.po_box;

  return (
    <div className="print-footer mt-6 pt-1.5 border-t border-slate-800 text-[10px] leading-relaxed text-slate-700">
      <div className="text-right">
        {addressAr}
        {subscription ? ` - رقم اشتراك المنشأة: ${subscription}` : ""}
        {poBox && !addressAr.includes(poBox) ? ` - الرمز البريدي: ${poBox}` : ""}
      </div>
      <div className="text-left" dir="ltr">
        {addressEn}
        {subscription ? ` - Subscription No.: ${subscription}` : ""}
        {poBox ? ` - P.O.Box: ${poBox}` : ""}
      </div>
      {reference ? <div className="text-center text-slate-400 mt-1">المرجع: {reference}</div> : null}
    </div>
  );
};

export default Letterhead;
