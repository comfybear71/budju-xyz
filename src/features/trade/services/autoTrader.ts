// ==========================================
// AutoTrader - Multi-Coin Tier-Based Trading Engine
// ==========================================
// Port of FLUB's autotrader.js to TypeScript for BUDJU.
//
// Monitors holdings with tier-based deviation settings:
//   Tier 1 (Blue Chips): BTC, ETH, SOL, BNB, XRP (default)
//   Tier 2 (Alts): User-assigned
//   Tier 3 (Speculative): User-assigned
//
// Logic:
//   - Sets buy/sell targets when a tier starts
//   - Buy target = price * (1 - deviation%), Sell target = price * (1 + deviation%)
//   - After BUY: buy target moves down, sell target stays
//   - After SELL: sell target moves up, buy target stays
//   - 24h cooldown per coin after each trade
//   - Always keeps $100 USDC minimum reserve
//   - Sells 83.3% of allocation (accumulation bias)

import {
  fetchPortfolio,
  fetchPrices,
  fetchCashBalances,
  fetchTraderState,
  saveTraderState,
  placeTrade,
  clearCacheKeys,
  getAdminAuth,
  ASSET_CONFIG,
  type PortfolioAsset,
  type TraderState,
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
  deviation: number;
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
  time: number; // Date.now() when trade executed
}

export interface CoinDiagnostic {
  reason: string;
  level: "info" | "warn" | "error";
  timestamp: number;
}

export interface AutoTraderSnapshot {
  isActive: boolean;
  tierActive: Record<number, boolean>;
  targets: Record<string, CoinTargets>;
  cooldowns: Record<string, number>;
  tierSettings: Record<string, TierSettings>;
  tierAssignments: Record<string, number>;
  tradeLog: TradeLogEntry[];
  recentTrades: Record<string, RecentTrade>;
  isOwner: boolean;
  deviceId: string;
  coinDiagnostics: Record<string, CoinDiagnostic>;
  cronDiagnostics: Record<string, string>;
}

type LogFn = (message: string, level?: "info" | "success" | "error") => void;

// ── Constants ────────────────────────────────────────────────

export const TIER_CONFIG: Record<number, TierConfig> = {
  1: { name: "Blue Chips", color: "#3b82f6", devMin: 1, devMax: 15, allocMin: 1, allocMax: 25 },
  2: { name: "Alts", color: "#eab308", devMin: 2, devMax: 20, allocMin: 1, allocMax: 20 },
  3: { name: "Speculative", color: "#f97316", devMin: 3, devMax: 30, allocMin: 1, allocMax: 15 },
};

const DEFAULT_T1 = ["BTC", "ETH", "SOL", "BNB", "XRP"];
const DEFAULT_COOLDOWN_HOURS = 24;
const MIN_USDC_RESERVE = 100;
const MIN_ORDER_USDC = 8; // Floor for any trade (Swyftx minimum is $7)
const SELL_RATIO = 0.833; // Sell 83% of buy amount (accumulate)
const CHECK_INTERVAL_MS = 180_000; // 3 minutes
const HEARTBEAT_STALE_MS = 5 * 60 * 1000; // 5 minutes

// ── AutoTrader Class ─────────────────────────────────────────

export class AutoTrader {
  // State
  tierActive: Record<number, boolean> = { 1: false, 2: false, 3: false };
  targets: Record<string, CoinTargets> = {};
  cooldowns: Record<string, number> = {};
  tierSettings: Record<string, TierSettings> = {
    tier1: { deviation: 1, allocation: 5, cooldownHours: 24 },
    tier2: { deviation: 2, allocation: 5, cooldownHours: 24 },
    tier3: { deviation: 2, allocation: 5, cooldownHours: 24 },
  };
  tierAssignments: Record<string, number> = {};
  tradeLog: TradeLogEntry[] = [];
  coinDiagnostics: Record<string, CoinDiagnostic> = {};
  cronDiagnostics: Record<string, string> = {};
  recentTrades: Record<string, RecentTrade> = {};

  // Device ownership — generate fresh ID each session (tab identification only)
  private _deviceId = Math.random().toString(36).substring(2, 10);
  private _isOwner = false;
  private _checkCount = 0;

  // Retry timer to reclaim ownership when previous heartbeat becomes stale
  private _ownershipRetryTimer: ReturnType<typeof setTimeout> | null = null;

  // Monitoring interval
  private _monitorInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks for UI updates
  private _onStateChange: (() => void) | null = null;
  private _log: LogFn = () => {};

  // Admin wallet for server saves
  private _adminWallet: string = "";

  // Cached data for the execution loop
  private _cachedAssets: PortfolioAsset[] = [];
  private _cachedPrices: Record<string, number> = {};
  private _cachedUsdcBalance: number = 0;

  // Warmup: skip first price check after resume so fresh prices load first
  private _warmup = false;

  // Debounce timer for tier settings save (slider drags fire onChange rapidly)
  private _saveTierSettingsTimer: ReturnType<typeof setTimeout> | null = null;

  // Pending save retry — if DB save fails, retry on next opportunity
  private _pendingTierSave = false;

  // Guard against concurrent _checkPrices execution
  private _priceCheckRunning = false;

  // Debounce timer for trigger-crossing immediate checks
  private _triggerCheckTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Computed ─────────────────────────────────────────────

  get isActive(): boolean {
    return this.tierActive[1] || this.tierActive[2] || this.tierActive[3];
  }

  get isOwner(): boolean {
    return this._isOwner;
  }

  get deviceId(): string {
    return this._deviceId;
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
      tier1: { deviation: 1, allocation: 5, cooldownHours: 24 },
      tier2: { deviation: 2, allocation: 5, cooldownHours: 24 },
      tier3: { deviation: 2, allocation: 5, cooldownHours: 24 },
    };
    this.tierSettings = {} as any;
    for (let t = 1; t <= 3; t++) {
      const key = `tier${t}`;
      const db = dbTiers[key] || {};
      this.tierSettings[key] = {
        deviation: db.deviation != null ? Number(db.deviation) : defaults[key].deviation,
        allocation: db.allocation != null ? Number(db.allocation) : defaults[key].allocation,
        cooldownHours: db.cooldownHours != null ? Number(db.cooldownHours) : defaults[key].cooldownHours,
      };
    }

    // Load tier assignments (FLUB uses numeric, BUDJU uses "tierN" keys)
    const rawAssignments = state.autoTierAssignments || {};
    this.tierAssignments = {};
    for (const [coin, tier] of Object.entries(rawAssignments)) {
      const tierStr = String(tier);
      const tierNum = tierStr.startsWith("tier")
        ? parseInt(tierStr.replace("tier", ""))
        : parseInt(tierStr);
      if (tierNum >= 1 && tierNum <= 3) {
        this.tierAssignments[coin] = tierNum;
      }
    }

    // Load cooldowns
    const rawCooldowns = state.autoCooldowns || {};
    this.cooldowns = {};
    const now = Date.now();
    for (const [coin, expiry] of Object.entries(rawCooldowns)) {
      const expiryTime = Number(expiry);
      if (expiryTime > now) {
        this.cooldowns[coin] = expiryTime;
      }
    }

    // Load trade log
    this.tradeLog = (state.autoTradeLog || []).map((e: any) => ({
      time: e.timestamp || e.time || "",
      coin: e.coin || "",
      side: ((e.side || "").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      quantity: Number(e.qty ?? e.quantity) || 0,
      price: Number(e.price) || 0,
      amount: (Number(e.qty ?? e.quantity) || 0) * (Number(e.price) || 0),
    }));

    // Load cron diagnostics (saved by server-side cron for UI display)
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

    // Load bot active state and resume monitoring automatically
    if (state.autoBotActive || state._rawAutoActive) {
      const autoActive = state._rawAutoActive || {};

      // Restore tier active state
      const savedTierActive = autoActive.tierActive || {};
      for (let t = 1; t <= 3; t++) {
        const key = String(t);
        this.tierActive[t] = !!(savedTierActive[key] ?? savedTierActive[t]);
      }

      // Restore targets
      const savedTargets = autoActive.targets || {};
      this.targets = {};
      for (const [code, val] of Object.entries(savedTargets)) {
        if (typeof val === "object" && val !== null && (val as any).buy && (val as any).sell) {
          this.targets[code] = val as CoinTargets;
        }
      }

      // NOTE: Do NOT delete targets for cooldown coins here.
      // _checkPrices already skips cooldown coins, and deleting targets
      // causes them to be permanently lost from the DB when _saveActiveState
      // writes back. After cooldown expires, the coin would have no target
      // and never trade again.

      // Device ownership check
      const otherDevice = autoActive.botDeviceId && autoActive.botDeviceId !== this._deviceId;
      const freshHeartbeat = autoActive.botHeartbeat && (Date.now() - autoActive.botHeartbeat < HEARTBEAT_STALE_MS);

      if (otherDevice && freshHeartbeat) {
        this._isOwner = false;
        this._log("Auto-trading active on another device — viewing only", "info");

        // Schedule a retry to reclaim ownership once the old heartbeat becomes stale
        const staleness = HEARTBEAT_STALE_MS - (Date.now() - (autoActive.botHeartbeat || 0));
        const retryDelay = Math.max(staleness + 5000, 10_000); // at least 10s
        this._scheduleOwnershipRetry(retryDelay);
      } else if (this.isActive) {
        // Take ownership and resume monitoring
        this._isOwner = true;

        // Only warmup if monitoring isn't already running — otherwise a
        // page refresh or navigation back to /trade would reset warmup
        // and delay the next trade check by another 3 minutes.
        if (!this._monitorInterval) {
          this._warmup = true;
          this._log(`Auto-trading resumed: monitoring ${Object.keys(this.targets).length} coins (warming up)`, "success");
        } else {
          this._log(`Auto-trading resumed: monitoring ${Object.keys(this.targets).length} coins`, "success");
        }

        this._saveActiveState();
        this._ensureMonitoring();
      }
    }

    // Ensure default assignments if none exist
    this._ensureDefaultAssignments();

    this._notifyChange();
  }

  // ── Tier Helpers ────────────────────────────────────────

  getCoinsForTier(tierNum: number): string[] {
    return Object.entries(this.tierAssignments)
      .filter(([, t]) => t === tierNum)
      .map(([code]) => code);
  }

  getTier(code: string): number {
    return this.tierAssignments[code] || 0;
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
    if (Object.keys(this.tierAssignments).length > 0) return;
    // Assign all known crypto assets from ASSET_CONFIG
    for (const code of Object.keys(ASSET_CONFIG)) {
      if (code === "AUD" || code === "USDC" || code === "USD") continue;
      this.tierAssignments[code] = DEFAULT_T1.includes(code) ? 1 : 2;
    }
    this._saveTierAssignments();
  }

  // ── Coin Assignment ─────────────────────────────────────

  assignCoin(code: string, tierNum: number) {
    const oldTier = this.tierAssignments[code];
    this.tierAssignments[code] = tierNum;
    this._saveTierAssignments();

    // If old tier was active, remove from targets
    if (oldTier && this.tierActive[oldTier] && this.targets[code]) {
      delete this.targets[code];
    }

    // If new tier is active, add with fresh targets
    if (this.tierActive[tierNum] && !this._isOnCooldown(code)) {
      const price = this._cachedPrices[code];
      if (price) {
        const dev = this.getTierSettings(tierNum).deviation;
        this.targets[code] = {
          buy: price * (1 - dev / 100),
          sell: price * (1 + dev / 100),
        };
      }
    }

    this._saveActiveState();
    this._log(`${code} → Tier ${tierNum} (${TIER_CONFIG[tierNum].name})`, "info");
    this._notifyChange();
  }

  unassignCoin(code: string) {
    const tier = this.tierAssignments[code];
    delete this.tierAssignments[code];
    delete this.targets[code];
    this._saveTierAssignments();
    this._saveActiveState();
    this._log(`${code} removed from Tier ${tier}`, "info");
    this._notifyChange();
  }

  // ── Tier Settings Update ────────────────────────────────

  /** Update tier settings in memory. Call saveTierSettingsNow() to persist to DB. */
  updateTierSettings(tierNum: number, settings: Partial<TierSettings>) {
    const key = `tier${tierNum}`;
    const current = this.tierSettings[key];
    if (!current) return;

    const oldDeviation = current.deviation;
    Object.assign(current, settings);

    // If deviation changed and tier is active, recalculate all targets for this tier
    if (settings.deviation !== undefined && settings.deviation !== oldDeviation && this.tierActive[tierNum]) {
      const tierCoins = this.getCoinsForTier(tierNum);
      for (const code of tierCoins) {
        const price = this._cachedPrices[code];
        if (price && price > 0) {
          this.targets[code] = {
            buy: price * (1 - settings.deviation / 100),
            sell: price * (1 + settings.deviation / 100),
          };
        }
      }
      this._log(`Tier ${tierNum} deviation changed to ${settings.deviation}% — targets recalculated`, "info");
    }

    this._notifyChange();
  }

  /** Explicitly save all tier settings to DB. Returns true on success. */
  async saveTierSettingsNow(): Promise<boolean> {
    // Cancel any pending debounced save
    if (this._saveTierSettingsTimer) {
      clearTimeout(this._saveTierSettingsTimer);
      this._saveTierSettingsTimer = null;
    }
    await this._saveTierSettings();
    await this._saveActiveState();
    return !this._pendingTierSave;
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
        this._log(`Tier ${tierNum} settings saved to DB (dev=${settings.deviation}%, alloc=${settings.allocation}%, cd=${settings.cooldownHours}h)`, "info");
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

  // ── Start / Stop ────────────────────────────────────────

  async startTier(tierNum: number): Promise<{ success: boolean; error?: string }> {
    // Always save current tier settings to DB before starting
    // (catches case where user adjusted sliders but forgot to click Save)
    await this._saveTierSettings();

    // Refresh data first
    await this._refreshData();

    // Check USDC balance (fetched separately since fetchPortfolio filters it out)
    const usdcBalance = this._cachedUsdcBalance;

    if (usdcBalance < MIN_USDC_RESERVE + 10) {
      const msg = `Need $${MIN_USDC_RESERVE + 10}+ USDC (keeping $${MIN_USDC_RESERVE} reserve)`;
      this._log(msg, "error");
      return { success: false, error: msg };
    }

    // Get coins assigned to this tier
    const tierCoins = this.getCoinsForTier(tierNum);
    if (tierCoins.length === 0) {
      const msg = `No coins assigned to Tier ${tierNum}`;
      this._log(msg, "error");
      return { success: false, error: msg };
    }

    // Set targets for non-cooldown coins
    let added = 0;
    for (const code of tierCoins) {
      if (!this._isOnCooldown(code)) {
        const price = this._cachedPrices[code];
        if (price && price > 0) {
          const dev = this.getTierSettings(tierNum).deviation;
          this.targets[code] = {
            buy: price * (1 - dev / 100),
            sell: price * (1 + dev / 100),
          };
          added++;
        }
      }
    }

    if (added === 0) {
      const msg = `All Tier ${tierNum} coins on cooldown or no price data`;
      this._log(msg, "error");
      return { success: false, error: msg };
    }

    this.tierActive[tierNum] = true;
    this._isOwner = true;
    this._checkCount = 0;

    const cfg = TIER_CONFIG[tierNum];
    this._log(`Tier ${tierNum} (${cfg.name}) started: monitoring ${added} coin(s)`, "success");

    for (const code of tierCoins) {
      const tgt = this.targets[code];
      if (tgt) {
        const s = this.getTierSettings(tierNum);
        this._log(
          `  ${code} (T${tierNum}): buy < $${tgt.buy.toFixed(2)}, sell > $${tgt.sell.toFixed(2)} (±${s.deviation}%, ${s.allocation}% alloc)`,
          "info",
        );
      }
    }

    // Save all state so non-admin users can see monitoring data
    this._saveActiveState();
    this._saveTierSettings();
    this._saveTierAssignments();
    this._saveCooldowns();
    this._ensureMonitoring();
    this._notifyChange();
    return { success: true };
  }

  stopTier(tierNum: number) {
    this.tierActive[tierNum] = false;

    // Remove targets for this tier's coins
    for (const code of this.getCoinsForTier(tierNum)) {
      delete this.targets[code];
    }

    this._log(`Tier ${tierNum} (${TIER_CONFIG[tierNum].name}) stopped`, "info");

    // Stop monitoring if no tiers active
    if (!this.isActive) {
      this._isOwner = false;
      this._stopMonitoring();
    }

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
      if (this.cooldowns[code]) {
        delete this.cooldowns[code];
        cleared++;
      }
    }

    if (cleared === 0) {
      this._log(`No cooldowns to override in Tier ${tierNum}`, "info");
      return;
    }

    // Add coins that weren't in targets
    for (const code of tierCoins) {
      if (!this.targets[code]) {
        const price = this._cachedPrices[code];
        if (price && price > 0) {
          const dev = this.getTierSettings(tierNum).deviation;
          this.targets[code] = {
            buy: price * (1 - dev / 100),
            sell: price * (1 + dev / 100),
          };
          this._log(
            `  Added ${code}: buy < $${this.targets[code].buy.toFixed(2)}, sell > $${this.targets[code].sell.toFixed(2)}`,
            "info",
          );
        }
      }
    }

    this._log(`Tier ${tierNum} cooldowns overridden — ${cleared} cleared`, "success");

    // Save cooldowns to server
    this._saveCooldowns();
    this._saveActiveState();
    this._notifyChange();

    // Trigger immediate check if tier is active
    if (this.tierActive[tierNum]) {
      this._checkPrices();
    }
  }

  // ── Monitoring Control ──────────────────────────────────

  private _ensureMonitoring() {
    if (!this._monitorInterval) {
      this._monitorInterval = setInterval(() => this._checkPrices(), CHECK_INTERVAL_MS);
      // Immediate first check
      this._checkPrices();
    }
  }

  private _stopMonitoring() {
    if (this._monitorInterval) {
      clearInterval(this._monitorInterval);
      this._monitorInterval = null;
    }
  }

  // ── Price Checking Loop (the core!) ─────────────────────

  private async _checkPrices() {
    if (!this.isActive || !this._isOwner) {
      this._stopMonitoring();
      return;
    }

    // Prevent concurrent execution (e.g. interval + trigger-crossing check)
    if (this._priceCheckRunning) return;
    this._priceCheckRunning = true;
    try {
      await this._checkPricesInner();
    } finally {
      this._priceCheckRunning = false;
    }
  }

  private async _checkPricesInner() {

    // Retry any pending tier settings save that previously failed
    if (this._pendingTierSave) {
      this.retryPendingSave();
    }

    this._checkCount++;

    // Warmup: on first check after resume, refresh data but skip trading.
    // This lets fresh prices load so we don't trade on stale targets.
    if (this._warmup) {
      this._warmup = false;
      this._log("Warmup: refreshing prices before monitoring begins...", "info");
      await this._refreshData();
      this._saveActiveState();
      this._notifyChange();
      return;
    }

    // Refresh heartbeat
    this._saveActiveState();

    // Every 3rd check (~9 min): verify device ownership
    if (this._checkCount % 3 === 0) {
      const stillOwner = await this._verifyOwnership();
      if (!stillOwner) return;
    }

    // Always refresh data before checking prices — stale USDC balance
    // was causing buys to be skipped ("would break $100 reserve")
    this._log("Refreshing prices...", "info");
    await this._refreshData();

    // Regenerate targets for assigned coins that lost them (e.g. after
    // cooldown expired but target was previously deleted from DB).
    for (const [code, tier] of Object.entries(this.tierAssignments)) {
      if (!this.tierActive[tier]) continue;
      if (this._isOnCooldown(code)) continue;
      if (this.targets[code]) continue; // already has target
      const price = this._cachedPrices[code];
      if (price && price > 0) {
        const dev = this.getTierSettings(tier).deviation;
        this.targets[code] = {
          buy: price * (1 - dev / 100),
          sell: price * (1 + dev / 100),
        };
        this._log(`${code}: regenerated targets — buy $${this.targets[code].buy.toFixed(2)}, sell $${this.targets[code].sell.toFixed(2)}`, "info");
      }
    }

    this._log(
      `Check #${this._checkCount}: USDC $${this._cachedUsdcBalance.toFixed(2)}, monitoring ${Object.keys(this.targets).length} coins`,
      "info",
    );

    let tradeExecuted = false;

    for (const code of Object.keys(this.targets)) {
      if (this._isOnCooldown(code)) {
        this._setDiagnostic(code, `Cooldown: ${this.getCooldownRemaining(code)}`, "info");
        continue;
      }

      const tier = this.getTier(code);
      if (!this.tierActive[tier]) continue;

      const settings = this.getSettings(code);
      const currentPrice = this._cachedPrices[code];
      const tgt = this.targets[code];

      if (!tgt || !currentPrice) {
        const reason = !currentPrice ? "No price data" : "No target set";
        this._setDiagnostic(code, reason, "error");
        this._log(`${code}: no target or price data (price=${currentPrice}, target=${!!tgt})`, "error");
        continue;
      }

      const pctToBuy = ((currentPrice - tgt.buy) / currentPrice * 100).toFixed(2);
      const pctToSell = ((tgt.sell - currentPrice) / currentPrice * 100).toFixed(2);

      // BUY: price dropped below buy target
      if (currentPrice <= tgt.buy) {
        this._setDiagnostic(code, "Executing BUY...", "info");
        this._log(
          `${code} hit buy target $${tgt.buy.toFixed(2)} (price: $${currentPrice.toFixed(2)}, ${pctToBuy}% below) — EXECUTING BUY`,
          "success",
        );
        await this._executeBuy(code, currentPrice, settings);
        tradeExecuted = true;
      }
      // SELL: price rose above sell target
      else if (currentPrice >= tgt.sell) {
        this._setDiagnostic(code, "Executing SELL...", "info");
        this._log(
          `${code} hit sell target $${tgt.sell.toFixed(2)} (price: $${currentPrice.toFixed(2)}, ${pctToSell}% above) — EXECUTING SELL`,
          "success",
        );
        await this._executeSell(code, currentPrice, settings);
        tradeExecuted = true;
      }
      else {
        this._setDiagnostic(code, `${pctToSell}% to sell, ${pctToBuy}% to buy`, "info");
        this._log(
          `${code}: $${currentPrice.toFixed(2)} — ${pctToBuy}% to buy ($${tgt.buy.toFixed(2)}), ${pctToSell}% to sell ($${tgt.sell.toFixed(2)})`,
          "info",
        );
      }
    }

    // Refresh after trades
    if (tradeExecuted) {
      await this._refreshData();
      this._saveActiveState();
    }

    this._notifyChange();

    // Log cooldown status
    const remaining = Object.keys(this.targets).filter((c) => !this._isOnCooldown(c));
    const onCooldown = Object.keys(this.targets).length - remaining.length;
    if (remaining.length === 0 && onCooldown > 0) {
      this._log(`All ${onCooldown} coins on cooldown — waiting...`, "info");
    }
  }

  // ── Trade Execution ─────────────────────────────────────

  private async _executeBuy(code: string, currentPrice: number, settings: TierSettings) {
    const usdcBalance = this._cachedUsdcBalance;

    const tradeAmount = Math.max((settings.allocation / 100) * usdcBalance, MIN_ORDER_USDC);
    if (usdcBalance - tradeAmount < MIN_USDC_RESERVE) {
      this._setDiagnostic(code, `BUY blocked: USDC $${usdcBalance.toFixed(0)} too low (need $${MIN_USDC_RESERVE} reserve)`, "error");
      this._log(`Skipping ${code} buy — USDC $${usdcBalance.toFixed(2)}, trade $${tradeAmount.toFixed(2)}, would break $${MIN_USDC_RESERVE} reserve (alloc ${settings.allocation}%)`, "error");
      return;
    }

    const quantity = parseFloat((tradeAmount / currentPrice).toFixed(8));
    this._log(
      `AUTO BUY: ${quantity} ${code} at $${currentPrice.toFixed(2)} ($${tradeAmount.toFixed(2)} USDC)`,
      "success",
    );

    try {
      const result = await placeTrade({
        assetCode: code,
        side: "buy",
        amount: tradeAmount,
        orderType: "market",
      });

      if (result.success) {
        this._setDiagnostic(code, "BUY executed!", "info");
        this._log(`${code} buy executed!`, "success");
        this._addTradeLog(code, "BUY", quantity, currentPrice, tradeAmount);
        this._setCooldown(code);
        this._recordTradeInDB(code, "buy", quantity, currentPrice);
        this._recordRecentTrade(code, "BUY", currentPrice, tradeAmount);

        // Reset BOTH targets from trade price so they stay within deviation %
        const oldBuy = this.targets[code].buy;
        const oldSell = this.targets[code].sell;
        this.targets[code].buy = currentPrice * (1 - settings.deviation / 100);
        this.targets[code].sell = currentPrice * (1 + settings.deviation / 100);
        this._log(
          `${code} targets reset: buy $${oldBuy.toFixed(2)} → $${this.targets[code].buy.toFixed(2)}, sell $${oldSell.toFixed(2)} → $${this.targets[code].sell.toFixed(2)}`,
          "info",
        );
      } else {
        this._setDiagnostic(code, `BUY failed: ${result.error}`, "error");
        this._log(`${code} buy failed: ${result.error}`, "error");
      }
    } catch (error: any) {
      this._setDiagnostic(code, `BUY error: ${error.message}`, "error");
      this._log(`${code} buy error: ${error.message}`, "error");
    }
  }

  private async _executeSell(code: string, currentPrice: number, settings: TierSettings) {
    const asset = this._cachedAssets.find((a) => a.code === code);
    const assetBalance = asset?.balance ?? 0;

    const sellPercent = settings.allocation * SELL_RATIO;
    let quantity = parseFloat(((sellPercent / 100) * assetBalance).toFixed(8));

    if (quantity <= 0) {
      this._setDiagnostic(code, `SELL blocked: no balance on Swyftx (${code} = 0)`, "error");
      this._log(`Skipping ${code} sell — insufficient balance`, "error");
      return;
    }

    let sellValue = quantity * currentPrice;

    // If below minimum order size, bump up to meet it (matching server-side cron logic)
    if (sellValue < MIN_ORDER_USDC) {
      const minQty = MIN_ORDER_USDC / currentPrice;
      if (minQty <= assetBalance) {
        // Sell enough to meet minimum
        quantity = parseFloat(minQty.toFixed(8));
        sellValue = quantity * currentPrice;
        this._log(`${code}: bumped sell qty to ${quantity} to meet $${MIN_ORDER_USDC} minimum`, "info");
      } else {
        // Try selling entire balance
        quantity = parseFloat(assetBalance.toFixed(8));
        sellValue = quantity * currentPrice;
        if (sellValue < MIN_ORDER_USDC) {
          this._setDiagnostic(code, `SELL blocked: total holding ($${sellValue.toFixed(2)}) below $${MIN_ORDER_USDC} minimum`, "error");
          this._log(`Skipping ${code} sell — total holding $${sellValue.toFixed(2)} below $${MIN_ORDER_USDC} minimum`, "error");
          return;
        }
      }
    }

    this._log(
      `AUTO SELL: ${quantity} ${code} at $${currentPrice.toFixed(2)} (${sellPercent.toFixed(1)}% of holdings, $${sellValue.toFixed(2)} USDC)`,
      "success",
    );

    try {
      const result = await placeTrade({
        assetCode: code,
        side: "sell",
        amount: sellValue,
        orderType: "market",
      });

      if (result.success) {
        this._setDiagnostic(code, "SELL executed!", "info");
        this._log(`${code} sell executed!`, "success");
        this._addTradeLog(code, "SELL", quantity, currentPrice, sellValue);
        this._setCooldown(code);
        this._recordTradeInDB(code, "sell", quantity, currentPrice);
        this._recordRecentTrade(code, "SELL", currentPrice, sellValue);

        // Reset BOTH targets from trade price so they stay within deviation %
        const oldBuy = this.targets[code].buy;
        const oldSell = this.targets[code].sell;
        this.targets[code].buy = currentPrice * (1 - settings.deviation / 100);
        this.targets[code].sell = currentPrice * (1 + settings.deviation / 100);
        this._log(
          `${code} targets reset: buy $${oldBuy.toFixed(2)} → $${this.targets[code].buy.toFixed(2)}, sell $${oldSell.toFixed(2)} → $${this.targets[code].sell.toFixed(2)}`,
          "info",
        );
      } else {
        this._setDiagnostic(code, `SELL failed: ${result.error}`, "error");
        this._log(`${code} sell failed: ${result.error}`, "error");
      }
    } catch (error: any) {
      this._setDiagnostic(code, `SELL error: ${error.message}`, "error");
      this._log(`${code} sell error: ${error.message}`, "error");
    }
  }

  // ── Device Ownership ────────────────────────────────────

  private async _verifyOwnership(): Promise<boolean> {
    try {
      const state = await fetchTraderState();
      if (!state || !state._rawAutoActive) return true;

      const autoActive = state._rawAutoActive;

      // Another device took over
      if (autoActive.botDeviceId && autoActive.botDeviceId !== this._deviceId) {
        this._log("Another device took over — stopping local monitoring", "info");
        this._isOwner = false;
        this._stopMonitoring();
        this._notifyChange();
        return false;
      }

      // Stopped remotely
      if (autoActive.isActive === false) {
        this._log("Auto-trading stopped from another device", "info");
        this.tierActive = { 1: false, 2: false, 3: false };
        this._isOwner = false;
        this._stopMonitoring();
        this._notifyChange();
        return false;
      }

      // Sync tier active state from server
      if (autoActive.tierActive) {
        for (let t = 1; t <= 3; t++) {
          this.tierActive[t] = !!(autoActive.tierActive[t] ?? autoActive.tierActive[String(t)]);
        }
      }

      return true;
    } catch {
      return true; // Network error, keep running
    }
  }

  // ── Ownership Retry ────────────────────────────────────

  private _scheduleOwnershipRetry(delayMs: number) {
    this._clearOwnershipRetry();
    this._log(`Will retry ownership in ${Math.round(delayMs / 1000)}s`, "info");
    this._ownershipRetryTimer = setTimeout(async () => {
      this._ownershipRetryTimer = null;
      if (this._isOwner) return; // Already reclaimed
      if (!this.isActive) return; // No tiers active

      try {
        const state = await fetchTraderState();
        if (!state || !state._rawAutoActive) {
          // No active state on server — safe to take ownership
          this._isOwner = true;
        } else {
          const autoActive = state._rawAutoActive;
          const otherDevice = autoActive.botDeviceId && autoActive.botDeviceId !== this._deviceId;
          const freshHeartbeat = autoActive.botHeartbeat && (Date.now() - autoActive.botHeartbeat < HEARTBEAT_STALE_MS);

          if (otherDevice && freshHeartbeat) {
            // Still active on another device — retry again
            const staleness = HEARTBEAT_STALE_MS - (Date.now() - (autoActive.botHeartbeat || 0));
            const retryDelay = Math.max(staleness + 5000, 10_000);
            this._scheduleOwnershipRetry(retryDelay);
            return;
          }

          // Heartbeat is stale or same device — reclaim ownership
          this._isOwner = true;
        }

        if (this._isOwner) {
          this._warmup = true;
          this._log("Ownership reclaimed — resuming auto-trading", "success");
          this._saveActiveState();
          this._ensureMonitoring();
          this._notifyChange();
        }
      } catch {
        // Network error — retry in 30s
        this._scheduleOwnershipRetry(30_000);
      }
    }, delayMs);
  }

  private _clearOwnershipRetry() {
    if (this._ownershipRetryTimer) {
      clearTimeout(this._ownershipRetryTimer);
      this._ownershipRetryTimer = null;
    }
  }

  // ── Data Refresh ────────────────────────────────────────

  private async _refreshData() {
    try {
      // Bust the cache for portfolio, prices, and cash balance so the
      // trading loop always gets a live fetch — stale cached { usdc: 0 }
      // from a failed Swyftx call was silently blocking every buy.
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

      const [assets, apiPrices, cash] = await Promise.all([
        fetchPortfolio(),
        fetchPrices(),
        fetchCashBalances(),
      ]);
      this._cachedAssets = assets;
      // API prices as base, then overlay real-time WebSocket prices.
      // Also capture any WS updates that arrived during the API call.
      const freshWs: Record<string, number> = {};
      for (const code of Object.keys(CODE_TO_BINANCE)) {
        if (this._cachedPrices[code]) {
          freshWs[code] = this._cachedPrices[code];
        }
      }
      this._cachedPrices = { ...apiPrices, ...wsPrices, ...freshWs };
      this._cachedUsdcBalance = cash.usdc;
    } catch (error: any) {
      this._log(`Data refresh error: ${error.message}`, "error");
    }
  }

  /** Update cached prices externally (from parent component's price ticker).
   *  If any price crosses a buy/sell trigger, schedule an immediate check
   *  so trades execute within seconds instead of waiting for the 3-min interval.
   */
  updatePrices(prices: Record<string, number>) {
    this._cachedPrices = { ...this._cachedPrices, ...prices };

    // Set diagnostics for non-owner mode so UI shows why trades aren't executing
    if (this.isActive && !this._isOwner) {
      for (const [code, price] of Object.entries(prices)) {
        const tgt = this.targets[code];
        if (!tgt || !price || this._isOnCooldown(code)) continue;
        if (price >= tgt.sell) {
          this._setDiagnostic(code, "Not owner — cron-managed", "warn");
        } else if (price <= tgt.buy) {
          this._setDiagnostic(code, "Not owner — cron-managed", "warn");
        }
      }
    }

    if (!this.isActive || !this._isOwner || this._warmup) return;

    // Check if any updated price crossed a trigger
    let triggered = false;
    for (const [code, price] of Object.entries(prices)) {
      const tgt = this.targets[code];
      if (!tgt || !price || this._isOnCooldown(code)) continue;
      if (price <= tgt.buy || price >= tgt.sell) {
        triggered = true;
        break;
      }
    }

    if (triggered && !this._triggerCheckTimer) {
      // Debounce 2s to batch rapid WebSocket updates, then execute
      this._triggerCheckTimer = setTimeout(() => {
        this._triggerCheckTimer = null;
        this._checkPrices();
      }, 2000);
    }
  }

  updateAssets(assets: PortfolioAsset[]) {
    this._cachedAssets = assets;
  }

  // ── Cooldown Management ─────────────────────────────────

  private _setCooldown(coin: string) {
    // Look up the tier for this coin to get per-tier cooldown hours
    const tierNum = this.tierAssignments[coin] || 1;
    const tierKey = `tier${tierNum}`;
    const hours = this.tierSettings[tierKey]?.cooldownHours ?? DEFAULT_COOLDOWN_HOURS;
    const expiresAt = Date.now() + hours * 60 * 60 * 1000;
    this.cooldowns[coin] = expiresAt;
    this._saveCooldowns();
    this._log(`${coin} on cooldown for ${hours}h`, "info");
  }

  _isOnCooldown(coin: string): boolean {
    const cooldown = this.cooldowns[coin];
    if (!cooldown) return false;
    if (Date.now() >= cooldown) {
      delete this.cooldowns[coin];
      return false;
    }
    return true;
  }

  getCooldownRemaining(coin: string): string {
    const cooldown = this.cooldowns[coin];
    if (!cooldown) return "0h";
    const remaining = cooldown - Date.now();
    if (remaining <= 0) return "0h";
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  }

  // ── Trade Log ───────────────────────────────────────────

  private _addTradeLog(coin: string, side: "BUY" | "SELL", quantity: number, price: number, amount: number) {
    const entry: TradeLogEntry = {
      time: new Date().toISOString(),
      coin,
      side,
      quantity,
      price,
      amount,
    };
    this.tradeLog.unshift(entry);
    if (this.tradeLog.length > 50) this.tradeLog.pop();
    this._saveTradeLog();
  }

  // ── Recent Trade Tracking (for UI celebrations) ────────

  private _recordRecentTrade(coin: string, side: "BUY" | "SELL", price: number, amount: number) {
    const tradeTime = Date.now();
    this.recentTrades[coin] = { side, price, amount, time: tradeTime };
    this._notifyChange();
    // Auto-clear after 60 seconds so the celebration badge fades
    setTimeout(() => {
      // Only delete if it's still the same trade (not a newer one)
      if (this.recentTrades[coin]?.time === tradeTime) {
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

  // ── Record to MongoDB ───────────────────────────────────

  private async _recordTradeInDB(coin: string, tradeType: "buy" | "sell", amount: number, price: number) {
    if (!this._adminWallet) return;
    try {
      const auth = await getAdminAuth(this._adminWallet);
      if (!auth) return;

      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auth,
          coin,
          type: tradeType,
          amount,
          price,
        }),
      });
      if (res.ok) {
        this._log(`Trade saved to DB: ${tradeType} ${amount.toFixed(6)} ${coin} @ $${price.toFixed(2)}`, "success");
      }
    } catch {
      // Non-critical
    }
  }

  // ── Persistence (Server State) ──────────────────────────

  private async _saveActiveState() {
    if (!this._adminWallet) return;

    const autoActive = {
      isActive: this.isActive,
      tierActive: this.tierActive,
      targets: this.targets,
      botDeviceId: this._deviceId,
      botHeartbeat: Date.now(),
    };

    try {
      await saveTraderState(this._adminWallet, { autoActive });
    } catch {
      // Non-critical
    }
  }

  private async _saveTierSettings() {
    if (!this._adminWallet) return;

    const autoTiers: Record<string, any> = {};
    for (let t = 1; t <= 3; t++) {
      autoTiers[`tier${t}`] = {
        ...this.tierSettings[`tier${t}`],
        name: TIER_CONFIG[t].name,
        active: this.tierActive[t],
      };
    }

    try {
      const result = await saveTraderState(this._adminWallet, { autoTiers });
      if (result.success) {
        this._pendingTierSave = false;
      } else {
        // Don't retry on signature denial — user explicitly rejected or wallet unavailable
        const isAuthError = result.error?.includes("signature") || result.error?.includes("Admin");
        this._pendingTierSave = !isAuthError;
        this._log(`Tier settings save failed: ${result.error || "unknown"} — cached locally`, "error");
      }
    } catch (err: any) {
      this._pendingTierSave = true;
      this._log(`Tier settings save error: ${err.message || "unknown"} — cached locally`, "error");
    }
  }

  /** Flush any pending debounced tier settings save immediately (called on page unload) */
  flushPendingSave(): void {
    if (this._saveTierSettingsTimer) {
      clearTimeout(this._saveTierSettingsTimer);
      this._saveTierSettingsTimer = null;
      // Fire and forget — beforeunload can't wait for async
      this._saveTierSettings();
      this._saveActiveState();
    }
  }

  /** Retry any pending tier settings save (called from monitoring loop) */
  async retryPendingSave(): Promise<void> {
    if (!this._pendingTierSave || !this._adminWallet) return;
    this._log("Retrying pending tier settings save...", "info");
    await this._saveTierSettings();
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

  private async _saveTradeLog() {
    if (!this._adminWallet) return;

    const log = this.tradeLog.map((e) => ({
      coin: e.coin,
      side: e.side.toLowerCase(),
      qty: e.quantity,
      price: e.price,
      timestamp: e.time,
    }));

    try {
      await saveTraderState(this._adminWallet, { autoTradeLog: log });
    } catch {
      // Non-critical
    }
  }

  // ── Trade Amount Estimates ──────────────────────────────

  /** Get cached USDC balance (from last refresh) */
  getUsdcBalance(): number {
    return this._cachedUsdcBalance;
  }

  /** Get estimated BUY order amount in USDC for a coin */
  getEstimatedBuyAmount(code: string): number {
    const settings = this.getSettings(code);
    const usdc = this._cachedUsdcBalance;
    const amount = Math.max((settings.allocation / 100) * usdc, MIN_ORDER_USDC);
    // Respect reserve
    if (usdc - amount < MIN_USDC_RESERVE) {
      return Math.max(0, usdc - MIN_USDC_RESERVE);
    }
    return amount;
  }

  /** Get estimated SELL order value in USD for a coin */
  getEstimatedSellValue(code: string): number {
    const settings = this.getSettings(code);
    const asset = this._cachedAssets.find((a) => a.code === code);
    const balance = asset?.balance ?? 0;
    const price = this._cachedPrices[code] || 0;
    const sellPercent = settings.allocation * SELL_RATIO;
    let quantity = (sellPercent / 100) * balance;
    let value = quantity * price;
    // Match execution logic: bump to minimum if needed
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

  private _setDiagnostic(code: string, reason: string, level: CoinDiagnostic["level"] = "info") {
    this.coinDiagnostics[code] = { reason, level, timestamp: Date.now() };
  }

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
      isOwner: this._isOwner,
      deviceId: this._deviceId,
      coinDiagnostics: { ...this.coinDiagnostics },
      cronDiagnostics: { ...this.cronDiagnostics },
    };
  }

  // ── Cleanup ─────────────────────────────────────────────

  destroy() {
    this._stopMonitoring();
    this._clearOwnershipRetry();
    if (this._saveTierSettingsTimer) {
      clearTimeout(this._saveTierSettingsTimer);
      this._saveTierSettingsTimer = null;
    }
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
