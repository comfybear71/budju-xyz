import { useEffect, useState } from "react";

export interface TrailingPublic {
  enabled: boolean;
  pullbackPct: number;
  armed: Record<string, { high: number }>;
}

const EMPTY: TrailingPublic = { enabled: false, pullbackPct: 5, armed: {} };
let cache: { at: number; data: TrailingPublic } | null = null;

/** Public read of the trailing take-profit state (config + armed signals) from /api/state. */
export function useTrailing(): TrailingPublic {
  const [t, setT] = useState<TrailingPublic>(cache?.data || EMPTY);
  useEffect(() => {
    let dead = false;
    const load = async () => {
      if (cache && Date.now() - cache.at < 30_000) {
        setT(cache.data);
        return;
      }
      try {
        const r = await fetch("/api/state");
        if (!r.ok) return;
        const d = await r.json();
        const cfg = d.autoTrailingConfig || {};
        const data: TrailingPublic = {
          enabled: !!cfg.enabled,
          pullbackPct: Number(cfg.pullbackPct) || 5,
          armed: d.autoTrail || {},
        };
        cache = { at: Date.now(), data };
        if (!dead) setT(data);
      } catch {
        /* badge is optional */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);
  return t;
}

export const trailStop = (high: number, pullbackPct: number) => high * (1 - pullbackPct / 100);
