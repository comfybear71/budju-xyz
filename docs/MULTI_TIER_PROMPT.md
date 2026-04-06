# Multi-Tier Auto-Trader Implementation — Handoff Prompt

> Copy-paste this into a new Claude Code session to implement the multi-tier system.

---

## MANDATORY: Read These Files First

Before writing ANY code, read these files in order:

1. `SAFETY-RULES.md` — Mandatory safety protocol. Follow it exactly.
2. `CLAUDE.md` — Full project architecture, patterns, and lessons learned.
3. `HANDOFF.md` — Current project state, recent changes, what's planned.
4. This file (`docs/MULTI_TIER_PROMPT.md`) — The implementation spec below.

---

## Branch & Deployment Rules

- **Development branch:** `claude/review-project-docs-GWNzR` — this is the active working branch. Create your work here or branch from it.
- **This branch IS the Vercel production branch.** Changes pushed here deploy to budju.xyz.
- **NEVER push to `master` directly.** Merge via PR only after testing.
- **Do NOT touch any code outside the auto-trader system** unless explicitly asked. The perp trading, Telegram bot, VPS bot, pool accounting, and other systems are working — leave them alone.

---

## What to Implement: Multi-Tier System

### Current State (what exists now)
- Each coin is assigned to ONE tier (`tierAssignments: Record<string, number>`)
- Each tier has: `deviation` (buy trigger %), `sellDeviation` (sell trigger %), `allocation`, `cooldownHours`
- Asymmetric reset: after BUY, sell band stays anchored high. After SELL, both reset.
- Targets stored as `targets["BTC"] = { buy, sell }`
- Cooldowns stored as `cooldowns["BTC"] = expiryTimestamp`

### New System (what to build)
Every coin exists in ALL three tiers simultaneously. Each tier acts as an independent layer with its own deviation bands, cooldowns, and allocation.

**Example: BTC at $67,000**
- T1 (-3% buy / +10% sell): Buy target $64,990, Sell target $73,700
- T2 (-6% buy / +12% sell): Buy target $62,980, Sell target $75,040
- T3 (-10% buy / +15% sell): Buy target $60,300, Sell target $77,050

Price drops to $64,990 → T1 buys → T1 on cooldown, T2 and T3 still active.
Price keeps dropping to $62,980 → T2 buys → T2 on cooldown, T3 still active.
Price crashes to $60,300 → T3 buys → all on cooldown, sell targets all anchored high.
Price recovers → sells trigger on the way up, recycling USDC.

### Key Architecture Changes

1. **Target keys become compound:** `targets["BTC:1"]`, `targets["BTC:2"]`, `targets["BTC:3"]`
2. **Cooldown keys become compound:** `cooldowns["BTC:1"]`, `cooldowns["BTC:2"]`, `cooldowns["BTC:3"]`
3. **Tier assignments:** Change from `Record<string, number>` to support multi-tier. Options:
   - `Record<string, number[]>` (coin → array of tier nums, default `[1,2,3]`)
   - Or per-tier coin lists: `tierCoins: Record<number, string[]>`
4. **Admin UI:** Each tier shows its coins. User can add/remove coins per tier. Default: all coins in all tiers.
5. **Price checking loop:** For each active tier, check ALL coins in that tier against that tier's deviation bands. Fire independently.
6. **Sell band anchoring:** Same asymmetric logic — after BUY in any tier, sell band stays anchored high for THAT tier's target only.

### Suggested Default Settings

| | T1 - Normal | T2 - Big Dip | T3 - Crash Buy |
|---|---|---|---|
| Buy Dev | -3% | -6% | -10% |
| Sell Dev | +10% | +12% | +15% |
| Allocation | 5% | 8% | 12% |
| Cooldown | 12h | 12h | 24h |

### Files to Modify

| File | What Changes |
|------|-------------|
| `src/features/trade/services/autoTrader.ts` | Core engine: compound keys, multi-tier assignment, independent cooldowns, target management |
| `src/features/trade/components/AdminAutoTradeView.tsx` | Admin UI: per-tier coin lists, add/remove per tier, compound key display |
| `src/features/trade/components/AutoTraderView.tsx` | User view: show multi-tier status per coin |
| `api/auto-trade-cron.py` | Backend cron: same compound key logic, independent cooldowns |
| `src/features/trade/services/tradeApi.ts` | Types: TraderState, snapshot interfaces |

### Backwards Compatibility
- Old `tierAssignments` in MongoDB (`{coin: tierNum}`) should be migrated on load — put those coins in all 3 tiers.
- Old `targets["BTC"]` should be migrated to `targets["BTC:1"]` on load.
- Old `cooldowns["BTC"]` should be migrated to `cooldowns["BTC:1"]` on load.

### What NOT to Change
- The perp trading system (perp_engine.py, perp_strategies.py, etc.)
- The Telegram bot
- The VPS trading bot
- Pool accounting / deposits / withdrawals
- Holdings panel, charts, or any other UI outside the auto-trader
- The Binance WebSocket price feed

### Testing
- After implementation, test on the Vercel preview URL (the branch deployment)
- Verify: starting a tier assigns targets for all coins in that tier
- Verify: a buy in T1 only puts T1 on cooldown, T2/T3 remain active
- Verify: sell band stays anchored after buy
- Verify: admin UI shows coins per tier with add/remove
- Verify: backend cron uses same compound keys

---

## Summary

The goal is **accumulation-focused DCA with escalating dip layers**. T1 catches normal volatility, T2 catches real dips, T3 catches crashes. Every coin is in every tier by default. Each tier fires independently. The wider the dip, the more we buy. Sell targets stay anchored high so we only sell on real recoveries.
