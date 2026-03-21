/**
 * Morning and evening briefings: fetch data, call Gemini, store, optionally email.
 */

import nodemailer from "nodemailer";
import { marked } from "marked";
import { generateText } from "./gemini";

type BriefingRow = { id: number; content: string; created_at: string; type: "morning" | "evening" };

async function tavilySearch(query: string, maxResults = 5): Promise<Array<{ title: string; url: string; content: string }>> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, search_depth: "basic", max_results: maxResults }),
    });
    const data = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }> };
    return res.ok ? (data.results ?? []) : [];
  } catch (_) {
    return [];
  }
}

async function sendBriefingEmail(content: string, subject: string): Promise<boolean> {
  const to = process.env.BRIEFING_EMAIL_TO?.trim();
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!to || !host || !user || !pass) {
    const missing = [to ? null : "BRIEFING_EMAIL_TO", host ? null : "SMTP_HOST", user ? null : "SMTP_USER", pass ? null : "SMTP_PASS"].filter(Boolean);
    console.warn("Briefing email skipped: missing env vars:", missing.join(", "));
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });
    const htmlBody = await Promise.resolve(marked.parse(content));
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#333;max-width:600px;margin:0 auto;padding:16px}
h1,h2,h3{color:#111;margin-top:1.2em;margin-bottom:0.5em}
h2{font-size:1.1em;border-bottom:1px solid #ddd;padding-bottom:4px}
ul,ol{margin:0.5em 0;padding-left:1.5em}
li{margin:0.25em 0}
strong{color:#000}
a{color:#0066cc}
</style></head>
<body>
${htmlBody}
</body>
</html>`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || user,
      to,
      subject,
      text: content,
      html,
    });
    console.log("Briefing email sent to", to);
    return true;
  } catch (e) {
    console.error("Briefing email failed:", e);
    return false;
  }
}

export { sendBriefingEmail };

type BriefingDeps = {
  db: import("sql.js").Database | null;
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  run: (sql: string, params?: Record<string, string | number | null>) => { lastInsertRowid: number };
  saveDb: () => void;
  fetchCoinGecko: () => Promise<void>;
  fetchStocks: () => Promise<void>;
  fetchHN: () => Promise<void>;
  generateSignals: () => void;
  buildLiveContext: () => string;
  buildMemoryContext: () => string;
  getWatchedTickers: () => string[];
  getScannerTopPicks?: () => Array<{ symbol: string; signal: string; score: number; aria_reasoning: string | null; price: number }>;
};

export function createBriefingGenerators(deps: BriefingDeps) {
  const {
    db,
    execAll,
    run,
    saveDb,
    fetchCoinGecko,
    fetchStocks,
    fetchHN,
    generateSignals,
    buildLiveContext,
    buildMemoryContext,
    getWatchedTickers,
  } = deps;

  async function generateBriefing(): Promise<BriefingRow | null> {
    if (!db) return null;
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new Error("GEMINI_API_KEY is not set in .env");
    }

    await fetchCoinGecko();
    await fetchStocks();
    await fetchHN();
    generateSignals();

    const memoryContext = buildMemoryContext();

    // WAYPOINT [briefing-data-fetch]
    // WHAT: Pull watchlist signals, scanner picks, notable movers, and crypto portfolio for briefing.
    // WHY: Briefings must surface insights from a wider set of tickers — not just Nico's fixed watchlist.
    // HOW: Three tiers — watchlist, scanner top picks (discovery), notable movers (±3 score).
    const watchlistSignals = execAll<{
      ticker: string;
      signal: string;
      reasoning: string | null;
      price: number;
      indicator_data: string | null;
      created_at: string;
    }>(
      `SELECT ticker, signal, reasoning, price, indicator_data, created_at FROM signals
       WHERE ticker IN (SELECT DISTINCT symbol FROM prices)
       ORDER BY created_at DESC LIMIT 20`
    );

    const scannerPicks = execAll<{
      symbol: string;
      signal: string;
      score: number;
      rsi: number | null;
      macd_histogram: number | null;
      aria_reasoning: string | null;
      category: string;
      scanned_at: string;
    }>(
      `SELECT symbol, signal, score, rsi, macd_histogram, aria_reasoning, category, scanned_at
       FROM scanner_results
       WHERE aria_reasoning IS NOT NULL AND aria_reasoning != ''
         AND scanned_at >= datetime('now', '-2 days')
       ORDER BY score DESC
       LIMIT 10`
    );

    const notableMovers = execAll<{
      symbol: string;
      signal: string;
      score: number;
      rsi: number | null;
      macd_histogram: number | null;
      category: string;
      scanned_at: string;
    }>(
      `SELECT symbol, signal, score, rsi, macd_histogram, category, scanned_at
       FROM scanner_results
       WHERE (score >= 3 OR score <= -3)
         AND scanned_at >= datetime('now', '-2 days')
         AND (aria_reasoning IS NULL OR aria_reasoning = '')
       ORDER BY ABS(score) DESC
       LIMIT 8`
    );

    const portfolio = execAll<{
      symbol: string;
      current_price: number;
      unrealized_pnl_pct: number;
      market_value: number;
    }>(
      `SELECT symbol, current_price, unrealized_pnl_pct, market_value
       FROM crypto_portfolio
       ORDER BY market_value DESC`
    );

    const news = execAll<{
      id: number;
      title: string;
      url: string | null;
      summary: string | null;
      created_at: string;
    }>(
      `SELECT id, title, url, summary, created_at FROM news
       WHERE title IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5`
    );

    const newsBlock =
      news.length > 0
        ? news
            .map(
              (n) =>
                `- Title: ${n.title}\n  Summary: ${n.summary && n.summary.trim() ? n.summary : "No summary"}\n  Link: ${n.url ?? "—"}`
            )
            .join("\n\n")
        : "(No notable tech news from Hacker News available.)";

    console.log("Briefing data: scannerPicks=", scannerPicks.length, "notableMovers=", notableMovers.length, "news=", news.length);

    // WAYPOINT [briefing-freshness]
    // WHAT: Extract tickers mentioned in yesterday's briefing to avoid repetition.
    // WHY: Day-to-day variety — Worth Watching and Top Signals should feel different.
    // HOW: Parse yesterday's content for 2-5 char uppercase words, filter to known tickers.
    let recentlyMentioned: string[] = [];
    const watchedSet = new Set(getWatchedTickers().map((t) => t.toUpperCase()));
    const scannerSymbols = new Set([...scannerPicks, ...notableMovers].map((r) => r.symbol.toUpperCase()));
    const knownTickers = new Set([...watchedSet, ...scannerSymbols, ...portfolio.map((p) => p.symbol.toUpperCase())]);

    const yesterdayBriefing = execAll<{ content: string }>(
      `SELECT content FROM briefings
       WHERE date(created_at) = date('now', '-1 day')
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (yesterdayBriefing.length) {
      const matches = yesterdayBriefing[0].content.match(/\b[A-Z]{2,5}\b/g) || [];
      recentlyMentioned = [...new Set(matches.map((m) => m.toUpperCase()))].filter((t) => knownTickers.has(t));
    }

    const freshnessRule =
      recentlyMentioned.length > 0
        ? `
FRESHNESS RULE:
These tickers were highlighted yesterday — avoid featuring them again in Worth Watching or Top Signals unless something significant changed (e.g. signal flipped from HOLD to STRONG BUY):
${recentlyMentioned.join(", ")}
`
        : "";

    const scannerNote =
      scannerPicks.length === 0 && notableMovers.length === 0
        ? "\n(Scanner data is empty — scan may not have run yet. Focus on watchlist data only. Note briefly if relevant.)\n"
        : "";

    const userPrompt = `You are ARIA, Nico's personal market intelligence assistant.
Write a morning briefing that is specific, varied, and actionable. Never repeat the same observations two days in a row — always find something fresh to highlight.

DISCOVERY OPPORTUNITIES (from market scan — put these FIRST in Top Signals and Worth Watching when present):

TIER 2 — SCANNER TOP PICKS (broader market, up to 50 stocks scanned):
${JSON.stringify(scannerPicks)}
These are ARIA's highest-conviction picks. OUTSIDE Nico's current watchlist — pure discovery.

TIER 3 — NOTABLE MOVERS (strong signals ±3):
${JSON.stringify(notableMovers)}
Bullish (score ≥3) or bearish (score ≤-3) from today's scan.
${scannerNote}

TIER 1 — NICO'S PORTFOLIO & WATCHLIST:
${JSON.stringify(watchlistSignals)}
His holdings and watchlist. Cover briefly — focus only on what CHANGED or is notable TODAY.

CRYPTO PORTFOLIO:
${JSON.stringify(portfolio)}

TECH NEWS (Hacker News):
${newsBlock}
${memoryContext}
${freshnessRule}

Write the briefing in these sections:

## Good Morning
One sentence on overall market tone today. Make it specific — reference an actual data point.

## Your Portfolio
Cover Nico's holdings only if something notable happened. If everything is flat, say so in one sentence and move on.

## Top Signals Today
Pull the 3 strongest signals from ALL THREE tiers — MUST include scanner picks when available. For each: ticker, signal, composite score (if available), one sentence of plain English reasoning. Label: [WATCHLIST] [SCANNER] [MOVER].

## Worth Watching
2-3 discovery picks from Tier 2 or Tier 3 that Nico does NOT own or watch. When scanner data exists, this section MUST contain scanner tickers — never only watchlist tickers.

## Tech News
Summarize 1-2 of the most relevant HN stories from the Tech News block above. If none, say "No notable tech news from Hacker News available."

## Market Pulse
One paragraph on the broader theme across the data. What sector is strong? What's weak? Be analytical, not generic.

## Action Items
Two specific, concrete things Nico could do today. Reference specific tickers and conditions. Never give generic advice.

RULES:
- Maximum 400 words total
- Never say "as of my last update" or similar hedging
- Never repeat yesterday's action items
- Always reference actual numbers from the data
- Frame everything as "indicators suggest" — never present as financial advice`;

    const systemInstruction = "You are ARIA writing a sharp, no-fluff morning briefing for Nico. Be direct, structured, and concrete. Use short sections and bullets.";
    const content = (await generateText(userPrompt, systemInstruction)).trim();
    if (!content) return null;

    const created_at = new Date().toISOString();
    const result = run("INSERT INTO briefings (content, created_at, type) VALUES (:content, :created_at, :type)", {
      ":content": content,
      ":created_at": created_at,
      ":type": "morning",
    });
    saveDb();

    const rows = execAll<BriefingRow>(
      `SELECT id, content, created_at, type FROM briefings WHERE id = ${result.lastInsertRowid} LIMIT 1`
    );
    return rows[0] ?? null;
  }

  async function generateEveningBriefing(): Promise<BriefingRow | null> {
    if (!db) return null;
    if (!process.env.GEMINI_API_KEY?.trim()) return null;

    await fetchCoinGecko();
    await fetchStocks();
    await fetchHN();
    generateSignals();

    const memoryContext = buildMemoryContext();

    // Same data fetches as morning briefing (WAYPOINT [briefing-data-fetch])
    const watchlistSignals = execAll<{
      ticker: string;
      signal: string;
      reasoning: string | null;
      price: number;
      indicator_data: string | null;
      created_at: string;
    }>(
      `SELECT ticker, signal, reasoning, price, indicator_data, created_at FROM signals
       WHERE ticker IN (SELECT DISTINCT symbol FROM prices)
       ORDER BY created_at DESC LIMIT 20`
    );

    const scannerPicks = execAll<{
      symbol: string;
      signal: string;
      score: number;
      rsi: number | null;
      macd_histogram: number | null;
      aria_reasoning: string | null;
      category: string;
      scanned_at: string;
    }>(
      `SELECT symbol, signal, score, rsi, macd_histogram, aria_reasoning, category, scanned_at
       FROM scanner_results
       WHERE aria_reasoning IS NOT NULL AND aria_reasoning != ''
         AND scanned_at >= datetime('now', '-2 days')
       ORDER BY score DESC
       LIMIT 10`
    );

    const notableMovers = execAll<{
      symbol: string;
      signal: string;
      score: number;
      rsi: number | null;
      macd_histogram: number | null;
      category: string;
      scanned_at: string;
    }>(
      `SELECT symbol, signal, score, rsi, macd_histogram, category, scanned_at
       FROM scanner_results
       WHERE (score >= 3 OR score <= -3)
         AND scanned_at >= datetime('now', '-2 days')
         AND (aria_reasoning IS NULL OR aria_reasoning = '')
       ORDER BY ABS(score) DESC
       LIMIT 8`
    );

    const portfolio = execAll<{
      symbol: string;
      current_price: number;
      unrealized_pnl_pct: number;
      market_value: number;
    }>(
      `SELECT symbol, current_price, unrealized_pnl_pct, market_value
       FROM crypto_portfolio
       ORDER BY market_value DESC`
    );

    const news = execAll<{
      id: number;
      title: string;
      url: string | null;
      summary: string | null;
      created_at: string;
    }>(
      `SELECT id, title, url, summary, created_at FROM news
       WHERE title IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5`
    );

    const newsBlock =
      news.length > 0
        ? news
            .map(
              (n) =>
                `- Title: ${n.title}\n  Summary: ${n.summary && n.summary.trim() ? n.summary : "No summary"}\n  Link: ${n.url ?? "—"}`
            )
            .join("\n\n")
        : "(No notable tech news from Hacker News available.)";

    console.log("Evening briefing data: scannerPicks=", scannerPicks.length, "notableMovers=", notableMovers.length, "news=", news.length);

    // Freshness: avoid repeating yesterday's tickers (WAYPOINT [briefing-freshness])
    let recentlyMentioned: string[] = [];
    const watchedSet = new Set(getWatchedTickers().map((t) => t.toUpperCase()));
    const scannerSymbols = new Set([...scannerPicks, ...notableMovers].map((r) => r.symbol.toUpperCase()));
    const knownTickers = new Set([...watchedSet, ...scannerSymbols, ...portfolio.map((p) => p.symbol.toUpperCase())]);

    const yesterdayBriefing = execAll<{ content: string }>(
      `SELECT content FROM briefings
       WHERE date(created_at) = date('now', '-1 day')
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (yesterdayBriefing.length) {
      const matches = yesterdayBriefing[0].content.match(/\b[A-Z]{2,5}\b/g) || [];
      recentlyMentioned = [...new Set(matches.map((m) => m.toUpperCase()))].filter((t) => knownTickers.has(t));
    }

    const freshnessRule =
      recentlyMentioned.length > 0
        ? `
FRESHNESS RULE:
These tickers were highlighted yesterday — avoid featuring them again in Scanner Standouts or Tomorrow's Watchlist unless something significant changed:
${recentlyMentioned.join(", ")}
`
        : "";

    const scannerNote =
      scannerPicks.length === 0 && notableMovers.length === 0
        ? "\n(Scanner data is empty — focus on watchlist and portfolio data only.)\n"
        : "";

    const userPrompt = `You are ARIA, Nico's personal market intelligence assistant.
Write an evening briefing (6pm) that summarizes the day and sets up tomorrow.

DISCOVERY OPPORTUNITIES (from market scan — put these FIRST in Scanner Standouts and Tomorrow's Watchlist):

TIER 2 — SCANNER TOP PICKS:
${JSON.stringify(scannerPicks)}

TIER 3 — NOTABLE MOVERS:
${JSON.stringify(notableMovers)}
${scannerNote}

TIER 1 — NICO'S PORTFOLIO & WATCHLIST:
${JSON.stringify(watchlistSignals)}

CRYPTO PORTFOLIO:
${JSON.stringify(portfolio)}

TECH NEWS:
${newsBlock}
${memoryContext}
${freshnessRule}

Write the briefing in these sections:

## Market Close Summary
How did the day end overall — reference actual price/signal changes from the data.

## Your Portfolio Today
Only note positions that moved meaningfully today. P&L changes, signal flips, RSI crossing thresholds.

## Scanner Standouts
2-3 tickers from scanner_results with the most interesting movement today. MUST include scanner picks when data exists.

## Tomorrow's Watchlist
2-3 tickers for tomorrow morning. Draw from scanner picks with strong but not yet extreme RSI.

## Tech News
1-2 relevant HN stories from the Tech News block. If none, say "No notable tech news available."

## Evening Action Item
One specific thing to consider before tomorrow's open.

RULES:
- Maximum 400 words total
- Frame everything as "indicators suggest" — never present as financial advice
- Reference actual numbers from the data`;

    const systemInstruction = "You are ARIA writing a sharp evening briefing for Nico. Direct, concrete, no fluff. Use short bullets.";
    const content = (await generateText(userPrompt, systemInstruction)).trim();
    if (!content) return null;

    const created_at = new Date().toISOString();
    const result = run("INSERT INTO briefings (content, created_at, type) VALUES (:content, :created_at, :type)", {
      ":content": content,
      ":created_at": created_at,
      ":type": "evening",
    });
    saveDb();

    const rows = execAll<BriefingRow>(
      `SELECT id, content, created_at, type FROM briefings WHERE id = ${result.lastInsertRowid} LIMIT 1`
    );
    return rows[0] ?? null;
  }

  return { generateBriefing, generateEveningBriefing };
}
