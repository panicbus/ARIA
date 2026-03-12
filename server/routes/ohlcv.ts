/**
 * OHLCV API routes.
 * GET /status — ticker counts and watched list; GET /:symbol — historical bars;
 * POST /refresh-all — background refresh; POST /refresh/:symbol — single ticker refresh.
 */

import { Router, Request, Response } from "express";
import { fetchOHLCVForTicker } from "../services/ohlcv";

type DbContext = {
  db: import("sql.js").Database;
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  saveDb: () => void;
  getWatchedTickers: () => string[];
  fetchAndStoreOHLCV: () => Promise<void>;
  cryptoIds: Record<string, string>;
};

export function createOhlcvRouter(ctx: DbContext): Router {
  const router = Router();
  const { db, execAll, saveDb, getWatchedTickers, fetchAndStoreOHLCV, cryptoIds } = ctx;

  // WAYPOINT [ohlcv-api]
  // WHAT: GET /:symbol?days=90 returns historical OHLCV for a ticker, sorted by date desc.
  // WHY: Frontend chart and backtest need historical bars; this serves them from the local DB.

  router.get("/status", (req: Request, res: Response) => {
    if (!db) return res.json({ tickers: {} });
    const rows = execAll<{ symbol: string; cnt: number }>(
      "SELECT symbol, COUNT(*) AS cnt FROM ohlcv GROUP BY symbol"
    );
    const tickers: Record<string, number> = {};
    for (const r of rows) tickers[r.symbol] = r.cnt;
    res.json({ tickers, watched: getWatchedTickers() });
  });

  router.get("/:symbol", (req: Request, res: Response) => {
    const symbol = String(req.params.symbol || "").toUpperCase();
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || 90), 10) || 90));
    if (!symbol) return res.status(400).json({ error: "symbol required" });
    const watched = getWatchedTickers();
    if (!watched.includes(symbol)) {
      return res.status(400).json({ error: `Unknown symbol. Watched: ${watched.join(", ")}` });
    }
    const rows = execAll<{ date: string; open: number; high: number; low: number; close: number; volume: number }>(
      `SELECT date, open, high, low, close, volume FROM ohlcv WHERE symbol = '${symbol}' ORDER BY date DESC LIMIT ${days}`
    );
    res.json(rows.reverse()); // Chronological for charts
  });

  router.post("/refresh-all", (req: Request, res: Response) => {
    res.status(202).json({ message: "OHLCV refresh started in background (takes ~13s per ticker)" });
    fetchAndStoreOHLCV().catch((err) => console.error("OHLCV refresh-all failed:", err));
  });

  router.post("/refresh/:symbol", async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol || "").toUpperCase();
    if (!symbol) return res.status(400).json({ error: "symbol required" });
    const watched = getWatchedTickers();
    if (!watched.includes(symbol)) {
      return res.status(400).json({ error: `Symbol ${symbol} not in watched list. Add to Memory watchlist or as a position.` });
    }
    try {
      const result = await fetchOHLCVForTicker(symbol, { cryptoIds });
      if (!result || !result.rows?.length) {
        let detail = "No data returned";
        if (result?.raw) {
          try {
            const parsed = JSON.parse(result.raw) as Record<string, string>;
            detail = parsed.Note ?? parsed["Error Message"] ?? detail;
          } catch (_) {}
        }
        return res.status(502).json({ error: "Alphavantage returned no data", detail });
      }
      for (const r of result.rows) {
        db.run(
          `INSERT OR IGNORE INTO ohlcv (symbol, date, open, high, low, close, volume, source, created_at)
           VALUES (:symbol, :date, :open, :high, :low, :close, :volume, :source, :created_at)`,
          {
            ":symbol": r.symbol,
            ":date": r.date,
            ":open": r.open,
            ":high": r.high,
            ":low": r.low,
            ":close": r.close,
            ":volume": r.volume,
            ":source": "alphavantage",
            ":created_at": new Date().toISOString(),
          }
        );
      }
      saveDb();
      res.json({ ok: true, symbol, rows: result.rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Refresh failed", detail: msg });
    }
  });

  return router;
}
