# ==========================================
# Coin classes + position sizing (pure — no database / network)
# ==========================================
# Class comes from market cap; a coin the Dip Report flags "Careful" drops one
# class (never moves up); thin trading volume shrinks the buy a little more.
# A per-coin position cap stops the bot buying once a wallet holds that many
# dollars of the coin.

from typing import Dict, Optional, Tuple

CLASSES = [  # (name, min market cap USD, buy-size multiplier)
    ("blue", 50e9, 1.0),
    ("large", 10e9, 0.85),
    ("mid", 1e9, 0.65),
    ("small", 0.0, 0.4),
]
THIN_VOLUME_RATIO = 0.01
THIN_FACTOR = 0.75
ORDER = [c[0] for c in CLASSES]


def classify(mcap: Optional[float], volume: Optional[float], careful: bool = False) -> Dict:
    mcap = float(mcap or 0)
    idx = len(CLASSES) - 1
    for i, (_, floor, _) in enumerate(CLASSES):
        if mcap >= floor:
            idx = i
            break
    if careful and idx < len(CLASSES) - 1:
        idx += 1                                   # one class safer
    name, _, mult = CLASSES[idx]
    thin = bool(mcap > 0 and float(volume or 0) < mcap * THIN_VOLUME_RATIO)
    if thin:
        mult *= THIN_FACTOR
    return {"cls": name, "mult": round(mult, 3), "thin": thin, "careful": bool(careful), "mcap": mcap}


def size_buy(base_amount: float, info: Optional[Dict], held_usd: float, cap_usd: float,
             min_order: float) -> Tuple[float, str]:
    """(amount to spend, note). amount 0 = skip. info None = unknown coin -> treated as small."""
    mult = (info or {}).get("mult", CLASSES[-1][2])
    amount = max(base_amount * mult, min_order)
    if cap_usd and cap_usd > 0:
        room = cap_usd - held_usd
        if room < min_order:
            return 0.0, f"at the ${cap_usd:,.0f} position cap"
        amount = max(min(amount, room), min_order)
    return round(amount, 2), ""
