import { useState, useEffect, useCallback } from "react";
import { FaLock, FaCheckCircle, FaExclamationTriangle, FaTrash, FaSync } from "react-icons/fa";
import {
  fetchBudjuGateStatus,
  fetchSwyftxKeyStatus,
  saveSwyftxKey,
  removeSwyftxKey,
  fetchPersonalHoldings,
  type BudjuGateStatus,
  type SwyftxKeyStatus,
  type PersonalHoldings,
} from "../services/tradeApi";

interface Props {
  wallet: string;
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
 * trade-only Swyftx API key; the bot trades directly in that account.
 */
const PersonalExchangeKeyPanel = ({ wallet }: Props) => {
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<BudjuGateStatus | null>(null);
  const [keyStatus, setKeyStatus] = useState<SwyftxKeyStatus>({ configured: false });
  const [holdings, setHoldings] = useState<PersonalHoldings | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [ackWarning, setAckWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [showReplace, setShowReplace] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    const [g, k] = await Promise.all([fetchBudjuGateStatus(wallet), fetchSwyftxKeyStatus(wallet)]);
    setGate(g);
    setKeyStatus(k);
    setLoading(false);
    if (k.configured && k.status === "active") {
      fetchPersonalHoldings(wallet).then(setHoldings);
    } else {
      setHoldings(null);
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
    setMessage({ text: "Swyftx key connected — the bot will start trading in your own account.", tone: "success" });
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
    setMessage({ text: "Key removed. The bot will no longer trade on your account.", tone: "success" });
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
        BUDJU never holds your money. Connect your own Swyftx API key and the bot trades directly in{" "}
        <span className="text-slate-300 font-medium">your own account</span> — your funds never touch BUDJU's
        wallet or a shared pool.
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
