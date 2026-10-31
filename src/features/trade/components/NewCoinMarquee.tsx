import { useEffect, useState } from "react";
import ScrollingBanner from "@components/common/ScrollingBanner";
import { getRecentCoins, loadCoinConfig } from "../services/tradeApi";

/** Scrolling banner announcing coins added in the last 7 days. Hidden when none. */
const NewCoinMarquee = () => {
  const [coins, setCoins] = useState(getRecentCoins());

  useEffect(() => {
    let alive = true;
    void loadCoinConfig().then(() => alive && setCoins([...getRecentCoins()]));
    return () => {
      alive = false;
    };
  }, []);

  if (coins.length === 0) return null;
  const text = "🪙 NEW ON BUDJU: " + coins.map((c) => `${c.code} (${c.name})`).join(" · ") + " 🪙";
  return <ScrollingBanner text={text} repetitions={4} speed="slow" className="rounded-xl mb-2" />;
};

export default NewCoinMarquee;
