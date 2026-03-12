/**
 * Backtest engine: simulates trading on historical OHLCV using composite indicator logic.
 * Returns trades, summary stats, and equity curve for signal validation.
 */

import { computeIndicatorsForCloses, scoreToSignal } from "./indicators";

export type BacktestTrade = {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  return_pct: number;
  signal: string;
  outcome: "win" | "loss";
};

export type BacktestResult = {
  ticker: string;
  days: number;
  summary: {
    total_return_pct: number;
    buy_and_hold_pct: number;
    win_rate: number;
    num_trades: number;
    best_trade_pct: number;
    worst_trade_pct: number;
    max_drawdown_pct: number;
  };
  trades: BacktestTrade[];
  equity_curve: { date: string; value: number }[];
  error?: string;
} | null;

type BacktestDeps = {
  db: import("sql.js").Database | null;
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  getWatchedTickers: () => string[];
};

export function createRunBacktest(deps: BacktestDeps): (ticker: string, days: number) => BacktestResult {
  const { db, execAll, getWatchedTickers } = deps;

  return function runBacktest(ticker: string, days: number): BacktestResult {
    if (!db) return null;
    if (!getWatchedTickers().includes(ticker)) return null;

    const rows = execAll<{ date: string; open: number; high: number; low: number; close: number; volume: number }>(
      `SELECT date, open, high, low, close, volume FROM ohlcv WHERE symbol = '${ticker}' ORDER BY date ASC LIMIT ${days + 100}`
    );
    if (rows.length < 50) {
      return {
        ticker,
        days,
        summary: { total_return_pct: 0, buy_and_hold_pct: 0, win_rate: 0, num_trades: 0, best_trade_pct: 0, worst_trade_pct: 0, max_drawdown_pct: 0 },
        trades: [],
        equity_curve: [],
        error: `Insufficient OHLCV data: need at least 50 days, got ${rows.length}`,
      };
    }

    const closes = rows.map((r) => Number(r.close));
    const trades: BacktestTrade[] = [];
    const equityCurve: { date: string; value: number }[] = [];
    const startCapital = 1000;
    let capital = startCapital;
    let position: { shares: number; entryPrice: number; entryDate: string } | null = null;
    let peak = startCapital;
    let maxDrawdown = 0;

    for (let i = 49; i < rows.length; i++) {
      const slice = closes.slice(0, i + 1);
      const ind = computeIndicatorsForCloses(slice);
      const signal = ind ? scoreToSignal(ind.score).signal : "HOLD";
      const row = rows[i];
      const date = row.date;
      const nextRow = rows[i + 1];
      const execOpen = nextRow ? Number(nextRow.open) : Number(row.close);
      const execDate = nextRow ? nextRow.date : date;

      if (position && (signal === "SELL" || signal === "STRONG SELL")) {
        const exitPrice = execOpen;
        const returnPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
        capital += position.shares * exitPrice;
        trades.push({
          entry_date: position.entryDate,
          exit_date: execDate,
          entry_price: position.entryPrice,
          exit_price: exitPrice,
          return_pct: returnPct,
          signal,
          outcome: returnPct > 0 ? "win" : "loss",
        });
        position = null;
      } else if (!position && (signal === "BUY" || signal === "STRONG BUY") && capital > 0 && nextRow) {
        const shares = capital / execOpen;
        position = { shares, entryPrice: execOpen, entryDate: execDate };
        capital = 0;
      }

      const close = Number(row.close);
      const portfolioValue = position ? position.shares * close : capital;
      equityCurve.push({ date, value: portfolioValue });
      if (portfolioValue > peak) peak = portfolioValue;
      const dd = ((peak - portfolioValue) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    if (position) {
      const lastRow = rows[rows.length - 1];
      const exitPrice = Number(lastRow.close);
      const returnPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
      capital += position.shares * exitPrice;
      trades.push({
        entry_date: position.entryDate,
        exit_date: lastRow.date,
        entry_price: position.entryPrice,
        exit_price: exitPrice,
        return_pct: returnPct,
        signal: "HOLD",
        outcome: returnPct > 0 ? "win" : "loss",
      });
    }

    const finalValue = capital;
    const totalReturnPct = ((finalValue - startCapital) / startCapital) * 100;
    const firstClose = Number(rows[0].close);
    const lastClose = Number(rows[rows.length - 1].close);
    const buyAndHoldPct = ((lastClose - firstClose) / firstClose) * 100;
    const winRate = trades.length ? (trades.filter((t) => t.outcome === "win").length / trades.length) * 100 : 0;
    const bestTrade = trades.length ? Math.max(...trades.map((t) => t.return_pct)) : 0;
    const worstTrade = trades.length ? Math.min(...trades.map((t) => t.return_pct)) : 0;

    return {
      ticker,
      days,
      summary: {
        total_return_pct: totalReturnPct,
        buy_and_hold_pct: buyAndHoldPct,
        win_rate: winRate,
        num_trades: trades.length,
        best_trade_pct: bestTrade,
        worst_trade_pct: worstTrade,
        max_drawdown_pct: maxDrawdown,
      },
      trades,
      equity_curve: equityCurve,
    };
  };
}
