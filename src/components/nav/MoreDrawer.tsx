import React, { useState, useRef, useEffect } from "react";

const ITEMS = [
  { id: "briefing", label: "Briefing", icon: "📋" },
  { id: "news", label: "News", icon: "📰" },
  { id: "memory", label: "Memory", icon: "👤" },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onTabChange: (tab: string) => void;
};

export function MoreDrawer({ open, onClose, onTabChange }: Props) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);

  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragY > 60) onClose();
    setDragY(0);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 99,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 280ms ease",
        }}
      />
      {/* Sheet */}
      <div
        role="presentation"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#111111",
          borderRadius: "16px 16px 0 0",
          borderTop: "0.5px solid rgba(255,255,255,0.1)",
          padding: "10px 0 32px",
          zIndex: 100,
          transform: isDragging
            ? `translateY(${Math.max(0, dragY)}px)`
            : open
              ? "translateY(0)"
              : "translateY(100%)",
          transition: isDragging ? "none" : "transform 280ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 3,
            background: "rgba(255,255,255,0.18)",
            borderRadius: 2,
            margin: "0 auto 14px",
            cursor: "grab",
          }}
        />
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            style={{
              width: "100%",
              padding: "13px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 13,
              color: "#f0f0f0",
              fontFamily: "var(--body)",
              cursor: "pointer",
              borderBottom: "0.5px solid rgba(255,255,255,0.06)",
              background: "none",
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              textAlign: "left",
              minHeight: 44,
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
