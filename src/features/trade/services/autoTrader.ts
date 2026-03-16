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
}

type LogFn = (message: string, level?: "info" | "success" | "error") => void;

// ── Constants ────────────────────────────────────────────────

export const TIER_CONFIG: Record<number, TierConfig> = {
  1: { name: "Blue Chips", color: "#3b82f6", devMin: 1, devMax: 15, allocMin: 1, allocMax: 25 },
  2: { name: "Alts", color: "#eab308", devMin: 2, devMax: 20, allocMin: 1, allocMax: 20 },
  3: { name: "Speculative", color: "#f97316", devMin: 3, devMax: 30, allocMin: 1, allocMax: 15 },
};

const DEFAULT_T1 = ["BTC", "ETH", "SOL", "BNB", "XRP"];
const COOLDOWN_HOURS = 24;
const MIN_USDC_RESERVE = 100;
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
    tier1: { deviation: 2, allocation: 10 },
    tier2: { deviation: 5, allocation: 5 },
    tier3: { deviation: 8, allocation: 3 },
  };
  tierAssignments: Record<string, number> = {};
  tradeLog: TradeLogEntry[] = [];
  recentTrades: Record<string, RecentTrade> = {};

  // Device ownership — persist deviceId so page refreshes keep the same identity
  private _deviceId = (() => {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("budju_bot_device_id");
      if (stored) return stored;
      const id = Math.random().toString(36).substring(2, 10);
      localStorage.setItem("budju_bot_device_id", id);
      return id;
    }
    return Math.random().toString(36).substring(2, 10);
  })();
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

    // Load tier settings — DB values take priority, localStorage is fallback
    const tierAssets = state.autoTierAssets || {};
    const localSettings = this._loadSettingsFromLocalStorage();

    for (const [key, cfg] of Object.entries(tierAssets)) {
      const tierKey = key.startsWith("tier") ? key : `tier${key}`;
      if (this.tierSettings[tierKey]) {
        this.tierSettings[tierKey] = {
          deviation: Number((cfg as any).deviation) || this.tierSettings[tierKey].deviation,
          allocation: Number((cfg as any).allocation) || this.tierSettings[tierKey].allocation,
        };
      }
    }

    // If localStorage has different values, it means a previous DB save failed.
    // Use localStorage values (more recent user intent) and flag for retry.
    if (localSettings) {
      let mismatch = false;
      for (const [tierKey, localTier] of Object.entries(localSettings)) {
        const dbTier = this.tierSettings[tierKey];
        if (dbTier && (dbTier.deviation !== localTier.deviation || dbTier.allocation !== localTier.allocation)) {
          mismatch = true;
          this.tierSettings[tierKey] = { ...localTier };
        }
      }
      if (mismatch) {
        this._pendingTierSave = true;
        this._log("Tier settings restored from local cache — will sync to server", "info");
      }
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

      // Remove coins on cooldown from targets
      for (const code of Object.keys(this.targets)) {
        if (this._isOnCooldown(code)) {
          delete this.targets[code];
        }
      }

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

  updateTierSettings(tierNum: number, settings: Partial<TierSettings>) {
    const key = `tier${tierNum}`;
    this.tierSettings[key] = { ...this.tierSettings[key], ...settings };

    // Save to localStorage immediately (synchronous, can't fail)
    this._saveSettingsToLocalStorage();

    // Debounce server save — slider onChange fires on every drag pixel,
    // flooding the API with concurrent POSTs that race/fail silently.
    // In-memory update is immediate so the UI stays responsive.
    if (this._saveTierSettingsTimer) clearTimeout(this._saveTierSettingsTimer);
    this._saveTierSettingsTimer = setTimeout(() => {
      this._saveTierSettingsTimer = null;
      this._saveTierSettings();
    }, 500);

    this._notifyChange();
  }

  // ── Start / Stop ────────────────────────────────────────

  async startTier(tierNum: number): Promise<{ success: boolean; error?: string }> {
    // Flush any pending debounced tier settings save before starting
    if (this._saveTierSettingsTimer) {
      clearTimeout(this._saveTierSettingsTimer);
      this._saveTierSettingsTimer = null;
      await this._saveTierSettings();
    }

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

    this._log(
      `Check #${this._checkCount}: USDC $${this._cachedUsdcBalance.toFixed(2)}, monitoring ${Object.keys(this.targets).length} coins`,
      "info",
    );

    let tradeExecuted = false;

    for (const code of Object.keys(this.targets)) {
      if (this._isOnCooldown(code)) continue;

      const tier = this.getTier(code);
      if (!this.tierActive[tier]) continue;

      const settings = this.getSettings(code);
      const currentPrice = this._cachedPrices[code];
      const tgt = this.targets[code];

      if (!tgt || !currentPrice) {
        this._log(`${code}: no target or price data (price=${currentPrice}, target=${!!tgt})`, "error");
        continue;
      }

      const pctToBuy = ((currentPrice - tgt.buy) / currentPrice * 100).toFixed(2);
      const pctToSell = ((tgt.sell - currentPrice) / currentPrice * 100).toFixed(2);

      // BUY: price dropped below buy target
      if (currentPrice <= tgt.buy) {
        this._log(
          `${code} hit buy target $${tgt.buy.toFixed(2)} (price: $${currentPrice.toFixed(2)}, ${pctToBuy}% below) — EXECUTING BUY`,
          "success",
        );
        await this._executeBuy(code, currentPrice, settings);
        tradeExecuted = true;
      }
      // SELL: price rose above sell target
      else if (currentPrice >= tgt.sell) {
        this._log(
          `${code} hit sell target $${tgt.sell.toFixed(2)} (price: $${currentPrice.toFixed(2)}, ${pctToSell}% above) — EXECUTING SELL`,
          "success",
        );
        await this._executeSell(code, currentPrice, settings);
        tradeExecuted = true;
      }
      else {
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

    const tradeAmount = (settings.allocation / 100) * usdcBalance;
    if (usdcBalance - tradeAmount < MIN_USDC_RESERVE) {
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
        this._log(`${code} buy executed!`, "success");
        this._addTradeLog(code, "BUY", quantity, currentPrice, tradeAmount);
        this._setCooldown(code);
        this._recordTradeInDB(code, "buy", quantity, currentPrice);
        this._recordRecentTrade(code, "BUY", currentPrice, tradeAmount);

        // Move buy target down, keep sell target
        const oldBuy = this.targets[code].buy;
        this.targets[code].buy = currentPrice * (1 - settings.deviation / 100);
        this._log(
          `${code} buy target: $${oldBuy.toFixed(2)} → $${this.targets[code].buy.toFixed(2)} (sell stays $${this.targets[code].sell.toFixed(2)})`,
          "info",
        );
      } else {
        this._log(`${code} buy failed: ${result.error}`, "error");
      }
    } catch (error: any) {
      this._log(`${code} buy error: ${error.message}`, "error");
    }
  }

  private async _executeSell(code: string, currentPrice: number, settings: TierSettings) {
    const asset = this._cachedAssets.find((a) => a.code === code);
    const assetBalance = asset?.balance ?? 0;

    const sellPercent = settings.allocation * SELL_RATIO;
    const quantity = parseFloat(((sellPercent / 100) * assetBalance).toFixed(8));

    if (quantity <= 0) {
      this._log(`Skipping ${code} sell — insufficient balance`, "error");
      return;
    }

    const sellValue = quantity * currentPrice;
    this._log(
      `AUTO SELL: ${quantity} ${code} at $${currentPrice.toFixed(2)} (${sellPercent.toFixed(1)}% of holdings)`,
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
        this._log(`${code} sell executed!`, "success");
        this._addTradeLog(code, "SELL", quantity, currentPrice, sellValue);
        this._setCooldown(code);
        this._recordTradeInDB(code, "sell", quantity, currentPrice);
        this._recordRecentTrade(code, "SELL", currentPrice, sellValue);

        // Move sell target up, keep buy target
        const oldSell = this.targets[code].sell;
        this.targets[code].sell = currentPrice * (1 + settings.deviation / 100);
        this._log(
          `${code} sell target: $${oldSell.toFixed(2)} → $${this.targets[code].sell.toFixed(2)} (buy stays $${this.targets[code].buy.toFixed(2)})`,
          "info",
        );
      } else {
        this._log(`${code} sell failed: ${result.error}`, "error");
      }
    } catch (error: any) {
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

      const [assets, prices, cash] = await Promise.all([
        fetchPortfolio(),
        fetchPrices(),
        fetchCashBalances(),
      ]);
      this._cachedAssets = assets;
      this._cachedPrices = prices;
      this._cachedUsdcBalance = cash.usdc;
    } catch (error: any) {
      this._log(`Data refresh error: ${error.message}`, "error");
    }
  }

  /** Update cached prices externally (from parent component's price ticker) */
  updatePrices(prices: Record<string, number>) {
    this._cachedPrices = { ...this._cachedPrices, ...prices };
  }

  updateAssets(assets: PortfolioAsset[]) {
    this._cachedAssets = assets;
  }

  // ── Cooldown Management ─────────────────────────────────

  private _setCooldown(coin: string) {
    const expiresAt = Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000;
    this.cooldowns[coin] = expiresAt;
    this._saveCooldowns();
    this._log(`${coin} on cooldown for ${COOLDOWN_HOURS}h`, "info");
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
        // Sync localStorage to match what's now in DB
        this._saveSettingsToLocalStorage();
      } else {
        this._pendingTierSave = true;
        this._log(`Tier settings save failed: ${result.error || "unknown"} — cached locally`, "error");
      }
    } catch (err: any) {
      this._pendingTierSave = true;
      this._log(`Tier settings save error: ${err.message || "unknown"} — cached locally`, "error");
    }
  }

  /** Save tier settings to localStorage as immediate backup */
  private _saveSettingsToLocalStorage() {
    try {
      const data: Record<string, TierSettings> = {};
      for (let t = 1; t <= 3; t++) {
        data[`tier${t}`] = { ...this.tierSettings[`tier${t}`] };
      }
      localStorage.setItem("budju_tier_settings", JSON.stringify(data));
    } catch {
      // localStorage full or unavailable — not critical
    }
  }

  /** Load tier settings from localStorage (fallback when DB save failed) */
  private _loadSettingsFromLocalStorage(): Record<string, TierSettings> | null {
    try {
      const raw = localStorage.getItem("budju_tier_settings");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
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
    const amount = (settings.allocation / 100) * usdc;
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
    const quantity = (sellPercent / 100) * balance;
    return quantity * price;
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
      isOwner: this._isOwner,
      deviceId: this._deviceId,
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
