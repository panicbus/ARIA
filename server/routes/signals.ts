/**
 * Signals API routes.
 * POST / — save a signal; GET / — list recent signals with indicator_data and risk_context.
 */

import { Router, Request, Response } from "express";
import { displayTicker } from "../utils/watchlist";

type RiskContext = {
  suggested_position_size_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  risk_reward_ratio: number;
  confidence: string;
  warning?: string;
};

type DbContext = {
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  run: (sql: string, params?: Record<string, string | number | null>) => { lastInsertRowid: number };
  saveDb: () => void;
  getRiskContextForTicker: (ticker: string, signal?: string, indicatorData?: { score?: number } | null) => RiskContext;
  generateSignals?: () => void;
};

export function createSignalsRouter(ctx: DbContext): Router {
  const router = Router();
  const { execAll, run, saveDb, getRiskContextForTicker, generateSignals } = ctx;

  router.post("/", (req: Request, res: Response) => {
    const { ticker, signal, reasoning, price } = req.body;
    const result = run(
      "INSERT INTO signals (ticker, signal, reasoning, price) VALUES (:ticker, :signal, :reasoning, :price)",
      {
        ":ticker": ticker,
        ":signal": signal,
        ":reasoning": reasoning ?? null,
        ":price": price ?? null,
      }
    );
    saveDb();
    res.json({ id: result.lastInsertRowid });
  });

  router.get("/", (req: Request, res: Response) => {
    const rows = execAll<{ id: number; ticker: string; signal: string; reasoning: string; price: number; created_at: string; indicator_data: string | null }>(
      "SELECT id, ticker, signal, reasoning, price, created_at, indicator_data FROM signals ORDER BY created_at DESC LIMIT 20"
    );
    const signals = rows.map((s) => {
      let ind: { score?: number } | null = null;
      if (s.indicator_data) {
        try {
          ind = JSON.parse(s.indicator_data);
        } catch (_) {}
      }
      const ticker = displayTicker(s.ticker);
      return {
        ...s,
        ticker,
        indicator_data: ind,
        risk_context: getRiskContextForTicker(ticker, s.signal, ind),
      };
    });
    res.json(signals);
  });

  router.post("/generate", (_req: Request, res: Response) => {
    if (!generateSignals) {
      return res.status(501).json({ error: "Signal generation not configured" });
    }
    generateSignals();
    res.json({ ok: true, message: "Signals generated from watched tickers" });
  });

  router.get("/accuracy", (_req: Request, res: Response) => {
    const byTicker = execAll<{
      ticker: string; signal: string; total_signals: number;
      correct_3d: number; checked_3d: number; correct_7d: number; checked_7d: number;
      win_rate_3d: number; win_rate_7d: number; avg_return_3d: number; avg_return_7d: number;
    }>(
      `SELECT ticker, signal,
              COUNT(*) as total_signals,
              SUM(CASE WHEN outcome_3d = 'correct' THEN 1 ELSE 0 END) as correct_3d,
              SUM(CASE WHEN outcome_3d IN ('correct','incorrect') THEN 1 ELSE 0 END) as checked_3d,
              SUM(CASE WHEN outcome_7d = 'correct' THEN 1 ELSE 0 END) as correct_7d,
              SUM(CASE WHEN outcome_7d IN ('correct','incorrect') THEN 1 ELSE 0 END) as checked_7d,
              AVG(CASE WHEN outcome_3d IN ('correct','incorrect') THEN CASE WHEN outcome_3d = 'correct' THEN 1.0 ELSE 0.0 END END) as win_rate_3d,
              AVG(CASE WHEN outcome_7d IN ('correct','incorrect') THEN CASE WHEN outcome_7d = 'correct' THEN 1.0 ELSE 0.0 END END) as win_rate_7d,
              AVG(pct_change_3d) as avg_return_3d,
              AVG(pct_change_7d) as avg_return_7d
       FROM signal_outcomes
       WHERE outcome_3d IS NOT NULL OR outcome_7d IS NOT NULL
       GROUP BY ticker, signal
       HAVING checked_3d >= 3 OR checked_7d >= 3
       ORDER BY win_rate_7d DESC`
    );

    const bySignalType = execAll<{
      signal: string; total_signals: number;
      correct_3d: number; checked_3d: number; correct_7d: number; checked_7d: number;
      win_rate_3d: number; win_rate_7d: number; avg_return_3d: number; avg_return_7d: number;
    }>(
      `SELECT signal,
              COUNT(*) as total_signals,
              SUM(CASE WHEN outcome_3d = 'correct' THEN 1 ELSE 0 END) as correct_3d,
              SUM(CASE WHEN outcome_3d IN ('correct','incorrect') THEN 1 ELSE 0 END) as checked_3d,
              SUM(CASE WHEN outcome_7d = 'correct' THEN 1 ELSE 0 END) as correct_7d,
              SUM(CASE WHEN outcome_7d IN ('correct','incorrect') THEN 1 ELSE 0 END) as checked_7d,
              AVG(CASE WHEN outcome_3d IN ('correct','incorrect') THEN CASE WHEN outcome_3d = 'correct' THEN 1.0 ELSE 0.0 END END) as win_rate_3d,
              AVG(CASE WHEN outcome_7d IN ('correct','incorrect') THEN CASE WHEN outcome_7d = 'correct' THEN 1.0 ELSE 0.0 END END) as win_rate_7d,
              AVG(pct_change_3d) as avg_return_3d,
              AVG(pct_change_7d) as avg_return_7d
       FROM signal_outcomes
       WHERE outcome_3d IS NOT NULL OR outcome_7d IS NOT NULL
       GROUP BY signal
       ORDER BY win_rate_7d DESC`
    );

    const overall = execAll<{
      total_signals: number; total_evaluated: number;
      win_rate_3d: number; win_rate_7d: number; avg_return_3d: number; avg_return_7d: number;
    }>(
      `SELECT COUNT(*) as total_signals,
              SUM(CASE WHEN outcome_3d IN ('correct','incorrect') OR outcome_7d IN ('correct','incorrect') THEN 1 ELSE 0 END) as total_evaluated,
              AVG(CASE WHEN outcome_3d IN ('correct','incorrect') THEN CASE WHEN outcome_3d = 'correct' THEN 1.0 ELSE 0.0 END END) as win_rate_3d,
              AVG(CASE WHEN outcome_7d IN ('correct','incorrect') THEN CASE WHEN outcome_7d = 'correct' THEN 1.0 ELSE 0.0 END END) as win_rate_7d,
              AVG(pct_change_3d) as avg_return_3d,
              AVG(pct_change_7d) as avg_return_7d
       FROM signal_outcomes`
    );

    const o = overall[0] ?? { total_signals: 0, total_evaluated: 0, win_rate_3d: null, win_rate_7d: null, avg_return_3d: null, avg_return_7d: null };
    res.json({
      overall: {
        total_signals: o.total_signals ?? 0,
        total_evaluated: o.total_evaluated ?? 0,
        win_rate_3d: o.win_rate_3d ?? 0,
        win_rate_7d: o.win_rate_7d ?? 0,
        avg_return_3d: o.avg_return_3d ?? 0,
        avg_return_7d: o.avg_return_7d ?? 0,
      },
      by_ticker: byTicker,
      by_signal_type: bySignalType,
    });
  });

  return router;
}
