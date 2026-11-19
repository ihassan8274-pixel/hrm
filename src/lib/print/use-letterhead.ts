// خطّاف واحد لهوية المنشأة.
//
// كل شاشة تُخرج ورقةً مطبوعة تحتاج نفس الترويسة. هذا الخطّاف يقرأها مرة
// واحدة ويشاركها بين الشاشات، فلا تكرر الشاشةُ منطقَ الجلب ولا تختلف
// ترويسةُ شهادة عن ترويسةِ خط إجازة.

import { useEffect, useState } from "react";
import { DEFAULT_BRAND } from "./brand";
import type { LetterheadData } from "./letterhead";

let cached: LetterheadData | null = null;
let inflight: Promise<LetterheadData> | null = null;

async function fetchLetterhead(): Promise<LetterheadData> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch("/api/forms/letterhead")
      .then((response) => (response.ok ? response.json() : { company: {} }))
      .then((data) => {
        cached = { ...DEFAULT_BRAND, ...(data?.company ?? {}) };
        return cached;
      })
      .catch(() => {
        // تعذّر الجلب: نرجع لهوية المنشأة الافتراضية بدل ترك الترويسة فارغة.
        cached = { ...DEFAULT_BRAND };
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** بيانات المنشأة المستعملة في الترويسة، جاهزة للطباعة. */
export function useLetterhead(): LetterheadData {
  const [company, setCompany] = useState<LetterheadData>(cached ?? DEFAULT_BRAND);

  useEffect(() => {
    let active = true;
    fetchLetterhead().then((data) => {
      if (active) setCompany(data);
    });
    return () => {
      active = false;
    };
  }, []);

  return company;
}

/** يُفرغ الذاكرة المؤقتة — بعد تعديل بيانات المنشأة. */
export function invalidateLetterhead(): void {
  cached = null;
}
