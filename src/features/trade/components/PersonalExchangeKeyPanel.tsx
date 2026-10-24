import { useState, useEffect, useCallback } from "react";
import { FaLock, FaCheckCircle, FaExclamationTriangle, FaTrash, FaSync, FaRobot, FaPowerOff, FaKey, FaFlask } from "react-icons/fa";
import {
  fetchBudjuGateStatus,
  fetchSwyftxKeyStatus,
  saveSwyftxKey,
  removeSwyftxKey,
  fetchPersonalHoldings,
  fetchAutoTradeStatus,
  setAutoTradeEnabled,
  linkAdminMasterKey,
  placeTestBuy,
  type BudjuGateStatus,
  type SwyftxKeyStatus,
  type PersonalHoldings,
  type AutoTradeStatus,
} from "../services/tradeApi";

interface Props {
  wallet: string;
  isAdmin?: boolean;
}

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

/**
 * Non-custodial trading setup (Oct 2026 pivot) — BUDJU never holds or pools
 * user funds. Gated behind the same 10M BUDJU requirement as everywhere
 * else in the app, re-checked server-side on save (the client check here is
 * just UX — the backend never trusts it). Each wallet brings its own
 * trade-only Swyftx API key for live holdings visibility. Connecting a key
 * alone never starts trading — auto-trading (Phase 2) is a separate,
 * explicit opt-in below, and the bot only ever sells coins it bought
 * itself for this wallet, never pre-existing personal holdings.
 */
const PersonalExchangeKeyPanel = ({ wallet, isAdmin = false }: Props) => {
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<BudjuGateStatus | null>(null);
  const [keyStatus, setKeyStatus] = useState<SwyftxKeyStatus>({ configured: false });
  const [holdings, setHoldings] = useState<PersonalHoldings | null>(null);
  const [autoTrade, setAutoTrade] = useState<AutoTradeStatus | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [ackWarning, setAckWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [ackTrading, setAckTrading] = useState(false);
  const [togglingAutoTrade, setTogglingAutoTrade] = useState(false);
  const [linkingMasterKey, setLinkingMasterKey] = useState(false);
  const [showTestBuyConfirm, setShowTestBuyConfirm] = useState(false);
  const [ackTestBuy, setAckTestBuy] = useState(false);
  const [testBuying, setTestBuying] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    const [g, k] = await Promise.all([fetchBudjuGateStatus(wallet), fetchSwyftxKeyStatus(wallet)]);
    setGate(g);
    setKeyStatus(k);
    setLoading(false);
    if (k.configured && k.status === "active") {
      fetchPersonalHoldings(wallet).then(setHoldings);
      fetchAutoTradeStatus(wallet).then(setAutoTrade);
    } else {
      setHoldings(null);
      setAutoTrade(null);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!apiKeyInput.trim() || !ackWarning) return;
    setSaving(true);
    setMessage(null);
    const result = await saveSwyftxKey(wallet, apiKeyInput.trim());
    setSaving(false);
    if (!result.success) {
      setMessage({ text: result.error || "Failed to save key", tone: "error" });
      return;
    }
    setMessage({
      text: "Swyftx key connected — you can now see your live holdings below. Auto-trading stays off until you turn it on.",
      tone: "success",
    });
    setApiKeyInput("");
    setAckWarning(false);
    setShowReplace(false);
    refresh();
  };

  const handleRemove = async () => {
    setRemoving(true);
    setMessage(null);
    const result = await removeSwyftxKey(wallet);
    setRemoving(false);
    if (!result.success) {
      setMessage({ text: result.error || "Failed to remove key", tone: "error" });
      return;
    }
    setMessage({ text: "Key removed. BUDJU can no longer read or trade on this account.", tone: "success" });
    refresh();
  };

  /** Admin-only convenience: the admin's Swyftx key is already configured
   *  server-side (SWYFTX_API_KEY, the legacy pooled bot's key) — this links
   *  it to the admin's own per-user entry instead of re-pasting it here. */
  const handleLinkMasterKey = async () => {
    setLinkingMasterKey(true);
    setMessage(null);
    const result = await linkAdminMasterKey(wallet);
    setLinkingMasterKey(false);
    if (!result.success) {
      setMessage({ text: result.error || "Failed to link the server's master key", tone: "error" });
      return;
    }
    setMessage({
      text: `Linked the server's existing Swyftx key (${result.maskedApiKey}) — no need to paste it again.`,
      tone: "success",
    });
    refresh();
  };

  const handleEnableAutoTrade = async () => {
    if (!ackTrading) return;
    setTogglingAutoTrade(true);
    setMessage(null);
    const result = await setAutoTradeEnabled(wallet, true);
    setTogglingAutoTrade(false);
    if (!result.success) {
      setMessage({ text: result.error || "Failed to enable auto-trading", tone: "error" });
      return;
    }
    setMessage({ text: "Auto-trading enabled — the bot will start placing trades in your own account.", tone: "success" });
    setShowEnableConfirm(false);
    setAckTrading(false);
    refresh();
  };

  const handleDisableAutoTrade = async () => {
    setTogglingAutoTrade(true);
    setMessage(null);
    const result = await setAutoTradeEnabled(wallet, false);
    setTogglingAutoTrade(false);
    if (!result.success) {
      setMessage({ text: result.error || "Failed to disable auto-trading", tone: "error" });
      return;
    }
    setMessage({ text: "Auto-trading disabled. The bot will no longer place new trades in your account.", tone: "success" });
    refresh();
  };

  /** One-off real-money BTC buy (max $10 or 4% of live balance, refuses
   *  below the $30 reserve floor) through the exact same place-order ->
   *  record-ledger pipeline the auto-trader cron uses — proves that path
   *  works on this specific account without waiting for a real dip. */
  const handleTestBuy = async () => {
    if (!ackTestBuy) return;
    setTestBuying(true);
    setMessage(null);
    const result = await placeTestBuy(wallet, wallet, "BTC");
    setTestBuying(false);
    if (!result.success) {
      setMessage({ text: result.error || "Test buy failed", tone: "error" });
      return;
    }
    setMessage({
      text: `Test buy placed: bought ${result.quantity} BTC for $${result.usdcSpent?.toFixed(2)} @ $${result.price?.toLocaleString()}. Check Activity.`,
      tone: "success",
    });
    setShowTestBuyConfirm(false);
    setAckTestBuy(false);
    refresh();
  };

  if (loading) {
    return <div className="py-6 text-center text-xs text-slate-500">Checking BUDJU holdings...</div>;
  }

  if (!gate || !gate.passes) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 text-center">
        <FaLock className="mx-auto text-amber-400/80 mb-2" size={18} />
        <div className="text-sm font-semibold text-slate-200 mb-1">10M BUDJU required</div>
        <div className="text-xs text-slate-500">
          You hold {gate ? gate.budjuBalance.toLocaleString() : "0"} BUDJU — connect your own Swyftx key once you
          hold 10,000,000.
        </div>
      </div>
    );
  }

  const isActive = keyStatus.configured && keyStatus.status === "active";
  const isInvalid = keyStatus.configured && keyStatus.status !== "active";

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-slate-500 leading-relaxed">
        BUDJU never holds your money. Connect your own Swyftx API key to see your live holdings here — your funds
        never touch BUDJU's wallet or a shared pool. Auto-trading is a separate, explicit opt-in below — connecting
        a key alone never places a trade in{" "}
        <span className="text-slate-300 font-medium">your own account</span>.
      </div>

      {message && (
        <div
          className={`text-xs rounded-lg px-3 py-2 ${
            message.tone === "error"
              ? "bg-red-500/10 border border-red-500/30 text-red-300"
              : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {isActive && !showReplace && (
        <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FaCheckCircle className="text-emerald-400" size={14} />
            <span className="text-sm font-semibold text-emerald-300">Connected</span>
          </div>
          <div className="text-[11px] text-slate-500 space-y-0.5 font-mono">
            <div>Key: {keyStatus.maskedApiKey}</div>
            {keyStatus.lastValidatedAt && <div>Last validated: {formatDate(keyStatus.lastValidatedAt)}</div>}
          </div>

          {holdings && (
            <div className="mt-3 pt-3 border-t border-emerald-500/10">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Your holdings</div>
              {Object.keys(holdings.holdings).length === 0 ? (
                <div className="text-[11px] text-slate-600">No balances yet</div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(holdings.holdings).map(([coin, amount]) => (
                    <div key={coin} className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-400">{coin}</span>
                      <span className="text-slate-300">{amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowReplace(true)}
              className="flex-1 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <FaSync size={10} /> Replace key
            </button>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex-1 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <FaTrash size={10} /> {removing ? "Removing..." : "Remove"}
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-emerald-500/10">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Auto-trading</div>

            {autoTrade?.autoTradeEnabled ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FaRobot className="text-emerald-400" size={12} />
                  <span className="text-xs font-semibold text-emerald-300">Bot is live in your account</span>
                </div>
                {autoTrade.autoTradeEnabledAt && (
                  <div className="text-[10px] text-slate-500 mb-2">
                    Enabled {formatDate(autoTrade.autoTradeEnabledAt)}
                  </div>
                )}
                <button
                  onClick={handleDisableAutoTrade}
                  disabled={togglingAutoTrade}
                  className="w-full text-[11px] font-medium px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <FaPowerOff size={10} /> {togglingAutoTrade ? "Disabling..." : "Disable auto-trading"}
                </button>
              </div>
            ) : !showEnableConfirm ? (
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/40 p-3">
                <div className="text-[11px] text-slate-500 mb-2">
                  Off. Your key gives read-only holdings visibility until you turn this on.
                </div>
                <button
                  onClick={() => setShowEnableConfirm(true)}
                  className="w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/90 text-white hover:bg-emerald-500 transition-colors flex items-center justify-center gap-1.5"
                >
                  <FaRobot size={10} /> Enable auto-trading
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3 space-y-2.5">
                <div className="text-[11px] text-amber-200 leading-relaxed">
                  <div className="font-bold mb-1 flex items-center gap-1.5">
                    <FaExclamationTriangle size={11} /> This places real trades with real money
                  </div>
                  The bot will buy dips and sell rallies directly in your own Swyftx account using the strategy
                  settings below. It only ever sells what it itself bought for you — never pre-existing holdings.
                  You can disable this at any time.
                </div>
                <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ackTrading}
                    onChange={(e) => setAckTrading(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I understand this will place real trades in my own Swyftx account.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleEnableAutoTrade}
                    disabled={togglingAutoTrade || !ackTrading}
                    className="flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/90 text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {togglingAutoTrade ? "Enabling..." : "Confirm & enable"}
                  </button>
                  <button
                    onClick={() => {
                      setShowEnableConfirm(false);
                      setAckTrading(false);
                    }}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-emerald-500/10">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Test buy</div>

            {!showTestBuyConfirm ? (
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/40 p-3">
                <div className="text-[11px] text-slate-500 mb-2">
                  Fire one real BTC buy right now (max $10, or 4% of your live balance — whichever's bigger) to
                  confirm it shows up correctly in Activity. Works independently of auto-trading above.
                </div>
                <button
                  onClick={() => setShowTestBuyConfirm(true)}
                  className="w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-500/80 text-white hover:bg-blue-500 transition-colors flex items-center justify-center gap-1.5"
                >
                  <FaFlask size={10} /> Run test buy
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3 space-y-2.5">
                <div className="text-[11px] text-amber-200 leading-relaxed">
                  <div className="font-bold mb-1 flex items-center gap-1.5">
                    <FaExclamationTriangle size={11} /> This places one real BTC order right now
                  </div>
                  Buys whichever is bigger — $10, or 4% of your balance — of BTC in your own account, same as a
                  real auto-trade buy. Refuses outright if your balance isn't above $30, or if this buy would
                  drop it below $30.
                </div>
                <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ackTestBuy}
                    onChange={(e) => setAckTestBuy(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I understand this will buy real BTC in my own Swyftx account right now.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleTestBuy}
                    disabled={testBuying || !ackTestBuy}
                    className="flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-500/90 text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {testBuying ? "Buying..." : "Confirm & buy BTC"}
                  </button>
                  <button
                    onClick={() => {
                      setShowTestBuyConfirm(false);
                      setAckTestBuy(false);
                    }}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isInvalid && !showReplace && (
        <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <FaExclamationTriangle className="text-amber-400" size={14} />
            <span className="text-sm font-semibold text-amber-300">Key needs attention</span>
          </div>
          <div className="text-[11px] text-slate-500 mb-3">
            {keyStatus.lastError || "Swyftx rejected this key — it may have been revoked or rotated."}
          </div>
          <button
            onClick={() => setShowReplace(true)}
            className="w-full text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Replace key
          </button>
        </div>
      )}

      {(!keyStatus.configured || showReplace) && (
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 space-y-3">
          {isAdmin && !showReplace && (
            <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/25 p-3 space-y-2">
              <div className="text-[11px] text-cyan-200 leading-relaxed">
                <span className="font-semibold">Admin shortcut:</span> this wallet's Swyftx key is already
                configured on the server (it powers the legacy pooled bot) — link it instead of pasting it again.
              </div>
              <button
                onClick={handleLinkMasterKey}
                disabled={linkingMasterKey}
                className="w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-cyan-500/90 text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <FaKey size={10} /> {linkingMasterKey ? "Linking..." : "Link server's master key"}
              </button>
            </div>
          )}

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3 text-[11px] text-amber-200 leading-relaxed">
            <div className="font-bold mb-1 flex items-center gap-1.5">
              <FaExclamationTriangle size={11} /> Before you connect
            </div>
            In Swyftx, create a new API key under <span className="font-semibold">Settings → API Keys</span> and:
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>
                Enable <span className="font-semibold">ONLY "Trade" / "Read"</span> permissions
              </li>
              <li>
                <span className="font-semibold">Disable "Withdraw" / "Transfer"</span> — BUDJU should never be able
                to move money out of your account
              </li>
            </ul>
          </div>

          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Paste your Swyftx API key"
            autoComplete="off"
            className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
          />

          <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={ackWarning}
              onChange={(e) => setAckWarning(e.target.checked)}
              className="mt-0.5"
            />
            <span>I enabled only Trade permissions and disabled Withdraw/Transfer on this key.</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !apiKeyInput.trim() || !ackWarning}
              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-500/90 text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Connecting..." : "Connect Swyftx key"}
            </button>
            {showReplace && (
              <button
                onClick={() => {
                  setShowReplace(false);
                  setApiKeyInput("");
                  setMessage(null);
                }}
                className="text-xs font-medium px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalExchangeKeyPanel;
