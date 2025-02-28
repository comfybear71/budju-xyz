import { TokenData } from "@types";
import { useState, useEffect } from "react";

export const useTokenData = () => {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTokenData = async () => {
      try {
        setLoading(true);
        // Mock fetch for now - would be replaced with actual API call
        const response = await fetch(
          "https://mainnet.helius-rpc.com/?api-key=964271a5-20ee-4de5-be25-ea90dfbc698b",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getAsset",
              params: ["2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"],
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch token data");
        }

        const data = await response.json();

        if (data.result) {
          const tokenInfo = data.result.token_info;

          setTokenData({
            symbol: data.result.content.metadata.symbol,
            supply: tokenInfo.supply / 1000000,
            pricePerToken: tokenInfo.price_info.price_per_token,
            currency: tokenInfo.price_info.currency,
            marketCap:
              ((tokenInfo.supply / 1000) *
                tokenInfo.price_info.price_per_token) /
              1000,
            holders: 0, // Will be updated by a separate call
            firstCreated: "January 31, 2025",
          });

          // Then fetch holders data
          await fetchHoldersData();
        } else {
          throw new Error("Invalid token data response");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        console.error("Error fetching token data:", err);

        // Fallback data for development
        setTokenData({
          symbol: "BUDJU",
          supply: 1000000000,
          pricePerToken: 0.0000123,
          currency: "USDC",
          marketCap: 123456,
          holders: 138,
          firstCreated: "January 31, 2025",
        });
      } finally {
        setLoading(false);
      }
    };

    const fetchHoldersData = async () => {
      try {
        const response = await fetch(
          "https://mainnet.helius-rpc.com/?api-key=964271a5-20ee-4de5-be25-ea90dfbc698b",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getProgramAccounts",
              params: [
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                {
                  encoding: "jsonParsed",
                  filters: [
                    {
                      dataSize: 165,
                    },
                    {
                      memcmp: {
                        offset: 0,
                        bytes: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
                      },
                    },
                  ],
                },
              ],
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch holders data");
        }

        const data = await response.json();

        if (data.result) {
          const holders = new Set();
          data.result.forEach((account: any) => {
            holders.add(account.account.data.parsed.info.owner);
          });

          // Subtract 24 from the count of holders, ensure it doesn't go below 0
          const adjustedHolders = Math.max(holders.size - 24, 0);

          setTokenData((prev) =>
            prev ? { ...prev, holders: adjustedHolders } : null,
          );
        }
      } catch (err) {
        console.error("Error fetching holders data:", err);
      }
    };

    fetchTokenData();
  }, []);

  return { tokenData, loading, error };
};
