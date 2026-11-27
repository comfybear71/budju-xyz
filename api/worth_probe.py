# ==========================================
# Read-only probe: could we rebuild "what the account was worth" before Nov 13?
# ==========================================
# Nothing recorded the account's worth before Nov 13, and Swyftx has no endpoint for it. The idea is to replay each wallet's
# Swyftx order history against historical coin prices. Before building that blind, this asks Swyftx three questions per wallet and
# sends the answers to Telegram: how many past orders can we read, how far back do they go, and can we price the coins held.
# It places nothing, writes nothing except a "done" marker, and runs once per wallet.

from datetime import datetime
from typing import Dict, List, Optional

PAGE_SIZE = 100
MAX_PAGES = 12
_TIME_KEYS = ("created", "createdat", "created_at", "datecreated", "date", "time", "timestamp", "updated", "updatedat", "executed")


def order_rows(reply) -> List[Dict]:
    if isinstance(reply, list):
        return [r for r in reply if isinstance(r, dict)]
    if isinstance(reply, dict):
        for k in ("orders", "data", "items", "results"):
            if isinstance(reply.get(k), list):
                return [r for r in reply[k] if isinstance(r, dict)]
        for v in reply.values():
            if isinstance(v, list):
                return [r for r in v if isinstance(r, dict)]
    return []


def order_time_ms(row: Dict) -> Optional[int]:
    """Best guess at when an order happened, in epoch ms (None if no time-like field is readable)."""
    for k, v in row.items():
        if str(k).lower() not in _TIME_KEYS:
            continue
        try:
            if isinstance(v, (int, float)):
                return int(v if v > 1e11 else v * 1000)
            s = str(v).replace("Z", "+00:00")
            return int(datetime.fromisoformat(s).timestamp() * 1000)
        except (ValueError, TypeError, OverflowError):
            continue
    return None


def summarise(pages: List[List[Dict]], held: Dict[str, float], cg_ids: Dict[str, str]) -> Dict:
    rows = [r for p in pages for r in p]
    times = [t for t in (order_time_ms(r) for r in rows) if t]
    iso = lambda ms: datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d")
    coins = [c for c in held if c not in ("AUD", "USD", "USDC", "USDT")]
    return {
        "orders": len(rows),
        "pages": len(pages),
        "earliest": iso(min(times)) if times else None,
        "latest": iso(max(times)) if times else None,
        "withTime": len(times),
        "keys": sorted(rows[0].keys())[:25] if rows else [],
        "heldCoins": len(coins),
        "unpriceable": sorted(c for c in coins if c not in cg_ids),
    }


def fetch_pages(get_json, page_size: int = PAGE_SIZE, max_pages: int = MAX_PAGES) -> List[List[Dict]]:
    """get_json(path) -> reply. Stops on an empty page, a short page, or a page that repeats the last one (paging ignored)."""
    pages: List[List[Dict]] = []
    last_sig = None
    for n in range(1, max_pages + 1):
        rows = order_rows(get_json(f"/orders/?limit={page_size}&page={n}"))
        if not rows:
            break
        sig = repr(rows[0]) + repr(rows[-1])
        if sig == last_sig:
            break
        last_sig = sig
        pages.append(rows)
        if len(rows) < page_size:
            break
    return pages


def message(label: str, s: Dict) -> str:
    if not s["orders"]:
        return f"🔎 Worth-history probe · {label}\nSwyftx returned no past orders."
    span = f"{s['earliest']} → {s['latest']}" if s["earliest"] else "dates not readable"
    pri = (f"{len(s['unpriceable'])} of {s['heldCoins']} held coins have no price source: {', '.join(s['unpriceable'][:12])}"
           if s["unpriceable"] else f"all {s['heldCoins']} held coins have a price source")
    return (f"🔎 Worth-history probe · {label}\nOrders readable: {s['orders']} ({s['pages']} page(s))\nSpan: {span}\n"
            f"{pri}\nFields: {', '.join(s['keys'])}")


def run_once(label: str, wallet: str, client, held: Dict[str, float], send, is_done, mark_done) -> bool:
    """Never raises. Marks a wallet done only after the report was sent, so a failed attempt tries again next run."""
    try:
        if is_done(wallet):
            return False
        from asset_registry import ASSET_CG_IDS
        from swyftx_client import SWYFTX_BASE
        headers = client._headers()
        pages = fetch_pages(lambda path: client._http_json(SWYFTX_BASE + path, headers=headers, timeout=10))
        send(message(label, summarise(pages, held, ASSET_CG_IDS)))
        mark_done(wallet)
        return True
    except Exception as e:
        print(f"[worth-probe] skipped: {type(e).__name__}: {e}", flush=True)
        return False
