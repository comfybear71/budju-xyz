import { getCoinRank } from "../services/tradeApi";

/** Market-cap rank of a coin (CoinGecko), e.g. "#1" for Bitcoin. Shows nothing until ranks have loaded or when the coin is unranked.
 *  The Top 10 are highlighted, the same group the bot buys first. */
const RankBadge = ({ code, className = "" }: { code: string; className?: string }) => {
  const rank = getCoinRank(code);
  if (!rank) return null;
  const top = rank <= 10;
  return (
    <span
      title={`Market-cap rank #${rank} (CoinGecko)`}
      className={`text-[9px] font-mono font-bold px-1 py-px rounded leading-none ${className}`}
      style={{
        color: top ? "#60a5fa" : "#64748b",
        background: top ? "rgba(96,165,250,0.12)" : "rgba(100,116,139,0.12)",
        border: `1px solid ${top ? "rgba(96,165,250,0.3)" : "rgba(100,116,139,0.2)"}`,
      }}
    >
      #{rank}
    </span>
  );
};

export default RankBadge;
