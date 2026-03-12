/**
 * Backtest API route.
 * GET /?ticker=BTC&days=90 — run backtest and return summary, trades, equity curve.
 */

import { Router, Request, Response } from "express";

type BacktestResult = {
  ticker: string;
  days: number;
  summary: {
    total_return_pct: number;
    buy_and_hold_pct: number;
    win_rate: number;
    num_trades: number;
    best_trade_pct: number;
    worst_trade_pct: number;
    max_drawdown_pct: number;
  };
  trades: Array<{
    entry_date: string;
    exit_date: string;
    entry_price: number;
    exit_price: number;
    return_pct: number;
    signal: string;
    outcome: "win" | "loss";
  }>;
  equity_curve: Array<{ date: string; value: number }>;
  error?: string;
} | null;

type DbContext = {
  getWatchedTickers: () => string[];
  runBacktest: (ticker: string, days: number) => BacktestResult;
};

export function createBacktestRouter(ctx: DbContext): Router {
  const router = Router();
  const { getWatchedTickers, runBacktest } = ctx;

  router.get("/", (req: Request, res: Response) => {
    const ticker = String(req.query.ticker || "").toUpperCase();
    const days = Math.min(365, Math.max(30, parseInt(String(req.query.days || 90), 10) || 90));
    if (!ticker) return res.status(400).json({ error: "ticker required" });
    const watched = getWatchedTickers();
    if (!watched.includes(ticker)) {
      return res.status(400).json({ error: `Unknown ticker. Watched: ${watched.join(", ")}` });
    }
    const result = runBacktest(ticker, days);
    if (!result) return res.status(500).json({ error: "Backtest failed" });
    if (result.error) return res.status(400).json({ error: result.error, ...result });
    res.json(result);
  });

  return router;
}
