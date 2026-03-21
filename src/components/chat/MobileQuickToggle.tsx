import React from "react";

type Props = {
  quickMode: boolean;
  onToggle: () => void;
};

export function MobileQuickToggle({ quickMode, onToggle }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: quickMode ? "#00ff94" : "#666", fontFamily: "var(--mono)" }}>
        {quickMode ? "Quick mode active" : "Full data active"}
      </span>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: quickMode ? "rgba(0,255,148,0.1)" : "rgba(255,255,255,0.05)",
          border: quickMode ? "0.5px solid rgba(0,255,148,0.3)" : "0.5px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          padding: "4px 10px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 20,
            height: 11,
            borderRadius: 6,
            background: quickMode ? "#00ff94" : "rgba(255,255,255,0.12)",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: quickMode ? "#0a0a0a" : "#555",
              position: "absolute",
              top: 1.5,
              left: quickMode ? undefined : 1,
              right: quickMode ? 1 : undefined,
              transition: "all 150ms ease",
            }}
          />
        </div>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 500, color: quickMode ? "#00ff94" : "#666" }}>
          Quick
        </span>
      </button>
    </div>
  );
}
