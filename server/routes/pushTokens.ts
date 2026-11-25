// تسجيل رمز التنبيه الفوري للتطبيق الأصلي.
//
// الرمز مرتبط بالمستخدم المصادَّق عليه من الجلسة فقط؛ لا يقبل الجسم معرّف مستخدم،
// حتى لا يقدر مستخدم بتسجيل رمز جهاز آخر أو إرسال تنبيهات باسمه.
// الإرسال الفعلي عبر FCM/APNs يُفعّل لاحقاً بمفاتيح المشروع؛ هذه النقطة تخزّن الرموز فقط.

import express from "express";
import db from "../config/postgres";
import { log } from "../lib/logger";

export function registerPushTokens(app: express.Express) {
  app.post("/api/push-tokens", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

      const token = String(req.body?.token || "").trim();
      const platform = String(req.body?.platform || "").trim();
      if (!token || token.length > 512) return res.status(400).json({ error: "Invalid push token" });
      if (platform !== "android" && platform !== "ios") {
        return res.status(400).json({ error: "Invalid platform" });
      }

      await db.prepare(
        `INSERT INTO push_tokens (user_id, platform, token)
         VALUES (?, ?, ?)
         ON CONFLICT (token) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           updated_at = CURRENT_TIMESTAMP`,
      ).run(user.id, platform, token);

      res.json({ ok: true });
    } catch (err) {
      log.error("push token registration failed:", err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: "تعذّر تسجيل رمز التنبيه" });
    }
  });
}
