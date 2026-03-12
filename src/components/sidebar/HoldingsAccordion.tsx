import React from "react";

import { HoldingsCard } from "../holdings/HoldingsCard";
import { API } from "../../config";
import type { Dashboard, Memory } from "../../types";

const CARD_H = 130;
const GAP = 7;

export function HoldingsAccordion({
  memories,
  dashboard,
  open,
  onToggle,
  ohlcvRefreshAll,
  onRefreshAll,
}: {
  memories: Memory[];
  dashboard: Dashboard | null;
  open: boolean;
  onToggle: () => void;
  ohlcvRefreshAll: boolean;
  onRefreshAll: () => void;
}) {
  const positions = memories.filter((m) => m.key.startsWith("position_"));
  const maxHeight = open ? (positions.length > 0 ? positions.length * CARD_H + (positions.length - 1) * GAP + 40 : 80) : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <span style={{ transform: open ? "rotate(90deg)" : "none", display: "inline-block", fontSize: 10, color: "#555", transition: "transform 0.2s ease" }}>▶</span>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", color: "#444", textTransform: "uppercase", fontFamily: "var(--mono)" }}>Holdings</span>
        </button>
        {open && positions.length > 0 && (
          <button
            onClick={onRefreshAll}
            disabled={ohlcvRefreshAll}
            style={{ fontSize: 8, padding: "3px 6px", background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)", borderRadius: 4, color: "#00ff94", cursor: ohlcvRefreshAll ? "wait" : "pointer", fontFamily: "var(--mono)" }}
          >
            {ohlcvRefreshAll ? "Refreshing…" : "Refresh all charts"}
          </button>
        )}
      </div>
      <div style={{ overflow: "hidden", maxHeight, transition: "max-height 0.3s ease" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {positions.length > 0
            ? positions.map((m) => {
                let pos: { ticker?: string; amount?: string | number; entry?: string | number };
                try {
                  pos = typeof m.value === "string" ? JSON.parse(m.value) : (m.value ?? {});
                } catch {
                  pos = {};
                }
                const tickerFromKey = m.key.replace(/^position_/i, "").toUpperCase();
                if (!pos.ticker && tickerFromKey) pos = { ...pos, ticker: tickerFromKey };
                const ticker = (pos.ticker ?? tickerFromKey ?? "").toUpperCase().trim() || "—";
                const p = dashboard?.prices?.find((r) => r.symbol === ticker);
                return (
                  <HoldingsCard
                    key={m.key}
                    memoryKey={m.key}
                    pos={pos}
                    currentPrice={p?.price ?? null}
                    apiBase={API}
                  />
                );
              })
            : <span style={{ fontSize: 11, color: "#444", fontFamily: "var(--mono)" }}>Add positions in Memory → Portfolio</span>}
        </div>
      </div>
    </div>
  );
}
