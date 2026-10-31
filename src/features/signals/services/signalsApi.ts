// ==========================================
// Signals / Copy Trading — Phase 1 API client
// ==========================================
// Public, read-only endpoints (same visibility tier as the Pool
// leaderboard / coin charts) — no wallet connection needed to view.
// ==========================================

async function fetchWithRetry(url: string, retries = 2, timeoutMs = 12000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok && res.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("fetchWithRetry exhausted");
}

export interface SignalsLeaderboardEntry {
  address: string;
  label?: string;
  trades: number;
  winRate: number;
  totalPnlUsd: number;
  avgHoldMinutes: number;
  lastSeenAt: string | null;
}

export interface SignalsLeaderboard {
  entries: SignalsLeaderboardEntry[];
  walletCount: number;
  trackedCount: number;
  excludedCount: number;
}

export interface SignalPosition {
  id: string;
  walletAddress: string;
  walletLabel?: string;
  tokenSymbol: string;
  tokenMint: string;
  status: "open" | "closed";
  entryPriceUsd: number | null;
  entryAmountUsd: number | null;
  entryAt: string | null;
  currentPriceUsd: number | null;
  exitPriceUsd: number | null;
  exitAt: string | null;
  exitReason: string | null;
  pnlUsd: number;
  pnlPct: number;
}

export interface SignalsOverview {
  trackedWallets: number;
  activeWallets: number;
  openPositions: number;
  closedPositions: number;
  totalPaperPnlUsd: number;
  overallWinRate: number;
}

export async function fetchSignalsLeaderboard(limit = 50): Promise<SignalsLeaderboard | null> {
  try {
    const res = await fetchWithRetry(`/api/copytrade/leaderboard?limit=${limit}`);
    if (!res.ok) return null;
    return (await res.json()) as SignalsLeaderboard;
  } catch {
    return null;
  }
}

export async function fetchSignalsFeed(limit = 60): Promise<SignalPosition[]> {
  try {
    const res = await fetchWithRetry(`/api/copytrade/signals?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.signals ?? []) as SignalPosition[];
  } catch {
    return [];
  }
}

export async function fetchSignalsOverview(): Promise<SignalsOverview | null> {
  try {
    const res = await fetchWithRetry("/api/copytrade/overview");
    if (!res.ok) return null;
    return (await res.json()) as SignalsOverview;
  } catch {
    return null;
  }
}

export interface SignalsProgressEntry {
  address: string;
  label?: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  tradesNeeded: number;
  lastSeenAt: string | null;
}

export interface SignalsProgress {
  entries: SignalsProgressEntry[];
  inProgressCount: number;
  minTradesToScore: number;
}

/** Wallets still "pending" (not yet proven onto the real leaderboard, nor
 *  excluded as a wash-trader/bot) that have made at least one paper trade
 *  so far — sorted closest-to-graduating first. Lets the page show the
 *  tracked list visibly growing instead of a flat "no ranked wallets
 *  yet" while every wallet is still under the 10-trade minimum. */
export async function fetchSignalsProgress(limit = 30): Promise<SignalsProgress | null> {
  try {
    const res = await fetchWithRetry(`/api/copytrade/progress?limit=${limit}`);
    if (!res.ok) return null;
    return (await res.json()) as SignalsProgress;
  } catch {
    return null;
  }
}

export interface SignalsStatus {
  verdict: { level: "ok" | "warn" | "error"; headline: string; detail: string };
  wallets: { trackedWallets: number; pendingWallets: number; activeWallets: number };
  webhook: {
    connected: boolean;
    deliveriesOk: number;
    deliveriesRejected: number;
    lastDeliveryAt: string | null;
    lastSyncError: string | null;
  };
  events: { total: number; last24h: number; lastAt: string | null };
  paperTrades: { open: number; closed: number; opened24h: number; closed24h: number; lastOpenedAt: string | null };
  jobs: { walletRefreshAt: string | null; pricingJobAt: string | null };
  serverTime: string;
}

/** Plain-English health of the whole Signals pipeline (public, aggregate only). */
export async function fetchSignalsStatus(): Promise<SignalsStatus | null> {
  try {
    const res = await fetchWithRetry("/api/copytrade/status");
    if (!res.ok) return null;
    return (await res.json()) as SignalsStatus;
  } catch {
    return null;
  }
}
