# ARIA Phase 6a & Post-6a Work — Detailed Overview

> Summary for context handoff. Covers everything since Phase 6a was instituted.

---

## Phase 6a — Real Portfolio: Crypto

**Goal:** Replace generic market data with Nico's actual Robinhood crypto holdings so ARIA can give personal advice (e.g., "you're up 14% on your BTC" instead of "BTC signal is WATCH").

### Implemented

- **Robinhood Crypto API integration** (`server/services/robinhood.ts`)
  - Ed25519 signing via `tweetnacl` (Robinhood exports raw base64 keys; Node OpenSSL can fail on Ed25519)
  - Uses native `https` instead of `fetch` (Cloudflare blocks Node fetch in some environments)
  - Endpoints: portfolio, positions, buying power, market data
  - Rate limiting: 30 req/min with warnings

- **Live data flow** (`server/services/liveData.ts`)
  - BTC/ETH: Robinhood first, CoinGecko as silent fallback
  - Prices stored in `prices` table; crypto portfolio in `crypto_portfolio` table

- **Portfolio API** (`server/routes/portfolio.ts`)
  - `GET /api/portfolio/crypto` — holdings from `crypto_portfolio`
  - `GET /api/portfolio/summary` — totals, P&L, buying power, `credentials_configured` flag
  - `GET /api/portfolio/aria-take` — ARIA's take on BTC/ETH (cached 15 min)
  - `POST /api/portfolio/refresh` — trigger Robinhood sync

- **Env vars** (`.env.example`)
  - `ROBINHOOD_API_KEY` — API key from robinhood.com → Account → Settings → API (crypto)
  - `ROBINHOOD_PRIVATE_KEY` — Raw base64 (32 bytes) or PEM format

- **Build Phase List** — Phase 6a marked complete in sidebar

---

## Chat & Memory Fixes (Post-6a)

### add_position tool & position memory keys

- **Problem:** ARIA sometimes used `remember()` with bad keys like `position_AVERAGE_COST_RDDT`, `position_QUANTITY_AMD` instead of `position_RDDT`.
- **Fix:** Introduced dedicated `add_position` tool; positions must use `position_TICKER` only.
- **Validation:** `remember` rejects invalid `position_*` keys; `getWatchedTickers` and `HoldingsAccordion` filter to valid `position_TICKER` keys only.
- **System prompt:** Explicit instruction to use `add_position` for positions, never `remember` with position keys.

### Chat persistence on Fly.io

- **Problem:** Chat history did not persist on refresh when deployed to Fly.io.
- **Fix:** Ensured history endpoint and DB writes work correctly in deployed environment (storage, paths, etc.).

---

## Tech News Tab — Major Refactor

### Before
- Tech news list in left sidebar (`TechNewsList`)
- 5 articles, small font, no grouping

### After
- **Dedicated NEWS tab** to the right of BRIEFING in the header
- **TechNewsTab** component (`src/components/tabs/TechNewsTab.tsx`)
- **Removed** `TechNewsList` from sidebar (component file still exists but unused)

### News API changes (`server/routes/dashboard.ts`)

- `GET /api/news?days=N` — returns articles from last N days
- Default: 15 days when no `days` param
- TechNewsTab fetches `?days=5`

### Tech News UI

- **Header:** Matches other tabs (fontSize 16, letterSpacing 0.12em, color #555, var(--mono))
- **Grouping:** Articles grouped by day with local timezone (Pacific) timestamps
- **Range:** Last 5 days of articles
- **Per day:** Max 6 articles per day
- **NEW label:** Articles &lt; 1 day old get green "NEW" badge
- **Refresh:** Feed polls every 30 minutes
- **Summary layout:**
  - Summary text below article title
  - Single line with `textOverflow: ellipsis` if overflow
  - Left margin 45px to align with title
  - No "hackernews" citation (all from HN)

---

## Article Summaries

### Meta description (no AI)

- Fetch article URL, extract `og:description` or `meta name="description"`
- Truncate to 20 words
- 5s timeout, User-Agent header

### AI summaries (when meta missing)

- **Flow:** Meta first → if null, scrape with Readability → AI summarize with Gemini
- **Readability** (`@mozilla/readability` + `jsdom`): Extract main article body from HTML
- **Gemini:** Summarize excerpt (first ~2000 chars) in 1–2 sentences, max 25 words

### Safeguards (Gemini free tier ~250–500 RPD)

- **Skip if summary exists:** Don't re-fetch or re-summarize articles already in DB
- **Cap per fetch:** Max 3 AI summaries per 15-min HN fetch (`AI_NEWS_SUMMARIES_PER_FETCH`)
- **Optional disable:** `ENABLE_AI_NEWS_SUMMARIES=false` in `.env` to turn off AI summaries

### Schema & backend

- **News table:** Added `summary` column (migration + CREATE TABLE)
- **fetchHN** (`server/services/liveData.ts`): Uses `INSERT ... ON CONFLICT(id) DO UPDATE` to upsert with summary
- **Dependencies:** `@mozilla/readability`, `jsdom`, `@types/jsdom`

### Env vars

- `ENABLE_AI_NEWS_SUMMARIES` — set to `false` to disable (default: enabled)
- `AI_NEWS_SUMMARIES_PER_FETCH` — max AI calls per fetch (default: 3)

---

## Sidebar & UX

- **Holdings accordion:** Default to **open** (`holdingsOpen` initial state `true`)

---

## File Summary

| Area | Files touched |
|------|---------------|
| Phase 6a | `robinhood.ts`, `liveData.ts`, `portfolio.ts`, `index.ts` (crypto_portfolio table, refresh) |
| News tab | `TechNewsTab.tsx` (new), `App.tsx` (tab, remove sidebar list), `dashboard.ts` (news API) |
| Summaries | `liveData.ts` (fetchArticleSummary, Readability, Gemini), `gemini.ts` |
| Memory/positions | `chatTools.ts` (add_position, remember validation), `HoldingsAccordion.tsx`, `index.ts` (getWatchedTickers) |
| Config | `.env.example` (news env vars) |

---

## Dependencies Added

- `@mozilla/readability`
- `jsdom`
- `@types/jsdom`
- `tweetnacl` (Phase 6a; may have existed)

---

## Current State

- **AI:** Gemini 2.0 Flash (free tier) for chat, briefings, scanner, portfolio "ARIA take", and news summaries
- **News:** HN top 10 fetched every 15 min; meta + AI summaries; 5 days, 6/day, 30-min frontend poll
- **Portfolio:** Robinhood crypto + equity positions from Memory (`position_*`)
