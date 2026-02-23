import { useState } from "react";
import { FaPlus } from "react-icons/fa";
import { POOL_WALLET } from "@constants/addresses";
import { sendUsdcDeposit } from "@lib/services/depositService";
import { submitUserDeposit } from "@/features/trade/services/tradeApi";
import { getConnectedWallet } from "@lib/services/bankApi";

interface DepositModalProps {
  walletAddress: string;
  usdcBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

const DepositModal = ({
  walletAddress,
  usdcBalance,
  onClose,
  onSuccess,
}: DepositModalProps) => {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val < 1) {
      setError("Please enter a valid amount (minimum $1 USDC)");
      return;
    }
    if (val > usdcBalance) {
      setError(
        `Insufficient USDC balance. You have ${usdcBalance.toFixed(2)} USDC`,
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Step 1: Send USDC on-chain
      const provider = getConnectedWallet();
      const txSignature = await sendUsdcDeposit(
        provider,
        walletAddress,
        val,
      );

      // Step 2: Record deposit in MongoDB (poolValue=0 lets backend use current state)
      const result = await submitUserDeposit(walletAddress, val, txSignature, 0);

      if (!result.success) {
        setError(result.error || "Failed to record deposit");
        setLoading(false);
        return;
      }

      // Success
      onSuccess();
      onClose();
      alert(
        `Deposit successful!\n\n${val} USDC sent to BUDJU pool.\nTX: ${txSignature.substring(0, 24)}...`,
      );
    } catch (err: any) {
      if (err.message?.includes("User rejected")) {
        setError("Transaction cancelled by user");
      } else {
        setError(err.message || "Deposit failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-[#0f1225] border border-white/[0.08] rounded-2xl p-6 text-center shadow-2xl">
        {/* Green + icon */}
        <div className="w-[50px] h-[50px] bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
          <FaPlus className="w-5 h-5 text-emerald-500" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-emerald-500 mb-2">
          Deposit USDC
        </h2>

        {/* Description */}
        <p className="text-[13px] text-gray-400 mb-3 leading-relaxed">
          Send USDC from your Phantom wallet to the BUDJU pool. Your allocation
          is based on your deposit percentage of the total pool.
        </p>

        {/* Available balance */}
        <div className="text-xs text-gray-500 mb-3">
          Available:{" "}
          <span className="text-emerald-500 font-bold">
            {usdcBalance.toFixed(2)}
          </span>{" "}
          USDC
        </div>

        {/* Amount input */}
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (USDC)"
          min="1"
          step="1"
          disabled={loading}
          className="w-full px-4 py-3.5 text-base text-center bg-black/30 border-2 border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-emerald-500/40 mb-2 font-mono"
        />

        {/* Deposit address */}
        <div className="text-[10px] text-gray-500 mb-1">
          Sending to BUDJU Pool:
        </div>
        <div className="text-[11px] text-gray-400 font-mono break-all px-2 py-2 bg-black/20 rounded-lg mb-3">
          {POOL_WALLET}
        </div>

        {/* Minimum deposit */}
        <div className="text-[11px] text-gray-500 mb-4">
          Minimum deposit: $1 USDC
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 mb-3">{error}</div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="py-4 text-center">
            <div className="w-9 h-9 border-[3px] border-white/10 border-t-emerald-500 rounded-full mx-auto mb-2 animate-spin" />
            <div className="text-[13px] text-gray-400">
              Waiting for Phantom approval...
            </div>
          </div>
        )}

        {/* Buttons */}
        {!loading && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-400 bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!amount}
              className={`flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 cursor-pointer hover:bg-emerald-600 transition-colors ${
                !amount ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              Send USDC
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositModal;
