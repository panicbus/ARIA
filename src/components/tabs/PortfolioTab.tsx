import React, { useState, useEffect, useRef } from "react";

import { API, DASHBOARD_POLL_MS, signalColors } from "../../config";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MetricCard } from "../ui/MetricCard";
import type { CryptoPortfolioHolding, Dashboard } from "../../types";

const TZ = "America/Los_Angeles";

const INFO_CONTENT = {
  unrealizedPnl: {
    term: "Unrealized P&L",
    def: "The profit or loss you’d have if you sold right now, compared to what you paid.",
    explain: "It’s called “unrealized” because you haven’t locked it in yet—it’s just on paper. Positive means you’re up; negative means you’re down.",
  },
  buyingPower: {
    term: "Buying Power",
    def: "How much cash you have available to buy more crypto without adding more money.",
    explain: "This is your spendable balance—the amount you can use right now to place new orders.",
  },
  rsi: {
    term: "RSI",
    def: "Relative Strength Index—a number (0–100) that shows how strong or weak recent price moves have been.",
    explain: "Above 70 often means the asset has been bought a lot lately and might cool off. Below 30 often means the opposite—lots of selling, and it might bounce. It’s one tool to spot potential turning points.",
  },
};
const formatTs = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const ASSET_NAMES: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum" };

export function PortfolioTab({
  dashboard,
  onViewBacktest,
  onPortfolioRefresh,
}: {
  dashboard: Dashboard | null;
  onViewBacktest?: (ticker: string) => void;
  onPortfolioRefresh?: () => void;
}) {
  const [summary, setSummary] = useState<{
    total_crypto_value: number;
    total_unrealized_pnl: number;
    total_unrealized_pnl_pct: number;
    buying_power: number;
    holdings: CryptoPortfolioHolding[];
    last_updated: string | null;
    data_source: string;
    credentials_configured?: boolean;
  } | null>(null);
  const [ariaTake, setAriaTake] = useState<{ btc: string; eth: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ariaTakeLoading, setAriaTakeLoading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const ariaTakeFetchedAt = useRef(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!infoOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [infoOpen]);
  const ARIA_CACHE_MS = 15 * 60 * 1000;

  const loadSummary = () => {
    fetch(`${API}/portfolio/summary`)
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setSummary(null));
  };

  const loadAriaTake = (force = false) => {
    const now = Date.now();
    if (!force && ariaTake && now - ariaTakeFetchedAt.current < ARIA_CACHE_MS) return;
    setAriaTakeLoading(true);
    fetch(`${API}/portfolio/aria-take`)
      .then((r) => r.json())
      .then((data) => {
        setAriaTake(data);
        ariaTakeFetchedAt.current = now;
      })
      .catch(() => setAriaTake(null))
      .finally(() => setAriaTakeLoading(false));
  };

  useEffect(() => {
    loadSummary();
    const t = setInterval(loadSummary, DASHBOARD_POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (summary?.holdings?.length) loadAriaTake();
  }, [summary?.holdings?.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/portfolio/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSummary(data);
        onPortfolioRefresh?.();
      }
    } catch (_) {}
    setRefreshing(false);
  };

  const holdings = summary?.holdings ?? [];
  const hasData = holdings.length > 0;
  const isStale = summary?.data_source === "robinhood_stale";
  const credentialsConfigured = summary?.credentials_configured ?? false;

  const glossaryTooltip = (
    <div style={{ padding: 12, maxWidth: 420 }}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: "#00ff94", fontFamily: "var(--mono)" }}>Glossary</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 14, lineHeight: 1.5, color: "#aaa", fontFamily: "var(--body)" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#00ff94", marginBottom: 4 }}>{INFO_CONTENT.unrealizedPnl.term}</div>
          <div>{INFO_CONTENT.unrealizedPnl.def}</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{INFO_CONTENT.unrealizedPnl.explain}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#00ff94", marginBottom: 4 }}>{INFO_CONTENT.buyingPower.term}</div>
          <div>{INFO_CONTENT.buyingPower.def}</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{INFO_CONTENT.buyingPower.explain}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#00ff94", marginBottom: 4 }}>{INFO_CONTENT.rsi.term}</div>
          <div>{INFO_CONTENT.rsi.def}</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{INFO_CONTENT.rsi.explain}</div>
        </div>
      </div>
    </div>
  );

  const HeaderRow = () => (
    <div ref={infoRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 16, letterSpacing: "0.12em", color: "#999", fontWeight: 600, fontFamily: "var(--mono)" }}>CRYPTO PORTFOLIO</div>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            background: infoOpen ? "rgba(0,255,148,0.15)" : "rgba(255,255,255,0.04)",
            color: infoOpen ? "#00ff94" : "#888",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Glossary"
        >
          ⓘ
        </button>
      </div>
      {infoOpen && (
        <div
          className="info-tooltip"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 20,
            background: "#141414",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => setInfoOpen(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 }} aria-label="Close">×</button>
          </div>
          {glossaryTooltip}
        </div>
      )}
    </div>
  );

  if (!hasData) {
    const message = credentialsConfigured
      ? "Could not load portfolio from Robinhood. Check the server console for API errors. Possible causes: wrong endpoint format, invalid signing, or no BTC/ETH positions in your account."
      : "Add your Robinhood API credentials to .env to see your live crypto portfolio here. Until then, ARIA is watching BTC and ETH market prices via CoinGecko.";
    return (
      <div className="tab-portfolio" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <HeaderRow />
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "#777",
            fontSize: 15,
            fontFamily: "var(--body)",
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          {message}
        </div>
        {credentialsConfigured && (
          <button
            className="portfolio-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              alignSelf: "center",
              fontSize: 12,
              fontFamily: "var(--mono)",
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(0,255,148,0.4)",
              background: refreshing ? "rgba(0,255,148,0.1)" : "transparent",
              color: "#00ff94",
              cursor: refreshing ? "wait" : "pointer",
            }}
          >
            {refreshing ? "Refreshing…" : "Try again"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tab-portfolio" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <HeaderRow />

      {isMobile ? (
        <>
          <div className="portfolio-header-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <MetricCard
              label="Total value"
              value={`$${(summary?.total_crypto_value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            />
            <MetricCard
              label="Buying power"
              value={`$${(summary?.buying_power ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            />
            <MetricCard
              label="P&L $"
              value={`${(summary?.total_unrealized_pnl ?? 0) >= 0 ? "+" : ""}$${(summary?.total_unrealized_pnl ?? 0).toFixed(2)}`}
            />
            <MetricCard
              label="P&L %"
              value={`${(summary?.total_unrealized_pnl_pct ?? 0) >= 0 ? "+" : ""}${(summary?.total_unrealized_pnl_pct ?? 0).toFixed(1)}%`}
            />
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#444", marginBottom: 4 }}>
            Last updated: {summary?.last_updated ? formatTs(summary.last_updated) : "—"}
            {isStale && <span style={{ color: "#ffd32a", marginLeft: 8 }}>⚠ Last known data</span>}
          </div>
          <button
            className="portfolio-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              fontSize: 13,
              fontFamily: "var(--mono)",
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#ccc",
              cursor: refreshing ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
            }}
          >
            <span style={{ fontSize: 16 }}>↻</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </>
      ) : (
        <div className="portfolio-header-grid" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontFamily: "var(--mono)", color: "#888" }}>
            Total Crypto Value: <span style={{ color: "#00ff94", fontWeight: 700 }}>${(summary?.total_crypto_value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ fontSize: 14, fontFamily: "var(--mono)", color: "#888" }}>
            Unrealized P&L:{" "}
            <span style={{ color: (summary?.total_unrealized_pnl ?? 0) >= 0 ? "#00ff94" : "#ff4757", fontWeight: 700 }}>
              ${(summary?.total_unrealized_pnl ?? 0).toFixed(2)} ({(summary?.total_unrealized_pnl_pct ?? 0) >= 0 ? "+" : ""}
              {(summary?.total_unrealized_pnl_pct ?? 0).toFixed(1)}%)
            </span>
          </div>
          <div style={{ fontSize: 14, fontFamily: "var(--mono)", color: "#888" }}>
            Buying Power: <span style={{ color: "#ccc" }}>${(summary?.buying_power ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "#444" }}>
            Last updated: {summary?.last_updated ? formatTs(summary.last_updated) : "—"}
            {isStale && <span style={{ color: "#ffd32a", marginLeft: 8 }}>⚠ Last known data</span>}
          </div>
          <button
            className="portfolio-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              fontSize: 12,
              fontFamily: "var(--mono)",
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid rgba(0,255,148,0.4)",
              background: refreshing ? "rgba(0,255,148,0.1)" : "transparent",
              color: "#00ff94",
              cursor: refreshing ? "wait" : "pointer",
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {holdings.map((h) => {
          const change24h = dashboard?.prices?.find((p) => p.symbol === h.symbol)?.change_24h ?? null;
          const signal = dashboard?.signalsByTicker?.[h.symbol];
          return (
            <div
              key={h.symbol}
              className="holding-card"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <div>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "#f0f0f0" }}>{h.symbol}</span>
                  <span style={{ fontSize: 14, color: "#888", marginLeft: 8 }}>{ASSET_NAMES[h.symbol] ?? h.symbol}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {signal?.indicator_data?.rsi != null && (
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: signal.indicator_data.rsi > 70 ? "#ff4757" : signal.indicator_data.rsi < 30 ? "#00ff94" : "#888" }}>
                      RSI {signal.indicator_data.rsi.toFixed(0)}
                    </span>
                  )}
                  {signal && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: `${(signalColors[signal.signal] ?? "#888")}18`,
                      border: `1px solid ${(signalColors[signal.signal] ?? "#888")}40`,
                      color: signalColors[signal.signal] ?? "#888",
                    }}
                  >
                    {signal.signal}
                  </span>
                )}
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#00ff94", fontFamily: "var(--display)", marginBottom: 8 }}>
                ${h.current_price >= 1000 ? h.current_price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : h.current_price.toFixed(2)}
                {change24h != null && (
                  <span style={{ fontSize: 14, marginLeft: 8, color: change24h >= 0 ? "#00ff94" : "#ff4757" }}>
                    ({change24h >= 0 ? "+" : ""}{change24h.toFixed(1)}% 24h)
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 12, fontSize: 12, fontFamily: "var(--mono)" }}>
                <div><span style={{ color: "#888" }}>Quantity:</span> {h.quantity.toFixed(4)}</div>
                <div><span style={{ color: "#888" }}>Avg buy:</span> ${h.average_buy_price.toFixed(2)}</div>
                <div><span style={{ color: "#888" }}>Market value:</span> ${h.market_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                <div>
                  <span style={{ color: "#888" }}>Unrealized P&L:</span>{" "}
                  <span style={{ color: h.unrealized_pnl >= 0 ? "#00ff94" : "#ff4757" }}>
                    ${h.unrealized_pnl.toFixed(2)} ({h.unrealized_pnl >= 0 ? "+" : ""}{h.unrealized_pnl_pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
              {onViewBacktest && !isMobile && (
                <button
                  onClick={() => onViewBacktest(h.symbol)}
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "transparent",
                    color: "#888",
                    cursor: "pointer",
                  }}
                >
                  View Backtest
                </button>
              )}
            </div>
          );
        })}
      </div>

      {holdings.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#00ff94", fontFamily: "var(--mono)", marginBottom: 8 }}>ARIA&apos;S TAKE</div>
          {ariaTakeLoading ? (
            <div style={{ color: "#888", fontSize: 13 }}>Loading…</div>
          ) : ariaTake ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ariaTake.btc ? <div style={{ fontSize: 14, lineHeight: 1.6, color: "#ccc" }}>{ariaTake.btc}</div> : null}
              {ariaTake.eth ? <div style={{ fontSize: 14, lineHeight: 1.6, color: "#ccc" }}>{ariaTake.eth}</div> : null}
              <button
                onClick={() => loadAriaTake(true)}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "#00ff94",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Refresh
              </button>
            </div>
          ) : (
            <div style={{ color: "#888", fontSize: 13 }}>Unable to load ARIA&apos;s take.</div>
          )}
        </div>
      )}

      {isMobile && dashboard && (
        <div className="market-pulse-mobile">
          <div style={{ fontSize: 8, letterSpacing: "0.12em", color: "#444", textTransform: "uppercase", fontFamily: "var(--mono)", marginBottom: 8 }}>
            Market Pulse
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {(dashboard.prices || [])
              .filter((p) => ["SPY", "BTC", "ETH", "AMD", "AMZN", "NET", "NEE"].includes(p.symbol))
              .map((p) => (
                <MetricCard
                  key={p.symbol}
                  label={p.symbol}
                  value={
                    p.price >= 1000
                      ? "$" + p.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
                      : "$" + Number(p.price).toFixed(2)
                  }
                  sub={
                    p.change_24h != null
                      ? (p.change_24h >= 0 ? "↑" : "↓") + Math.abs(p.change_24h).toFixed(1) + "% 24h"
                      : undefined
                  }
                  signal={dashboard.signalsByTicker?.[p.symbol]?.signal}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
