import React from 'react';

/**
 * C · ورقة الهوية — الخلفية السائدة للنظام.
 *
 * عناصر الهوية (الاسم العربي + الاسم اللاتيني + الفاصل ثلاثي الألوان + الأيقونة
 * ثلاثية الأبعاد + المربعان) تظهر كعلامة مائية ثابتة خلف كل الشاشات، في الوضعين
 * النهاري والليلي. لا تحتوي على أي بيانات، ولا تستقبل أحداث فأرة، وتُخفى في الطباعة.
 */
export const IdentityPaperBackground: React.FC = () => (
  <div className="identity-paper" aria-hidden="true" dir="ltr">
    <div className="identity-paper__sheet">
      <div className="identity-paper__mark">
        <span className="identity-paper__overline">EMPOWER</span>
        <span className="identity-paper__ar">تمكين</span>
        <span className="identity-paper__en">EMPOWER</span>
        <span className="identity-paper__rule" />
        <span className="identity-paper__sub">HUMAN RESOURCES MANAGEMENT SYSTEM</span>
      </div>
      <img className="identity-paper__icon" src="/brand/empower-3d-icon.png" alt="" />
      <div className="identity-paper__tiles">
        <span>EMPOWER</span>
        <span>تمكين</span>
      </div>
    </div>
  </div>
);

export default IdentityPaperBackground;
