/**
 * Normalize watchlist values from memory — handles malformed JSON (e.g. ["IGPT"] stored as string),
 * double-encoding, and ensures we always return clean ticker strings.
 */
export function parseWatchlistValue(value: string | null | undefined): string[] {
  if (!value || typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const out: string[] = [];
      for (const item of parsed) {
        const t = normalizeTickerElement(item);
        if (t) out.push(t);
      }
      return out;
    }
    if (typeof parsed === "string") {
      const t = normalizeTickerElement(parsed);
      return t ? [t] : [];
    }
  } catch {
    // Not valid JSON — try comma/space split (legacy format)
    return raw
      .split(/[\s,]+/)
      .map((s) => s.replace(/[\[\]"]/g, "").toUpperCase().trim())
      .filter((s) => s.length >= 1 && s.length <= 6);
  }
  return [];
}

function normalizeTickerElement(item: unknown): string | null {
  if (typeof item === "string") {
    const cleaned = item.replace(/[\[\]"]/g, "").toUpperCase().trim();
    return cleaned.length >= 1 && cleaned.length <= 6 ? cleaned : null;
  }
  if (Array.isArray(item) && item.length > 0) {
    return normalizeTickerElement(item[0]);
  }
  return null;
}

/**
 * For display — if a ticker string looks like raw JSON (e.g. ["IGPT"]), extract the actual ticker.
 */
export function displayTicker(ticker: string): string {
  if (!ticker || typeof ticker !== "string") return ticker ?? "";
  const trimmed = ticker.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]).toUpperCase().trim();
      if (typeof parsed === "string") return parsed.toUpperCase().trim();
    } catch {
      return trimmed.replace(/[\[\]"]/g, "").toUpperCase().trim() || trimmed;
    }
  }
  return trimmed.toUpperCase().trim();
}
