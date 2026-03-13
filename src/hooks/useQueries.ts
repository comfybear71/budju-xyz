import { useQuery } from "@tanstack/react-query";
import walletService, { type WalletBalance } from "@lib/services/walletService";
import { getChartData, type ChartOptions, type CandlestickData } from "@lib/services/chartApi";

/**
 * Cached wallet balance query. Refetches every 30s (matching the existing
 * polling interval) but deduplicates concurrent requests and shares cache
 * across components.
 */
export function useWalletBalances(walletAddress: string | null) {
  return useQuery<WalletBalance>({
    queryKey: ["walletBalances", walletAddress],
    queryFn: () => walletService.fetchWalletBalances(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 15_000,       // Consider fresh for 15s
    refetchInterval: 30_000, // Refetch every 30s
    retry: 2,
  });
}

/**
 * Cached chart data query. Stale time matches the existing 2-min cache TTL
 * in chartApi.ts, but TanStack Query also deduplicates in-flight requests.
 */
export function useChartData(options: ChartOptions | null) {
  return useQuery<CandlestickData[]>({
    queryKey: ["chartData", options?.baseToken, options?.quoteToken, options?.timeframe],
    queryFn: () => getChartData(options!),
    enabled: !!options,
    staleTime: 2 * 60_000,  // 2 min (matches chartApi cache TTL)
    retry: 1,
  });
}

/**
 * Cached pool info query for the /pool page.
 */
export function usePoolInfo() {
  return useQuery({
    queryKey: ["poolInfo"],
    queryFn: async () => {
      const res = await fetch("/api/index?action=pool_info");
      if (!res.ok) throw new Error(`Pool info fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
