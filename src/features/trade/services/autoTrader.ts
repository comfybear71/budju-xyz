// ==========================================
// AutoTrader - Browser-side settings controller for the tier-based bot
// ==========================================
//
// IMPORTANT (2026-10-29 consolidation): this class used to be a second,
// independent trading engine — it fetched live prices/balances in the
// browser and placed REAL Swyftx orders itself (with a device-heartbeat
// scheme to avoid colliding with the server cron trading the same admin
// account). That duplicated api/auto-trade-cron.py's execution logic and
// was the root cause of two different Telegram message formats and
// occasional same-account double-trades.
//
// There is now exactly ONE trading engine: the server-side cron that loops
// over every connected wallet (admin included) every 5 minutes, computes
// targets, checks safety guards, and places orders. This class no longer
// executes anything — it only manages the shared tier settings (deviation/
// allocation/cooldown/coin assignments) that the cron reads, and displays
// read-only state (targets, cooldowns, trade log) loaded from the server.
//
// Tier-based settings:
//   Tier 1 (Dip): shallow deviation, frequent
//   Tier 2 (Dive): medium deviation
//   Tier 3 (Crash): deep deviation, rare
//
// Logic (enforced server-side, mirrored here only for display estimates):
//   - Buy target = price * (1 - deviation%), Sell target = price * (1 + deviation%)
//   - After BUY: buy target moves down, sell target stays
//   - After SELL: sell target moves up, buy target stays
//   - Cooldown per coin-tier after each trade
//   - Always keeps a per-wallet USDC minimum reserve

import {
  fetchPortfolio,
  fetchPrices,
  fetchCashBalances,
  fetchTraderState,
  fetchCoinStats,
  saveTraderState,
  clearCacheKeys,
  ASSET_CONFIG,
  PERMANENT_BUY_DENYLIST,
  type PortfolioAsset,
} from "./tradeApi";
import { CODE_TO_BINANCE } from "@lib/services/binanceWs";

// ── Types ────────────────────────────────────────────────────

export interface TierConfig {
  name: string;
  color: string;
  devMin: number;
  devMax: number;
  allocMin: number;
  allocMax: number;
}

export interface TierSettings {
  deviation: number;       // Buy deviation % (how far below reference to trigger buy)
  sellDeviation: number;   // Sell deviation % (how far above reference to trigger sell)
  allocation: number;
  cooldownHours: number;
}

export interface CoinTargets {
  buy: number;
  sell: number;
}

export interface TradeLogEntry {
  time: string;
  coin: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
}

export interface RecentTrade {
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  time: number; // Date.now() when the trade was first seen in the trade log
}

export interface AutoTraderSnapshot {
  isActive: boolean;
  tierActive: Record<number, boolean>;
  targets: Record<string, CoinTargets>;
  cooldowns: Record<string, number>;
  tierSettings: Record<string, TierSettings>;
  tierAssignments: Record<string, number[]>;
  tradeLog: TradeLogEntry[];
  recentTrades: Record<string, RecentTrade>;
  cronDiagnostics: Record<string, string>;
}

type LogFn = (message: string, level?: "info" | "success" | "error") => void;

// ── Compound Key Helpers ─────────────────────────────────────

/** Create compound key "COIN:TIER" for multi-tier targets/cooldowns */
export function compoundKey(coin: string, tier: number): string {
  return `${coin}:${tier}`;
}

/** Parse compound key "COIN:TIER" back to { coin, tier } */
export function parseCompoundKey(key: string): { coin: string; tier: number } {
  const idx = key.lastIndexOf(":");
  if (idx === -1) return { coin: key, tier: 1 }; // legacy non-compound key
  return { coin: key.slice(0, idx), tier: parseInt(key.slice(idx + 1)) || 1 };
}

// ── Constants ────────────────────────────────────────────────

export const TIER_CONFIG: Record<number, TierConfig> = {
  1: { name: "Dip", color: "#3b82f6", devMin: 1, devMax: 15, allocMin: 1, allocMax: 25 },
  2: { name: "Dive", color: "#eab308", devMin: 2, devMax: 20, allocMin: 1, allocMax: 20 },
  3: { name: "Crash", color: "#f97316", devMin: 3, devMax: 30, allocMin: 1, allocMax: 15 },
};

const ALL_TIERS = [1, 2, 3];
// Matches the server cron's per-wallet USDC reserve floor — kept here only
// so the "estimated buy amount" display shows the same number the cron
// would actually use.
const MIN_USDC_RESERVE = 30;
const MIN_ORDER_USDC = 8; // Floor for any trade (Swyftx minimum is $7)
const SELL_RATIO = 0.833; // Sell 83% of buy amount (accumulate)

// ── AutoTrader Class ─────────────────────────────────────────

export class AutoTrader {
  // State (loaded from / persisted to the shared server document that the
  // cron reads — this class never decides whether to trade, only what
  // settings the cron should use)
  tierActive: Record<number, boolean> = { 1: false, 2: false, 3: false };
  targets: Record<string, CoinTargets> = {};
  cooldowns: Record<string, number> = {};
  tierSettings: Record<string, TierSettings> = {
    tier1: { deviation: 3, sellDeviation: 10, allocation: 5, cooldownHours: 12 },
    tier2: { deviation: 6, sellDeviation: 12, allocation: 8, cooldownHours: 12 },
    tier3: { deviation: 10, sellDeviation: 15, allocation: 12, cooldownHours: 24 },
  };
  tierAssignments: Record<string, number[]> = {};
  tradeLog: TradeLogEntry[] = [];
  cronDiagnostics: Record<string, string> = {};
  recentTrades: Record<string, RecentTrade> = {};

  // Callbacks for UI updates
  private _onStateChange: (() => void) | null = null;
  private _log: LogFn = () => {};

  // Admin wallet for server saves
  private _adminWallet: string = "";

  // Cached data for display-only estimates (buy/sell amount previews,
  // avg-cost badges) — never used to decide or place a trade
  private _cachedAssets: PortfolioAsset[] = [];
  private _cachedPrices: Record<string, number> = {};
  private _cachedUsdcBalance: number = 0;
  /** Avg cost (cost basis) per coin from /api/coin-stats. Missing/0 = allow sells. */
  private _cachedAvgCost: Record<string, number> = {};

  // Detects newly-appeared trade log entries across polls so the UI can
  // still show a brief "just traded" badge even though the trade itself
  // was executed by the server cron, not this tab.
  private _hasLoadedTradeLogOnce = false;
  private _lastSeenTradeTime = 0;

  // ── Computed ─────────────────────────────────────────────

  get isActive(): boolean {
    return this.tierActive[1] || this.tierActive[2] || this.tierActive[3];
  }

  // ── Init / Config ───────────────────────────────────────

  setAdminWallet(wallet: string) {
    this._adminWallet = wallet;
  }

  setOnStateChange(fn: () => void) {
    this._onStateChange = fn;
  }

  setLogger(fn: LogFn) {
    this._log = fn;
  }

  private _notifyChange() {
    this._onStateChange?.();
  }

  // ── Load State from Server ──────────────────────────────

  async loadFromServer(): Promise<void> {
    const state = await fetchTraderState();
    if (!state) return;

    // Load tier settings from DB, falling back to defaults
    const dbTiers = state.autoTiers || state.autoTierAssets || {};
    const defaults: Record<string, TierSettings> = {
      tier1: { deviation: 3, sellDeviation: 10, allocation: 5, cooldownHours: 12 },
      tier2: { deviation: 6, sellDeviation: 12, allocation: 8, cooldownHours: 12 },
      tier3: { deviation: 10, sellDeviation: 15, allocation: 12, cooldownHours: 24 },
    };
    this.tierSettings = {} as any;
    for (let t = 1; t <= 3; t++) {
      const key = `tier${t}`;
      const db = dbTiers[key] || {};
      this.tierSettings[key] = {
        deviation: db.deviation != null ? Number(db.deviation) : defaults[key].deviation,
        sellDeviation: db.sellDeviation != null ? Number(db.sellDeviation) : defaults[key].sellDeviation,
        allocation: db.allocation != null ? Number(db.allocation) : defaults[key].allocation,
        cooldownHours: db.cooldownHours != null ? Number(db.cooldownHours) : defaults[key].cooldownHours,
      };
    }

    // Load tier assignments — migrate old single-tier format to multi-tier arrays
    const rawAssignments = state.autoTierAssignments || {};
    this.tierAssignments = {};
    for (const [coin, tier] of Object.entries(rawAssignments)) {
      if (Array.isArray(tier)) {
        // Already multi-tier format
        this.tierAssignments[coin] = (tier as number[]).filter((t) => t >= 1 && t <= 3);
      } else {
        // Old format: single tier number or "tierN" string → migrate to all 3 tiers
        const tierStr = String(tier);
        const tierNum = tierStr.startsWith("tier")
          ? parseInt(tierStr.replace("tier", ""))
          : parseInt(tierStr);
        if (tierNum >= 1 && tierNum <= 3) {
          this.tierAssignments[coin] = [...ALL_TIERS]; // all tiers by default
        }
      }
    }

    // Load cooldowns — migrate old "BTC" keys to compound "BTC:1" keys
    const rawCooldowns = state.autoCooldowns || {};
    this.cooldowns = {};
    const now = Date.now();
    for (const [key, expiry] of Object.entries(rawCooldowns)) {
      const expiryTime = Number(expiry);
      if (expiryTime <= now) continue;
      if (key.includes(":")) {
        // Already compound key format
        this.cooldowns[key] = expiryTime;
      } else {
        // Old format "BTC" → create compound keys for all assigned tiers
        const tiers = this.tierAssignments[key] || [1];
        for (const t of tiers) {
          this.cooldowns[compoundKey(key, t)] = expiryTime;
        }
      }
    }

    // Load trade log (now solely populated by the server cron — this tab
    // never appends to it directly anymore)
    const newTradeLog: TradeLogEntry[] = (state.autoTradeLog || []).map((e: any) => ({
      time: e.timestamp || e.time || "",
      coin: e.coin || "",
      side: ((e.side || "").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      quantity: Number(e.qty ?? e.quantity) || 0,
      price: Number(e.price) || 0,
      amount: (Number(e.qty ?? e.quantity) || 0) * (Number(e.price) || 0),
    }));
    this._applyTradeLog(newTradeLog);

    // Load cron diagnostics (saved by the server cron for UI display)
    const cronLog = state.autoCronLog || {};
    this.cronDiagnostics = {};
    if (cronLog.decisions && Array.isArray(cronLog.decisions)) {
      for (const d of cronLog.decisions) {
        if (d.coin && d.reason) {
          this.cronDiagnostics[d.coin] = d.reason;
        } else if (d.coin && d.action) {
          this.cronDiagnostics[d.coin] = d.error || d.action;
        }
      }
    }

    // Load bot active state + last-known targets (best-effort display only —
    // the cron is the sole source of truth for whether/when a trade fires)
    if (state.autoBotActive || state._rawAutoActive) {
      const autoActive = state._rawAutoActive || {};

      const savedTierActive = autoActive.tierActive || {};
      for (let t = 1; t <= 3; t++) {
        const key = String(t);
        this.tierActive[t] = !!(savedTierActive[key] ?? savedTierActive[t]);
      }

      // Restore targets — migrate old "BTC" keys to compound "BTC:1" keys
      const savedTargets = autoActive.targets || {};
      this.targets = {};
      for (const [key, val] of Object.entries(savedTargets)) {
        if (typeof val === "object" && val !== null && (val as any).buy && (val as any).sell) {
          if (key.includes(":")) {
            this.targets[key] = val as CoinTargets;
          } else {
            const tiers = this.tierAssignments[key];
            const tier = tiers?.length ? tiers[0] : 1;
            this.targets[compoundKey(key, tier)] = val as CoinTargets;
          }
        }
      }
    }

    // Ensure default assignments if none exist
    this._ensureDefaultAssignments();

    this._notifyChange();
  }

  /** Diff the freshly-loaded trade log against the previous one and raise a
   *  brief "just traded" badge for any coin with a genuinely new entry.
   *  Skips the very first load so historical trades aren't all flagged as
   *  "recent" the moment the page opens. */
  private _applyTradeLog(newTradeLog: TradeLogEntry[]) {
    if (this._hasLoadedTradeLogOnce) {
      for (const entry of newTradeLog) {
        const entryTime = entry.time ? new Date(entry.time).getTime() : 0;
        if (entryTime > this._lastSeenTradeTime) {
          this._recordRecentTrade(entry.coin, entry.side, entry.price, entry.amount, entryTime);
        }
      }
    }
    this.tradeLog = newTradeLog;
    this._hasLoadedTradeLogOnce = true;
    for (const entry of newTradeLog) {
      const entryTime = entry.time ? new Date(entry.time).getTime() : 0;
      if (entryTime > this._lastSeenTradeTime) this._lastSeenTradeTime = entryTime;
    }
  }

  // ── Tier Helpers ────────────────────────────────────────

  getCoinsForTier(tierNum: number): string[] {
    return Object.entries(this.tierAssignments)
      .filter(([, tiers]) => tiers.includes(tierNum))
      .map(([code]) => code);
  }

  getTiersForCoin(code: string): number[] {
    return this.tierAssignments[code] || [];
  }

  /** @deprecated Use getTiersForCoin() for multi-tier. Returns first tier for backward compat. */
  getTier(code: string): number {
    const tiers = this.tierAssignments[code];
    return tiers?.length ? tiers[0] : 0;
  }

  getSettings(code: string): TierSettings {
    const tier = this.getTier(code);
    if (tier >= 1 && tier <= 3) return this.tierSettings[`tier${tier}`];
    return this.tierSettings.tier2; // fallback
  }

  getTierSettings(tierNum: number): TierSettings {
    return this.tierSettings[`tier${tierNum}`] || this.tierSettings.tier2;
  }

  // ── Default Assignments ─────────────────────────────────

  private _ensureDefaultAssignments() {
    if (Object.keys(this.tierAssignments).length > 0) {
      let changed = false;
      for (const code of Object.keys(this.tierAssignments)) {
        if (PERMANENT_BUY_DENYLIST.has(code)) {
          delete this.tierAssignments[code];
          changed = true;
        }
      }
      if (changed) this._saveTierAssignments();
      return;
    }
    // Assign all known crypto assets to ALL tiers by default
    for (const code of Object.keys(ASSET_CONFIG)) {
      if (code === "AUD" || code === "USDC" || code === "USD") continue;
      if (PERMANENT_BUY_DENYLIST.has(code)) continue;
      this.tierAssignments[code] = [...ALL_TIERS];
    }
    this._saveTierAssignments();
  }

  // ── Coin Assignment ─────────────────────────────────────

  /** Add a coin to a specific tier */
  assignCoin(code: string, tierNum: number) {
    if (PERMANENT_BUY_DENYLIST.has(code)) return; // never assign denied coins
    const tiers = this.tierAssignments[code] || [];
    if (!tiers.includes(tierNum)) {
      tiers.push(tierNum);
      tiers.sort();
    }
    this.tierAssignments[code] = tiers;
    this._saveTierAssignments();

    // Optimistic display target only — the cron computes and persists the
    // real target on its own next run regardless of what's shown here.
    const ck = compoundKey(code, tierNum);
    if (this.tierActive[tierNum] && !this._isOnCooldown(ck)) {
      const price = this._cachedPrices[code];
      if (price) {
        const ts = this.getTierSettings(tierNum);
        this.targets[ck] = {
          buy: price * (1 - ts.deviation / 100),
          sell: price * (1 + ts.sellDeviation / 100),
        };
      }
    }

    this._log(`${code} added to Tier ${tierNum} (${TIER_CONFIG[tierNum].name})`, "info");
    this._notifyChange();
  }

  /** Remove a coin from a specific tier */
  unassignCoin(code: string, tierNum?: number) {
    if (tierNum !== undefined) {
      // Remove from specific tier
      const tiers = this.tierAssignments[code] || [];
      this.tierAssignments[code] = tiers.filter((t) => t !== tierNum);
      if (this.tierAssignments[code].length === 0) {
        delete this.tierAssignments[code];
      }
      delete this.targets[compoundKey(code, tierNum)];
      delete this.cooldowns[compoundKey(code, tierNum)];
      this._log(`${code} removed from Tier ${tierNum}`, "info");
    } else {
      // Remove from all tiers
      const tiers = this.tierAssignments[code] || [];
      delete this.tierAssignments[code];
      for (const t of tiers) {
        delete this.targets[compoundKey(code, t)];
        delete this.cooldowns[compoundKey(code, t)];
      }
      this._log(`${code} removed from all tiers`, "info");
    }
    this._saveTierAssignments();
    this._notifyChange();
  }

  // ── Tier Settings Update ────────────────────────────────

  /** Update tier settings in memory. Call saveTierSettingsForTier() to persist to DB. */
  updateTierSettings(tierNum: number, settings: Partial<TierSettings>) {
    const key = `tier${tierNum}`;
    const current = this.tierSettings[key];
    if (!current) return;

    const oldBuyDev = current.deviation;
    const oldSellDev = current.sellDeviation;
    Object.assign(current, settings);

    // If either deviation changed and tier is active, recalculate display
    // targets for this tier (optimistic only — see assignCoin comment)
    const buyDevChanged = settings.deviation !== undefined && settings.deviation !== oldBuyDev;
    const sellDevChanged = settings.sellDeviation !== undefined && settings.sellDeviation !== oldSellDev;
    if ((buyDevChanged || sellDevChanged) && this.tierActive[tierNum]) {
      const tierCoins = this.getCoinsForTier(tierNum);
      for (const code of tierCoins) {
        const ck = compoundKey(code, tierNum);
        const price = this._cachedPrices[code];
        if (price && price > 0) {
          this.targets[ck] = {
            buy: price * (1 - current.deviation / 100),
            sell: price * (1 + current.sellDeviation / 100),
          };
        }
      }
      this._log(`Tier ${tierNum} deviation changed to buy ${current.deviation}% / sell ${current.sellDeviation}% — targets recalculated`, "info");
    }

    this._notifyChange();
  }

  /** Save only a single tier's settings (deviation + allocation) to DB. Returns true on success. */
  async saveTierSettingsForTier(tierNum: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._adminWallet) return { ok: false, error: "No admin wallet connected" };
    const key = `tier${tierNum}`;
    const settings = this.tierSettings[key];
    if (!settings) return { ok: false, error: "Tier settings not found" };

    try {
      const autoTiers: Record<string, any> = {
        [key]: {
          ...settings,
          name: TIER_CONFIG[tierNum].name,
          active: this.tierActive[tierNum],
        },
      };
      const result = await saveTraderState(this._adminWallet, { autoTiers });
      if (result.success) {
        this._log(`Tier ${tierNum} settings saved to DB (buyDev=${settings.deviation}%, sellDev=${settings.sellDeviation}%, alloc=${settings.allocation}%, cd=${settings.cooldownHours}h)`, "info");
        return { ok: true };
      } else {
        const error = result.error || "Unknown server error";
        this._log(`Tier ${tierNum} settings save failed: ${error}`, "error");
        return { ok: false, error };
      }
    } catch (err: any) {
      const error = err.message || "Network error";
      this._log(`Tier ${tierNum} settings save error: ${error}`, "error");
      return { ok: false, error };
    }
  }

  // ── Start / Stop (settings toggle only — the cron decides if/when to
  // actually trade on its own next run) ──────────────────

  async startTier(tierNum: number): Promise<{ success: boolean; error?: string }> {
    // Always save current tier settings to DB before starting
    // (catches case where user adjusted sliders but forgot to click Save)
    await this.saveTierSettingsForTier(tierNum);

    // Refresh cached prices so the optimistic display targets below are fresh
    await this._refreshData();

    const tierCoins = this.getCoinsForTier(tierNum);
    if (tierCoins.length === 0) {
      const msg = `No coins assigned to Tier ${tierNum}`;
      this._log(msg, "error");
      return { success: false, error: msg };
    }

    // Set optimistic display targets for non-cooldown coins — purely for
    // the monitoring panel; the cron computes the real ones independently.
    const ts = this.getTierSettings(tierNum);
    for (const code of tierCoins) {
      const ck = compoundKey(code, tierNum);
      if (!this._isOnCooldown(ck)) {
        const price = this._cachedPrices[code];
        if (price && price > 0) {
          this.targets[ck] = {
            buy: price * (1 - ts.deviation / 100),
            sell: price * (1 + ts.sellDeviation / 100),
          };
        }
      }
    }

    this.tierActive[tierNum] = true;

    const cfg = TIER_CONFIG[tierNum];
    this._log(`Tier ${tierNum} (${cfg.name}) started: monitoring ${tierCoins.length} coin(s)`, "success");

    // Save all state so every wallet's dashboard — and the cron — see the
    // updated tier-active flag immediately.
    this._saveActiveState();
    this._saveTierAssignments();
    this._saveCooldowns();
    this._notifyChange();
    return { success: true };
  }

  stopTier(tierNum: number) {
    this.tierActive[tierNum] = false;

    // Remove display targets for this tier's coins
    for (const code of this.getCoinsForTier(tierNum)) {
      delete this.targets[compoundKey(code, tierNum)];
    }

    this._log(`Tier ${tierNum} (${TIER_CONFIG[tierNum].name}) stopped`, "info");

    this._saveActiveState();
    this._notifyChange();
  }

  stopAll() {
    for (let t = 1; t <= 3; t++) {
      if (this.tierActive[t]) this.stopTier(t);
    }
  }

  // ── Override Cooldowns ──────────────────────────────────

  async overrideCooldowns(tierNum: number) {
    const tierCoins = this.getCoinsForTier(tierNum);
    let cleared = 0;

    for (const code of tierCoins) {
      const ck = compoundKey(code, tierNum);
      if (this.cooldowns[ck]) {
        delete this.cooldowns[ck];
        cleared++;
      }
    }

    if (cleared === 0) {
      this._log(`No cooldowns to override in Tier ${tierNum}`, "info");
      return;
    }

    // Optimistic display targets for coins that didn't already have one
    for (const code of tierCoins) {
      const ck = compoundKey(code, tierNum);
      if (!this.targets[ck]) {
        const price = this._cachedPrices[code];
        if (price && price > 0) {
          const ts2 = this.getTierSettings(tierNum);
          this.targets[ck] = {
            buy: price * (1 - ts2.deviation / 100),
            sell: price * (1 + ts2.sellDeviation / 100),
          };
        }
      }
    }

    this._log(`Tier ${tierNum} cooldowns overridden — ${cleared} cleared`, "success");

    this._saveCooldowns();
    this._saveActiveState();
    this._notifyChange();
  }

  // ── Data Refresh (for display estimates only) ───────────

  private async _refreshData() {
    try {
      // Bust the cache so estimate displays always reflect a live fetch.
      clearCacheKeys("portfolio", "prices", "cash");

      // Snapshot only WebSocket-connected prices before the API call.
      // WS prices are sub-second; CoinGecko lags up to 30s. For non-WS
      // coins we WANT the fresh API price, so we only preserve WS ones.
      const wsPrices: Record<string, number> = {};
      for (const code of Object.keys(CODE_TO_BINANCE)) {
        if (this._cachedPrices[code]) {
          wsPrices[code] = this._cachedPrices[code];
        }
      }

      const [assets, apiPrices, cash, coinStats] = await Promise.all([
        fetchPortfolio(),
        fetchPrices(),
        fetchCashBalances(),
        fetchCoinStats(),
      ]);
      this._cachedAssets = assets;
      // API prices as base, then overlay real-time WebSocket prices.
      const freshWs: Record<string, number> = {};
      for (const code of Object.keys(CODE_TO_BINANCE)) {
        if (this._cachedPrices[code]) {
          freshWs[code] = this._cachedPrices[code];
        }
      }
      this._cachedPrices = { ...apiPrices, ...wsPrices, ...freshWs };
      this._cachedUsdcBalance = cash.usdc;

      // Avg cost map for the "below avg cost" badge (missing/0 = unknown)
      if (coinStats?.coins?.length) {
        const avgMap: Record<string, number> = {};
        for (const c of coinStats.coins) {
          if (c.coin && c.avgCost > 0) avgMap[c.coin] = c.avgCost;
        }
        this._cachedAvgCost = avgMap;
      }
    } catch (error: any) {
      this._log(`Data refresh error: ${error.message}`, "error");
    }
  }

  /** Public avg-cost lookup for UI (0 if unknown). */
  getAvgCost(coin: string): number {
    return this._cachedAvgCost[coin] || 0;
  }

  /** Feed live prices in from the parent component's WebSocket ticker, for
   *  display/estimate purposes only. No execution is triggered here. */
  updatePrices(prices: Record<string, number>) {
    this._cachedPrices = { ...this._cachedPrices, ...prices };
  }

  // ── Cooldown Management ─────────────────────────────────

  /** Check cooldown using compound key "BTC:1" or plain coin code "BTC" (checks all tiers) */
  _isOnCooldown(key: string): boolean {
    if (key.includes(":")) {
      // Compound key — check specific tier
      const cooldown = this.cooldowns[key];
      if (!cooldown) return false;
      if (Date.now() >= cooldown) {
        delete this.cooldowns[key];
        return false;
      }
      return true;
    }
    // Plain coin code — check if ANY tier is on cooldown (for UI backward compat)
    for (const t of ALL_TIERS) {
      const ck = compoundKey(key, t);
      const cooldown = this.cooldowns[ck];
      if (cooldown && Date.now() < cooldown) return true;
      if (cooldown && Date.now() >= cooldown) delete this.cooldowns[ck];
    }
    return false;
  }

  getCooldownRemaining(key: string): string {
    const cooldown = this.cooldowns[key];
    if (!cooldown) return "0h";
    const remaining = cooldown - Date.now();
    if (remaining <= 0) return "0h";
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  }

  // ── Recent Trade Tracking (for UI celebrations) ────────

  private _recordRecentTrade(coin: string, side: "BUY" | "SELL", price: number, amount: number, time: number) {
    this.recentTrades[coin] = { side, price, amount, time };
    this._notifyChange();
    // Auto-clear after 60 seconds so the celebration badge fades
    setTimeout(() => {
      if (this.recentTrades[coin]?.time === time) {
        delete this.recentTrades[coin];
        this._notifyChange();
      }
    }, 60_000);
  }

  getRecentTrade(coin: string): RecentTrade | null {
    const trade = this.recentTrades[coin];
    if (!trade) return null;
    // Expire after 60 seconds
    if (Date.now() - trade.time > 60_000) {
      delete this.recentTrades[coin];
      return null;
    }
    return trade;
  }

  // ── Persistence (Server State) ──────────────────────────

  private async _saveActiveState() {
    if (!this._adminWallet) return;

    const autoActive = {
      isActive: this.isActive,
      tierActive: this.tierActive,
      targets: this.targets,
    };

    try {
      await saveTraderState(this._adminWallet, { autoActive });
    } catch {
      // Non-critical
    }
  }

  /** Flush any in-flight state to the server immediately (called on page unload) */
  flushPendingSave(): void {
    // Fire and forget — beforeunload can't wait for async
    this._saveActiveState();
  }

  private async _saveTierAssignments() {
    if (!this._adminWallet) return;
    try {
      await saveTraderState(this._adminWallet, {
        autoTierAssignments: this.tierAssignments,
      });
    } catch {
      // Non-critical
    }
  }

  private async _saveCooldowns() {
    if (!this._adminWallet) return;
    try {
      await saveTraderState(this._adminWallet, {
        autoCooldowns: this.cooldowns,
      });
    } catch {
      // Non-critical
    }
  }

  // ── Trade Amount Estimates ──────────────────────────────

  /** Get estimated BUY order amount in USDC for a coin (optionally for specific tier) */
  getEstimatedBuyAmount(code: string, tierNum?: number): number {
    const settings = tierNum ? this.getTierSettings(tierNum) : this.getSettings(code);
    const usdc = this._cachedUsdcBalance;
    const amount = Math.max((settings.allocation / 100) * usdc, MIN_ORDER_USDC);
    if (usdc - amount < MIN_USDC_RESERVE) {
      return Math.max(0, usdc - MIN_USDC_RESERVE);
    }
    return amount;
  }

  /** Get estimated SELL order value in USD for a coin (optionally for specific tier) */
  getEstimatedSellValue(code: string, tierNum?: number): number {
    const settings = tierNum ? this.getTierSettings(tierNum) : this.getSettings(code);
    const asset = this._cachedAssets.find((a) => a.code === code);
    const balance = asset?.balance ?? 0;
    const price = this._cachedPrices[code] || 0;
    const sellPercent = settings.allocation * SELL_RATIO;
    const quantity = (sellPercent / 100) * balance;
    let value = quantity * price;
    if (value < MIN_ORDER_USDC && price > 0) {
      const minQty = MIN_ORDER_USDC / price;
      if (minQty <= balance) {
        value = MIN_ORDER_USDC;
      } else {
        value = balance * price;
      }
    }
    return value;
  }

  // ── Snapshot for UI ─────────────────────────────────────

  getSnapshot(): AutoTraderSnapshot {
    return {
      isActive: this.isActive,
      tierActive: { ...this.tierActive },
      targets: { ...this.targets },
      cooldowns: { ...this.cooldowns },
      tierSettings: { ...this.tierSettings },
      tierAssignments: { ...this.tierAssignments },
      tradeLog: [...this.tradeLog],
      recentTrades: { ...this.recentTrades },
      cronDiagnostics: { ...this.cronDiagnostics },
    };
  }

  // ── Cleanup ─────────────────────────────────────────────

  destroy() {
    this._onStateChange = null;
  }
}

// Singleton instance
let _instance: AutoTrader | null = null;

export function getAutoTrader(): AutoTrader {
  if (!_instance) {
    _instance = new AutoTrader();
  }
  return _instance;
}

export function destroyAutoTrader() {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
