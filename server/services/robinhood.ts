/**
 * Robinhood Crypto API service.
 * Phase 6a — Real Portfolio: Crypto
 *
 * WAYPOINT [robinhood]
 * WHAT: Connects ARIA to Robinhood Crypto API for real account data — positions, cost basis, P&L.
 * WHY: Replaces generic market data with Nico's actual holdings so ARIA can give personal advice.
 * HOW IT HELPS NICO: ARIA says "you're up 14% on your BTC" not "BTC signal is WATCH."
 *
 * Uses tweetnacl for Ed25519 signing — Robinhood exports raw base64 keys that Node's OpenSSL
 * can fail to parse (ERR_OSSL_UNSUPPORTED), so we use pure JS Ed25519 instead.
 *
 * Uses native https module instead of fetch — Cloudflare blocks Node's fetch; https works.
 */

import nacl from "tweetnacl";
import https from "https";
import { sign, createPrivateKey } from "crypto";

const ROBINHOOD_HOST = "trading.robinhood.com";

let requestCount = 0;
let lastResetAt = Date.now();
const RATE_LIMIT = 30;

function checkRateLimit(): void {
  const now = Date.now();
  if (now - lastResetAt >= 60_000) {
    requestCount = 0;
    lastResetAt = now;
  }
  if (requestCount >= RATE_LIMIT - 5) {
    console.warn(`Robinhood API: approaching rate limit (${requestCount}/${RATE_LIMIT})`);
  }
}

/**
 * Robinhood exports raw base64 (32-byte Ed25519 seed). Use tweetnacl to avoid OpenSSL decoder issues.
 */
function signWithRawBase64(raw: string, message: Buffer): string {
  const base64 = raw.replace(/\s/g, "").trim();
  const seed = new Uint8Array(Buffer.from(base64, "base64"));
  if (seed.length !== 32) {
    throw new Error(`Robinhood private key: expected 32 bytes, got ${seed.length}`);
  }
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  const signature = nacl.sign.detached(message, keypair.secretKey);
  return Buffer.from(signature).toString("base64");
}

/**
 * PEM format — try Node crypto (OpenSSL). Fails on some systems with Ed25519.
 */
function signWithPem(pem: string, message: Buffer): string {
  const key = createPrivateKey({ key: pem, format: "pem" });
  const sig = sign(null, message, key);
  return sig.toString("base64");
}

/**
 * Normalize PEM from .env (handles \n, \r\n, single-line). Returns null if not PEM.
 */
function normalizePem(raw: string): string | null {
  let pem = raw
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!pem.includes("-----BEGIN")) return null;
  const beginMatch = pem.match(/-----BEGIN [^-]+-----/);
  const endMatch = pem.match(/-----END [^-]+-----/);
  if (beginMatch && endMatch) {
    const begin = beginMatch[0];
    const end = endMatch[0];
    const middle = pem.slice(begin.length, pem.indexOf(end)).replace(/\s/g, "");
    if (middle && !pem.includes("\n")) {
      pem = `${begin}\n${middle}\n${end}`;
    }
  }
  return pem;
}

/**
 * Robinhood signs: api_key + timestamp + path + method + body (no separators).
 * Path must be normalized: start with /, method uppercase.
 * Ref: albedosehen/robinhood-crypto-client createSignatureMessage
 */
function signRequest(
  apiKey: string,
  privateKeyRaw: string,
  timestamp: string,
  path: string,
  method: string,
  body: string
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedMethod = method.toUpperCase();
  const messageStr = `${apiKey}${timestamp}${normalizedPath}${normalizedMethod}${body}`;
  const message = Buffer.from(messageStr, "utf8");

  const pem = normalizePem(privateKeyRaw);
  if (pem) {
    try {
      return signWithPem(pem, message);
    } catch {
      // OpenSSL may fail; fall through to try raw base64
    }
  }

  // Robinhood format: raw base64
  return signWithRawBase64(privateKeyRaw.trim(), message);
}

function getRobinhoodHeaders(path: string, method: string, body: string): Record<string, string> {
  const apiKey = process.env.ROBINHOOD_API_KEY?.trim() ?? "";
  const privateKeyPem = process.env.ROBINHOOD_PRIVATE_KEY?.trim() ?? "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = signRequest(apiKey, privateKeyPem, timestamp, path, method, body);
  return {
    "x-api-key": apiKey,
    "x-timestamp": timestamp,
    "x-signature": sig,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };
}

function isConfigured(): boolean {
  return !!(process.env.ROBINHOOD_API_KEY?.trim() && process.env.ROBINHOOD_PRIVATE_KEY?.trim());
}

export type RobinhoodAccount = {
  buying_power: number;
  portfolio_value: number;
  currency: string;
};

export type RobinhoodHolding = {
  symbol: string;
  quantity: number;
  cost_basis: number;
  average_buy_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
};

export type RobinhoodSummary = {
  account: RobinhoodAccount;
  holdings: RobinhoodHolding[];
  last_updated: string;
};

// Include all Robinhood holdings — don't filter to a fixed list. Robinhood may add cryptos (e.g. DOGE, SOL).
const ROBINHOOD_SYMBOL_MAP: Record<string, string> = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  DOGE: "DOGE-USD",
  LTC: "LTC-USD",
  SOL: "SOL-USD",
  AVAX: "AVAX-USD",
  SHIB: "SHIB-USD",
  LINK: "LINK-USD",
  UNI: "UNI-USD",
  MATIC: "MATIC-USD",
  ATOM: "ATOM-USD",
  XLM: "XLM-USD",
  BCH: "BCH-USD",
  ETC: "ETC-USD",
  ADA: "ADA-USD",
  DOT: "DOT-USD",
};

function rhFetch<T>(path: string, options: { method?: string; body?: string } = {}): Promise<T | null> {
  if (!isConfigured()) return Promise.resolve(null);
  checkRateLimit();
  requestCount++;

  const method = (options.method ?? "GET").toUpperCase();
  const bodyStr = typeof options.body === "string" ? options.body : "";
  const headers = getRobinhoodHeaders(path, method, bodyStr);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: ROBINHOOD_HOST,
        path,
        method,
        headers: { ...headers, ...(options.body ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}) },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 400) {
            console.warn(`Robinhood API ${path}: ${res.statusCode}`, text.slice(0, 500));
            resolve(null);
            return;
          }
          try {
            resolve(text ? (JSON.parse(text) as T) : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", (e) => {
      console.warn("Robinhood API error:", e);
      resolve(null);
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function fetchCryptoAccount(): Promise<RobinhoodAccount | null> {
  const path = "/api/v1/crypto/trading/accounts/";
  const data = await rhFetch<{ results?: Array<Record<string, unknown>> }>(path);
  if (!data?.results?.[0]) return null;
  const r = data.results[0] as Record<string, unknown>;
  const buyingPower = r.buying_power != null ? Number(r.buying_power) : 0;
  const portfolioValue = r.portfolio_value != null ? Number(r.portfolio_value) : 0;
  const currency = typeof r.currency === "string" ? r.currency : "USD";
  return { buying_power: buyingPower, portfolio_value: portfolioValue, currency };
}

export async function fetchCryptoHoldings(): Promise<RobinhoodHolding[] | null> {
  const path = "/api/v1/crypto/trading/holdings/";
  const data = await rhFetch<{ results?: Array<Record<string, unknown>> }>(path);
  if (!data?.results) return null;

  const holdings: RobinhoodHolding[] = [];
  for (const r of data.results) {
    const symbolRaw = (r.asset_code ?? r.symbol ?? r.currency ?? (r as any).currency?.code ?? "") as string;
    const symbol = String(symbolRaw).replace(/-USD$/i, "").toUpperCase().trim();
    if (!symbol || symbol.length > 10) continue;

    const quantity = Number(r.total_quantity ?? r.quantity ?? r.amount ?? r.quantity_available_for_trading ?? r.quantity_available ?? 0) || 0;
    const costBasis = Number(r.cost_basis ?? r.cost_basis_amount ?? r.cost_basis_price ?? 0) || 0;
    const avgBuy = Number(r.average_buy_price ?? r.average_price ?? r.average_buy ?? costBasis / (quantity || 1)) || 0;
    let currentPrice = Number(r.current_price ?? r.market_price ?? r.market_value ?? 0) || 0;
    if (currentPrice <= 0) currentPrice = (await fetchCryptoPrice(symbol)) ?? 0;
    const marketValue = Number(r.market_value ?? r.equity ?? r.value ?? quantity * currentPrice) || 0;
    const unrealizedPnl = Number(r.unrealized_pnl ?? r.unrealized_pnl_amount ?? marketValue - costBasis) || 0;
    const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

    holdings.push({
      symbol,
      quantity,
      cost_basis: costBasis,
      average_buy_price: avgBuy,
      current_price: currentPrice,
      market_value: marketValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_pct: unrealizedPnlPct,
    });
  }
  return holdings;
}

export async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  const rhSymbol = ROBINHOOD_SYMBOL_MAP[symbol.toUpperCase()] ?? `${symbol.toUpperCase()}-USD`;
  const path = `/api/v1/crypto/marketdata/best_bid_ask/?symbol=${encodeURIComponent(rhSymbol)}`;
  const data = await rhFetch<{
    results?: Array<{
      price?: string;
      bid_inclusive_of_sell_spread?: string;
      ask_inclusive_of_buy_spread?: string;
    }>;
  }>(path);

  if (!data?.results?.[0]) return null;

  const r = data.results[0];
  const price = parseFloat(String(r.price ?? 0)) || 0;
  if (price > 0) return price;

  const bid = parseFloat(String(r.bid_inclusive_of_sell_spread ?? 0)) || 0;
  const ask = parseFloat(String(r.ask_inclusive_of_buy_spread ?? 0)) || 0;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  if (bid > 0) return bid;
  if (ask > 0) return ask;
  return null;
}

export async function fetchCryptoPortfolioSummary(): Promise<RobinhoodSummary | null> {
  if (!isConfigured()) return null;

  const [account, holdings] = await Promise.all([fetchCryptoAccount(), fetchCryptoHoldings()]);
  if (!account && !holdings?.length) return null;

  return {
    account: account ?? { buying_power: 0, portfolio_value: 0, currency: "USD" },
    holdings: holdings ?? [],
    last_updated: new Date().toISOString(),
  };
}

export function logRobinhoodStatus(): void {
  if (!isConfigured()) {
    console.warn("  Robinhood: credentials not in .env — crypto prices use CoinGecko; Portfolio tab shows unconfigured state.");
  } else {
    console.log("  Robinhood: API key and private key present — crypto uses Robinhood primary, CoinGecko fallback.");
  }
}
