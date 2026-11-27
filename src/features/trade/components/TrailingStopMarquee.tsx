import ScrollingBanner from "@components/common/ScrollingBanner";
import type { TraderState } from "../services/tradeApi";
import { buildTrailingItems, trailingBannerText } from "./trailingMarquee";

/** Scrolling banner listing coins whose trailing stop is armed, and stops that fired in the last 24 hours. Hidden when there are none. */
const TrailingStopMarquee = ({ state }: { state: TraderState | null }) => {
  if (!state) return null;
  const text = trailingBannerText(buildTrailingItems(state.autoTrail, state.profitPlan, state.autoTradeLog, Date.now()));
  if (!text) return null;
  return <ScrollingBanner text={text} repetitions={4} speed="slower" className="rounded-xl mb-2" textClassName="!text-amber-300" />;
};

export default TrailingStopMarquee;
