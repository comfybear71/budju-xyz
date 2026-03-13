import { useEffect, useState, useRef, useCallback } from "react";
import {
  getBinancePriceStream,
  type BinanceWsState,
} from "@lib/services/binanceWs";

/**
 * React hook for real-time Binance WebSocket prices.
 *
 * Returns live prices (Record<string, number>) that update in real time,
 * plus connection state. Automatically connects on mount, shares a
 * singleton WebSocket across all consumers.
 *
 * @param throttleMs - Min interval between React state updates (default 1000ms).
 *   Binance sends ~1 msg/sec per symbol; throttling prevents excessive re-renders.
 */
export function useLivePrices(throttleMs = 1000) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [wsState, setWsState] = useState<BinanceWsState>({
    connected: false,
    lastUpdate: 0,
    priceCount: 0,
  });

  const latestRef = useRef<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlush = useRef(0);

  const flush = useCallback(() => {
    timerRef.current = null;
    lastFlush.current = Date.now();
    setPrices({ ...latestRef.current });
  }, []);

  useEffect(() => {
    const stream = getBinancePriceStream();
    stream.connect();

    const unsubPrices = stream.onPrices((incoming) => {
      latestRef.current = incoming;
      const now = Date.now();
      if (now - lastFlush.current >= throttleMs) {
        flush();
      } else if (!timerRef.current) {
        const remaining = throttleMs - (now - lastFlush.current);
        timerRef.current = setTimeout(flush, remaining);
      }
    });

    const unsubState = stream.onState(setWsState);

    return () => {
      unsubPrices();
      unsubState();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [throttleMs, flush]);

  return { prices, wsState };
}
