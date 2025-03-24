import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@hooks/useWallet";
import { Transaction, VersionedTransaction, Connection } from "@solana/web3.js";
import {
  initializeTokenRegistry,
  getTokenBySymbol,
} from "@lib/services/tokenRegistry";
import { getChartData, CandlestickData } from "@lib/services/chartApi";

const JUPITER_API_URL = "https://quote-api.jup.ag/v6";

export interface SwapEstimate {
  inAmount: number;
  outAmount: number;
  estimatedPrice: number;
  slippageBps: number;
}

export interface UseTradeResult {
  loading: boolean;
  error: string | null;
  estimate: SwapEstimate | null;
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
  slippageBps: number = 50, // Default to 0.5%
): UseTradeResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<SwapEstimate | null>(null);
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState("1D");
  const { connection } = useWallet();

  useEffect(() => {
    initializeTokenRegistry().catch((err) =>
      console.error("Failed to initialize token registry:", err),
    );
  }, []);

  useEffect(() => {
    loadChartData(timeframe);
  }, [fromToken, toToken, timeframe]);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || !connection.connected) {
      setEstimate(null);
      return;
    }

    const fetchEstimate = async () => {
      try {
        setLoading(true);
        setError(null);

        const fromTokenInfo = await getTokenBySymbol(fromToken);
        const toTokenInfo = await getTokenBySymbol(toToken);

        if (!fromTokenInfo || !toTokenInfo) {
          throw new Error("Token not found in registry");
        }

        const inputAmount =
          parseFloat(amount) * Math.pow(10, fromTokenInfo.decimals);

        const quoteResponse = await fetch(
          `${JUPITER_API_URL}/quote?inputMint=${fromTokenInfo.address}&outputMint=${toTokenInfo.address}&amount=${inputAmount}&slippageBps=${slippageBps}`,
        );

        if (!quoteResponse.ok) {
          throw new Error("Failed to fetch swap quote");
        }

        const quote = await quoteResponse.json();

        setEstimate({
          inAmount: quote.inAmount,
          outAmount: quote.outAmount,
          estimatedPrice: quote.outAmount / quote.inAmount,
          slippageBps: quote.slippageBps,
        });
      } catch (err) {
        console.error("Error estimating swap:", err);
        setError(
          err instanceof Error ? err.message : "Failed to estimate swap",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchEstimate();
  }, [fromToken, toToken, amount, connection.connected, slippageBps]); // Added slippageBps to dependencies

  const executeSwap = useCallback(async () => {
    if (!connection.connected || !connection.wallet) {
      throw new Error("Wallet not connected");
    }

    if (!amount || parseFloat(amount) <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    try {
      setLoading(true);
      setError(null);

      const fromTokenInfo = await getTokenBySymbol(fromToken);
      const toTokenInfo = await getTokenBySymbol(toToken);

      if (!fromTokenInfo || !toTokenInfo) {
        throw new Error("Token not found in registry");
      }

      const inputAmount =
        parseFloat(amount) * Math.pow(10, fromTokenInfo.decimals);

      // Step 1: Get a quote first
      console.log("Fetching quote...");
      const quoteResponse = await fetch(
        `${JUPITER_API_URL}/quote?inputMint=${fromTokenInfo.address}&outputMint=${toTokenInfo.address}&amount=${inputAmount}&slippageBps=${slippageBps}`,
      );

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error("Quote response error:", errorText);
        throw new Error(`Failed to fetch swap quote: ${errorText}`);
      }

      const quoteData = await quoteResponse.json();
      console.log("Quote data received:", quoteData);

      // Step 2: Create a swap transaction using the quote
      console.log("Creating swap transaction...");

      // Format the request body according to Jupiter API v6 requirements
      const swapRequestBody = {
        quoteResponse: quoteData,
        userPublicKey: connection.wallet.address,
        wrapUnwrapSOL: true,
      };

      console.log("Swap request body:", JSON.stringify(swapRequestBody));

      const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(swapRequestBody),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        console.error("Swap response error:", errorText);
        throw new Error(`Failed to fetch swap transaction: ${errorText}`);
      }

      const swapData = await swapResponse.json();
      console.log("Swap data received:", swapData);

      if (!swapData.swapTransaction) {
        throw new Error("No swap transaction received from API");
      }

      // Step 3: Process the transaction with the wallet
      console.log("Processing transaction with wallet...");

      // Handle versioned transaction from Jupiter v6
      const transactionBuffer = Buffer.from(swapData.swapTransaction, "base64");
      const versionedTransaction =
        VersionedTransaction.deserialize(transactionBuffer);

      console.log("Signing transaction...");

      // For versioned transactions, we need to handle it differently based on wallet
      const provider = window.solana || window.solflare;
      if (!provider) throw new Error("No wallet provider found");

      try {
        // Use the appropriate signing method for versioned transactions
        if (typeof provider.signAndSendTransaction === "function") {
          // Some wallets have a combined method
          console.log("Using wallet's signAndSendTransaction method...");
          const result =
            await provider.signAndSendTransaction(versionedTransaction);
          const signature = result.signature;
          console.log("Transaction sent, ID:", signature);
          return signature;
        } else {
          // Otherwise handle signing and sending separately
          console.log("Signing versioned transaction...");
          // Most wallets support signTransaction for versioned transactions
          const signedTx = await provider.signTransaction(versionedTransaction);

          console.log("Sending transaction...");
          // For versioned transactions, we'll use connection's sendRawTransaction
          const solanaConnection = new Connection(connection.rpcEndpoint);
          const signature = await solanaConnection.sendRawTransaction(
            signedTx.serialize(),
          );
          console.log("Transaction sent, ID:", signature);
          return signature;
        }
      } catch (err) {
        console.error("Error processing transaction:", err);
        throw new Error(
          `Transaction signing failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } catch (err) {
      console.error("Swap execution failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Swap failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fromToken, toToken, amount, connection, slippageBps]); // Added slippageBps to dependencies

  const executeDeposit = useCallback(
    async (token: string, depositAmount: string) => {
      if (!connection.connected) {
        throw new Error("Wallet not connected");
      }

      try {
        setLoading(true);

        // Simulating a successful deposit (in real implementation, this would interact with your smart contract)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Return a mock transaction ID
        const mockTxId =
          "SimulatedDepositTx" + Math.random().toString(36).substring(2, 15);
        return mockTxId;
      } catch (error) {
        console.error(`Deposit error:`, error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to process deposit",
        );
      } finally {
        setLoading(false);
      }
    },
    [connection],
  );

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
      setChartError(
        err instanceof Error ? err.message : "Failed to load chart data",
      );
    } finally {
      setChartLoading(false);
    }
  };

  return {
    loading,
    error,
    estimate,
    chartData,
    chartLoading,
    chartError,
    executeSwap,
    executeDeposit,
    loadChartData,
  };
};
