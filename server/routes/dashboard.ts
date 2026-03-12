/**
 * Dashboard API routes.
 * GET /prices — latest prices; GET /news — HN headlines; GET /dashboard — aggregate (prices + news + signals).
 */

import { Router, Request, Response } from "express";

type PriceRow = { symbol: string; price: number; change_24h: number | null; source: string; updated_at: string };
type NewsRow = { id: number; title: string; url: string | null; source: string; created_at: string };
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
  getWatchedTickers: () => string[];
  getRiskContextForTicker: (ticker: string, signal?: string, indicatorData?: { score?: number } | null) => RiskContext;
};

export function createDashboardRouter(ctx: DbContext): Router {
  const router = Router();
  const { execAll, getWatchedTickers, getRiskContextForTicker } = ctx;

  router.get("/prices", (req: Request, res: Response) => {
    const prices = execAll<PriceRow>("SELECT symbol, price, change_24h, source, updated_at FROM prices ORDER BY symbol");
    res.json(prices);
  });

  router.get("/news", (req: Request, res: Response) => {
    const news = execAll<NewsRow>("SELECT id, title, url, source, created_at FROM news ORDER BY created_at DESC LIMIT 15");
    res.json(news);
  });

  router.get("/dashboard", (req: Request, res: Response) => {
    const prices = execAll<PriceRow>("SELECT symbol, price, change_24h, source, updated_at FROM prices ORDER BY symbol");
    const news = execAll<NewsRow>("SELECT id, title, url, source, created_at FROM news ORDER BY created_at DESC LIMIT 10");
    const signals = execAll<{ ticker: string; signal: string; reasoning: string; price: number; created_at: string; indicator_data: string | null }>(
      "SELECT ticker, signal, reasoning, price, created_at, indicator_data FROM signals ORDER BY created_at DESC LIMIT 10"
    );
    const byTicker = new Map<string, { signal: string; reasoning: string; price: number; indicator_data?: unknown; risk_context: RiskContext }>();
    for (const s of signals) {
      if (!byTicker.has(s.ticker)) {
        let ind: { score?: number } | null = null;
        if (s.indicator_data) {
          try {
            ind = JSON.parse(s.indicator_data);
          } catch (_) {}
        }
        byTicker.set(s.ticker, {
          signal: s.signal,
          reasoning: s.reasoning,
          price: s.price,
          indicator_data: ind,
          risk_context: getRiskContextForTicker(s.ticker, s.signal, ind),
        });
      }
    }
    res.json({ prices, news, tickers: getWatchedTickers(), signalsByTicker: Object.fromEntries(byTicker) });
  });

  return router;
}
