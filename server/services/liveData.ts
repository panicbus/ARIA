/**
 * Live data fetchers: CoinGecko (crypto), Finnhub (stocks), Hacker News.
 * Used by start() intervals and briefing generation.
 */

const HN_TOP = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

export type LiveDataDeps = {
  db: import("sql.js").Database | null;
  saveDb: () => void;
  getWatchedTickers: () => string[];
  cryptoIds: Record<string, string>;
  coingeckoIdToSymbol: Record<string, string>;
};

export function createLiveDataFetchers(deps: LiveDataDeps) {
  const { db, saveDb, getWatchedTickers, cryptoIds, coingeckoIdToSymbol } = deps;

  async function fetchCoinGecko(): Promise<void> {
    if (!db) return;
    const tickers = getWatchedTickers();
    const crypto = tickers.filter((s) => s in cryptoIds);
    if (crypto.length === 0) return;
    const ids = crypto.map((s) => cryptoIds[s]).filter(Boolean).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    try {
      const res = await fetch(url);
      const data = (await res.json()) as Record<string, { usd: number; usd_24h_change?: number }>;
      const now = new Date().toISOString();
      for (const [id, v] of Object.entries(data)) {
        const symbol = coingeckoIdToSymbol[id] ?? id.toUpperCase();
        const price = v.usd;
        const change = v.usd_24h_change ?? null;
        db.run(
          "INSERT OR REPLACE INTO prices (symbol, price, change_24h, source, updated_at) VALUES (:symbol, :price, :change_24h, :source, :updated_at)",
          { ":symbol": symbol, ":price": price, ":change_24h": change, ":source": "coingecko", ":updated_at": now }
        );
      }
      saveDb();
    } catch (e) {
      console.error("CoinGecko fetch error:", e);
    }
  }

  async function fetchStocks(): Promise<void> {
    if (!db) return;
    const key = process.env.FINNHUB_API_KEY?.trim();
    if (!key) {
      console.warn("Stocks: Add FINNHUB_API_KEY to .env (free at finnhub.io).");
      return;
    }
    const finnhubQuote = (symbol: string) =>
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;
    const symbols = getWatchedTickers().filter((s) => s !== "BTC");
    const now = new Date().toISOString();
    for (const symbol of symbols) {
      try {
        const res = await fetch(finnhubQuote(symbol));
        const text = await res.text();
        if (!res.ok) {
          console.warn(`Finnhub ${symbol}: ${res.status} ${text.slice(0, 80)}`);
          continue;
        }
        const data = JSON.parse(text) as { c?: number; dp?: number };
        const price = data?.c;
        if (price == null || typeof price !== "number") continue;
        const pct = typeof data?.dp === "number" ? data.dp : null;
        db.run(
          "INSERT OR REPLACE INTO prices (symbol, price, change_24h, source, updated_at) VALUES (:symbol, :price, :change_24h, :source, :updated_at)",
          { ":symbol": symbol, ":price": price, ":change_24h": pct, ":source": "finnhub", ":updated_at": now }
        );
      } catch (e) {
        console.warn(`Finnhub ${symbol} fetch error:`, e);
      }
    }
    saveDb();
  }

  async function fetchHN(): Promise<void> {
    if (!db) return;
    try {
      const ids = (await (await fetch(HN_TOP)).json()) as number[];
      const top = ids.slice(0, 10);
      for (const id of top) {
        const item = (await (await fetch(HN_ITEM(id))).json()) as { title?: string; url?: string } | null;
        if (!item?.title) continue;
        const title = String(item.title).slice(0, 200);
        const url = item.url ?? null;
        db.run(
          "INSERT OR IGNORE INTO news (id, title, url, source, created_at) VALUES (:id, :title, :url, :source, :created_at)",
          { ":id": id, ":title": title, ":url": url, ":source": "hackernews", ":created_at": new Date().toISOString() }
        );
      }
      saveDb();
    } catch (e) {
      console.error("HN fetch error:", e);
    }
  }

  return { fetchCoinGecko, fetchStocks, fetchHN };
}
