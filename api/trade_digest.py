# ==========================================
# Telegram digest for the auto-trade cron
# ==========================================
# One message per cycle, grouped by wallet (admin first), each line tagged
# with its tier, followed by a "Pool total" that adds every wallet together
# by coin. Telegram rejects messages over 4096 characters, so split_message()
# breaks an oversized digest at line boundaries instead of losing it.

TELEGRAM_LIMIT = 4000  # headroom under Telegram's 4096-char cap


def _qty(q):
    return f"{q:,.4f}" if q >= 1 else f"{q:.6f}"


def _price(p):
    if p >= 1:
        return f"${p:,.2f}"
    if p >= 0.01:
        return f"${p:.4f}"
    return f"${p:.8f}"


def _short(wallet):
    return f"{wallet[:4]}…{wallet[-4:]}"


def _line(t):
    icon = "🛒" if t["side"] == "BUY" else "💸"
    tier = f"T{t['tier']} " if t.get("tier") else ""
    return f"{icon} {tier}{t['coin']} {_qty(t['qty'])} @ {_price(t['price'])} (${t['amount']:,.2f})"


def _totals(trades):
    bought = sum(t["amount"] for t in trades if t["side"] == "BUY")
    sold = sum(t["amount"] for t in trades if t["side"] == "SELL")
    parts = []
    if bought:
        parts.append(f"Bought ${bought:,.2f}")
    if sold:
        parts.append(f"Sold ${sold:,.2f}")
    return " · ".join(parts)


def _by_coin(trades, side):
    agg = {}
    for t in trades:
        if t["side"] != side:
            continue
        q, a = agg.get(t["coin"], (0.0, 0.0))
        agg[t["coin"]] = (q + t["qty"], a + t["amount"])
    return agg


def format_digest(all_trades):
    wallets = {}
    for t in all_trades:
        wallets.setdefault(t["wallet"], []).append(t)
    # Admin wallet first, then the rest by address.
    ordered = sorted(wallets.items(), key=lambda kv: (not kv[1][0].get("isPool"), kv[0]))

    lines = [f"🤖 <b>Auto-Trade</b> — {len(all_trades)} trade(s) across {len(wallets)} wallet(s)"]
    for wallet, trades in ordered:
        name = "Admin" if trades[0].get("isPool") else "Wallet"
        lines.append(f"\n👤 <b>{name}</b> ({_short(wallet)})")
        for t in [x for x in trades if x["side"] == "BUY"] + [x for x in trades if x["side"] == "SELL"]:
            lines.append(_line(t))
        lines.append(f"<i>{_totals(trades)}</i>")

    lines.append(f"\n🏦 <b>Pool total</b> (all wallets) — {_totals(all_trades)}")
    for side, icon, label in (("BUY", "🟢", "Bought"), ("SELL", "🔴", "Sold")):
        agg = _by_coin(all_trades, side)
        if agg:
            items = ", ".join(f"{c} {_qty(q)} (${a:,.2f})" for c, (q, a) in sorted(agg.items()))
            lines.append(f"{icon} {label}: {items}")
    return "\n".join(lines)


def split_message(text, limit=TELEGRAM_LIMIT):
    """Split at line boundaries so every piece fits Telegram's limit."""
    if len(text) <= limit:
        return [text]
    chunks, cur = [], ""
    for line in text.split("\n"):
        if cur and len(cur) + 1 + len(line) > limit:
            chunks.append(cur)
            cur = line
        else:
            cur = f"{cur}\n{line}" if cur else line
    if cur:
        chunks.append(cur)
    return chunks
