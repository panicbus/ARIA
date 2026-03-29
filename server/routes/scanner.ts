/**
 * Scanner API routes.
 * GET /universe — active universe; GET /results — scan results;
 * GET /status — last scan, scanning state; POST /run — trigger scan;
 * GET /candidates — graduation pipeline; GET /universe/stats — universe breakdown;
 * POST /nominate — manually trigger weekly nomination;
 * GET /company/:symbol — company name from Finnhub.
 */

import { Router, Request, Response } from "express";

type ScannerRouterDeps = {
  getActiveUniverse: () => Promise<Array<{ symbol: string; category: string }>>;
  triggerScan: () => void;
  getResults: () => Array<Record<string, unknown>>;
  getStatus: () => {
    lastScan: string | null; tickersScanned: number; scanning: boolean;
    apiCallsRemaining: number; universeSize: number; pendingCount: number;
  };
  getCandidates: () => Array<{
    symbol: string; category: string; tier: string; ohlcv_days: number;
    has_sufficient_data: number; status: string; nominated_at: string; activated_at: string | null;
  }>;
  getUniverseStats: () => {
    total_active: number; total_pending: number;
    by_tier: Record<string, number>; by_category: Record<string, number>;
    graduating_soon: string[]; calls_used_today: number; calls_remaining: number;
  };
  runWeeklyNomination: () => Promise<string[]>;
};

export function createScannerRouter(deps: ScannerRouterDeps): Router {
  const router = Router();
  const { getActiveUniverse, triggerScan, getResults, getStatus, getCandidates, getUniverseStats, runWeeklyNomination } = deps;

  router.get("/company/:symbol", async (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? "").toUpperCase();
    if (!symbol) return res.status(400).json({ error: "Symbol required" });
    const key = process.env.FINNHUB_API_KEY?.trim();
    if (!key) return res.json({ name: symbol });
    try {
      const r = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`);
      const data = (await r.json()) as { name?: string };
      res.json({ name: data?.name ?? symbol });
    } catch {
      res.json({ name: symbol });
    }
  });

  router.get("/universe", async (req: Request, res: Response) => {
    try {
      const universe = await getActiveUniverse();
      res.json(universe);
    } catch (e) {
      console.error("Scanner universe error:", e);
      res.status(500).json({ error: "Failed to get scanner universe" });
    }
  });

  router.get("/results", (req: Request, res: Response) => {
    res.json(getResults());
  });

  router.get("/status", (req: Request, res: Response) => {
    res.json(getStatus());
  });

  // WAYPOINT [scanner-candidates-api]
  // WHAT: Returns the graduation pipeline — all scanner_candidates with progress info.
  // WHY: Lets the UI show which tickers are building data and how close they are to activation.
  // HOW IT HELPS NICO: Visibility into what's coming next in the scanner universe.
  router.get("/candidates", (req: Request, res: Response) => {
    const candidates = getCandidates();
    const graduating_soon = candidates.filter((c) => c.status === "pending" && c.ohlcv_days >= 40).length;
    res.json({ candidates, total: candidates.length, graduating_soon });
  });

  // WAYPOINT [scanner-universe-stats-api]
  // WHAT: Returns universe breakdown by tier, category, and graduation progress.
  // WHY: Dashboard-level visibility into how the scanner universe is growing.
  // HOW IT HELPS NICO: Quick glance at universe health and API budget remaining.
  router.get("/universe/stats", (req: Request, res: Response) => {
    res.json(getUniverseStats());
  });

  // WAYPOINT [scanner-nominate-api]
  // WHAT: Manually triggers the weekly Gemini nomination for new tickers.
  // WHY: Testing and on-demand expansion when Nico wants to grow the universe immediately.
  // HOW IT HELPS NICO: Control over when new candidates are added beyond the Sunday cron.
  router.post("/nominate", async (req: Request, res: Response) => {
    try {
      const added = await runWeeklyNomination();
      res.json({ status: "ok", added, count: added.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Nomination failed", detail: msg });
    }
  });

  router.post("/run", (req: Request, res: Response) => {
    triggerScan();
    res.json({ status: "scanning" });
  });

  return router;
}
