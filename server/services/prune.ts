/**
 * Prune old OHLCV and chat messages to cap sql.js DB growth.
 *
 * OHLCV: chat/briefings use live prices + signals, not raw bars. Indicators need ~50 trading days;
 * we retain extra calendar days as buffer. Charts default to ~30 days visible.
 *
 * messages: Gemini gets last 20 turns; GET /history returns 100. Keeping PRUNE_MESSAGES_KEEP
 * preserves continuity without unbounded growth.
 */

type PruneDeps = {
  execAll: <T extends Record<string, unknown>>(sql: string) => T[];
  run: (sql: string, params?: Record<string, string | number | null | undefined>) => { lastInsertRowid: number };
  saveDb: () => void;
};

const DEFAULT_OHLCV_RETAIN_DAYS = 180;
const DEFAULT_MESSAGES_KEEP = 200;

export function createPruneStorage(deps: PruneDeps): () => void {
  const { execAll, run, saveDb } = deps;

  return function pruneStorage(): void {
    const ohlcvDays = Math.max(
      90,
      Math.min(800, Number(process.env.PRUNE_OHLCV_RETAIN_DAYS) || DEFAULT_OHLCV_RETAIN_DAYS)
    );
    const msgKeep = Math.max(50, Math.min(2000, Number(process.env.PRUNE_MESSAGES_KEEP) || DEFAULT_MESSAGES_KEEP));

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - ohlcvDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let ohlcvDeleted = 0;
    try {
      const before =
        execAll<{ c: number }>(
          `SELECT COUNT(*) AS c FROM ohlcv WHERE date < '${cutoffStr.replace(/'/g, "''")}'`
        )[0]?.c ?? 0;
      if (before > 0) {
        run(`DELETE FROM ohlcv WHERE date < :cutoff`, { ":cutoff": cutoffStr });
        ohlcvDeleted = before;
      }
    } catch (e) {
      console.error("[prune] OHLCV prune failed:", e);
    }

    let messagesDeleted = 0;
    try {
      const cnt = execAll<{ c: number }>("SELECT COUNT(*) AS c FROM messages")[0]?.c ?? 0;
      if (cnt > msgKeep) {
        const beforeMsg =
          execAll<{ c: number }>(`SELECT COUNT(*) AS c FROM messages WHERE id NOT IN (
            SELECT id FROM messages ORDER BY datetime(created_at) DESC LIMIT ${msgKeep}
          )`)[0]?.c ?? 0;
        if (beforeMsg > 0) {
          run(`DELETE FROM messages WHERE id NOT IN (
            SELECT id FROM messages ORDER BY datetime(created_at) DESC LIMIT ${msgKeep}
          )`);
          messagesDeleted = beforeMsg;
        }
      }
    } catch (e) {
      console.error("[prune] messages prune failed:", e);
    }

    if (ohlcvDeleted > 0 || messagesDeleted > 0) {
      saveDb();
      console.log(
        `[prune] removed ${ohlcvDeleted} OHLCV rows (older than ${ohlcvDays}d), ${messagesDeleted} messages (keeping last ${msgKeep})`
      );
    }
  };
}
