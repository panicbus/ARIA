/**
 * Scanner API routes.
 * GET /universe — active universe; GET /results — scan results;
 * GET /status — last scan, scanning state; POST /run — trigger scan (async).
 */

import { Router, Request, Response } from "express";

type ScannerRouterDeps = {
  getActiveUniverse: () => Promise<Array<{ symbol: string; category: string }>>;
  triggerScan: () => void;
  getResults: () => Array<Record<string, unknown>>;
  getStatus: () => { lastScan: string | null; tickersScanned: number; scanning: boolean; apiCallsRemaining: number; universeSize: number };
};

export function createScannerRouter(deps: ScannerRouterDeps): Router {
  const router = Router();
  const { getActiveUniverse, triggerScan, getResults, getStatus } = deps;

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
    const results = getResults();
    res.json(results);
  });

  router.get("/status", (req: Request, res: Response) => {
    const status = getStatus();
    res.json(status);
  });

  router.post("/run", (req: Request, res: Response) => {
    triggerScan();
    res.json({ status: "scanning" });
  });

  return router;
}
