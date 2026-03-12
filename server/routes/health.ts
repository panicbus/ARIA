/**
 * Health and connectivity API routes.
 * GET /health — liveness; GET /claude-test — Anthropic API connectivity.
 */

import { Router, Request, Response } from "express";
import type Anthropic from "@anthropic-ai/sdk";

export function createHealthRouter(anthropic: Anthropic): Router {
  const router = Router();

  router.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ARIA online", timestamp: new Date().toISOString() });
  });

  router.get("/claude-test", async (req: Request, res: Response) => {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return res.status(500).json({ ok: false, error: "ANTHROPIC_API_KEY not set" });
    }
    try {
      const r = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 20,
        messages: [{ role: "user", content: "Say 'ok' only." }],
      });
      const text = (r.content[0] as { type: string; text?: string })?.text ?? "";
      res.json({ ok: true, reply: text.trim() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Claude test error:", msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
