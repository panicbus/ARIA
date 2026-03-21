import React from "react";

import { MarkdownContent } from "./MarkdownContent";
import type { Message } from "../../types";

export const ChatMessage = React.memo(({ msg }: { msg: Message }) => (
  <div
    className="msg-enter"
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: msg.role === "user" ? "flex-end" : "flex-start",
      maxWidth: "78%",
      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
    }}
  >
    <div
      className="chat-bubble"
      style={{
        padding: "11px 15px",
        borderRadius: msg.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
        background: msg.role === "user" ? "rgba(0,255,148,0.09)" : "rgba(255,255,255,0.04)",
        border: msg.role === "user" ? "1px solid rgba(0,255,148,0.18)" : "1px solid rgba(255,255,255,0.07)",
        fontSize: 14,
        lineHeight: 1.65,
        color: msg.role === "user" ? "#d0ffe8" : "#ccc",
        ...(msg.role === "user" ? { whiteSpace: "pre-wrap" as const } : {}),
      }}
    >
      {msg.role === "assistant" ? <MarkdownContent content={msg.content} /> : msg.content}
    </div>
    <div style={{ fontSize: 10, color: "#333", marginTop: 3, fontFamily: "var(--mono)" }}>{msg.ts}</div>
  </div>
));
