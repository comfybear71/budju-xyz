// ============================================================
// StrategySpotlight — Rotating "what's hot" across all strategies
// Fetches live candle data, runs every strategy detector from the
// bot (trend following, mean reversion, momentum, BB squeeze,
// keltner, S/R reversal, scalping, grid), scores opportunities,
// and auto-rotates through the hottest ones.
// Display only — no trades executed.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { CODE_TO_BINANCE } from "@lib/services/binanceWs";

// ── Types ───────────────────────────────────────────────────

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface StrategyOpportunity {
  strategy: string;          // e.g. "BB Squeeze"
  strategyKey: string;       // e.g. "bb_squeeze"
  market: string;            // e.g. "BTC-PERP"
  base: string;              // e.g. "BTC"
  direction: "long" | "short";
  hotness: number;           // 0-100 score
  confidence: number;        // 0-100
  headline: string;          // e.g. "Squeeze releasing — breakout imminent"
  details: string[];         // Bullet points of indicator data
  entryZone: string;         // e.g. "$70,500 - $70,700"
  leverage: string;          // e.g. "4x"
  color: string;             // Strategy accent color
  icon: string;              // Emoji icon
}

// ── Markets ─────────────────────────────────────────────────

const MARKETS = [
  { symbol: "SOL-PERP", base: "SOL" },
  { symbol: "BTC-PERP", base: "BTC" },
  { symbol: "ETH-PERP", base: "ETH" },
  { symbol: "LINK-PERP", base: "LINK" },
  { symbol: "SUI-PERP", base: "SUI" },
  { symbol: "AVAX-PERP", base: "AVAX" },
  { symbol: "BONK-PERP", base: "BONK" },
  { symbol: "WIF-PERP", base: "WIF" },
  { symbol: "DOGE-PERP", base: "DOGE" },
  { symbol: "JUP-PERP", base: "JUP" },
];

// ── Fetch klines ────────────────────────────────────────────

async function fetchKlines(binanceSymbol: string): Promise<CandleData[]> {
  const symbol = binanceSymbol.toUpperCase();
  const urls = [
    `/api/klines?symbol=${symbol}&interval=1m&limit=120`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=120`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((k: number[]) => ({
        time: Math.floor(k[0] / 1000),
        open: +k[1],
        high: +k[2],
        low: +k[3],
        close: +k[4],
      }));
    } catch { continue; }
  }
  return [];
}

// ── Indicator Helpers (mirroring backend) ───────────────────

function emaCalc(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const vals = [seed];
  for (let i = period; i < data.length; i++) {
    vals.push(data[i] * k + vals[vals.length - 1] * (1 - k));
  }
  return vals;
}

function smaCalc(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const vals: number[] = [];
  for (let i = 0; i <= data.length - period; i++) {
    vals.push(data.slice(i, i + period).reduce((a, b) => a + b, 0) / period);
  }
  return vals;
}

function rsiCalc(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];
  const deltas = prices.slice(1).map((p, i) => p - prices[i]);
  const gains = deltas.map(d => Math.max(d, 0));
  const losses = deltas.map(d => Math.abs(Math.min(d, 0)));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const vals: number[] = [];
  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    vals.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return vals;
}

function atrCalc(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];
  const trs = prices.slice(1).map((p, i) => Math.abs(p - prices[i]));
  const scale = Math.sqrt(60); // Scale 1m ATR → ~1hr ATR (matches backend)
  const vals = [trs.slice(0, period).reduce((a, b) => a + b, 0) / period * scale];
  for (let i = period; i < trs.length; i++) {
    const raw = (vals[vals.length - 1] / scale * (period - 1) + trs[i]) / period;
    vals.push(raw * scale);
  }
  return vals;
}

function bollingerBands(prices: number[], period: number = 20, numStd: number = 2.0) {
  if (prices.length < period) return { upper: [] as number[], middle: [] as number[], lower: [] as number[] };
  const middle = smaCalc(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < middle.length; i++) {
    const window = prices.slice(i, i + period);
    const mean = middle[i];
    const std = Math.sqrt(window.reduce((s, p) => s + (p - mean) ** 2, 0) / period);
    upper.push(mean + numStd * std);
    lower.push(mean - numStd * std);
  }
  return { upper, middle, lower };
}

function keltnerChannel(prices: number[], emaPeriod: number = 20, atrPeriod: number = 14, atrMult: number = 1.5) {
  const emaVals = emaCalc(prices, emaPeriod);
  const atrVals = atrCalc(prices, atrPeriod);
  if (!emaVals.length || !atrVals.length) return { upper: [] as number[], middle: [] as number[], lower: [] as number[] };
  const minLen = Math.min(emaVals.length, atrVals.length);
  const ema = emaVals.slice(-minLen);
  const atr = atrVals.slice(-minLen);
  return {
    upper: ema.map((e, i) => e + atr[i] * atrMult),
    middle: ema,
    lower: ema.map((e, i) => e - atr[i] * atrMult),
  };
}

// ── Price Formatting ────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

// ── Strategy Detectors ──────────────────────────────────────
// Each returns an opportunity if conditions are met, null otherwise.

function detectTrendFollowing(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  const fastEma = emaCalc(closes, 9);
  const slowEma = emaCalc(closes, 21);
  const rsiVals = rsiCalc(closes, 14);
  const atrVals = atrCalc(closes, 14);
  if (fastEma.length < 2 || slowEma.length < 2 || !rsiVals.length || !atrVals.length) return null;

  const cf = fastEma[fastEma.length - 1], pf = fastEma[fastEma.length - 2];
  const cs = slowEma[slowEma.length - 1], ps = slowEma[slowEma.length - 2];
  const currRsi = rsiVals[rsiVals.length - 1];
  const currAtr = atrVals[atrVals.length - 1];

  // How close to crossover? (proximity score even if not crossed yet)
  const gap = (cf - cs) / price * 100;
  const prevGap = (pf - ps) / price * 100;
  const crossingUp = pf <= ps && cf > cs;
  const crossingDown = pf >= ps && cf < cs;
  const nearCrossUp = !crossingUp && gap > -0.02 && gap < 0.05 && gap > prevGap;
  const nearCrossDown = !crossingDown && gap < 0.02 && gap > -0.05 && gap < prevGap;

  if (!crossingUp && !crossingDown && !nearCrossUp && !nearCrossDown) return null;
  if (currRsi < 25 || currRsi > 75) return null; // Too extreme for trend

  const isBull = crossingUp || nearCrossUp;
  const direction = isBull ? "long" as const : "short" as const;
  const crossed = crossingUp || crossingDown;

  const entryLow = isBull ? price : price - currAtr * 0.5;
  const entryHigh = isBull ? price + currAtr * 0.5 : price;

  const hotness = crossed
    ? 75 + Math.min(Math.abs(currRsi - 50) * 0.4, 20)
    : 40 + Math.min(Math.abs(gap) * 2000, 30);

  return {
    strategy: "Trend Following",
    strategyKey: "trend_following",
    market: symbol, base, direction,
    hotness: Math.round(hotness),
    confidence: Math.round(50 + Math.abs(currRsi - 50) * 0.6),
    headline: crossed
      ? `EMA 9/21 ${isBull ? "bullish" : "bearish"} crossover confirmed`
      : `EMA crossover ${isBull ? "bullish" : "bearish"} — approaching`,
    details: [
      `EMA9: ${fmtPrice(cf)} ${isBull ? ">" : "<"} EMA21: ${fmtPrice(cs)}`,
      `RSI: ${currRsi.toFixed(1)} (${currRsi > 60 ? "bullish" : currRsi < 40 ? "bearish" : "neutral"})`,
      `ATR: ${fmtPrice(currAtr)}`,
    ],
    entryZone: `${fmtPrice(entryLow)} - ${fmtPrice(entryHigh)}`,
    leverage: "5x",
    color: "blue",
    icon: "📈",
  };
}

function detectMeanReversion(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  const bb = bollingerBands(closes, 20, 2.0);
  const rsiVals = rsiCalc(closes, 14);
  const atrVals = atrCalc(closes, 14);
  if (!bb.upper.length || !rsiVals.length || !atrVals.length) return null;

  const currUpper = bb.upper[bb.upper.length - 1];
  const currLower = bb.lower[bb.lower.length - 1];
  const currMiddle = bb.middle[bb.middle.length - 1];
  const currRsi = rsiVals[rsiVals.length - 1];
  const currAtr = atrVals[atrVals.length - 1];
  const bbWidth = (currUpper - currLower) / currMiddle * 100;

  // Near lower band + RSI oversold → long
  const distToLower = (price - currLower) / price * 100;
  const distToUpper = (currUpper - price) / price * 100;

  const atLower = distToLower < 0.15 && currRsi < 35;
  const nearLower = distToLower < 0.4 && currRsi < 40;
  const atUpper = distToUpper < 0.15 && currRsi > 65;
  const nearUpper = distToUpper < 0.4 && currRsi > 60;

  if (!atLower && !nearLower && !atUpper && !nearUpper) return null;

  const isBull = atLower || nearLower;
  const isStrong = atLower || atUpper;

  const hotness = isStrong
    ? 80 + Math.min(Math.abs(currRsi - 50) * 0.3, 15)
    : 45 + Math.min(Math.abs(currRsi - 50) * 0.5, 25);

  return {
    strategy: "Mean Reversion",
    strategyKey: "mean_reversion",
    market: symbol, base,
    direction: isBull ? "long" : "short",
    hotness: Math.round(hotness),
    confidence: Math.round(40 + Math.abs(currRsi - 50) * 0.8),
    headline: isStrong
      ? `Price at BB ${isBull ? "lower" : "upper"} band + RSI ${isBull ? "oversold" : "overbought"}`
      : `Approaching BB ${isBull ? "lower" : "upper"} band — reversal setup forming`,
    details: [
      `BB: ${fmtPrice(currLower)} / ${fmtPrice(currMiddle)} / ${fmtPrice(currUpper)}`,
      `RSI: ${currRsi.toFixed(1)} (${currRsi < 30 ? "oversold" : currRsi > 70 ? "overbought" : "approaching"})`,
      `BB Width: ${bbWidth.toFixed(2)}% • Target: ${fmtPrice(currMiddle)}`,
    ],
    entryZone: isBull
      ? `${fmtPrice(currLower)} - ${fmtPrice(currLower + currAtr * 0.3)}`
      : `${fmtPrice(currUpper - currAtr * 0.3)} - ${fmtPrice(currUpper)}`,
    leverage: "3x",
    color: "purple",
    icon: "🔄",
  };
}

function detectMomentumBreakout(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  if (closes.length < 25) return null;
  const rsiVals = rsiCalc(closes, 14);
  const atrVals = atrCalc(closes, 14);
  if (!rsiVals.length || !atrVals.length) return null;

  const lookback = 20;
  const recentPrices = closes.slice(-(lookback + 1), -1);
  const recentHigh = Math.max(...recentPrices);
  const recentLow = Math.min(...recentPrices);
  const prevPrice = closes[closes.length - 2];
  const currRsi = rsiVals[rsiVals.length - 1];
  const currAtr = atrVals[atrVals.length - 1];

  // Average range
  const ranges: number[] = [];
  for (let i = closes.length - lookback - 1; i < closes.length - 1; i++) {
    ranges.push(Math.abs(closes[i + 1] - closes[i]));
  }
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const currRange = Math.abs(price - prevPrice);

  // Breakout above recent high
  const breakUp = price > recentHigh && currRange > avgRange * 1.2 && currRsi > 50;
  const breakDown = price < recentLow && currRange > avgRange * 1.2 && currRsi < 50;
  // Near breakout
  const nearBreakUp = !breakUp && (recentHigh - price) / price < 0.002 && currRsi > 48;
  const nearBreakDown = !breakDown && (price - recentLow) / price < 0.002 && currRsi < 52;

  if (!breakUp && !breakDown && !nearBreakUp && !nearBreakDown) return null;

  const isBull = breakUp || nearBreakUp;
  const confirmed = breakUp || breakDown;

  const hotness = confirmed
    ? 85 + Math.min(currRange / avgRange * 5, 10)
    : 50 + Math.min((1 - Math.abs(price - (isBull ? recentHigh : recentLow)) / price) * 200, 30);

  return {
    strategy: "Momentum Breakout",
    strategyKey: "momentum",
    market: symbol, base,
    direction: isBull ? "long" : "short",
    hotness: Math.round(Math.min(hotness, 95)),
    confidence: Math.round(confirmed ? 70 + currRange / avgRange * 10 : 45),
    headline: confirmed
      ? `${isBull ? "Bullish" : "Bearish"} breakout — ${(currRange / avgRange).toFixed(1)}x avg range`
      : `${isBull ? "Resistance" : "Support"} test — breakout imminent`,
    details: [
      `Range high: ${fmtPrice(recentHigh)} • Low: ${fmtPrice(recentLow)}`,
      `Move: ${(currRange / avgRange).toFixed(1)}x avg range`,
      `RSI: ${currRsi.toFixed(1)} confirming ${isBull ? "bullish" : "bearish"}`,
    ],
    entryZone: isBull
      ? `${fmtPrice(recentHigh)} - ${fmtPrice(recentHigh + currAtr * 0.5)}`
      : `${fmtPrice(recentLow - currAtr * 0.5)} - ${fmtPrice(recentLow)}`,
    leverage: "5x",
    color: "orange",
    icon: "🚀",
  };
}

function detectBBSqueeze(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  if (closes.length < 40) return null;

  const bb = bollingerBands(closes, 20, 2.0);
  const kc = keltnerChannel(closes, 20, 14, 1.5);
  const rsiVals = rsiCalc(closes, 14);
  const smaVals = smaCalc(closes, 20);

  if (!bb.upper.length || !kc.upper.length || !rsiVals.length || !smaVals.length) return null;

  // Align arrays
  const minLen = Math.min(bb.upper.length, kc.upper.length, smaVals.length);

  // Check squeeze state for last N bars
  const squeezeOn: boolean[] = [];
  const momentum: number[] = [];
  for (let i = 0; i < minLen; i++) {
    const bi = bb.upper.length - minLen + i;
    const ki = kc.upper.length - minLen + i;
    const si = smaVals.length - minLen + i;
    const pi = closes.length - minLen + i;
    squeezeOn.push(bb.upper[bi] < kc.upper[ki] && bb.lower[bi] > kc.lower[ki]);
    momentum.push(closes[pi] - smaVals[si]);
  }

  // Count consecutive squeeze bars at end
  let consecutiveSqueeze = 0;
  for (let i = squeezeOn.length - 1; i >= 0; i--) {
    if (squeezeOn[i]) consecutiveSqueeze++;
    else break;
  }

  // Check for squeeze release (was squeezing, now released)
  let barsSinceRelease: number | null = null;
  for (let i = squeezeOn.length - 1; i > 0; i--) {
    if (!squeezeOn[i] && squeezeOn[i - 1]) {
      barsSinceRelease = squeezeOn.length - 1 - i;
      break;
    }
  }

  const currMom = momentum[momentum.length - 1];
  const prevMom = momentum.length > 1 ? momentum[momentum.length - 2] : 0;
  const currRsi = rsiVals[rsiVals.length - 1];
  const momRising = currMom > prevMom;

  // Active squeeze (building pressure)
  const isSqueezing = consecutiveSqueeze >= 5;
  // Just released (within 3 bars)
  const justReleased = barsSinceRelease !== null && barsSinceRelease <= 3;

  if (!isSqueezing && !justReleased) return null;

  const isBull = currMom > 0 && (momRising || currRsi > 50);
  const direction = isBull ? "long" as const : "short" as const;

  const atrVals = atrCalc(closes, 14);
  const currAtr = atrVals.length ? atrVals[atrVals.length - 1] : 0;

  const hotness = justReleased
    ? 90 + Math.min(consecutiveSqueeze, 5)
    : 55 + Math.min(consecutiveSqueeze * 3, 30);

  return {
    strategy: "BB Squeeze",
    strategyKey: "bb_squeeze",
    market: symbol, base, direction,
    hotness: Math.round(Math.min(hotness, 95)),
    confidence: Math.round(justReleased ? 75 + Math.min(consecutiveSqueeze * 2, 20) : 40 + consecutiveSqueeze * 3),
    headline: justReleased
      ? `Squeeze RELEASED — ${isBull ? "bullish" : "bearish"} breakout firing`
      : `Squeeze building (${consecutiveSqueeze} bars) — pressure mounting`,
    details: [
      justReleased ? `Released ${barsSinceRelease} bar${barsSinceRelease === 1 ? "" : "s"} ago` : `${consecutiveSqueeze} bars compressed`,
      `Momentum: ${currMom > 0 ? "+" : ""}${(currMom / price * 100).toFixed(3)}% (${momRising ? "rising" : "falling"})`,
      `RSI: ${currRsi.toFixed(1)} • BB inside Keltner Channel`,
    ],
    entryZone: isBull
      ? `${fmtPrice(price)} - ${fmtPrice(price + currAtr * 0.3)}`
      : `${fmtPrice(price - currAtr * 0.3)} - ${fmtPrice(price)}`,
    leverage: "4x",
    color: "yellow",
    icon: "💥",
  };
}

function detectKeltner(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  if (closes.length < 30) return null;

  const kc = keltnerChannel(closes, 20, 14, 1.5);
  const rsiVals = rsiCalc(closes, 14);
  const atrVals = atrCalc(closes, 14);
  if (!kc.upper.length || !rsiVals.length || !atrVals.length) return null;

  const currUpper = kc.upper[kc.upper.length - 1];
  const currMiddle = kc.middle[kc.middle.length - 1];
  const currLower = kc.lower[kc.lower.length - 1];
  const currRsi = rsiVals[rsiVals.length - 1];
  const currAtr = atrVals[atrVals.length - 1];

  const distToLower = (price - currLower) / price * 100;
  const distToUpper = (currUpper - price) / price * 100;

  // Mean reversion: price at channel boundary + RSI extreme
  const atLower = distToLower < 0.2 && currRsi < 35;
  const nearLower = distToLower < 0.5 && currRsi < 40;
  const atUpper = distToUpper < 0.2 && currRsi > 65;
  const nearUpper = distToUpper < 0.5 && currRsi > 60;

  if (!atLower && !nearLower && !atUpper && !nearUpper) return null;

  const isBull = atLower || nearLower;
  const isStrong = atLower || atUpper;

  return {
    strategy: "Keltner Channel",
    strategyKey: "keltner",
    market: symbol, base,
    direction: isBull ? "long" : "short",
    hotness: Math.round(isStrong ? 75 + Math.abs(currRsi - 50) * 0.3 : 45 + Math.abs(currRsi - 50) * 0.4),
    confidence: Math.round(40 + Math.abs(currRsi - 50) * 0.7),
    headline: isStrong
      ? `Price at KC ${isBull ? "lower" : "upper"} channel — bounce setup`
      : `Approaching KC ${isBull ? "support" : "resistance"}`,
    details: [
      `KC: ${fmtPrice(currLower)} / ${fmtPrice(currMiddle)} / ${fmtPrice(currUpper)}`,
      `RSI: ${currRsi.toFixed(1)} (${currRsi < 30 ? "oversold" : currRsi > 70 ? "overbought" : "approaching extreme"})`,
      `Target: ${fmtPrice(currMiddle)} (channel midline)`,
    ],
    entryZone: isBull
      ? `${fmtPrice(currLower)} - ${fmtPrice(currLower + currAtr * 0.3)}`
      : `${fmtPrice(currUpper - currAtr * 0.3)} - ${fmtPrice(currUpper)}`,
    leverage: "3x",
    color: "cyan",
    icon: "📊",
  };
}

function detectScalping(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  const rsiVals = rsiCalc(closes, 7); // Short RSI for scalping
  const fastEma = emaCalc(closes, 5);
  const atrVals = atrCalc(closes, 10);
  if (!rsiVals.length || fastEma.length < 2 || !atrVals.length) return null;

  const currRsi = rsiVals[rsiVals.length - 1];
  const currEma = fastEma[fastEma.length - 1];
  const prevEma = fastEma[fastEma.length - 2];
  const emaRising = currEma > prevEma;
  const currAtr = atrVals[atrVals.length - 1];

  // RSI bounce from extreme + EMA direction
  const longSetup = currRsi < 30 && emaRising;
  const shortSetup = currRsi > 70 && !emaRising;
  const nearLong = currRsi < 35 && emaRising;
  const nearShort = currRsi > 65 && !emaRising;

  if (!longSetup && !shortSetup && !nearLong && !nearShort) return null;

  const isBull = longSetup || nearLong;
  const isStrong = longSetup || shortSetup;

  return {
    strategy: "Scalping",
    strategyKey: "scalping",
    market: symbol, base,
    direction: isBull ? "long" : "short",
    hotness: Math.round(isStrong ? 70 + Math.abs(currRsi - 50) * 0.4 : 40 + Math.abs(currRsi - 50) * 0.3),
    confidence: Math.round(35 + Math.abs(currRsi - 50) * 0.6),
    headline: isStrong
      ? `RSI ${isBull ? "oversold bounce" : "overbought fade"} — quick ${isBull ? "long" : "short"}`
      : `RSI approaching ${isBull ? "oversold" : "overbought"} — scalp forming`,
    details: [
      `RSI(7): ${currRsi.toFixed(1)} (${currRsi < 30 ? "oversold" : currRsi > 70 ? "overbought" : "approaching"})`,
      `EMA(5): ${emaRising ? "rising" : "falling"}`,
      `Quick target: ${fmtPrice(currAtr * 0.5)} move`,
    ],
    entryZone: isBull
      ? `${fmtPrice(price - currAtr * 0.2)} - ${fmtPrice(price)}`
      : `${fmtPrice(price)} - ${fmtPrice(price + currAtr * 0.2)}`,
    leverage: "3x",
    color: "pink",
    icon: "⚡",
  };
}

function detectSRReversal(candles: CandleData[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  if (candles.length < 60) return null;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  // Find swing highs/lows (resistance/support)
  const swingWindow = 5;
  const resistanceLevels: number[] = [];
  const supportLevels: number[] = [];

  for (let i = swingWindow; i < highs.length - swingWindow; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= swingWindow; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) resistanceLevels.push(highs[i]);
    if (isLow) supportLevels.push(lows[i]);
  }

  if (!resistanceLevels.length && !supportLevels.length) return null;

  // Cluster nearby levels (within 0.3%)
  const clusterLevels = (levels: number[]): { price: number; touches: number }[] => {
    const clusters: { price: number; touches: number }[] = [];
    for (const level of levels) {
      const match = clusters.find(c => Math.abs(c.price - level) / c.price < 0.003);
      if (match) {
        match.price = (match.price * match.touches + level) / (match.touches + 1);
        match.touches++;
      } else {
        clusters.push({ price: level, touches: 1 });
      }
    }
    return clusters.filter(c => c.touches >= 2).sort((a, b) => b.touches - a.touches);
  };

  const supports = clusterLevels(supportLevels);
  const resistances = clusterLevels(resistanceLevels);

  const rsiVals = rsiCalc(closes, 14);
  const atrVals = atrCalc(closes, 14);
  if (!rsiVals.length || !atrVals.length) return null;

  const currRsi = rsiVals[rsiVals.length - 1];
  const currAtr = atrVals[atrVals.length - 1];

  // Check if price is near a support level
  for (const s of supports) {
    const dist = (price - s.price) / price * 100;
    if (dist > -0.3 && dist < 0.5 && currRsi < 40) {
      return {
        strategy: "S/R Reversal",
        strategyKey: "sr_reversal",
        market: symbol, base,
        direction: "long",
        hotness: Math.round(60 + s.touches * 8 + (35 - currRsi) * 0.5),
        confidence: Math.round(40 + s.touches * 10 + (40 - currRsi) * 0.3),
        headline: `Support bounce at ${fmtPrice(s.price)} (${s.touches} touches)`,
        details: [
          `Support: ${fmtPrice(s.price)} tested ${s.touches}x`,
          `RSI: ${currRsi.toFixed(1)} (${currRsi < 35 ? "oversold — confirms" : "approaching oversold"})`,
          `Distance: ${Math.abs(dist).toFixed(2)}% from level`,
        ],
        entryZone: `${fmtPrice(s.price)} - ${fmtPrice(s.price + currAtr * 0.3)}`,
        leverage: "3x",
        color: "emerald",
        icon: "🛡️",
      };
    }
  }

  // Check if price is near a resistance level
  for (const r of resistances) {
    const dist = (r.price - price) / price * 100;
    if (dist > -0.3 && dist < 0.5 && currRsi > 60) {
      return {
        strategy: "S/R Reversal",
        strategyKey: "sr_reversal",
        market: symbol, base,
        direction: "short",
        hotness: Math.round(60 + r.touches * 8 + (currRsi - 65) * 0.5),
        confidence: Math.round(40 + r.touches * 10 + (currRsi - 60) * 0.3),
        headline: `Resistance rejection at ${fmtPrice(r.price)} (${r.touches} touches)`,
        details: [
          `Resistance: ${fmtPrice(r.price)} tested ${r.touches}x`,
          `RSI: ${currRsi.toFixed(1)} (${currRsi > 65 ? "overbought — confirms" : "approaching overbought"})`,
          `Distance: ${Math.abs(dist).toFixed(2)}% from level`,
        ],
        entryZone: `${fmtPrice(r.price - currAtr * 0.3)} - ${fmtPrice(r.price)}`,
        leverage: "3x",
        color: "emerald",
        icon: "🛡️",
      };
    }
  }

  return null;
}

function detectGridOpportunity(closes: number[], price: number, base: string, symbol: string): StrategyOpportunity | null {
  if (closes.length < 30) return null;

  const atrVals = atrCalc(closes, 14);
  if (!atrVals.length) return null;

  // Detect range-bound market (low directional movement)
  const lookback = 20;
  const recent = closes.slice(-lookback);
  const high = Math.max(...recent);
  const low = Math.min(...recent);
  const range = (high - low) / price * 100;

  // Also check if trend is flat (low EMA slope)
  const ema20 = emaCalc(closes, 20);
  if (ema20.length < 5) return null;
  const emaSlope = Math.abs(ema20[ema20.length - 1] - ema20[ema20.length - 5]) / price * 100;

  // Range-bound: range < 1.5% and flat EMA
  const isRanging = range < 2.0 && emaSlope < 0.3;
  if (!isRanging) return null;

  const currAtr = atrVals[atrVals.length - 1];
  const gridSpacing = currAtr * 0.5;
  const midPrice = (high + low) / 2;

  return {
    strategy: "Grid Trading",
    strategyKey: "grid",
    market: symbol, base,
    direction: price < midPrice ? "long" : "short",
    hotness: Math.round(50 + (2.0 - range) * 15 + (0.3 - emaSlope) * 30),
    confidence: Math.round(40 + (2.0 - range) * 10),
    headline: `Range-bound market — grid opportunity (${range.toFixed(1)}% range)`,
    details: [
      `Range: ${fmtPrice(low)} - ${fmtPrice(high)} (${range.toFixed(2)}%)`,
      `Grid spacing: ${fmtPrice(gridSpacing)} (0.5x ATR)`,
      `5 buy + 5 sell levels around ${fmtPrice(midPrice)}`,
    ],
    entryZone: `${fmtPrice(low)} - ${fmtPrice(high)}`,
    leverage: "2x",
    color: "slate",
    icon: "📐",
  };
}

// ── Run All Detectors ───────────────────────────────────────

function analyzeMarket(candles: CandleData[], base: string, symbol: string): StrategyOpportunity[] {
  const closes = candles.map(c => c.close);
  const price = closes[closes.length - 1];

  const detectors = [
    () => detectTrendFollowing(closes, price, base, symbol),
    () => detectMeanReversion(closes, price, base, symbol),
    () => detectMomentumBreakout(closes, price, base, symbol),
    () => detectBBSqueeze(closes, price, base, symbol),
    () => detectKeltner(closes, price, base, symbol),
    () => detectScalping(closes, price, base, symbol),
    () => detectSRReversal(candles, price, base, symbol),
    () => detectGridOpportunity(closes, price, base, symbol),
  ];

  const results: StrategyOpportunity[] = [];
  for (const detect of detectors) {
    try {
      const opp = detect();
      if (opp) results.push(opp);
    } catch {
      // Skip failed detectors
    }
  }
  return results;
}

// ── Color Helpers ───────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/25",    text: "text-blue-400",    glow: "shadow-blue-500/10" },
  purple:  { bg: "bg-purple-500/10",  border: "border-purple-500/25",  text: "text-purple-400",  glow: "shadow-purple-500/10" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/25",  text: "text-orange-400",  glow: "shadow-orange-500/10" },
  yellow:  { bg: "bg-yellow-500/10",  border: "border-yellow-500/25",  text: "text-yellow-400",  glow: "shadow-yellow-500/10" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    text: "text-cyan-400",    glow: "shadow-cyan-500/10" },
  pink:    { bg: "bg-pink-500/10",    border: "border-pink-500/25",    text: "text-pink-400",    glow: "shadow-pink-500/10" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-400", glow: "shadow-emerald-500/10" },
  slate:   { bg: "bg-slate-500/10",   border: "border-slate-500/25",   text: "text-slate-400",   glow: "shadow-slate-500/10" },
};

// ── Component ───────────────────────────────────────────────

const StrategySpotlight = () => {
  const [opportunities, setOpportunities] = useState<StrategyOpportunity[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    const allOpps: StrategyOpportunity[] = [];

    for (const m of MARKETS) {
      const binanceSym = CODE_TO_BINANCE[m.base];
      if (!binanceSym) continue;
      try {
        const candles = await fetchKlines(binanceSym);
        if (candles.length < 30) continue;
        const opps = analyzeMarket(candles, m.base, m.symbol);
        allOpps.push(...opps);
      } catch { /* skip */ }
    }

    // Sort by hotness (highest first)
    allOpps.sort((a, b) => b.hotness - a.hotness);
    setOpportunities(allOpps);
    setActiveIndex(0);
    setLoading(false);
  }, []);

  // Initial scan + refresh every 60s
  useEffect(() => {
    runScan();
    const interval = setInterval(runScan, 60_000);
    return () => clearInterval(interval);
  }, [runScan]);

  // Auto-rotate every 6 seconds
  useEffect(() => {
    if (paused || opportunities.length <= 1) return;
    rotateRef.current = setInterval(() => {
      setActiveIndex(i => (i + 1) % opportunities.length);
    }, 6000);
    return () => { if (rotateRef.current) clearInterval(rotateRef.current); };
  }, [paused, opportunities.length]);

  if (loading && !opportunities.length) {
    return (
      <div className="rounded-lg border border-blue-500/15 bg-slate-900/60 p-3">
        <div className="text-[10px] text-slate-400 animate-pulse">Scanning strategies across all markets...</div>
      </div>
    );
  }

  if (!opportunities.length) {
    return (
      <div className="rounded-lg border border-slate-500/15 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-500">No strategy opportunities detected right now</div>
          <button onClick={runScan} className="text-[9px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors">
            Rescan
          </button>
        </div>
      </div>
    );
  }

  const opp = opportunities[activeIndex % opportunities.length];
  const colors = COLOR_MAP[opp.color] || COLOR_MAP.blue;
  const dirColor = opp.direction === "long" ? "text-emerald-400" : "text-red-400";
  const dirBg = opp.direction === "long" ? "bg-emerald-500/15 border-emerald-500/30" : "bg-red-500/15 border-red-500/30";

  return (
    <div
      className={`rounded-lg border ${colors.border} ${colors.bg} p-2.5 space-y-1.5 transition-all duration-500 shadow-lg ${colors.glow} cursor-pointer overflow-hidden`}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Top row: strategy name + market + direction + hotness */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-xs">{opp.icon}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${colors.text}`}>
            {opp.strategy}
          </span>
          <span className="text-[10px] text-slate-300 font-bold">{opp.base}</span>
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border whitespace-nowrap ${dirBg} ${dirColor}`}>
            {opp.direction.toUpperCase()}
          </span>
          <span className="text-[9px] text-slate-500">{opp.leverage}</span>
        </div>
        {/* Hotness bar */}
        <span className="flex items-center gap-1 flex-shrink-0" title={`Hotness: ${opp.hotness}%`}>
          <span className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden inline-block">
            <span
              className={`block h-full rounded-full transition-all duration-700 ${
                opp.hotness >= 80 ? "bg-red-400" : opp.hotness >= 60 ? "bg-orange-400" : opp.hotness >= 40 ? "bg-yellow-400" : "bg-slate-400"
              }`}
              style={{ width: `${opp.hotness}%` }}
            />
          </span>
          <span className={`text-[8px] font-bold ${
            opp.hotness >= 80 ? "text-red-400" : opp.hotness >= 60 ? "text-orange-400" : "text-slate-400"
          }`}>
            {opp.hotness >= 80 ? "HOT" : opp.hotness >= 60 ? "WARM" : "MILD"}
          </span>
        </span>
      </div>

      {/* Headline */}
      <div className="text-[10px] text-slate-200 font-medium leading-relaxed break-words">
        {opp.headline}
      </div>

      {/* Compact info row */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px]">
        <span className="text-slate-400">Entry: <span className="text-slate-300 break-all">{opp.entryZone}</span></span>
        <span className="text-slate-400">Conf: <span className={colors.text}>{opp.confidence}%</span></span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-1.5 pt-1.5 border-t border-white/[0.05]">
          {opp.details.map((d, i) => (
            <div key={i} className="text-[9px] text-slate-400 flex items-start gap-1.5">
              <span className="text-slate-600 mt-px">•</span>
              <span>{d}</span>
            </div>
          ))}
          <div className="text-[8px] text-slate-600 italic pt-0.5">
            Display only — not an active trade signal
          </div>
        </div>
      )}

      {/* Footer: count + dots + controls */}
      <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
        <span className="text-[8px] text-slate-600">
          {activeIndex + 1}/{opportunities.length} opportunities • {paused ? "paused" : "rotating"}
        </span>
        {/* Page dots */}
        <span className="flex items-center gap-0.5">
          {opportunities.slice(0, Math.min(opportunities.length, 8)).map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}
              className={`w-1 h-1 rounded-full transition-all ${
                i === activeIndex % opportunities.length
                  ? `${opp.hotness >= 80 ? "bg-red-400" : opp.hotness >= 60 ? "bg-orange-400" : "bg-blue-400"} w-2`
                  : "bg-slate-600"
              }`}
            />
          ))}
          {opportunities.length > 8 && <span className="text-[7px] text-slate-600 ml-0.5">+{opportunities.length - 8}</span>}
        </span>
        {/* Nav buttons pushed right */}
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setActiveIndex(i => (i - 1 + opportunities.length) % opportunities.length); }}
            className="text-[9px] text-slate-500 hover:text-white transition-colors px-1"
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setActiveIndex(i => (i + 1) % opportunities.length); }}
            className="text-[9px] text-slate-500 hover:text-white transition-colors px-1"
          >
            ›
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); runScan(); }}
            className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 hover:text-white border border-white/[0.05] transition-colors"
          >
            {loading ? "..." : "↻"}
          </button>
        </span>
      </div>
    </div>
  );
};

export default StrategySpotlight;
