// هوية المنشأة الافتراضية — مأخوذة من ورقة الشركة.
//
// القيم هنا هي ما يظهر على الورق إذا لم تُضبط بيانات المنشأة من شاشة
// الإعدادات. المصدر الوحيد: تعديلُها في «بيانات المنشأة» يتغلب عليها،
// وهذه القيم تبقى خط السقوط عند غياب أي إعداد.

export const DEFAULT_BRAND = {
  org_name: "شركة مطعم معصوب حليب لتقديم الوجبات",
  org_name_en: "Masoob Haleeb Restaurant Co. for Food Services",
  cr_number: "7040849866",
  vat_number: "313001325500003",
  unified_number_700: "7104989866",
  establishment_subscription_number: "1033325",
  po_box: "32275",
  org_address_ar:
    "أبو عبيدة عامر بن الجارح - حي المنار - المملكة العربية السعودية - الرمز البريدي: 32275",
  org_address_en:
    "Abu Ubaydah Amer bin Al-Jarrah St. - Al-Manar Dist. - Dammam - Kingdom of Saudi Arabia",
  org_logo_url: "/brand/masoob-logo.png",
  country: "المملكة العربية السعودية",
  currency: "SAR",
};

/**
 * القيم الافتراضية القديمة التي زرعها القالب الجاهز — تستبدل بهوية المنشأة
 * مرة واحدة. ما عدّله المسؤول بعد ذلك يبقى كما هو.
 */
export const LEGACY_VALUES: Record<string, string[]> = {
  org_name: ["شركة المسار الرقمي للحلول المتكاملة", "مؤسسة الرواتب العالمية"],
  country: ["Egypt"],
  currency: ["EGP"],
};
