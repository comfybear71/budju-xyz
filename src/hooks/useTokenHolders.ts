// src/lib/hooks/useTokenHolders.ts
import { useState, useEffect } from "react";
import { fetchHeliusTokenMetrics } from "@/lib/utils/tokenService";

interface TokenData {
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  totalSupply: number;
  burned: number;
}

export const useTokenHolders = () => {
  const [holders, setHolders] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const metrics: TokenData = await fetchHeliusTokenMetrics();
      setHolders(metrics.holders);
    } catch (err) {
      console.error("Error fetching token holders:", err);
      setError("Failed to load holders data.");
      setHolders(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  return { holders, loading, error };
};