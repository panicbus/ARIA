// WAYPOINT [scanner]
// WHAT: Proactive market scanner — scans a risk-tiered universe of 65+ tickers, runs RSI/MACD/MA signals in memory-safe batches, ARIA filters to 3-7 top picks.
// WHY: Discovery beyond Nico's portfolio. Graduation pipeline ensures tickers only enter active scanning after 50+ days of OHLCV data.
// HOW IT HELPS NICO: "Worth watching" candidates ranked by technicals and ARIA reasoning, expanding automatically as data matures.

import { computeIndicatorsForCloses, scoreToSignal } from "./indicators";
import { generateText } from "./gemini";

// ── Seed universe (65 tickers across 3 tiers) ──────────────────────────────────

// WAYPOINT [scanner-seed-universe]
// WHAT: Static seed list of 65 tickers across conservative / moderate / aggressive tiers and 13 categories.
// WHY: Provides a diverse starting universe; graduation pipeline activates them as OHLCV data becomes available.
// HOW IT HELPS NICO: Broad sector exposure — mega cap to small cap biotech — without manually curating.

export type SeedTicker = { symbol: string; category: string; tier: "conservative" | "moderate" | "aggressive" };

export const SEED_UNIVERSE: SeedTicker[] = [
  // Conservative (25) — large cap, stable
  { symbol: "AAPL", category: "mega_cap", tier: "conservative" },
  { symbol: "MSFT", category: "mega_cap", tier: "conservative" },
  { symbol: "GOOGL", category: "mega_cap", tier: "conservative" },
  { symbol: "META", category: "mega_cap", tier: "conservative" },
  { symbol: "NVDA", category: "mega_cap", tier: "conservative" },
  { symbol: "JPM", category: "finance", tier: "conservative" },
  { symbol: "BAC", category: "finance", tier: "conservative" },
  { symbol: "GS", category: "finance", tier: "conservative" },
  { symbol: "V", category: "finance", tier: "conservative" },
  { symbol: "MA", category: "finance", tier: "conservative" },
  { symbol: "JNJ", category: "healthcare", tier: "conservative" },
  { symbol: "UNH", category: "healthcare", tier: "conservative" },
  { symbol: "LLY", category: "healthcare", tier: "conservative" },
  { symbol: "ABBV", category: "healthcare", tier: "conservative" },
  { symbol: "PFE", category: "healthcare", tier: "conservative" },
  { symbol: "WMT", category: "consumer", tier: "conservative" },
  { symbol: "COST", category: "consumer", tier: "conservative" },
  { symbol: "HD", category: "consumer", tier: "conservative" },
  { symbol: "TGT", category: "consumer", tier: "conservative" },
  { symbol: "MCD", category: "consumer", tier: "conservative" },
  { symbol: "XOM", category: "energy", tier: "conservative" },
  { symbol: "CVX", category: "energy", tier: "conservative" },
  { symbol: "NEE", category: "energy", tier: "conservative" },
  { symbol: "SO", category: "energy", tier: "conservative" },
  { symbol: "DUK", category: "energy", tier: "conservative" },
  // Moderate (20) — growth and mid-cap
  { symbol: "CRM", category: "growth_tech", tier: "moderate" },
  { symbol: "NOW", category: "growth_tech", tier: "moderate" },
  { symbol: "ADBE", category: "growth_tech", tier: "moderate" },
  { symbol: "PANW", category: "growth_tech", tier: "moderate" },
  { symbol: "SNOW", category: "growth_tech", tier: "moderate" },
  { symbol: "PLTR", category: "emerging_tech", tier: "moderate" },
  { symbol: "NET", category: "emerging_tech", tier: "moderate" },
  { symbol: "DDOG", category: "emerging_tech", tier: "moderate" },
  { symbol: "MDB", category: "emerging_tech", tier: "moderate" },
  { symbol: "COIN", category: "emerging_tech", tier: "moderate" },
  { symbol: "TSLA", category: "ev_clean", tier: "moderate" },
  { symbol: "RIVN", category: "ev_clean", tier: "moderate" },
  { symbol: "ENPH", category: "ev_clean", tier: "moderate" },
  { symbol: "FSLR", category: "ev_clean", tier: "moderate" },
  { symbol: "BE", category: "ev_clean", tier: "moderate" },
  { symbol: "ABNB", category: "consumer_growth", tier: "moderate" },
  { symbol: "UBER", category: "consumer_growth", tier: "moderate" },
  { symbol: "LYFT", category: "consumer_growth", tier: "moderate" },
  { symbol: "DASH", category: "consumer_growth", tier: "moderate" },
  { symbol: "RBLX", category: "consumer_growth", tier: "moderate" },
  // Aggressive (20) — small cap, high risk
  { symbol: "IONQ", category: "ai_quantum", tier: "aggressive" },
  { symbol: "RGTI", category: "ai_quantum", tier: "aggressive" },
  { symbol: "QUBT", category: "ai_quantum", tier: "aggressive" },
  { symbol: "ARQQ", category: "ai_quantum", tier: "aggressive" },
  { symbol: "BBAI", category: "ai_quantum", tier: "aggressive" },
  { symbol: "RKLB", category: "space_defense", tier: "aggressive" },
  { symbol: "LUNR", category: "space_defense", tier: "aggressive" },
  { symbol: "ASTS", category: "space_defense", tier: "aggressive" },
  { symbol: "ACHR", category: "space_defense", tier: "aggressive" },
  { symbol: "JOBY", category: "space_defense", tier: "aggressive" },
  { symbol: "SOFI", category: "fintech", tier: "aggressive" },
  { symbol: "AFRM", category: "fintech", tier: "aggressive" },
  { symbol: "UPST", category: "fintech", tier: "aggressive" },
  { symbol: "HOOD", category: "fintech", tier: "aggressive" },
  { symbol: "OPEN", category: "fintech", tier: "aggressive" },
  { symbol: "RXRX", category: "biotech", tier: "aggressive" },
  { symbol: "BEAM", category: "biotech", tier: "aggressive" },
  { symbol: "PACB", category: "biotech", tier: "aggressive" },
  { symbol: "TWST", category: "biotech", tier: "aggressive" },
  { symbol: "VERV", category: "biotech", tier: "aggressive" },
];

const ALPHAVANTAGE_DAILY_LIMIT = 24;
const OHLCV_MIN_DAYS = 50;
const SCANNER_BATCH_SIZE = 10;
const SCANNER_BATCH_DELAY_MS = 1000;
const CANDIDATES_CAP = 100;

export type ScannerDeps = {
  db: import("sql.js").Database;
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  run: (sql: string, params?: Record<string, string | number | null | undefined>) => { lastInsertRowid: number };
  saveDb: () => void;
  getWatchedTickers: () => string[];
  cryptoIds?: Record<string, string>;
};

function logMem(label: string): void {
  const used = process.memoryUsage();
  console.log(`[mem] ${label}: ${Math.round(used.heapUsed / 1024 / 1024)}MB heap, ${Math.round(used.rss / 1024 / 1024)}MB rss`);
}

function sqlQ(s: string): string {
  return s.replace(/'/g, "''");
}

function getAlphavantageCallsToday(execAll: ScannerDeps["execAll"]): number {
  const rows = execAll<{ value: string }>("SELECT value FROM memories WHERE key = 'alphavantage_calls_today' LIMIT 1");
  if (!rows[0]?.value) return 0;
  try {
    const parsed = JSON.parse(rows[0].value) as { date: string; count: number };
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date === today) return parsed.count;
  } catch (_) {}
  return 0;
}

function incrementAlphavantageCalls(execAll: ScannerDeps["execAll"], run: ScannerDeps["run"], saveDb: () => void): void {
  const today = new Date().toISOString().slice(0, 10);
  const current = getAlphavantageCallsToday(execAll);
  const next = current + 1;
  run(
    `INSERT INTO memories (key, value, confidence, source, updated_at, created_at) VALUES ('alphavantage_calls_today', :value, 1, 'system', :u, :u)
     ON CONFLICT(key) DO UPDATE SET value = :value, updated_at = :u`,
    { ":value": JSON.stringify({ date: today, count: next }), ":u": new Date().toISOString() }
  );
  saveDb();
}

async function fetchPriceFromFinnhub(symbol: string): Promise<{ price: number; change_24h: number | null } | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`);
    const data = (await res.json()) as { c?: number; dp?: number };
    const price = data?.c;
    if (price == null || typeof price !== "number") return null;
    const pct = typeof data?.dp === "number" ? data.dp : null;
    return { price, change_24h: pct };
  } catch (_) {
    return null;
  }
}

export type ScannerUniverseEntry = { symbol: string; category: string };

export function createScannerService(deps: ScannerDeps) {
  const { db, execAll, run, saveDb, getWatchedTickers } = deps;

  // ── Seed scanner_candidates on startup ────────────────────────────────────────

  // WAYPOINT [scanner-seed-candidates]
  // WHAT: Inserts all 65 seed tickers into scanner_candidates if not already present, plus upserts scanner_universe rows.
  // WHY: Graduation pipeline needs all tickers tracked from the start; active flag set only when OHLCV >= 50 days.
  // HOW IT HELPS NICO: Universe builds itself over time without manual intervention.
  function seedCandidatesAndUniverse(): void {
    for (const s of SEED_UNIVERSE) {
      run(
        `INSERT INTO scanner_candidates (symbol, category, tier, status)
         VALUES (:sym, :cat, :tier, 'pending')
         ON CONFLICT(symbol) DO NOTHING`,
        { ":sym": s.symbol, ":cat": s.category, ":tier": s.tier }
      );
      run(
        `INSERT INTO scanner_universe (symbol, category, active)
         VALUES (:sym, :cat, 0)
         ON CONFLICT(symbol) DO NOTHING`,
        { ":sym": s.symbol, ":cat": s.category }
      );
    }
    saveDb();
    runGraduationCheck();
  }

  // ── Graduation pipeline ───────────────────────────────────────────────────────

  // WAYPOINT [scanner-graduation]
  // WHAT: Promotes pending candidates to active once they have >= 50 OHLCV days. Processes in batches of 20.
  // WHY: Scanning tickers without enough data produces garbage signals; this gates activation on data maturity.
  // HOW IT HELPS NICO: Scanner accuracy improves as more tickers graduate with real indicator data.
  function runGraduationCheck(): void {
    const pending = execAll<{ symbol: string; category: string; tier: string }>(
      "SELECT symbol, category, tier FROM scanner_candidates WHERE status = 'pending' ORDER BY symbol"
    );
    const GRAD_BATCH = 20;
    const now = new Date().toISOString();
    let graduated = 0;
    for (let i = 0; i < pending.length; i += GRAD_BATCH) {
      const batch = pending.slice(i, i + GRAD_BATCH);
      for (const c of batch) {
        const countRow = execAll<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM ohlcv WHERE symbol = '${sqlQ(c.symbol)}' AND date >= date('now', '-120 days')`
        );
        const days = countRow[0]?.cnt ?? 0;
        run("UPDATE scanner_candidates SET ohlcv_days = :d WHERE symbol = :s", { ":d": days, ":s": c.symbol });
        if (days >= OHLCV_MIN_DAYS) {
          run(
            "UPDATE scanner_candidates SET has_sufficient_data = 1, status = 'active', activated_at = :now WHERE symbol = :s",
            { ":now": now, ":s": c.symbol }
          );
          run("UPDATE scanner_universe SET active = 1 WHERE symbol = :s", { ":s": c.symbol });
          graduated++;
          console.log(`[scanner] Graduated ${c.symbol} to active scanner universe (${days} days OHLCV)`);
        }
      }
    }
    // Also update ohlcv_days for already-active candidates so the UI shows progress
    const active = execAll<{ symbol: string }>(
      "SELECT symbol FROM scanner_candidates WHERE status = 'active'"
    );
    for (const a of active) {
      const countRow = execAll<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM ohlcv WHERE symbol = '${sqlQ(a.symbol)}' AND date >= date('now', '-120 days')`
      );
      run("UPDATE scanner_candidates SET ohlcv_days = :d WHERE symbol = :s", { ":d": countRow[0]?.cnt ?? 0, ":s": a.symbol });
    }
    if (graduated > 0) saveDb();
  }

  // ── Active universe (only tickers with sufficient data) ───────────────────────
  function getActiveUniverseSync(): ScannerUniverseEntry[] {
    return execAll<{ symbol: string; category: string }>(
      "SELECT symbol, category FROM scanner_universe WHERE active = 1 ORDER BY symbol"
    );
  }

  async function getActiveUniverse(): Promise<ScannerUniverseEntry[]> {
    return getActiveUniverseSync();
  }

  // ── Scanner run (batched, memory-safe) ────────────────────────────────────────
  let scanning = false;

  async function runScan(): Promise<void> {
    if (scanning) return;
    scanning = true;
    logMem("scanner start");
    try {
      runGraduationCheck();
      const universe = getActiveUniverseSync();
      if (universe.length === 0) {
        console.log("[scanner] No active tickers with sufficient OHLCV data — skipping scan");
        return;
      }

      run("DELETE FROM scanner_results");
      saveDb();

      for (let i = 0; i < universe.length; i += SCANNER_BATCH_SIZE) {
        const batch = universe.slice(i, i + SCANNER_BATCH_SIZE);
        const batchNum = Math.floor(i / SCANNER_BATCH_SIZE) + 1;
        logMem(`scanner batch ${batchNum}`);

        for (const { symbol, category } of batch) {
          const priceData = await fetchPriceFromFinnhub(symbol);
          const price = priceData?.price ?? 0;
          const change_24h = priceData?.change_24h ?? null;

          const closes = execAll<{ close: number }>(
            `SELECT close FROM ohlcv WHERE symbol = '${sqlQ(symbol)}' ORDER BY date ASC`
          ).map((r) => Number(r.close));

          let signal: string;
          let score: number;
          let rsi: number | null = null;
          let macdHistogram: number | null = null;
          let indicatorData: Record<string, unknown> | null = null;

          const ind = computeIndicatorsForCloses(closes);
          if (ind && closes.length >= OHLCV_MIN_DAYS) {
            const res = scoreToSignal(ind.score);
            signal = res.signal;
            score = ind.score;
            rsi = ind.rsi;
            macdHistogram = ind.macd.histogram;
            indicatorData = ind as unknown as Record<string, unknown>;
          } else {
            const change = change_24h ?? 0;
            if (change >= 5) signal = "WATCH";
            else if (change <= -5) signal = "WATCH";
            else if (change >= 2) signal = "BUY";
            else if (change <= -2) signal = "SELL";
            else signal = "HOLD";
            score = 0;
            indicatorData = { methodology: "24h_fallback", rsi: null, macd: null, ma20: null, ma50: null, score: 0 };
          }

          run(
            `INSERT INTO scanner_results (symbol, signal, score, rsi, macd_histogram, price, change_24h, indicator_data, category)
             VALUES (:symbol, :signal, :score, :rsi, :macd_histogram, :price, :change_24h, :indicator_data, :category)`,
            {
              ":symbol": symbol,
              ":signal": signal,
              ":score": score,
              ":rsi": rsi,
              ":macd_histogram": macdHistogram,
              ":price": price,
              ":change_24h": change_24h,
              ":indicator_data": indicatorData ? JSON.stringify(indicatorData) : null,
              ":category": category,
            }
          );
        }
        saveDb();
        if (i + SCANNER_BATCH_SIZE < universe.length) {
          await new Promise((r) => setTimeout(r, SCANNER_BATCH_DELAY_MS));
        }
      }

      await filterWithAria();
      recordSignalOutcomes();
      logMem("scanner end");
    } finally {
      scanning = false;
    }
  }

  async function filterWithAria(): Promise<void> {
    const rows = execAll<{
      id: number; symbol: string; signal: string; score: number;
      rsi: number | null; macd_histogram: number | null;
      price: number; change_24h: number | null; category: string;
    }>("SELECT id, symbol, signal, score, rsi, macd_histogram, price, change_24h, category FROM scanner_results ORDER BY score DESC");

    if (rows.length === 0 || !process.env.GEMINI_API_KEY?.trim()) return;

    const summary = rows
      .map((r) =>
        `${r.symbol} (${r.category}): ${r.signal} score ${r.score}/6, RSI ${r.rsi ?? "n/a"}, MACD ${r.macd_histogram != null ? (r.macd_histogram > 0 ? "bullish" : "bearish") : "n/a"}, price $${r.price}, 24h ${r.change_24h != null ? r.change_24h.toFixed(1) + "%" : "n/a"}`
      )
      .join("\n");

    const prompt = `Here are today's scanner results across ${rows.length} stocks.

Surface the 3-7 most genuinely interesting opportunities. Consider: signal strength, unusual RSI readings, MACD crossovers, and anything that stands out as worth attention.

Prioritize variety across categories — do not return more than 2 picks from the same category. A varied set of picks is more useful than 5 from the same category.

For each pick, write 2-3 sentences of plain English reasoning explaining WHY this is interesting right now.

Also flag any tickers showing unusual negative momentum that Nico should be aware of even if he doesn't own them.

Return ONLY a valid JSON array of objects with this exact shape:
[{"symbol":"TICKER","aria_reasoning":"2-3 sentences of reasoning"}]
No other text.`;

    try {
      const systemInstruction = "You are ARIA. Return only valid JSON. No markdown, no explanation.";
      const response = await generateText(`${prompt}\n\n---\n${summary}`, systemInstruction);
      const clean = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = clean.match(/\[[\s\S]*\]/);
      const arr = jsonMatch ? (JSON.parse(jsonMatch[0]) as Array<{ symbol: string; aria_reasoning: string }>) : [];

      const bySymbol = new Map(arr.map((a) => [a.symbol.toUpperCase(), a.aria_reasoning ?? ""]));
      for (const r of rows) {
        const reasoning = bySymbol.get(r.symbol);
        if (reasoning) {
          db.run("UPDATE scanner_results SET aria_reasoning = :reasoning WHERE id = :id", {
            ":reasoning": reasoning,
            ":id": r.id,
          });
        }
      }
      saveDb();
    } catch (e) {
      console.warn("Scanner ARIA filter failed:", e);
    }
  }

  // ── Weekly nomination (Gemini picks 5 new tickers) ────────────────────────────

  // WAYPOINT [scanner-nomination]
  // WHAT: Weekly cron calls Gemini to nominate 5 new tickers for the candidate pipeline (capped at 100 total).
  // WHY: Universe grows organically based on emerging themes; ARIA suggests what Nico might not have found.
  // HOW IT HELPS NICO: Continuously discovers new opportunities aligned with his aggressive-growth focus.
  async function runWeeklyNomination(): Promise<string[]> {
    const totalCandidates = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM scanner_candidates")[0]?.cnt ?? 0;
    if (totalCandidates >= CANDIDATES_CAP) {
      console.log(`[scanner] Candidates at cap (${totalCandidates}/${CANDIDATES_CAP}) — skipping nomination`);
      return [];
    }
    if (!process.env.GEMINI_API_KEY?.trim()) {
      console.warn("[scanner] No GEMINI_API_KEY — skipping nomination");
      return [];
    }

    const existing = execAll<{ symbol: string }>(
      "SELECT symbol FROM scanner_candidates UNION SELECT symbol FROM scanner_universe"
    );
    const existingSymbols = existing.map((r) => r.symbol).join(", ");

    const prompt = `You are expanding a stock scanner universe for an aggressive retail investor interested in tech, AI, clean energy, fintech, and high-growth sectors.

Current universe: ${existingSymbols}

Nominate exactly 5 new tickers NOT already in the above list. Choose based on:
- What sectors are underrepresented?
- Emerging themes (AI infrastructure, quantum computing, space, biotech, energy transition)
- Mix of market caps (at least 1 large, 1 mid, 1 small cap)
- Recent momentum or growing institutional interest

Return ONLY a valid JSON array, no other text:
[{"symbol":"TICKER","category":"one of: mega_cap, finance, healthcare, consumer, energy, growth_tech, emerging_tech, ev_clean, consumer_growth, ai_quantum, space_defense, fintech, biotech","tier":"conservative|moderate|aggressive","reason":"one sentence why"}]`;

    try {
      logMem("nomination start");
      const response = await generateText(prompt, "You are ARIA. Return only valid JSON. No markdown fences, no explanation.");
      const clean = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = clean.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn("[scanner] Nomination: no JSON array found in response");
        return [];
      }
      const arr = JSON.parse(jsonMatch[0]) as Array<{ symbol: string; category: string; tier: string; reason: string }>;
      const added: string[] = [];
      const now = new Date().toISOString();
      for (const item of arr) {
        const sym = (item.symbol ?? "").toUpperCase().trim();
        if (!sym || !/^[A-Z0-9.]{1,10}$/.test(sym)) continue;
        const existCheck = execAll<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM scanner_candidates WHERE symbol = '${sqlQ(sym)}'`
        );
        if ((existCheck[0]?.cnt ?? 0) > 0) continue;
        const tier = ["conservative", "moderate", "aggressive"].includes(item.tier) ? item.tier : "moderate";
        const validCats = ["mega_cap", "finance", "healthcare", "consumer", "energy", "growth_tech", "emerging_tech", "ev_clean", "consumer_growth", "ai_quantum", "space_defense", "fintech", "biotech"];
        const category = validCats.includes(item.category) ? item.category : "emerging_tech";
        run(
          `INSERT INTO scanner_candidates (symbol, category, tier, status, nominated_at)
           VALUES (:sym, :cat, :tier, 'pending', :now)
           ON CONFLICT(symbol) DO NOTHING`,
          { ":sym": sym, ":cat": category, ":tier": tier, ":now": now }
        );
        run(
          `INSERT INTO scanner_universe (symbol, category, active)
           VALUES (:sym, :cat, 0)
           ON CONFLICT(symbol) DO NOTHING`,
          { ":sym": sym, ":cat": category }
        );
        added.push(sym);
      }
      if (added.length) {
        saveDb();
        console.log(`[scanner] Weekly nomination: added ${added.length} new candidates: ${added.join(", ")}`);
      } else {
        console.log("[scanner] Weekly nomination: no new candidates added (all already existed)");
      }
      logMem("nomination end");
      return added;
    } catch (e) {
      console.warn("[scanner] Nomination failed:", e);
      return [];
    }
  }

  // ── Query helpers ─────────────────────────────────────────────────────────────

  function getResults(): Array<{
    id: number; symbol: string; signal: string; score: number;
    rsi: number | null; macd_histogram: number | null;
    price: number; change_24h: number | null;
    indicator_data: string | null; aria_reasoning: string | null;
    category: string; scanned_at: string;
  }> {
    return execAll(
      "SELECT id, symbol, signal, score, rsi, macd_histogram, price, change_24h, indicator_data, aria_reasoning, category, scanned_at FROM scanner_results ORDER BY CASE WHEN aria_reasoning IS NOT NULL AND aria_reasoning != '' THEN 0 ELSE 1 END, score DESC"
    );
  }

  function getTopPicks(scoreMin = 3): Array<{
    symbol: string; signal: string; score: number; rsi: number | null;
    aria_reasoning: string | null; price: number; change_24h: number | null; category: string;
  }> {
    return execAll(
      `SELECT symbol, signal, score, rsi, aria_reasoning, price, change_24h, category FROM scanner_results WHERE aria_reasoning IS NOT NULL AND aria_reasoning != '' AND score >= ${scoreMin} ORDER BY score DESC`
    );
  }

  function getCandidates(): Array<{
    symbol: string; category: string; tier: string; ohlcv_days: number;
    has_sufficient_data: number; status: string; nominated_at: string; activated_at: string | null;
  }> {
    return execAll(
      "SELECT symbol, category, tier, ohlcv_days, has_sufficient_data, status, nominated_at, activated_at FROM scanner_candidates ORDER BY ohlcv_days DESC, symbol"
    );
  }

  function getUniverseStats(): {
    total_active: number; total_pending: number;
    by_tier: Record<string, number>; by_category: Record<string, number>;
    graduating_soon: string[]; calls_used_today: number; calls_remaining: number;
  } {
    const active = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM scanner_universe WHERE active = 1")[0]?.cnt ?? 0;
    const pending = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM scanner_candidates WHERE status = 'pending'")[0]?.cnt ?? 0;
    const tierRows = execAll<{ tier: string; cnt: number }>(
      "SELECT tier, COUNT(*) AS cnt FROM scanner_candidates GROUP BY tier"
    );
    const by_tier: Record<string, number> = {};
    for (const r of tierRows) by_tier[r.tier] = r.cnt;
    const catRows = execAll<{ category: string; cnt: number }>(
      "SELECT category, COUNT(*) AS cnt FROM scanner_candidates GROUP BY category"
    );
    const by_category: Record<string, number> = {};
    for (const r of catRows) by_category[r.category] = r.cnt;
    const soonRows = execAll<{ symbol: string }>(
      "SELECT symbol FROM scanner_candidates WHERE status = 'pending' AND ohlcv_days >= 40 ORDER BY ohlcv_days DESC"
    );
    const avCalls = getAlphavantageCallsToday(execAll);
    return {
      total_active: active,
      total_pending: pending,
      by_tier,
      by_category,
      graduating_soon: soonRows.map((r) => r.symbol),
      calls_used_today: avCalls,
      calls_remaining: Math.max(0, ALPHAVANTAGE_DAILY_LIMIT - avCalls),
    };
  }

  function getStatus(): {
    lastScan: string | null; tickersScanned: number; scanning: boolean;
    apiCallsRemaining: number; universeSize: number; pendingCount: number;
  } {
    const last = execAll<{ scanned_at: string }>("SELECT scanned_at FROM scanner_results ORDER BY scanned_at DESC LIMIT 1");
    const count = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM scanner_results");
    const uni = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM scanner_universe WHERE active = 1");
    const pend = execAll<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM scanner_candidates WHERE status = 'pending'");
    const avCalls = getAlphavantageCallsToday(execAll);
    return {
      lastScan: last[0]?.scanned_at ?? null,
      tickersScanned: count[0]?.cnt ?? 0,
      scanning,
      apiCallsRemaining: Math.max(0, ALPHAVANTAGE_DAILY_LIMIT - avCalls),
      universeSize: uni[0]?.cnt ?? 0,
      pendingCount: pend[0]?.cnt ?? 0,
    };
  }

  function triggerScan(): void {
    runScan().catch((e) => console.error("Scanner run failed:", e));
  }

  // WAYPOINT [signal-outcome-recording]
  // WHAT: Saves today's directional scanner signals with entry prices for future accuracy checking.
  // WHY: Can't measure accuracy without knowing what signal fired and at what price.
  // HOW IT HELPS NICO: Builds evidence base for which signals are actually trustworthy.
  function recordSignalOutcomes(): void {
    const today = new Date().toISOString().split("T")[0];
    const results = execAll<{ symbol: string; signal: string; score: number; price: number }>(
      `SELECT sr.symbol, sr.signal, sr.score, p.price
       FROM scanner_results sr
       LEFT JOIN prices p ON p.symbol = sr.symbol
       WHERE sr.signal IN ('BUY','STRONG BUY','SELL','STRONG SELL')
         AND sr.aria_reasoning IS NOT NULL
         AND p.price IS NOT NULL`
    );
    let count = 0;
    for (const r of results) {
      try {
        run(
          `INSERT OR IGNORE INTO signal_outcomes (ticker, signal, score, price_at_signal, signal_date)
           VALUES (:ticker, :signal, :score, :price, :date)`,
          { ":ticker": r.symbol, ":signal": r.signal, ":score": r.score, ":price": r.price, ":date": today }
        );
        count++;
      } catch {}
    }
    saveDb();
    console.log(`Signal outcomes: recorded ${count} directional signals for ${today}`);
  }

  // WAYPOINT [signal-outcome-checker]
  // WHAT: Looks up prices 3 and 7 days after each signal and marks it correct or incorrect.
  // WHY: This is how ARIA learns whether her signals actually predicted price direction.
  // HOW IT HELPS NICO: Shows win rate per ticker and signal type so he knows what to trust.
  function checkSignalOutcomes(): void {
    const BULLISH = ["BUY", "STRONG BUY"];
    const BEARISH = ["SELL", "STRONG SELL"];

    const resolvePriceForDate = (ticker: string, dateStr: string): number | null => {
      const ohlcv = execAll<{ close: number }>(
        `SELECT close FROM ohlcv WHERE symbol = '${sqlQ(ticker)}' AND date = '${sqlQ(dateStr)}' LIMIT 1`
      );
      if (ohlcv.length) return ohlcv[0].close;
      // Try nearest OHLCV row within 3 days (weekends/holidays)
      const nearby = execAll<{ close: number }>(
        `SELECT close FROM ohlcv WHERE symbol = '${sqlQ(ticker)}' AND date BETWEEN date('${sqlQ(dateStr)}', '-3 days') AND date('${sqlQ(dateStr)}', '+3 days') ORDER BY ABS(julianday(date) - julianday('${sqlQ(dateStr)}')) LIMIT 1`
      );
      return nearby[0]?.close ?? null;
    };

    // 3-day checks
    const pending3d = execAll<{ id: number; ticker: string; signal: string; price_at_signal: number; signal_date: string }>(
      "SELECT id, ticker, signal, price_at_signal, signal_date FROM signal_outcomes WHERE checked_3d = 0 AND signal_date <= date('now', '-3 days') LIMIT 100"
    );
    for (const row of pending3d) {
      const targetDate = new Date(row.signal_date + "T00:00:00Z");
      targetDate.setUTCDate(targetDate.getUTCDate() + 3);
      const target = targetDate.toISOString().split("T")[0];
      const price3d = resolvePriceForDate(row.ticker, target);
      if (price3d == null) continue;
      const pct = ((price3d - row.price_at_signal) / row.price_at_signal) * 100;
      const outcome = BULLISH.includes(row.signal)
        ? (price3d > row.price_at_signal ? "correct" : "incorrect")
        : BEARISH.includes(row.signal)
          ? (price3d < row.price_at_signal ? "correct" : "incorrect")
          : "na";
      run(
        `UPDATE signal_outcomes SET price_3d = :p, pct_change_3d = :pct, outcome_3d = :o, checked_3d = 1 WHERE id = :id`,
        { ":p": price3d, ":pct": Math.round(pct * 100) / 100, ":o": outcome, ":id": row.id }
      );
    }

    // 7-day checks
    const pending7d = execAll<{ id: number; ticker: string; signal: string; price_at_signal: number; signal_date: string }>(
      "SELECT id, ticker, signal, price_at_signal, signal_date FROM signal_outcomes WHERE checked_7d = 0 AND signal_date <= date('now', '-7 days') LIMIT 100"
    );
    for (const row of pending7d) {
      const targetDate = new Date(row.signal_date + "T00:00:00Z");
      targetDate.setUTCDate(targetDate.getUTCDate() + 7);
      const target = targetDate.toISOString().split("T")[0];
      const price7d = resolvePriceForDate(row.ticker, target);
      if (price7d == null) continue;
      const pct = ((price7d - row.price_at_signal) / row.price_at_signal) * 100;
      const outcome = BULLISH.includes(row.signal)
        ? (price7d > row.price_at_signal ? "correct" : "incorrect")
        : BEARISH.includes(row.signal)
          ? (price7d < row.price_at_signal ? "correct" : "incorrect")
          : "na";
      run(
        `UPDATE signal_outcomes SET price_7d = :p, pct_change_7d = :pct, outcome_7d = :o, checked_7d = 1 WHERE id = :id`,
        { ":p": price7d, ":pct": Math.round(pct * 100) / 100, ":o": outcome, ":id": row.id }
      );
    }

    saveDb();
    const stats = execAll<{ total: number; correct_3d: number; correct_7d: number }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN outcome_3d = 'correct' THEN 1 ELSE 0 END) as correct_3d,
              SUM(CASE WHEN outcome_7d = 'correct' THEN 1 ELSE 0 END) as correct_7d
       FROM signal_outcomes WHERE outcome_3d IS NOT NULL OR outcome_7d IS NOT NULL`
    );
    if (stats[0]?.total > 0) {
      console.log(`Signal accuracy: ${stats[0].correct_3d}/${stats[0].total} correct at 3d, ${stats[0].correct_7d}/${stats[0].total} correct at 7d`);
    }
  }

  return {
    seedCandidatesAndUniverse,
    runGraduationCheck,
    getActiveUniverse,
    runScan,
    triggerScan,
    getResults,
    getTopPicks,
    getCandidates,
    getUniverseStats,
    getStatus,
    runWeeklyNomination,
    checkSignalOutcomes,
  };
}
