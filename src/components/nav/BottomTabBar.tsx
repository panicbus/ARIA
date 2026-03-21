import React from "react";

const TABS = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "scanner", label: "Scanner", icon: "🔍" },
  { id: "signals", label: "Signals", icon: "⚡" },
  { id: "portfolio", label: "Portfolio", icon: "📈" },
  { id: "more", label: "More", icon: "···" },
] as const;

type Props = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMoreOpen: () => void;
};

export function BottomTabBar({ activeTab, onTabChange, onMoreOpen }: Props) {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: "#111111",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((t) => {
        const isActive =
          t.id === "more"
            ? ["briefing", "news", "memory"].includes(activeTab)
            : activeTab === t.id;
        const handleClick = t.id === "more" ? onMoreOpen : () => onTabChange(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={handleClick}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              gap: 3,
              borderTop: isActive ? "2px solid #00ff94" : "2px solid transparent",
              color: isActive ? "#00ff94" : "#555",
              fontSize: 18,
              fontFamily: "var(--mono)",
              background: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: "none",
              minHeight: 44,
              padding: 0,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontFamily: "var(--mono)" }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
