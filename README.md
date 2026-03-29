# ARIA — Autonomous Research & Intelligence Assistant

> Your personal intelligence layer for tech, finance, and developer growth. React + Gemini + SQLite.

## Stack
- **Frontend**: React + TypeScript + Vite (port 5173)
- **Backend**: Node.js + TypeScript + Express (port 3001)
- **AI Brain**: Google Gemini 2.0 Flash
- **Memory**: SQLite via sql.js (local file: `aria.db`, no native build)
- **Deployed**: Fly.io (512 MB VM) — [aria-nico.fly.dev](https://aria-nico.fly.dev)

---

## Setup (5 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure API keys
```bash
cp .env.example .env
```
Open `.env` and add:

- **`GEMINI_API_KEY`** (required) — Chat, briefings, scanner, weekly nominations. Get at [aistudio.google.com](https://aistudio.google.com)
- **`FINNHUB_API_KEY`** — Live stock prices and scanner (free at finnhub.io)
- **`ALPHAVANTAGE_API_KEY`** — OHLCV history, backtest, scanner indicators (25 req/day free)
- **`TAVILY_API_KEY`** — Web search and evening briefing (optional)

### 3. Run ARIA
```bash
npm run dev
```

This starts both the server (port 3001) and the frontend (port 5173) simultaneously.

Open your browser to: **http://localhost:5173**

---

## Build Phases

### Phase 1 — The Shell ✅ `Mar 11`
- Hybrid UI — chat panel + dashboard sidebar
- AI wired in with ARIA's system prompt
- Persistent memory via SQLite (conversations survive restarts)
- AI Radar panel
- Build Phase tracker

### Phase 2 — The Eyes ✅ `Mar 12`
- **Live prices**: CoinGecko (crypto) + Finnhub (stocks) — stored in DB, refreshed every 5 min
- **Tech news**: Hacker News top stories — fetched every 15 min, linked in sidebar
- **Real signals**: BUY/SELL/HOLD/WATCH generated from 24h price moves, stored in DB, refreshed every 5 min
- **Dashboard sidebar**: Market Pulse and Tech News (HN) update on a 1‑minute poll
- **Signals tab**: List of live signals with ticker, signal, reasoning, price

### Phase 3 — The Brain ✅ `Mar 15`
- **Tool calling** — ARIA uses local tools: `get_prices`, `get_signals`, `get_news`, `generate_signal`, `get_risk_context`, `remember`, `recall`
- **Scheduled tasks** — Cron: prices (5 min), news (15 min), signals (5 min), morning briefing
- **Agent loop** — AI chains multiple tool calls until it returns only text
- **Memory extraction** — After each reply, ARIA extracts facts (positions, preferences, risk tolerance) and persists them

### Phase 4 — The Edge ✅ `Mar 16`
- **OHLCV historical** — Alphavantage (stocks + crypto), last 100 days
- **Technical indicators** — RSI, MACD, 20/50 MAs → composite signals with methodology
- **Backtest engine** — Historical simulation, equity curve, win rate, drawdown; exposed via API and Backtest tab
- **Risk framing** — `get_risk_context` tool: position size %, stop-loss, take-profit, risk:reward, confidence
- **Memory tab** — Portfolio (positions, watchlist), preferences, context; add/edit/delete, export JSON, clear all
- **Watchlist from memory** — Holdings + watchlist drive price/OHLCV/signal fetching
- **Morning briefing** — Structured digest with market summary, signals with risk framing, HN news, action items (8:30am weekdays)
- **Evening briefing** — 6pm weekdays: upside tickers, market-moving news, portfolio snapshot, tech/AI pulse; optional email delivery
- **Holdings in sidebar** — Positions from memory shown in collapsible accordion with live sparkline charts

### Phase 5 — The Scanner ✅ `Mar 16`
- **Proactive discovery** — Scans a curated universe beyond your holdings
- **Same signal logic** — RSI, MACD, MAs applied across universe; composite score −6 to +6
- **ARIA filtering** — Gemini selects 3–7 top picks with plain‑English reasoning per ticker
- **Scanner tab** — ARIA's picks, full results accordion, "Add to Watchlist", "View Backtest", filter pills
- **Daily scan** — Runs before morning briefing; Alphavantage 25 req/day limit respected
- **Morning briefing** — "Worth Watching Today" section from scanner picks (score ≥ +3)
- **`scan_market` tool** — ARIA can answer "anything interesting in the market today?" from scanner data

### Phase 6a — Real Portfolio ✅ `Mar 15`
- **Crypto portfolio** — Track holdings with cost basis, live P&L, allocation breakdown
- **Portfolio tab** — Add/remove positions, total value, per-asset gain/loss
- **Chat tools** — `add_position`, `remove_position` let ARIA manage your portfolio conversationally

### Phase 6b — Mobile ✅ `Mar 21`
- **Responsive layout** — Full mobile-first redesign; bottom tab bar, swipeable panels
- **Touch-friendly controls** — Larger tap targets, collapsible sections, mobile-optimized charts
- **PWA-ready** — Apple touch icon, viewport meta, standalone capable

### Phase 7 — Dynamic Scanner Universe ✅ `Mar 27`
- **65-ticker seed universe** — Conservative (25), Moderate (20), Aggressive (20) across 13 categories: mega cap, finance, healthcare, consumer, energy, growth tech, emerging tech, EV/clean energy, consumer growth, AI/quantum, space/defense, fintech, biotech
- **Graduation pipeline** — Tickers start inactive and graduate to the active scanner only after accumulating ≥ 50 days of OHLCV data, preventing garbage signals from insufficient history
- **OHLCV priority queue** — Fetches watched tickers first, then active scanner, then pending candidates; respects the 24-call/day Alphavantage hard limit with 500ms delay between calls
- **Weekly AI nomination** — Every Sunday at 05:00, Gemini nominates 5 new tickers based on underrepresented sectors and emerging themes (capped at 100 total candidates)
- **Memory-safe batching** — Scanner processes 10 tickers per batch with 1s delay; memory logged before and after each batch
- **Staggered cron schedule** — Nomination (Sun 05:00) → OHLCV (06:00) → Scanner (07:30) → Morning briefing (08:30) → Evening briefing (18:00) to prevent memory spikes on the 512 MB VM
- **Pipeline UI** — ScannerTab shows active + pipeline counts, collapsible graduation progress section with per-ticker OHLCV progress bars
- **New routes** — `/candidates`, `/universe/stats`, `/nominate`

---

## Web Search (Tavily)

ARIA can search the web for current information. **To enable:**

1. Sign up at [tavily.com](https://tavily.com) — free tier: 1K searches/month, no credit card
2. Get your API key
3. Add to `.env`: `TAVILY_API_KEY=tvly-your-key`
4. Restart the server

Without the key, ARIA will tell you that web search isn't configured when it tries to use it.

## Evening Briefing (6pm + email)

A **6pm weekday briefing** runs automatically. It includes:
1. **Tickers with upside potential** — stocks that could move up tomorrow (from web search; not limited to your watchlist)
2. **Big news with money-making implications** — earnings, Fed, economic data, catalysts
3. **Your portfolio snapshot** — quick take on holdings, signals, risk alerts
4. **Tech & AI pulse** — notable moves relevant to your work or investments

**Email delivery (optional):** To get the briefing by email at 6pm, add to `.env`:
```
BRIEFING_EMAIL_TO=your@email.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
```

For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833) (not your main password). Without SMTP, the briefing is still generated and stored — view it in the Briefing tab.

**Manual trigger:** POST `/api/briefings/generate-evening` or use the "Evening (6pm)" button in the Briefing tab.

---

## Project Structure

```
aria/
├── server/
│   ├── index.ts             # Express entry, DB init, cron jobs, route wiring
│   ├── services/
│   │   ├── backtest.ts
│   │   ├── briefings.ts
│   │   ├── chatTools.ts
│   │   ├── context.ts
│   │   ├── indicators.ts
│   │   ├── liveData.ts
│   │   ├── ohlcv.ts         # OHLCV fetch with priority queue + graduation
│   │   ├── scanner.ts       # Dynamic universe, batch scanning, weekly nomination
│   │   └── signals.ts
│   ├── routes/
│   │   ├── backtest.ts
│   │   ├── briefings.ts
│   │   ├── chat.ts
│   │   ├── dashboard.ts
│   │   ├── health.ts
│   │   ├── memories.ts
│   │   ├── ohlcv.ts
│   │   ├── portfolio.ts
│   │   ├── scanner.ts       # /api/scanner/* (candidates, universe/stats, nominate)
│   │   └── signals.ts
│   └── utils/
│       ├── memoryGuard.ts   # Snapshot/restore critical user data on startup
│       ├── mergeOhlcvLivePrice.ts
│       └── watchlist.ts
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── chat/            # ChatTab, ChatMessage, MarkdownContent
│   │   ├── holdings/        # HoldingsCard with sparkline charts
│   │   ├── nav/             # BottomTabBar, MobileNav, MoreDrawer
│   │   ├── sidebar/         # HoldingsAccordion, MarketPulse, BuildPhaseList
│   │   ├── tabs/            # ScannerTab, BacktestTab, MemoryTab, PortfolioTab, etc.
│   │   └── ui/              # MetricCard, StatusDot, TypingIndicator
│   ├── types/index.ts
│   └── main.tsx
├── aria.db                  # SQLite (auto-created, gitignored)
├── memory_guard.json        # Watchlist/holdings backup (auto-created, gitignored)
├── .env                     # API keys (gitignored)
└── .env.example
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status check |
| POST | `/api/chat` | Send message, get ARIA response |
| GET | `/api/history` | Load conversation history |
| DELETE | `/api/history` | Clear all messages |
| POST | `/api/signals` | Save a financial signal |
| GET | `/api/signals` | Get recent signals |
| GET | `/api/prices` | Latest prices |
| GET | `/api/news` | Tech news (Hacker News top stories) |
| GET | `/api/dashboard` | Aggregate: prices + news + tickers + signals by ticker |
| GET | `/api/memories` | All memories (portfolio, preferences, context) |
| POST | `/api/memories` | Create/update memory |
| DELETE | `/api/memories` | Clear all memories |
| DELETE | `/api/memories/:key` | Delete a single memory by key |
| GET | `/api/ohlcv/:symbol?days=90` | Historical OHLCV for a ticker |
| GET | `/api/backtest?ticker=&days=` | Run backtest simulation |
| GET | `/api/briefings` | List briefings |
| POST | `/api/briefings/generate` | Generate morning briefing |
| POST | `/api/briefings/generate-evening` | Generate evening briefing |
| GET | `/api/scanner/universe` | Active scanner universe |
| GET | `/api/scanner/results` | Latest scan results (ARIA picks first) |
| GET | `/api/scanner/status` | Last scan time, scanning flag, counts |
| POST | `/api/scanner/run` | Trigger scan manually |
| GET | `/api/scanner/candidates` | Graduation pipeline with OHLCV progress |
| GET | `/api/scanner/universe/stats` | Universe breakdown by tier, category, API usage |
| POST | `/api/scanner/nominate` | Manually trigger weekly AI nomination |
| GET | `/api/portfolio` | Crypto portfolio holdings |
| POST | `/api/portfolio` | Add/update portfolio position |
| DELETE | `/api/portfolio/:symbol` | Remove portfolio position |

---

## Cron Schedule

| Time (Pacific) | Frequency | Job |
|----------------|-----------|-----|
| 05:00 | Sunday | Weekly AI nomination — Gemini suggests 5 new tickers |
| 06:00 | Daily | OHLCV refresh + graduation check |
| 07:30 | Daily | Scanner run (batched, active tickers only) |
| 08:30 | Weekdays | Morning briefing |
| 18:00 | Weekdays | Evening briefing |
| 03:00 | Every 3 days | DB backup |

---

## Memory Guard

ARIA snapshots your watchlists and holdings to `memory_guard.json` after every change. On startup, if the database is missing these entries (e.g. after a DB corruption), the guard automatically restores them before any default seeds run. This prevents the recurring issue of holdings vanishing without a crash.

## Automatic Backups

The server backs up `aria.db` to a `backups/` folder every 3 days at 3am. It keeps the last 6 backups. To restore: stop the server, copy a backup over `aria.db`, then restart.

## Tips

- ARIA remembers your conversations between sessions (SQLite)
- Clear history anytime: `DELETE http://localhost:3001/api/history`
- The `.env` file and `aria.db` should both be in your `.gitignore`
- Add positions and watchlist in Memory → Portfolio; they drive sidebar Holdings and Market Pulse
- Prices and signals refresh every 5 min, news every 15 min. The frontend polls `/api/dashboard` every 60s.
- The scanner only runs on tickers with ≥ 50 days of OHLCV data — new tickers graduate automatically as data accumulates

---

*Built by Nico × ARIA — Phases 1–7 complete*
