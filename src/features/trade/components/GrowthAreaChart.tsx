import { useMemo, useRef, useState } from "react";
import { sliceToPeriod, type PositionHistoryPoint } from "../services/tradeApi";

interface Ev {
  timestamp: string;
  type: "deposit" | "withdrawal";
  amountUsd: number;
}

interface Props {
  points: PositionHistoryPoint[];
  /** Deposits / withdrawals, drawn as ▲ / ▼ markers on the timeline */
  events?: Ev[];
  /** True when there are no recorded value readings yet: the past points then only know what was PUT IN, not what the
   *  account was worth, so they must not be drawn as "worth". Only today's real total is. */
  estimated?: boolean;
}

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const usdSigned = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString()}`;
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const dayLabel = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const dayTime = (ts: number) => `${dayLabel(ts)}, ${new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

// Same buttons as the Swyftx portfolio chart. "All" = everything recorded so far.
const PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
] as const;

const W = 400;
const H = 150;
const PAD = { top: 10, bottom: 10 };

/**
 * What the account is WORTH over time (solid, filled), against what has been PUT IN (dashed steps: deposits minus
 * withdrawals). A deposit shows as a step up in both lines, so it no longer looks like the account is going nowhere;
 * the gap between the two lines is the profit or loss. ▲ marks a deposit, ▼ a withdrawal. Touch or hover for the numbers.
 * The scale fits the data (it no longer starts at $0, which squashed everything flat).
 * Points are the recorded hourly readings (see buildSnapshotHistory); only the last point is today's live total.
 */
const GrowthAreaChart = ({ points, events = [], estimated = false }: Props) => {
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const windowed = useMemo(() => {
    const days = PERIODS[periodIdx].days;
    return days === 0 ? points : sliceToPeriod(points, days);
  }, [points, periodIdx]);

  const chart = useMemo(() => {
    if (windowed.length < 2) return null;
    const t0 = new Date(windowed[0].timestamp).getTime();
    const t1 = new Date(windowed[windowed.length - 1].timestamp).getTime();
    const tRange = Math.max(t1 - t0, 1);
    const putIn = windowed.map((p) => p.cumulativeDeposited - p.cumulativeWithdrawn);
    const values = windowed.map((p) => p.value);
    const lo = Math.min(...values, ...putIn);
    const hi = Math.max(...values, ...putIn);
    const pad = Math.max((hi - lo) * 0.08, hi * 0.01, 1);
    const minV = lo - pad;
    const maxV = hi + pad;
    const vRange = maxV - minV || 1;
    const xs = windowed.map((p) => ((new Date(p.timestamp).getTime() - t0) / tRange) * W);
    const yFor = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) - ((v - minV) / vRange) * (H - PAD.top - PAD.bottom);
    const line = `M ${xs.map((x, i) => `${x.toFixed(1)},${yFor(values[i]).toFixed(1)}`).join(" L ")}`;
    const area = `${line} L ${W},${H} L 0,${H} Z`;
    // dashed "put in" line drawn as steps (a deposit is a jump, not a slope)
    let steps = `M ${xs[0].toFixed(1)},${yFor(putIn[0]).toFixed(1)}`;
    for (let i = 1; i < xs.length; i++) steps += ` L ${xs[i].toFixed(1)},${yFor(putIn[i - 1]).toFixed(1)} L ${xs[i].toFixed(1)},${yFor(putIn[i]).toFixed(1)}`;
    const last = windowed[windowed.length - 1];
    const result = last.value + last.cumulativeWithdrawn - last.cumulativeDeposited;
    // deposit / withdrawal markers inside the window, one per day, the biggest 12
    const byDay = new Map<string, { ts: number; dep: number; wd: number }>();
    for (const e of events) {
      const ts = new Date(e.timestamp).getTime();
      if (ts < t0 || ts > t1) continue;
      const key = new Date(ts).toDateString();
      const cur = byDay.get(key) ?? { ts, dep: 0, wd: 0 };
      if (e.type === "deposit") cur.dep += e.amountUsd; else cur.wd += e.amountUsd;
      byDay.set(key, cur);
    }
    const markers = [...byDay.entries()]
      .map(([day, m]) => ({ ...m, day, xPct: ((m.ts - t0) / tRange) * 100 }))
      .sort((a, b) => Math.max(b.dep, b.wd) - Math.max(a.dep, a.wd))
      .slice(0, 12);
    // amount labels: biggest first, skipped when too close to one already labelled so they never overlap
    const labelled: number[] = [];
    const withLabel = markers.map((m) => {
      const show = labelled.every((x) => Math.abs(x - m.xPct) >= 13);
      if (show) labelled.push(m.xPct);
      return { ...m, show };
    });
    const dayTotals = new Map([...byDay.entries()].map(([day, m]) => [day, { dep: m.dep, wd: m.wd }]));
    const endY = (yFor(values[values.length - 1]) / H) * 100;
    return { xs, values, putIn, line, area, steps, minV, maxV, t0, t1, result, markers: withLabel, dayTotals, endY };
  }, [windowed, events]);

  const tabs = (
    <div className="flex items-center justify-end gap-1 mb-1.5">
      {PERIODS.map((p, i) => (
        <button key={p.label} onClick={() => { setPeriodIdx(i); setHover(null); }}
          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-colors ${i === periodIdx ? "bg-blue-500/15 text-blue-400" : "text-slate-600 hover:text-slate-400"}`}>
          {p.label}
        </button>
      ))}
    </div>
  );

  if (points.length < 2) return <div className="text-center py-4 text-slate-500 text-[11px]">Not enough history yet to chart.</div>;
  if (!chart) return <div>{tabs}<div className="text-center py-4 text-slate-500 text-[11px]">Nothing recorded in this window yet.</div></div>;

  const { xs, values, putIn, line, area, steps, minV, maxV, t0, t1, result, markers, dayTotals, endY } = chart;
  const up = result >= 0;
  const color = up ? "#34d399" : "#f87171";

  const onMove = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setHover(best);
  };

  const hp = hover !== null ? windowed[hover] : null;
  const hx = hover !== null ? (xs[hover] / W) * 100 : 0;

  return (
    <div>
      {tabs}
      <div ref={box} className="relative select-none touch-pan-y" onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 150 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.30" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {!estimated && <path d={area} fill="url(#growthGrad)" />}
          <path d={steps} fill="none" stroke={estimated ? "rgba(148,163,184,0.95)" : "rgba(148,163,184,0.75)"} strokeWidth={estimated ? 1.6 : 1.2} strokeDasharray={estimated ? undefined : "4 3"} vectorEffect="non-scaling-stroke" />
          {!estimated && <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1="0" y2={H} stroke="rgba(255,255,255,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* scale labels */}
        <span className="absolute left-1 top-0 text-[9px] font-mono text-slate-500 pointer-events-none">{usd(maxV)}</span>
        <span className="absolute left-1 bottom-0 text-[9px] font-mono text-slate-500 pointer-events-none">{usd(minV)}</span>
        {/* deposit / withdrawal markers */}
        {markers.map((m) => (
          <span key={m.ts} className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center leading-none pointer-events-none"
            style={{ left: `${Math.min(94, Math.max(6, m.xPct))}%`, color: m.dep >= m.wd ? "#4ade80" : "#fbbf24" }}>
            {m.show && <span className="text-[8px] font-mono mb-0.5 whitespace-nowrap">{m.dep >= m.wd ? "+" : "−"}{compact(Math.max(m.dep, m.wd))}</span>}
            <span className="text-[9px]">{m.dep >= m.wd ? "▲" : "▼"}</span>
          </span>
        ))}
        {/* today's real total: the only point we truly know until readings are recorded */}
        {estimated && <span className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none" style={{ left: "99%", top: `${endY}%`, background: color, boxShadow: `0 0 6px ${color}` }} />}
        {/* hover / touch readout */}
        {hp && hover !== null && (
          <div className="absolute top-1 z-10 rounded-lg px-2 py-1.5 text-[10px] font-mono leading-snug pointer-events-none"
            style={{ left: `${Math.min(62, Math.max(0, hx - 18))}%`, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="text-slate-400">{dayTime(new Date(hp.timestamp).getTime())}</div>
            {(() => {
              const d = dayTotals.get(new Date(hp.timestamp).toDateString());
              return d ? (
                <>
                  {d.dep > 0 && <div className="text-green-400">▲ Deposited {usd(d.dep)} that day</div>}
                  {d.wd > 0 && <div className="text-amber-400">▼ Withdrew {usd(d.wd)} that day</div>}
                </>
              ) : null;
            })()}
            {estimated && hover < windowed.length - 1 ? (
              <div className="text-slate-100">Put in {usd(putIn[hover])}<div className="text-slate-500">(worth not recorded yet)</div></div>
            ) : (
              <>
                <div className="text-slate-100">Worth {usd(values[hover])}</div>
                <div className="text-slate-400">Put in {usd(putIn[hover])}</div>
                <div style={{ color: values[hover] - putIn[hover] >= 0 ? "#4ade80" : "#f87171" }}>Result {usdSigned(values[hover] - putIn[hover])}</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[9px] text-slate-600 mt-0.5 px-0.5">
        <span>{dayLabel(t0)}</span>
        <span>{dayLabel((t0 + t1) / 2)}</span>
        <span>Now</span>
      </div>
      <div className="flex items-center justify-between text-[10px] mt-1.5 px-0.5">
        <span className="text-slate-500">
          {estimated
            ? <><span className="text-slate-400">━</span> Put in (what you deposited) &nbsp;<span style={{ color }}>●</span> worth now &nbsp;<span className="text-green-400">▲</span> deposit &nbsp;<span className="text-amber-400">▼</span> withdrawal</>
            : <><span style={{ color }}>━</span> Worth &nbsp;<span className="text-slate-400">┅</span> Put in &nbsp;<span className="text-green-400">▲</span> deposit &nbsp;<span className="text-amber-400">▼</span> withdrawal</>}
        </span>
        <span className={`font-bold font-mono ${up ? "text-green-400" : "text-red-400"}`}>Result {usdSigned(result)}</span>
      </div>
    </div>
  );
};

export default GrowthAreaChart;
