import React, { useEffect, useRef } from "react";

import { ChatMessage } from "./ChatMessage";
import { MobileQuickToggle } from "./MobileQuickToggle";
import { TypingIndicator } from "../ui/TypingIndicator";
import { useIsMobile } from "../../hooks/useIsMobile";
import { API, SUGGESTED_PROMPTS } from "../../config";
import type { Message } from "../../types";

const TZ = "America/Los_Angeles";
const formatTimeLA = (iso?: string) =>
  (iso ? new Date(iso) : new Date()).toLocaleTimeString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

type Props = {
  messages: Message[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  quickMode: boolean;
  setQuickMode: (v: boolean | ((p: boolean) => boolean)) => void;
  online: boolean;
  onSend: (text?: string) => void;
  onClearChat: () => void;
};

export function ChatTab({
  messages,
  loading,
  input,
  setInput,
  quickMode,
  setQuickMode,
  online,
  onSend,
  onClearChat,
}: Props) {
  const isMobile = useIsMobile();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 280)}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, loading]);

  return (
    <div className="tab-chat" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="chat-messages" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map((msg, i) => (
          <ChatMessage key={msg.id ?? i} msg={msg} />
        ))}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", alignSelf: "flex-start" }}>
            <div style={{ borderRadius: "14px 14px 14px 3px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area" style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="suggested-prompts" style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div className="suggested-prompts-chips" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {SUGGESTED_PROMPTS.map((p, i) => (
              <button
                key={i}
                className="chip"
                onClick={() => setInput(p.text)}
                style={{ fontSize: 11, padding: "4px 11px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#777", cursor: "pointer", fontFamily: "var(--mono)", transition: "all 0.15s" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!isMobile && messages.length > 0 && (
            <button
              onClick={onClearChat}
              title="Clear chat window (keeps ARIA's memory — positions, watchlist, preferences)"
              style={{ fontSize: 11, padding: "4px 11px", borderRadius: 20, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#777", cursor: "pointer", fontFamily: "var(--mono)", transition: "all 0.15s" }}
            >
              Clear chat
            </button>
          )}
        </div>

        {isMobile && <MobileQuickToggle quickMode={quickMode} onToggle={() => setQuickMode((q) => !q)} />}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!isMobile && (
            <button
              type="button"
              onClick={() => setQuickMode((q) => !q)}
              title="Brief answers without fetching data (faster)"
              style={{
                fontSize: 11,
                padding: "6px 14px",
                borderRadius: 20,
                border: quickMode ? "1px solid rgba(0,255,148,0.5)" : "1px solid rgba(255,255,255,0.08)",
                background: quickMode ? "rgba(0,255,148,0.2)" : "rgba(255,255,255,0.04)",
                color: quickMode ? "#00ff94" : "#777",
                cursor: "pointer",
                fontFamily: "var(--mono)",
                fontWeight: quickMode ? 600 : 400,
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              Quick
            </button>
          )}
          <textarea
            ref={textareaRef}
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 11, padding: "11px 15px", color: "#f0f0f0", fontSize: 14, outline: "none", fontFamily: "var(--body)", resize: "none", minHeight: 44, height: 44, boxSizing: "border-box", overflow: "hidden" }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={online ? "Ask ARIA anything..." : "Start the server with: npm run dev"}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,255,148,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            rows={1}
          />
          <button
            onClick={() => onSend()}
            disabled={loading || !input.trim()}
            style={{ background: "#00ff94", border: "none", borderRadius: 10, height: 44, padding: "0 20px", margin: 0, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--display)", letterSpacing: "0.05em", opacity: loading || !input.trim() ? 0.4 : 1, transition: "opacity 0.2s", flexShrink: 0, boxSizing: "border-box" }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
