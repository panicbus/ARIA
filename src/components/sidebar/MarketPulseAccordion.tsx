import React from "react";

import { MetricCard } from "../ui/MetricCard";
import { FALLBACK_TICKERS } from "../../config";
import type { Dashboard } from "../../types";

export function MarketPulseAccordion({
  dashboard,
  open,
  onToggle,
}: {
  dashboard: Dashboard | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", marginBottom: 8 }}>
        <span style={{ transform: open ? "rotate(90deg)" : "none", display: "inline-block", fontSize: 10, color: "#555", transition: "transform 0.2s ease" }}>▶</span>
        <span style={{ fontSize: 9, letterSpacing: "0.14em", color: "#444", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Market Pulse</span>
      </button>
      <div style={{ overflow: "hidden", maxHeight: open ? 1080 : 0, transition: "max-height 0.3s ease" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {(dashboard?.prices ?? []).length > 0
            ? (dashboard?.tickers ?? FALLBACK_TICKERS).map((sym) => {
                const p = dashboard!.prices.find((r) => r.symbol === sym);
                const sig = dashboard!.signalsByTicker[sym];
                if (!p) return <MetricCard key={sym} label={sym} value="—" sub="…" />;
                const val = p.price >= 1000 ? `$${p.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${Number(p.price).toFixed(2)}`;
                const ch = p.change_24h != null ? `${p.change_24h >= 0 ? "↑" : "↓"} ${Math.abs(p.change_24h).toFixed(1)}% 24h` : "";
                return <MetricCard key={sym} label={sym} value={val} sub={ch} signal={sig?.signal} rsi={sig?.indicator_data?.rsi} />;
              })
            : (dashboard?.tickers ?? FALLBACK_TICKERS).map((sym) => <MetricCard key={sym} label={sym} value="—" sub="loading" />)}
        </div>
      </div>
    </div>
  );
}
