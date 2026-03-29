/**
 * OHLCV fetch and store from Alphavantage.
 * Stocks: TIME_SERIES_DAILY. Crypto: DIGITAL_CURRENCY_DAILY.
 * Used by Holdings charts, backtest, and signal generation.
 */

// WAYPOINT [ohlcv-priority-queue]
// WHAT: Fetches OHLCV in priority order (watched > active scanner > inactive candidates) with a hard 24-call/day Alphavantage limit.
// WHY: Free-tier AV allows 25/day; we reserve 1 for manual refreshes. Priority ensures Nico's holdings always update first.
// HOW IT HELPS NICO: Holdings charts stay fresh; scanner universe data builds gradually without blowing the API budget.

const ALPHAVANTAGE_BASE = "https://www.alphavantage.co/query";
const OHLCV_DAYS = 100;
const AV_DAILY_LIMIT = 24;
const AV_CALL_DELAY_MS = 500;

export type OHLCVRow = {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function alphavantageUrl(params: Record<string, string>): string {
  const key = process.env.ALPHAVANTAGE_API_KEY?.trim() ?? "";
  const q = new URLSearchParams({ ...params, apikey: key });
  return `${ALPHAVANTAGE_BASE}?${q.toString()}`;
}

function parseOHLCVFromStock(data: Record<string, unknown>): OHLCVRow[] {
  const series =
    (data["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined) ??
    (data["Time Series 1 (Daily)"] as Record<string, Record<string, string>> | undefined);
  if (!series || typeof series !== "object") return [];
  return Object.entries(series).map(([date, row]) => ({
    symbol: "",
    date,
    open: parseFloat(row["1. open"] ?? row["1. open (USD)"] ?? "0") || 0,
    high: parseFloat(row["2. high"] ?? row["2a. high (USD)"] ?? "0") || 0,
    low: parseFloat(row["3. low"] ?? row["3a. low (USD)"] ?? "0") || 0,
    close: parseFloat(row["4. close"] ?? row["4a. close (USD)"] ?? "0") || 0,
    volume: parseFloat(row["5. volume"] ?? row["5. volume"] ?? "0") || 0,
  }));
}

function parseOHLCVFromCrypto(data: Record<string, unknown>, symbol: string): OHLCVRow[] {
  const key = "Time Series (Digital Currency Daily)";
  const series = data[key] as Record<string, Record<string, string>> | undefined;
  if (!series || typeof series !== "object") return [];
  return Object.entries(series).map(([date, row]) => {
    const o = row["1a. open (USD)"] ?? row["1. open"] ?? "0";
    const h = row["2a. high (USD)"] ?? row["2. high"] ?? "0";
    const l = row["3a. low (USD)"] ?? row["3. low"] ?? "0";
    const c = row["4a. close (USD)"] ?? row["4. close"] ?? "0";
    const v = row["5. volume"] ?? "0";
    return {
      symbol,
      date,
      open: parseFloat(o) || 0,
      high: parseFloat(h) || 0,
      low: parseFloat(l) || 0,
      close: parseFloat(c) || 0,
      volume: parseFloat(v) || 0,
    };
  });
}

export type OHLCVFetchResult = {
  rows: OHLCVRow[];
  raw?: string;
  detail?: string;
  source?: "alphavantage" | "coingecko";
};

/** Historical closes for sidebar charts when Alpha Vantage is missing or rate-limited (BTC/ETH only). */
async function fetchOhlcvFromCoinGecko(geckoId: string, symbol: string): Promise<OHLCVRow[]> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(geckoId)}/market_chart?vs_currency=usd&days=90`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { prices?: [number, number][] };
    const prices = data.prices ?? [];
    const byDate = new Map<string, number>();
    for (const [ts, price] of prices) {
      const d = new Date(ts).toISOString().slice(0, 10);
      byDate.set(d, price);
    }
    const dates = [...byDate.keys()].sort();
    const rows = dates.map((date) => {
      const c = byDate.get(date)!;
      return { symbol, date, open: c, high: c, low: c, close: c, volume: 0 };
    });
    return rows.slice(-OHLCV_DAYS);
  } catch (e) {
    console.error(`CoinGecko OHLCV ${symbol}:`, e);
    return [];
  }
}

export async function fetchOHLCVForTicker(
  symbol: string,
  options?: { cryptoIds?: Record<string, string> }
): Promise<OHLCVFetchResult> {
  const cryptoIds = options?.cryptoIds ?? { BTC: "bitcoin", ETH: "ethereum" };
  const upper = symbol.toUpperCase();
  const isCrypto = upper in cryptoIds;
  const geckoId = isCrypto ? (cryptoIds[upper] ?? "") : "";
  const key = process.env.ALPHAVANTAGE_API_KEY?.trim();

  if (!key) {
    console.warn("OHLCV: ALPHAVANTAGE_API_KEY not set — stocks need it; trying CoinGecko for BTC/ETH only.");
    if (isCrypto && geckoId) {
      const rows = await fetchOhlcvFromCoinGecko(geckoId, upper);
      return rows.length
        ? { rows, source: "coingecko" }
        : { rows: [], detail: "No API key and CoinGecko returned no data." };
    }
    return { rows: [], detail: "ALPHAVANTAGE_API_KEY is not set on the server." };
  }

  let url: string;
  if (isCrypto) {
    url = alphavantageUrl({ function: "DIGITAL_CURRENCY_DAILY", symbol: upper, market: "USD", outputsize: "full" });
  } else {
    url = alphavantageUrl({ function: "TIME_SERIES_DAILY", symbol: upper, outputsize: "compact", datatype: "json" });
  }
  try {
    const res = await fetch(url);
    const data = (await res.json()) as Record<string, unknown>;
    const raw = JSON.stringify(data);
    const avNote = (data.Note ?? data["Error Message"]) as string | undefined;
    if (avNote) {
      console.warn(`OHLCV ${upper} (Alpha Vantage):`, avNote);
      if (isCrypto && geckoId) {
        const rows = await fetchOhlcvFromCoinGecko(geckoId, upper);
        if (rows.length) {
          return { rows, source: "coingecko", detail: `Alpha Vantage unavailable (${avNote.slice(0, 120)}…). Using CoinGecko history.` };
        }
      }
      return { rows: [], raw, detail: avNote };
    }
    let rows: OHLCVRow[];
    if (isCrypto) {
      rows = parseOHLCVFromCrypto(data, upper);
    } else {
      const parsed = parseOHLCVFromStock(data);
      rows = parsed.map((r) => ({ ...r, symbol: upper }));
    }
    rows = rows.slice(0, OHLCV_DAYS);
    if (rows.length === 0 && isCrypto && geckoId) {
      const cg = await fetchOhlcvFromCoinGecko(geckoId, upper);
      if (cg.length) return { rows: cg, source: "coingecko", detail: "Used CoinGecko (Alpha Vantage had no series)." };
    }
    if (rows.length === 0) {
      return { rows: [], raw, detail: "No daily series in Alpha Vantage response (check symbol or premium endpoint)." };
    }
    return { rows, raw, source: "alphavantage" };
  } catch (e) {
    console.error(`OHLCV fetch ${upper}:`, e);
    if (isCrypto && geckoId) {
      const rows = await fetchOhlcvFromCoinGecko(geckoId, upper);
      if (rows.length) return { rows, source: "coingecko", detail: "Alpha Vantage request failed; used CoinGecko." };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { rows: [], detail: msg };
  }
}

/** DB interface for storing OHLCV rows. Compatible with sql.js Database. */
export interface OHLCVDbAdapter {
  run: (sql: string, params?: Record<string, string | number | null>) => unknown;
}

function logMem(label: string): void {
  const used = process.memoryUsage();
  console.log(`[mem] ${label}: ${Math.round(used.heapUsed / 1024 / 1024)}MB heap, ${Math.round(used.rss / 1024 / 1024)}MB rss`);
}

function sqlQ(s: string): string {
  return s.replace(/'/g, "''");
}

type OHLCVDeps = {
  getWatchedTickers: () => string[];
  db: OHLCVDbAdapter;
  saveDb: () => void;
  cryptoIds?: Record<string, string>;
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  run: (sql: string, params?: Record<string, string | number | null | undefined>) => { lastInsertRowid: number };
  onGraduationCheck?: () => void;
};

function getAvCallsToday(execAll: OHLCVDeps["execAll"]): number {
  const rows = execAll<{ value: string }>("SELECT value FROM memories WHERE key = 'alphavantage_calls_today' LIMIT 1");
  if (!rows[0]?.value) return 0;
  try {
    const parsed = JSON.parse(rows[0].value) as { date: string; count: number };
    if (parsed.date === new Date().toISOString().slice(0, 10)) return parsed.count;
  } catch (_) {}
  return 0;
}

function bumpAvCalls(execAll: OHLCVDeps["execAll"], run: OHLCVDeps["run"], saveDb: () => void): void {
  const today = new Date().toISOString().slice(0, 10);
  const next = getAvCallsToday(execAll) + 1;
  run(
    `INSERT INTO memories (key, value, confidence, source, updated_at, created_at) VALUES ('alphavantage_calls_today', :value, 1, 'system', :u, :u)
     ON CONFLICT(key) DO UPDATE SET value = :value, updated_at = :u`,
    { ":value": JSON.stringify({ date: today, count: next }), ":u": new Date().toISOString() }
  );
  saveDb();
}

export function createFetchAndStoreOHLCV(deps: OHLCVDeps): () => Promise<void> {
  const { getWatchedTickers, db, saveDb, cryptoIds, execAll, run, onGraduationCheck } = deps;

  function storeRows(symbol: string, result: OHLCVFetchResult): void {
    const rowSource = result.source ?? "alphavantage";
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
          ":source": rowSource,
          ":created_at": new Date().toISOString(),
        }
      );
    }
    if (result.raw) {
      db.run("UPDATE prices SET source_raw = :raw WHERE symbol = :symbol", {
        ":raw": (result.raw as string).slice(0, 50000),
        ":symbol": symbol,
      });
    }
    saveDb();
  }

  return async function fetchAndStoreOHLCV(): Promise<void> {
    logMem("ohlcv start");
    const today = new Date().toISOString().slice(0, 10);
    let avCalls = getAvCallsToday(execAll);

    // Build priority queue:
    // P1: watched tickers not updated today
    const watched = getWatchedTickers();
    const p1: string[] = [];
    for (const sym of watched) {
      const latest = execAll<{ date: string }>(
        `SELECT date FROM ohlcv WHERE symbol = '${sqlQ(sym)}' ORDER BY date DESC LIMIT 1`
      );
      if (!latest[0]?.date || latest[0].date < today) p1.push(sym);
    }

    // P2: active scanner_universe tickers not already in p1, not updated today
    const activeScanner = execAll<{ symbol: string }>(
      "SELECT symbol FROM scanner_universe WHERE active = 1 ORDER BY symbol"
    );
    const p1Set = new Set(p1.map((s) => s.toUpperCase()));
    const p2: string[] = [];
    for (const row of activeScanner) {
      const sym = row.symbol.toUpperCase();
      if (p1Set.has(sym)) continue;
      const latest = execAll<{ date: string }>(
        `SELECT date FROM ohlcv WHERE symbol = '${sqlQ(sym)}' ORDER BY date DESC LIMIT 1`
      );
      if (!latest[0]?.date || latest[0].date < today) p2.push(sym);
    }

    // P3: inactive candidates that need data to graduate (sorted A-Z)
    const allQueued = new Set([...p1Set, ...p2.map((s) => s.toUpperCase())]);
    const inactive = execAll<{ symbol: string }>(
      "SELECT symbol FROM scanner_candidates WHERE status = 'pending' ORDER BY symbol"
    );
    const p3: string[] = [];
    for (const row of inactive) {
      const sym = row.symbol.toUpperCase();
      if (allQueued.has(sym)) continue;
      p3.push(sym);
    }

    const queue = [...p1, ...p2, ...p3];
    let priorityRefreshed = 0;
    let inactiveProgressed = 0;

    for (const symbol of queue) {
      if (avCalls >= AV_DAILY_LIMIT) break;
      const isCrypto = cryptoIds && symbol.toUpperCase() in cryptoIds;
      const result = await fetchOHLCVForTicker(symbol, { cryptoIds });
      if (!result.rows.length) {
        console.warn(`OHLCV skip ${symbol}:`, result.detail ?? "no data or rate limited");
        if (!isCrypto) {
          await new Promise((r) => setTimeout(r, AV_CALL_DELAY_MS));
        }
        continue;
      }
      storeRows(symbol, result);
      const isP3 = p3.includes(symbol);
      if (isP3) inactiveProgressed++;
      else priorityRefreshed++;

      if (result.source === "alphavantage") {
        bumpAvCalls(execAll, run, saveDb);
        avCalls++;
        await new Promise((r) => setTimeout(r, AV_CALL_DELAY_MS));
      }
      console.log(`OHLCV stored ${symbol} (${result.rows.length} bars) [${priorityRefreshed + inactiveProgressed}/${queue.length}]`);
    }

    const remaining = Math.max(0, AV_DAILY_LIMIT - avCalls);
    console.log(
      `OHLCV: ${priorityRefreshed} priority tickers refreshed, ${inactiveProgressed} inactive tickers progressed, ${avCalls} calls used today, ${remaining} remaining`
    );

    onGraduationCheck?.();
    logMem("ohlcv end");
  };
}
