import React from "react";

import type { NewsRow } from "../../types";

export function TechNewsList({ news }: { news: NewsRow[] }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.14em", color: "#444", textTransform: "uppercase", fontFamily: "var(--mono)", marginBottom: 8 }}>Tech News (HN)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {news.slice(0, 5).map((n) => (
          <a key={n.id} href={n.url ?? `https://news.ycombinator.com/item?id=${n.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#888", fontFamily: "var(--mono)", textDecoration: "none", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {n.title}
          </a>
        ))}
        {news.length === 0 && <span style={{ fontSize: 11, color: "#444", fontFamily: "var(--mono)" }}>Loading…</span>}
      </div>
    </div>
  );
}
