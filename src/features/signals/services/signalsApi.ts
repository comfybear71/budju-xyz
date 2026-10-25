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
