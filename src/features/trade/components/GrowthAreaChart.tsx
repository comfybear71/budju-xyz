import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PositionHistoryPoint } from "../services/tradeApi";

interface Ev {
  timestamp: string;
  type: "deposit" | "withdrawal";
  amountUsd: number;
}

interface Props {
  points: PositionHistoryPoint[];
  /** Deposits / withdrawals, drawn as ▲ / ▼ markers on the timeline (and as the "put in" steps, all the way back) */
  events?: Ev[];
  /** True when there are no recorded value readings yet: then nothing is drawn as "worth" except today's real total. */
  estimated?: boolean;
}

const DAY = 86_400_000;
const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const usdSigned = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString()}`;
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const dayLabel = (ts: number, withYear = false) =>
  new Date(ts).toLocaleDateString(undefined, withYear ? { day: "numeric", month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
const dayTime = (ts: number) => `${dayLabel(ts)}, ${new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

// How much of the history one screen shows. Scroll sideways to go further back. "All" = the stretch where worth was recorded.
const PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
] as const;
const MAX_ZOOM = 30;                       // the full history is never wider than 30 screens
const TICK_STEPS = [1, 2, 7, 14, 30, 60, 90, 180, 365];

const W = 400;
const H = 150;
const PAD = { top: 10, bottom: 10 };

type Hover = { ts: number; reading: number | null; px: number } | null;

/**
 * What the account is WORTH over time (solid, filled) against what has been PUT IN (dashed steps: deposits minus withdrawals).
 * A deposit is a step up in both lines; the gap between them is the profit or loss. ▲ deposit, ▼ withdrawal.
 * Scroll the chart sideways to see earlier history. The worth line starts where we began recording it (Nov 2026); before that only
 * the put-in steps are known, so the shaded part says so. Tap or hover for the numbers.
 */
const GrowthAreaChart = ({ points, events = [], estimated = false }: Props) => {
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);
  const [hover, setHover] = useState<Hover>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const fromRight = useRef(0);
  const [zoomDays, setZoomDays] = useState<number | null>(null);   // set by pinching; the 1W..All buttons clear it
  const anchor = useRef<{ frac: number; cx: number } | null>(null);  // keeps the point between your fingers still while zooming
  const zoomRef = useRef<number>(0);
  const [view, setView] = useState<{ from: number; to: number } | null>(null);   // the stretch of time on screen: the up/down scale fits it
  const spanRef = useRef({ tStart: 0, span: 0 });

  const model = useMemo(() => {
    if (points.length < 2) return null;
    const ptTs = points.map((p) => new Date(p.timestamp).getTime());
    const tEnd = ptTs[ptTs.length - 1];
    const evs = events.map((e) => ({ ts: new Date(e.timestamp).getTime(), type: e.type, amt: e.amountUsd })).filter((e) => e.ts <= tEnd && isFinite(e.ts)).sort((a, b) => a.ts - b.ts);
    const firstReading = estimated ? tEnd : ptTs[0];
    const tStart = Math.min(ptTs[0], evs.length ? evs[0].ts : Infinity);
    const span = Math.max(tEnd - tStart, 1);

    // put-in steps from every deposit / withdrawal, back to the first one
    const steps: { ts: number; cum: number }[] = [];
    let cum = 0;
    for (const e of evs) {
      cum += e.type === "deposit" ? e.amt : -e.amt;
      steps.push({ ts: e.ts, cum });
    }
    if (steps.length === 0) {
      const p0 = points[0];
      steps.push({ ts: ptTs[0], cum: p0.cumulativeDeposited - p0.cumulativeWithdrawn });
    }
    const putInAt = (ts: number) => {
      let v = steps[0].cum;
      for (const s of steps) { if (s.ts <= ts) v = s.cum; else break; }
      return v;
    };

    const values = points.map((p) => p.value);
    // the up/down scale fits the period you picked (not the whole history), so a small gap between worth and put-in is easy to see
    const fitDays = zoomDays ?? (PERIODS[periodIdx].days === 0 ? Math.max((tEnd - firstReading) / DAY, 1) : PERIODS[periodIdx].days);
    const fitFrom = view ? view.from : Math.max(tStart, tEnd - fitDays * DAY);
    const fitTo = view ? view.to : tEnd;
    const inView = (ts: number) => ts >= fitFrom && ts <= fitTo;
    const all = [putInAt(fitFrom), ...steps.filter((s) => inView(s.ts)).map((s) => s.cum),
                 ...(estimated ? [values[values.length - 1]] : values.filter((_, i) => inView(ptTs[i])))];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = Math.max((hi - lo) * 0.08, hi * 0.01, 1);
    const minV = lo - pad;
    const maxV = hi + pad;
    const yFor = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) - ((v - minV) / (maxV - minV || 1)) * (H - PAD.top - PAD.bottom);
    const xOf = (ts: number) => ((ts - tStart) / span) * W;

    let stepPath = `M ${xOf(steps[0].ts).toFixed(1)},${yFor(steps[0].cum).toFixed(1)}`;
    for (let i = 1; i < steps.length; i++) stepPath += ` L ${xOf(steps[i].ts).toFixed(1)},${yFor(steps[i - 1].cum).toFixed(1)} L ${xOf(steps[i].ts).toFixed(1)},${yFor(steps[i].cum).toFixed(1)}`;
    stepPath += ` L ${W},${yFor(steps[steps.length - 1].cum).toFixed(1)}`;

    const worthXs = points.map((_, i) => xOf(ptTs[i]));
    const line = `M ${worthXs.map((x, i) => `${x.toFixed(1)},${yFor(values[i]).toFixed(1)}`).join(" L ")}`;
    const area = `${line} L ${W},${H} L ${worthXs[0].toFixed(1)},${H} Z`;
    // days rebuilt from order history come first; the real readings take over from the first one that is not estimated
    const firstReal = points.findIndex((p) => !p.estimated);
    const nEst = firstReal < 0 ? points.length : firstReal;
    const pathOf = (from: number, to: number) => (to - from < 1 ? "" : `M ${worthXs.slice(from, to + 1).map((x, i) => `${x.toFixed(1)},${yFor(values[from + i]).toFixed(1)}`).join(" L ")}`);
    const estLine = estimated ? "" : pathOf(0, Math.min(nEst, points.length - 1));
    const realLine = estimated ? line : pathOf(Math.max(nEst - 1, 0), points.length - 1);

    const last = points[points.length - 1];
    const result = last.value + last.cumulativeWithdrawn - last.cumulativeDeposited;

    const byDay = new Map<string, { ts: number; dep: number; wd: number }>();
    for (const e of evs) {
      const key = new Date(e.ts).toDateString();
      const cur = byDay.get(key) ?? { ts: e.ts, dep: 0, wd: 0 };
      if (e.type === "deposit") cur.dep += e.amt; else cur.wd += e.amt;
      byDay.set(key, cur);
    }

    return { ptTs, tStart, tEnd, span, firstReading, putInAt, values, minV, maxV, yFor, stepPath, line, area, estLine, realLine, nEst, result, byDay,
             readingDays: Math.max((tEnd - firstReading) / DAY, 1), totalDays: span / DAY };
  }, [points, events, estimated, periodIdx, zoomDays, view]);

  // how wide the scrolling chart is: the chosen number of days fills one screen
  spanRef.current = model ? { tStart: model.tStart, span: model.span } : spanRef.current;
  const updateView = () => {
    const el = scroller.current;
    const m = spanRef.current;
    if (!el || !m.span || !el.scrollWidth) return;
    const win = (el.clientWidth / el.scrollWidth) * m.span;
    const q = Math.max(win / 20, 1);                      // small steps so the scale does not jitter on every pixel
    const from = Math.round((m.tStart + (el.scrollLeft / el.scrollWidth) * m.span) / q) * q;
    const to = from + Math.round(win / q) * q;
    setView((v) => (v && v.from === from && v.to === to ? v : { from, to }));
  };
  const windowDays = model ? Math.max(zoomDays ?? (PERIODS[periodIdx].days === 0 ? model.readingDays : PERIODS[periodIdx].days), model.totalDays / MAX_ZOOM) : 1;
  zoomRef.current = windowDays;
  const widthPct = model ? Math.max(100, (model.totalDays / windowDays) * 100) : 100;

  // start at "now" (the right end) when the zoom changes or the chart first appears
  const hasModel = !!model;
  useEffect(() => {
    const el = scroller.current;
    if (el) { el.scrollLeft = el.scrollWidth; fromRight.current = 0; updateView(); }
  }, [periodIdx, hasModel]);

  // live data nudges the chart's width every few seconds: keep the same spot (measured from "now") instead of jumping back
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (anchor.current) el.scrollLeft = Math.max(0, anchor.current.frac * el.scrollWidth - anchor.current.cx);
    else el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth - fromRight.current);
    updateView();
  }, [widthPct]);

  // two-finger pinch: fingers apart = zoom in (fewer days on screen), together = zoom out
  const totalDaysRef = useRef(1);
  totalDaysRef.current = model ? model.totalDays : 1;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let startDist = 0, startDays = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { startDist = dist(e.touches); startDays = zoomRef.current; }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const next = Math.min(totalDaysRef.current, Math.max(totalDaysRef.current / MAX_ZOOM, startDays * (startDist / dist(e.touches))));
      const rect = el.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      anchor.current = { frac: (el.scrollLeft + cx) / el.scrollWidth, cx };
      setHover(null);
      setZoomDays(next);
    };
    const onEnd = () => { startDist = 0; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); };
  }, [hasModel]);

  const ticks = useMemo(() => {
    if (!model) return [];
    const step = TICK_STEPS.find((s) => s >= windowDays / 4) ?? 365;
    const out: { x: number; label: string }[] = [];
    const first = new Date(model.tStart);
    first.setHours(0, 0, 0, 0);
    const withYear = model.totalDays > 365;
    // a tick closer than about 40px to "Now" would sit under that label
    const pxPerPct = ((scroller.current?.clientWidth ?? 340) * (widthPct / 100)) / 100;
    for (let t = first.getTime() + DAY; t <= model.tEnd && out.length < 80; t += step * DAY) {
      const x = ((t - model.tStart) / model.span) * 100;
      if ((100 - x) * pxPerPct < 40 || x * pxPerPct < 20) continue;
      out.push({ x, label: dayLabel(t, withYear) });
    }
    return out;
  }, [model, windowDays, widthPct]);

  const tabs = (
    <div className="flex items-center justify-end gap-1 mb-1.5">
      {PERIODS.map((p, i) => (
        <button key={p.label} onClick={() => { setPeriodIdx(i); setZoomDays(null); anchor.current = null; setHover(null); }}
          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-colors ${i === periodIdx && zoomDays === null ? "bg-blue-500/15 text-blue-400" : "text-slate-600 hover:text-slate-400"}`}>
          {p.label}
        </button>
      ))}
    </div>
  );

  if (!model) return <div className="text-center py-4 text-slate-500 text-[11px]">Not enough history yet to chart.</div>;

  const { ptTs, tStart, span, firstReading, putInAt, values, minV, maxV, yFor, stepPath, line, area, estLine, realLine, nEst, result, byDay, tEnd } = model;
  const up = result >= 0;
  const color = up ? "#34d399" : "#f87171";
  const pctOf = (ts: number) => ((ts - tStart) / span) * 100;
  const gapPct = (13 * 100) / widthPct;                       // 13% of one screen, in chart-width percent: labels closer than this are skipped

  // deposit / withdrawal markers, biggest first so the labelled ones are the important ones
  const labelled: number[] = [];
  const markers = [...byDay.values()]
    .map((m) => ({ ...m, xPct: Math.min(99.5, Math.max(0.5, pctOf(m.ts))) }))
    .sort((a, b) => Math.max(b.dep, b.wd) - Math.max(a.dep, a.wd))
    .map((m) => {
      const show = labelled.every((x) => Math.abs(x - m.xPct) >= gapPct);
      if (show) labelled.push(m.xPct);
      return { ...m, show };
    });

  const showAt = (clientX: number) => {
    const r = inner.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const ts = tStart + frac * span;
    let reading: number | null = null;
    if (!estimated && ts >= firstReading - DAY / 24) {
      reading = 0;
      for (let i = 1; i < ptTs.length; i++) if (Math.abs(ptTs[i] - ts) < Math.abs(ptTs[reading] - ts)) reading = i;
    }
    setHover({ ts: reading !== null ? ptTs[reading] : ts, reading, px: frac * r.width });
  };

  const hoverTs = hover ? hover.ts : 0;
  const dayTot = hover ? byDay.get(new Date(hoverTs).toDateString()) : undefined;
  const innerW = inner.current?.getBoundingClientRect().width ?? 0;
  const tipLeft = hover ? Math.min(Math.max(0, hover.px - 75), Math.max(0, innerW - 160)) : 0;
  const notRecordedPct = pctOf(firstReading);
  const scrollable = widthPct > 105;

  return (
    <div>
      {tabs}
      <div className="relative">
        <div ref={scroller} className="overflow-x-auto overflow-y-hidden" style={{ touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
          onScroll={(e) => { const el = e.currentTarget; anchor.current = null; fromRight.current = el.scrollWidth - el.clientWidth - el.scrollLeft; setHover((h) => (h ? null : h)); updateView(); }}>
          <div ref={inner} className="relative select-none" style={{ width: `${widthPct}%`, minWidth: "100%" }}
            onPointerMove={(e) => { if (e.pointerType === "mouse") showAt(e.clientX); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
            onClick={(e) => showAt(e.clientX)}>
            <div className="relative" style={{ height: H }}>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: H }} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.30" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
                {!estimated && notRecordedPct > 0.5 && <rect x="0" y="0" width={(notRecordedPct / 100) * W} height={H} fill="rgba(255,255,255,0.03)" />}
                {!estimated && <path d={area} fill="url(#growthGrad)" />}
                <path d={stepPath} fill="none" stroke={estimated ? "rgba(148,163,184,0.95)" : "rgba(148,163,184,0.75)"} strokeWidth={estimated ? 1.6 : 1.2} strokeDasharray={estimated ? undefined : "4 3"} vectorEffect="non-scaling-stroke" />
                {estLine && <path d={estLine} fill="none" stroke={color} strokeOpacity="0.6" strokeWidth="1.6" strokeDasharray="2 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                {!estimated && <path d={realLine} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                {hover && <line x1={((hoverTs - tStart) / span) * W} x2={((hoverTs - tStart) / span) * W} y1="0" y2={H} stroke="rgba(255,255,255,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              </svg>

              {/* where worth stops being known */}
              {!estimated && notRecordedPct * widthPct / 100 > 25 && (
                <div className="absolute top-1 left-0 flex justify-end pointer-events-none" style={{ width: `${notRecordedPct}%` }}>
                  <span className="sticky right-1.5 text-[9px] text-slate-500 whitespace-nowrap bg-[#0f172a]/80 rounded px-1">
                    {nEst > 0 ? `nothing known before ${dayLabel(firstReading)}, only what you put in` : `worth wasn't recorded before ${dayLabel(firstReading)}: only what you put in is known`} ◀
                  </span>
                </div>
              )}

              {/* deposit / withdrawal markers */}
              {markers.map((m) => (
                <span key={m.ts} className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center leading-none pointer-events-none"
                  style={{ left: `${m.xPct}%`, color: m.dep >= m.wd ? "#4ade80" : "#fbbf24" }}>
                  {m.show && <span className="text-[8px] font-mono mb-0.5 whitespace-nowrap">{m.dep >= m.wd ? "+" : "−"}{compact(Math.max(m.dep, m.wd))}</span>}
                  <span className="text-[9px]">{m.dep >= m.wd ? "▲" : "▼"}</span>
                </span>
              ))}

              {/* today's real total: the only point we truly know until readings are recorded */}
              {estimated && <span className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none" style={{ left: "99.6%", top: `${(yFor(values[values.length - 1]) / H) * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }} />}

              {/* hover / tap readout */}
              {hover && (
                <div className="absolute top-1 z-10 rounded-lg px-2 py-1.5 text-[10px] font-mono leading-snug pointer-events-none" style={{ left: tipLeft, width: 150, background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <div className="text-slate-400">{hover.reading !== null ? dayTime(hoverTs) : dayLabel(hoverTs, true)}</div>
                  {dayTot && (
                    <>
                      {dayTot.dep > 0 && <div className="text-green-400">▲ Deposited {usd(dayTot.dep)} that day</div>}
                      {dayTot.wd > 0 && <div className="text-amber-400">▼ Withdrew {usd(dayTot.wd)} that day</div>}
                    </>
                  )}
                  {hover.reading === null || (estimated && hover.reading < points.length - 1) ? (
                    <div className="text-slate-100">Put in {usd(putInAt(hoverTs))}<div className="text-slate-500">(worth not recorded)</div></div>
                  ) : (
                    <>
                      <div className="text-slate-100">Worth {usd(values[hover.reading])}{hover.reading < nEst && <span className="text-slate-500"> (estimated)</span>}</div>
                      <div className="text-slate-400">Put in {usd(putInAt(ptTs[hover.reading]))}</div>
                      <div style={{ color: values[hover.reading] - putInAt(ptTs[hover.reading]) >= 0 ? "#4ade80" : "#f87171" }}>Result {usdSigned(values[hover.reading] - putInAt(ptTs[hover.reading]))}</div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* dates: they scroll with the chart */}
            <div className="relative h-4 text-[9px] text-slate-600">
              {ticks.map((t) => (
                <span key={t.x} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap" style={{ left: `${t.x}%` }}>{t.label}</span>
              ))}
              <span className="absolute right-0 top-0.5">Now</span>
            </div>
          </div>
        </div>
        {/* scale labels stay put while the chart scrolls */}
        <span className="absolute left-1 top-0 text-[9px] font-mono text-slate-500 pointer-events-none">{usd(maxV)}</span>
        <span className="absolute left-1 text-[9px] font-mono text-slate-500 pointer-events-none" style={{ top: H - 38 }}>{usd(minV)}</span>
      </div>

      {scrollable && <div className="text-[9px] text-slate-600 text-center mt-0.5">◀ swipe sideways for earlier history, pinch to zoom · {dayLabel(tStart, true)} to {dayLabel(tEnd, true)}</div>}
      <div className="flex items-center justify-between text-[10px] mt-1.5 px-0.5">
        <span className="text-slate-500">
          {estimated
            ? <><span className="text-slate-400">━</span> Put in (what you deposited) &nbsp;<span style={{ color }}>●</span> worth now &nbsp;<span className="text-green-400">▲</span> deposit &nbsp;<span className="text-amber-400">▼</span> withdrawal</>
            : <><span style={{ color }}>━</span> Worth{nEst > 0 && <span className="text-slate-500"> (dotted = est.)</span>} &nbsp;<span className="text-slate-400">┅</span> Put in &nbsp;<span className="text-green-400">▲</span> deposit &nbsp;<span className="text-amber-400">▼</span> withdrawal</>}
        </span>
        <span className={`font-bold font-mono ${up ? "text-green-400" : "text-red-400"}`}>Result {usdSigned(result)}</span>
      </div>
    </div>
  );
};

export default GrowthAreaChart;
