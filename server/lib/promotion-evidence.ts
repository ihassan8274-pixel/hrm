/**
 * Promotion eligibility is evidence-based, not a salary edit with a note.
 *
 * A promotion must cite an appraisal and a completed, certificated training
 * record. If courses declare a target position, the cited certificate has to
 * match the old or the new position — otherwise it is not evidence for *this*
 * promotion. General courses (no target position) remain valid.
 */
export const PROMOTION_MIN_RATING = 3;

export async function checkPromotionEvidence(
  db: any,
  employeeId: number,
  newPosition: string | undefined,
  appraisalId?: unknown,
  trainingEnrollmentId?: unknown,
): Promise<{ appraisal: any; enrollment: any }> {
  const appraisal = appraisalId
    ? await db.prepare(`
        SELECT * FROM appraisals WHERE id = ? AND employee_id = ?
      `).get(appraisalId, employeeId)
    : await db.prepare(`
        SELECT * FROM appraisals WHERE employee_id = ? ORDER BY id DESC LIMIT 1
      `).get(employeeId);

  if (!appraisal) {
    throw new Error("لا يمكن الترقية دون تقييم أداء موثّق لهذا الموظف");
  }
  if (Number(appraisal.rating) < PROMOTION_MIN_RATING) {
    throw new Error(
      `تقييم الأداء (${appraisal.rating}) أقل من الحد المطلوب للترقية (${PROMOTION_MIN_RATING}) — أكمل التدريب أولاً`,
    );
  }

  const enrollments = await db.prepare(`
    SELECT t.*, c.title AS course_title, c.target_position, e.position
    FROM training_enrollments t
    LEFT JOIN training_courses c ON t.course_id = c.id
    JOIN employees e ON t.employee_id = e.id
    WHERE t.employee_id = ? AND t.status = 'completed'
      AND t.certificate_number IS NOT NULL AND TRIM(t.certificate_number) <> ''
  `).all(employeeId) as any[];

  if (!enrollments.length) {
    throw new Error("لا يمكن الترقية دون شهادة تدريب مكتملة وموثّقة لهذا الموظف");
  }

  let enrollment = trainingEnrollmentId
    ? enrollments.find((e) => Number(e.id) === Number(trainingEnrollmentId))
    : undefined;
  if (trainingEnrollmentId && !enrollment) {
    throw new Error("سجل التدريب المحدد غير مكتمل أو لا يخص هذا الموظف");
  }
  if (!enrollment) {
    const position = String(newPosition || "").trim();
    enrollment = position
      ? enrollments.find((e) => {
          const target = String(e.target_position || "").trim();
          return !target || target === position || target === e.position;
        })
      : enrollments[0];
  }
  if (!enrollment) {
    const targets = [...new Set(enrollments.map((e) => String(e.target_position || "")).filter(Boolean))];
    throw new Error(
      `شهادات الموظف لا تغطي الوظيفة المطلوبة${targets.length ? ` (المتاحة: ${targets.join("، ")})` : ""}`,
    );
  }

  return { appraisal, enrollment };
}
