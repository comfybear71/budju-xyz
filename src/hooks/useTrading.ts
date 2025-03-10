import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@hooks/useWallet";
import { estimateSwap, executeSwap } from "@lib/services/swapApi";
import { depositTokens, getConnectedWallet } from "@lib/services/bankApi";
import { getChartData, CandlestickData } from "@lib/services/chartApi";
import { initializeTokenRegistry } from "@lib/services/tokenRegistry";

export interface UseTradeResult {
  loading: boolean;
  error: string | null;
  estimate: any;
  chartData: CandlestickData[];
  chartLoading: boolean;
  chartError: string | null;
  executeSwap: () => Promise<string>;
  executeDeposit: (token: string, amount: string) => Promise<string>;
  loadChartData: (timeframe: string) => Promise<void>;
}

export const useTrading = (
  fromToken: string,
  toToken: string,
  amount: string,
): UseTradeResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState("1D");
  const { connection } = useWallet();

  // Initialize token registry on load
  useEffect(() => {
    initializeTokenRegistry().catch((err) =>
      console.error("Failed to initialize token registry:", err),
    );
  }, []);

  // Load chart data on token change or timeframe change
  useEffect(() => {
    loadChartData(timeframe);
  }, [fromToken, toToken, timeframe]);

  // Get swap estimate when input changes
  useEffect(() => {
    if (!amount || parseFloat(amount) === 0) {
      setEstimate(null);
      return;
    }

    const fetchEstimate = async () => {
      try {
        setLoading(true);
        setError(null);

        const amountValue = parseFloat(amount);

        // Get wallet for estimate
        const wallet =
          connection.connected && connection.wallet
            ? {
                publicKey: {
                  toString: () => connection.wallet?.address || "",
                },
              }
            : null;

        const swapEstimate = await estimateSwap({
          fromToken,
          toToken,
          amount: amountValue,
          slippageTolerance: 0.5,
          wallet,
        });

        setEstimate(swapEstimate);
      } catch (err) {
        console.error("Error estimating swap:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to estimate swap";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchEstimate();
  }, [fromToken, toToken, amount, connection.connected, connection.wallet]);

  // Load chart data
  const loadChartData = async (newTimeframe: string) => {
    try {
      setChartLoading(true);
      setChartError(null);
      setTimeframe(newTimeframe);

      const data = await getChartData({
        baseToken: fromToken,
        quoteToken: toToken,
        timeframe: newTimeframe,
        limit: 100,
      });

      setChartData(data);
    } catch (err) {
      console.error("Error loading chart data:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load chart data";
      setChartError(errorMessage);
    } finally {
      setChartLoading(false);
    }
  };

  // Execute swap function
  const performSwap = useCallback(async () => {
    if (!connection.connected) {
      throw new Error("Wallet not connected");
    }

    if (!amount || parseFloat(amount) === 0) {
      throw new Error("Amount must be greater than 0");
    }

    try {
      setLoading(true);
      setError(null);

      // Get the actual wallet adapter
      const wallet = getConnectedWallet();

      // Execute the swap
      const txId = await executeSwap({
        fromToken,
        toToken,
        amount: parseFloat(amount),
        slippageTolerance: 0.5,
        wallet,
      });

      return txId;
    } catch (err) {
      console.error("Swap execution failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Swap failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fromToken, toToken, amount, connection.connected]);

  // Execute deposit function
  const performDeposit = useCallback(
    async (token: string, depositAmount: string) => {
      if (!connection.connected) {
        throw new Error("Wallet not connected");
      }

      if (!depositAmount || parseFloat(depositAmount) === 0) {
        throw new Error("Amount must be greater than 0");
      }

      try {
        setLoading(true);
        setError(null);

        // Get the actual wallet adapter
        const wallet = getConnectedWallet();

        const result = await depositTokens({
          token,
          amount: parseFloat(depositAmount),
          wallet,
          onProgress: (step, progress) => {
            console.log(`Deposit progress: ${step} (${progress * 100}%)`);
          },
        });

        if (result.status === "error") {
          throw new Error(result.errorMessage || "Deposit failed");
        }

        return result.txId;
      } catch (err) {
        console.error("Deposit execution failed:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Deposit failed";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [connection.connected],
  );

  return {
    loading,
    error,
    estimate,
    chartData,
    chartLoading,
    chartError,
    executeSwap: performSwap,
    executeDeposit: performDeposit,
    loadChartData,
  };
};
