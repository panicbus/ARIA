/**
 * Health and connectivity API routes.
 * GET /health — liveness; GET /gemini-test — Gemini API connectivity;
 * GET /debug — persistence debug (DATA_DIR, message count, db exists).
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import { generateText } from "../services/gemini";

type HealthDeps = {
  dataDir: string;
  dbPath: string;
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
};

export function createHealthRouter(deps?: HealthDeps): Router {
  const router = Router();

  router.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ARIA online", timestamp: new Date().toISOString() });
  });

  router.get("/debug", (req: Request, res: Response) => {
    if (!deps) return res.json({ error: "Debug not configured" });
    const { dataDir, dbPath, execAll } = deps;
    const dbExists = fs.existsSync(dbPath);
    let messageCount = 0;
    try {
      const rows = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM messages");
      messageCount = rows[0]?.cnt ?? 0;
    } catch (_) {}
    const dataDirExists = fs.existsSync(dataDir);
    res.json({
      dataDir,
      dbPath,
      dataDirExists,
      dbExists,
      messageCount,
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/gemini-test", async (req: Request, res: Response) => {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      return res.status(500).json({ ok: false, error: "GEMINI_API_KEY not set" });
    }
    try {
      const text = await generateText("Say 'ok' only.");
      res.json({ ok: true, reply: text.trim() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Gemini test error:", msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
