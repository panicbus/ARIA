# ARIA — Architecture Schematic

> Full technical reference for understanding how ARIA is structured. Share this with Claude or any AI/developer to ensure full context.

---

## 1. Overview

**ARIA** (Autonomous Research & Intelligence Assistant) is a personal intelligence layer for tech industry, financial signals, and developer growth. Built for Nico, a senior frontend developer in the Bay Area.

**Core domains:**
1. **Tech & AI** — Industry monitoring, AI agents, frontend tooling
2. **Financial** — Stocks/crypto signals (BUY/SELL/HOLD/WATCH), risk framing
3. **Developer growth** — Learning, building, autonomous agents

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite (port 5173) |
| **Backend** | Node.js 18+, Express, TypeScript |
| **Database** | sql.js (in-memory SQLite, persisted to `aria.db`) |
| **AI** | Google Gemini API (`@google/generative-ai`), model configurable via `GEMINI_MODEL` |
| **Charts** | Recharts |
| **Markdown** | react-markdown, marked, remark-gfm |

**Key dependencies:** axios, jsdom, node-cron, nodemailer, tweetnacl (Robinhood auth), @mozilla/readability (article extraction)

---

## 3. Project Structure

```
aria/
├── src/                          # Frontend (React)
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Root component, layout, tabs, chat
│   ├── config.ts                 # API base URL, constants, signalColors
│   ├── types/index.ts            # Shared TypeScript types
│   └── components/
│       ├── chat/                 # ChatMessage, MarkdownContent
│       ├── holdings/             # HoldingsCard
│       ├── sidebar/               # HoldingsAccordion, MarketPulseAccordion, BuildPhaseList, TechNewsList
│       ├── tabs/                 # PortfolioTab, SignalsTab, ScannerTab, BacktestTab, BriefingTab, TechNewsTab, MemoryTab
│       └── ui/                   # StatusDot, MetricCard, TypingIndicator
├── server/                       # Backend (Express)
│   ├── index.ts                  # Entry, DB init, cron, route wiring
│   ├── routes/                   # HTTP handlers
│   │   ├── chat.ts
│   │   ├── dashboard.ts
│   │   ├── signals.ts
│   │   ├── briefings.ts
│   │   ├── backtest.ts
│   │   ├── scanner.ts
│   │   ├── portfolio.ts
│   │   ├── ohlcv.ts
│   │   ├── memories.ts
│   │   └── health.ts
│   └── services/                 # Business logic
│       ├── gemini.ts             # AI client (generateText, generateChatResponse)
│       ├── chatTools.ts          # Tool definitions + handlers, memory extraction
│       ├── context.ts            # buildLiveContext, buildMemoryContext, getRiskContextForTicker
│       ├── liveData.ts           # Prices (CoinGecko, Finnhub), news (HN)
│       ├── signals.ts            # Signal generation (RSI, MACD, MAs)
│       ├── ohlcv.ts              # Historical OHLCV (Alphavantage)
│       ├── indicators.ts         # RSI, MACD, MA calculations
│       ├── backtest.ts           # Historical simulation
│       ├── scanner.ts            # Market scan, ARIA picks
│       ├── briefings.ts          # Morning/evening briefings, email
│       └── robinhood.ts          # Robinhood Crypto API
├── index.html
├── vite.config.ts                # Proxy /api → localhost:3001
├── .env                          # Secrets (not committed)
└── aria.db                       # SQLite DB (created at runtime)
```

---

## 4. Database Schema (sql.js / SQLite)

**Location:** `DATA_DIR/aria.db` (default: project root). In-memory at runtime; persisted via `saveDb()` after writes.

| Table | Purpose |
|-------|---------|
| `messages` | Chat history (role, content, created_at) |
| `signals` | BUY/SELL/HOLD/WATCH per ticker (ticker, signal, reasoning, price, indicator_data JSON) |
| `prices` | Latest price per symbol (symbol PK, price, change_24h, source, updated_at) |
| `news` | Hacker News headlines (id, title, url, source, created_at, summary) |
| `briefings` | Morning/evening briefings (content, created_at, type) |
| `memories` | Key-value store (key UNIQUE, value, confidence, source, updated_at) — positions, watchlist, preferences |
| `ohlcv` | OHLCV history (symbol, date, open, high, low, close, volume, source) |
| `scanner_universe` | Symbols to scan (symbol, category, active) |
| `scanner_results` | Scan results (symbol, signal, score, rsi, macd_histogram, price, aria_reasoning, etc.) |
| `crypto_portfolio` | Robinhood crypto positions (symbol, quantity, cost_basis, average_buy_price, current_price, market_value, unrealized_pnl, buying_power, etc.) |

**DB helpers:** `execAll()` for SELECTs, `run()` for INSERT/UPDATE/DELETE, `saveDb()` after every write.

---

## 5. API Endpoints

**Base URL:** `/api` (or `http://localhost:3001/api` in dev; Vite proxies `/api` → 3001)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Liveness (root, no /api prefix) |
| `/api/health` | GET | Health with DB check |
| `/api/health/debug` | GET | Debug info |
| `/api/health/gemini-test` | GET | Test Gemini API |
| `/api/dashboard` | GET | Prices, news, signalsByTicker for sidebar |
| `/api/dashboard/market-pulse` | GET | Market Pulse entries |
| `/api/dashboard/prices` | GET | Raw prices |
| `/api/dashboard/news` | GET | Raw news |
| `/api/signals` | GET | List signals |
| `/api/signals` | POST | Add signal |
| `/api/signals/generate` | POST | Regenerate all signals |
| `/api/signals/:ticker` | GET | Signal for ticker |
| `/api/chat` | POST | Send message, get reply (tool-calling loop) |
| `/api/history` | GET | Chat history |
| `/api/history` | DELETE | Clear chat |
| `/api/memories` | GET | All memories |
| `/api/memories` | POST | Create/update memory |
| `/api/memories` | DELETE | Delete by key |
| `/api/memories/export` | GET | Export JSON |
| `/api/memories/import` | POST | Import JSON |
| `/api/briefings` | GET | List briefings |
| `/api/briefings` | DELETE | Delete briefing |
| `/api/briefings/generate` | POST | Generate morning briefing |
| `/api/briefings/generate-evening` | POST | Generate evening briefing |
| `/api/briefings/email-test` | GET | Test SMTP |
| `/api/backtest` | GET | Run backtest (?ticker=, ?days=) |
| `/api/scanner` | GET | List routes |
| `/api/scanner/universe` | GET | Scanner universe |
| `/api/scanner/results` | GET | Scan results |
| `/api/scanner/status` | GET | Last scan, scanning, apiCallsRemaining |
| `/api/scanner/run` | POST | Trigger scan |
| `/api/scanner/company/:symbol` | GET | Company name (Finnhub) |
| `/api/portfolio/crypto` | GET | Robinhood crypto holdings |
| `/api/portfolio/summary` | GET | Portfolio summary |
| `/api/portfolio/aria-take` | GET | ARIA's take per asset |
| `/api/portfolio/refresh` | POST | Refresh crypto from Robinhood |
| `/api/ohlcv` | GET | OHLCV routes |
| `/api/ohlcv/status` | GET | OHLCV status |
| `/api/ohlcv/:symbol` | GET | OHLCV for symbol |
| `/api/ohlcv/refresh-all` | POST | Refresh all OHLCV |
| `/api/ohlcv/refresh/:symbol` | POST | Refresh one symbol |

---

## 6. Frontend Architecture

### 6.1 Entry & Layout

- **main.tsx** → `App` (React.StrictMode)
- **App.tsx**:
  - Single root layout: header + sidebar + main content
  - **Header:** ARIA branding, StatusDot, 8 tab buttons (chat, portfolio, signals, scanner, backtest, briefing, news, memory)
  - **Sidebar:** Resizable (260px default, drag handle), HoldingsAccordion, MarketPulseAccordion, BuildPhaseList
  - **Main:** Tab content (conditional render by `activeTab`)

### 6.2 State (App.tsx)

- `messages`, `input`, `loading`, `online` — chat
- `activeTab` — which tab is active
- `sidebarWidth`, `resizing` — sidebar resize
- `dashboard`, `signals`, `memories` — fetched data
- `holdingsOpen`, `marketPulseOpen` — accordion state
- `backtestPreselectedTicker`, `quickMode` — chat/backtest options

### 6.3 Data Fetching

- **Dashboard:** `GET /api/dashboard` every `DASHBOARD_POLL_MS` (60s)
- **Signals:** `GET /api/signals` every 60s
- **Memories:** `GET /api/memories` on load + interval
- **History:** `GET /api/history` on load, visibility change

### 6.4 Styling

- **Inline styles** only (no CSS files)
- Global `<style>` block in App: fonts (Syne, DM Sans, DM Mono), CSS vars, scrollbar, keyframes
- Dark theme: `#0a0a0a` background, `#00ff94` accent, `#f0f0f0` text

### 6.5 Config (src/config.ts)

- `API` — base URL (`/api` or full origin)
- `SUGGESTED_PROMPTS`, `FALLBACK_TICKERS`, `DASHBOARD_POLL_MS`
- `signalColors` — BUY/SELL/HOLD/WATCH colors
- `MEMORY_SECTIONS`, `RISK_OPTIONS`, `SIGNALS_OPTIONS`

---

## 7. Backend Architecture

### 7.1 Startup Flow (server/index.ts)

1. `import "dotenv/config"` — **first** so env is loaded before any module
2. `start()` async:
   - Load sql.js, init DB from `aria.db` (or create new)
   - Run migrations (ALTER TABLE for new columns)
   - Seed `watchlist_core` if empty
   - Create services (dependency injection via factory functions)
   - Mount routes
   - Start server
   - Run initial fetches (prices, news, signals, OHLCV, crypto)
   - Set intervals

### 7.2 Key Concepts

- **getWatchedTickers():** Merges `BASE_TICKERS` with memory (`watchlist_core`, `watchlist_speculative`, `position_*`). Drives signals, OHLCV, live data.
- **Factory pattern:** Services receive `{ db, execAll, run, saveDb, getWatchedTickers, ... }` and return functions.

### 7.3 Scheduled Jobs (node-cron, Pacific timezone)

| Time | Job |
|------|-----|
| Every 5 min | Prices (crypto, stocks), crypto portfolio refresh |
| Every 15 min | fetchHN |
| Every 5 min | generateSignals |
| 3am, 1st & 15th | DB backup |
| 6am daily | OHLCV refresh |
| 7am daily | Scanner run |
| 8am weekdays | Morning briefing (email if SMTP configured) |
| 6pm weekdays | Evening briefing |

### 7.4 Chat Flow

1. User sends message → `POST /api/chat`
2. Message saved to DB
3. `buildLiveContext()` + `buildMemoryContext()` → system prompt
4. Gemini chat with `GEMINI_TOOLS` (tool-calling)
5. Loop: if model returns function calls → `handleToolCall()` → feed result back → repeat until text-only
6. Response saved to DB
7. `runMemoryExtraction()` — extract facts from conversation, call `remember` tool

### 7.5 Chat Tools (chatTools.ts)

| Tool | Purpose |
|------|---------|
| `get_prices` | Prices from DB |
| `get_signals` | Signals from DB |
| `get_news` | HN headlines from DB |
| `generate_signal` | Run signal logic for ticker |
| `remember` | Persist memory (key, value) |
| `recall` | All memories |
| `get_risk_context` | Position size %, stop-loss, take-profit for ticker |
| `get_portfolio` | Robinhood crypto positions |
| `scan_market` | Scanner top picks |
| `web_search` | Tavily API (requires TAVILY_API_KEY) |
| `add_to_watchlist` | Add ticker (core/speculative) |
| `remove_from_watchlist` | Remove ticker |
| `add_position` | Add/update stock position |
| `remove_position` | Remove stock position |

---

## 8. Environment Variables (.env)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Gemini API |
| `GEMINI_MODEL` | No | Override model (default gemini-2.5-flash) |
| `FINNHUB_API_KEY` | No | Stock prices, scanner company names |
| `ALPHAVANTAGE_API_KEY` | No | OHLCV, backtest |
| `TAVILY_API_KEY` | No | Web search |
| `ROBINHOOD_API_KEY` | No | Crypto portfolio |
| `ROBINHOOD_PRIVATE_KEY` | No | Robinhood auth |
| `BRIEFING_EMAIL_TO` | No | Email briefing |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Email delivery |
| `TZ` | No | Display timezone (default America/Los_Angeles) |
| `DATA_DIR` | No | DB path (default project root) |
| `PORT` | No | Server port (default 3001) |

---

## 9. Data Flow

```
External APIs → liveData (fetchHN, fetchStocks, fetchCryptoPrices)
                    ↓
              prices, news tables
                    ↓
              signals (RSI, MACD, MAs) → signals table
                    ↓
              Dashboard (prices, news, signalsByTicker)
                    ↓
              Frontend (sidebar, tabs)

Memory (chat, remember tool) → memories table
                    ↓
              getWatchedTickers() → drives signals, OHLCV, scanner
```

---

## 10. Memory Keys (Semantics)

- `watchlist_core` — JSON array of tickers
- `watchlist_speculative` — JSON array of tickers
- `position_TICKER` — JSON `{ quantity, average_cost }` for positions
- `risk_tolerance` — "conservative" | "moderate" | "aggressive"
- `signals_preference` — "daily" | "weekly" | "on_demand"
- Other `pref_*` or custom keys for context

---

## 11. Build & Run

```bash
npm run dev      # Concurrent: server (3001) + client (5173)
npm run server   # ts-node-dev server/index.ts
npm run client   # Vite (5173)
npm run build    # tsc + vite build
npm run start    # node dist-server/server/index.js (production)
```

---

## 12. Conventions

- **Timestamps:** SQLite `CURRENT_TIMESTAMP` is UTC; display uses `TZ` (America/Los_Angeles)
- **API:** All JSON; errors return `{ error: "..." }`
- **CORS:** Enabled for all origins
- **Production:** Serves `dist/` static files; `GET *` → index.html for SPA
