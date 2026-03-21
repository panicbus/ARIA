import React, { useState, useEffect } from "react";

import { API } from "../../config";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { NewsRow } from "../../types";

const TZ = "America/Los_Angeles";
const NEWS_POLL_MS = 30 * 60 * 1000; // 30 minutes

const normalizeIso = (iso: string) =>
  iso && !/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso.replace(" ", "T") + "Z" : iso;
const formatDateHeader = (iso: string) =>
  new Date(normalizeIso(iso)).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const formatTime = (iso: string) =>
  new Date(normalizeIso(iso)).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

const isLessThan1DayOld = (iso: string) => {
  const ageMs = Date.now() - new Date(normalizeIso(iso)).getTime();
  return ageMs < 24 * 60 * 60 * 1000;
};


function groupByDay(news: NewsRow[], maxPerDay: number): Map<string, NewsRow[]> {
  const map = new Map<string, NewsRow[]>();
  for (const n of news) {
    const d = new Date(normalizeIso(n.created_at));
    const key = d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
    if (!map.has(key)) map.set(key, []);
    const arr = map.get(key)!;
    if (arr.length < maxPerDay) arr.push(n);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(normalizeIso(b.created_at)).getTime() - new Date(normalizeIso(a.created_at)).getTime());
  }
  const sorted = new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  return sorted;
}

export function TechNewsTab() {
  const [news, setNews] = useState<NewsRow[]>([]);
  const isMobile = useIsMobile();

  const load = () => {
    fetch(`${API}/news?days=5`)
      .then((r) => r.json())
      .then((data: NewsRow[]) => setNews(Array.isArray(data) ? data : []))
      .catch(() => setNews([]));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, NEWS_POLL_MS);
    return () => clearInterval(t);
  }, []);

  const byDay = groupByDay(news, 6);

  return (
    <div className="tab-news" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ fontSize: 16, letterSpacing: "0.12em", color: "#555", fontFamily: "var(--mono)", marginBottom: 4 }}>
        TECH NEWS
      </div>
      {byDay.size === 0 ? (
        <div style={{ color: "#555", fontSize: 15, fontFamily: "var(--mono)" }}>
          No articles in the last 5 days. HN headlines refresh every 30 minutes.
        </div>
      ) : (
        [...byDay.entries()].map(([dateKey, articles]) => {
          const first = articles[0];
          const headerLabel = first ? formatDateHeader(first.created_at) : dateKey;
          const timeLabel = first ? formatTime(first.created_at) : "";
          return (
            <section key={dateKey}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  color: "#666",
                  fontFamily: "var(--mono)",
                  marginBottom: 12,
                  paddingBottom: 6,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {headerLabel}
                {timeLabel && (
                  <span style={{ marginLeft: 10, color: "#555" }}>{timeLabel} PT</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {articles.map((n) => (
                  <a
                    key={n.id}
                    className="news-article"
                    href={n.url ?? `https://news.ycombinator.com/item?id=${n.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "14px 16px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 10,
                      textDecoration: "none",
                      color: "#e0e0e0",
                      fontFamily: "var(--body)",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    {...(!isMobile && {
                      onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => {
                        e.currentTarget.style.background = "rgba(0,255,148,0.06)";
                        e.currentTarget.style.borderColor = "rgba(0,255,148,0.2)";
                      },
                      onMouseLeave: (e: React.MouseEvent<HTMLAnchorElement>) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                      },
                    })}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {isLessThan1DayOld(n.created_at) && (
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            letterSpacing: "0.08em",
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(0,255,148,0.15)",
                            border: "1px solid rgba(0,255,148,0.35)",
                            color: "#00ff94",
                            flexShrink: 0,
                          }}
                        >
                          NEW
                        </span>
                      )}
                      <span className="news-title" style={{ fontSize: 16, lineHeight: 1.5, flex: 1, minWidth: 0 }}>{n.title}</span>
                    </div>
                    {n.summary && (
                      <div
                        className="news-summary"
                        style={{
                          fontSize: 13,
                          opacity: 0.8,
                          color: "#999",
                          fontFamily: "var(--body)",
                          lineHeight: 1.4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginLeft: 45,
                        }}
                      >
                        {n.summary}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
