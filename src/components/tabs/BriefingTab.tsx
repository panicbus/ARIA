import React, { useState, useEffect, useRef } from "react";

import { API, DASHBOARD_POLL_MS } from "../../config";
import { MarkdownContent } from "../chat/MarkdownContent";
import type { Briefing } from "../../types";

const TZ = "America/Los_Angeles";
const pacificHour = (iso: string) =>
  parseInt(new Date(iso).toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }), 10);
const inferType = (b: Briefing) => b.type ?? (pacificHour(b.created_at) < 12 ? "morning" : "evening");
const formatMilitary = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });

export function BriefingTab() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingTypeTab, setBriefingTypeTab] = useState<"morning" | "evening">("morning");
  const [selectedBriefingId, setSelectedBriefingId] = useState<number | null>(null);
  const [briefingArchiveOffset, setBriefingArchiveOffset] = useState(0);
  const hasSetBriefingTabRef = useRef(false);

  const loadBriefings = () => {
    fetch(`${API}/briefings`)
      .then((r) => r.json())
      .then((data: Briefing[]) => setBriefings(data))
      .catch(() => setBriefings([]));
  };

  useEffect(() => {
    loadBriefings();
    const t = setInterval(loadBriefings, DASHBOARD_POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (briefings.length > 0 && !hasSetBriefingTabRef.current) {
      const latest = briefings[0];
      const t = latest.type ?? (new Date(latest.created_at).getUTCHours() < 12 ? "morning" : "evening");
      setBriefingTypeTab(t);
      hasSetBriefingTabRef.current = true;
    }
  }, [briefings]);

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const morningBriefings = briefings
    .filter((b) => inferType(b) === "morning" && new Date(b.created_at) >= threeMonthsAgo)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const byType = briefings.filter((b) => inferType(b) === briefingTypeTab);
  const displayId =
    selectedBriefingId && briefings.some((b) => b.id === selectedBriefingId)
      ? selectedBriefingId
      : byType[0]?.id ?? null;
  const displayBriefing = briefings.find((b) => b.id === displayId);
  const PILLS_PER_PAGE = 10;
  const archiveWindow = morningBriefings.slice(
    briefingArchiveOffset * PILLS_PER_PAGE,
    briefingArchiveOffset * PILLS_PER_PAGE + PILLS_PER_PAGE
  );
  const hasOlder = (briefingArchiveOffset + 1) * PILLS_PER_PAGE < morningBriefings.length;
  const hasNewer = briefingArchiveOffset > 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.12em", color: "#555", fontFamily: "var(--mono)", marginBottom: 4 }}>BRIEFINGS</div>
      {briefingError && (
        <div style={{ padding: "14px 18px", background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.3)", borderRadius: 8, fontSize: 16, color: "#ff6b6b", fontFamily: "var(--mono)" }}>
          {briefingError}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
        {(["morning", "evening"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setBriefingTypeTab(tab);
              setSelectedBriefingId(null);
            }}
            style={{
              fontSize: 12,
              fontFamily: "var(--mono)",
              padding: "4px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.1)",
              background: briefingTypeTab === tab ? "rgba(0,255,148,0.12)" : "rgba(255,255,255,0.04)",
              color: briefingTypeTab === tab ? "#00ff94" : "#666",
              cursor: "pointer",
            }}
          >
            {tab === "morning" ? "Morning" : "Evening"}
          </button>
        ))}
      </div>
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 18px" }}>
        {displayBriefing ? (
          <>
            <div style={{ fontSize: 14, color: "#666", fontFamily: "var(--mono)", marginBottom: 12 }}>
              {briefingTypeTab === "morning" ? "Morning" : "Evening"} Briefing · {formatDateShort(displayBriefing.created_at)} · {formatMilitary(displayBriefing.created_at)}
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.65, color: "#ccc", fontFamily: "var(--body)" }}>
              <MarkdownContent content={displayBriefing.content} />
            </div>
          </>
        ) : (
          <div style={{ color: "#555", fontSize: 17, fontFamily: "var(--mono)" }}>
            No {briefingTypeTab} briefing yet. Briefings run automatically at 08:00 (morning) and 18:00 (evening) Pacific.
          </div>
        )}
      </div>
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 10, color: "#555", fontFamily: "var(--mono)", marginBottom: 8, letterSpacing: "0.1em" }}>PREVIOUS MORNING BRIEFINGS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {hasNewer && (
            <button
              onClick={() => setBriefingArchiveOffset((o) => o - 1)}
              style={{ background: "none", border: "none", color: "#00ff94", cursor: "pointer", fontSize: 16, padding: 4 }}
              title="Newer dates"
            >
              ←
            </button>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
            {archiveWindow.length > 0 ? (
              archiveWindow.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBriefingId(b.id);
                    setBriefingTypeTab("morning");
                  }}
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    padding: "3px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: selectedBriefingId === b.id ? "rgba(0,255,148,0.12)" : "rgba(255,255,255,0.04)",
                    color: selectedBriefingId === b.id ? "#00ff94" : "#888",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDateShort(b.created_at)}
                </button>
              ))
            ) : (
              <span style={{ fontSize: 12, color: "#555", fontFamily: "var(--mono)" }}>No morning briefings in the last 3 months</span>
            )}
          </div>
          {hasOlder && (
            <button
              onClick={() => setBriefingArchiveOffset((o) => o + 1)}
              style={{ background: "none", border: "none", color: "#00ff94", cursor: "pointer", fontSize: 16, padding: 4 }}
              title="Older dates"
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
