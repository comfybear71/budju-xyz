interface Event { timestamp: string; type: "deposit" | "withdrawal"; amountUsd: number }
interface Props { events: Event[]; totalDeposited: number; totalWithdrawn: number; valueNow: number }

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });

const Cell = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
    <div className="text-sm font-bold font-mono" style={{ color: color || "#e2e8f0" }}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 leading-tight">{sub}</div>}
  </div>
);

/** Plain facts about the money moved in and out, and the one honest result: what it's worth now vs what went in (net of withdrawals). */
const CashFlowStats = ({ events, totalDeposited, totalWithdrawn, valueNow }: Props) => {
  const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const lastDep = [...sorted].reverse().find((e) => e.type === "deposit");
  const lastWd = [...sorted].reverse().find((e) => e.type === "withdrawal");
  const net = totalDeposited - totalWithdrawn;
  const result = valueNow + totalWithdrawn - totalDeposited;
  return (
    <div className="mt-3 pt-3 border-t border-white/[0.04]">
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Total deposited" value={usd(totalDeposited)} />
        <Cell label="Total withdrawn" value={usd(totalWithdrawn)} />
        <Cell label="Last deposit" value={lastDep ? usd(lastDep.amountUsd) : "—"} sub={lastDep ? day(lastDep.timestamp) : undefined} color="#4ade80" />
        <Cell label="Last withdrawal" value={lastWd ? usd(lastWd.amountUsd) : "—"} sub={lastWd ? day(lastWd.timestamp) : undefined} color="#fbbf24" />
        <Cell label="Net put in" value={usd(net)} sub="deposited − withdrawn" />
        <Cell label="Result" value={`${result >= 0 ? "+" : ""}${usd(result)}`} sub="worth now + withdrawn − deposited" color={result >= 0 ? "#4ade80" : "#f87171"} />
      </div>
    </div>
  );
};

export default CashFlowStats;
