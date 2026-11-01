# Trade history export (CSV) — pure helpers. Users need this for their own tax records.
import csv
import io
from typing import Dict, Iterable, List

HEADER = ["date_utc", "coin", "side", "quantity", "price_usd", "value_usd", "order_id", "source"]


def rows_to_csv(rows: Iterable[Dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(HEADER)
    for r in rows:
        qty = float(r.get("quantity") or 0)
        price = float(r.get("price") or 0)
        w.writerow([
            r.get("date", ""), str(r.get("coin", "")), str(r.get("side", "")),
            f"{qty:.8f}".rstrip("0").rstrip(".") if qty else "0", f"{price:.8f}".rstrip("0").rstrip(".") if price else "0",
            f"{qty * price:.2f}", r.get("orderId", ""), r.get("source", ""),
        ])
    return buf.getvalue()


def normalise(docs: Iterable[Dict], admin_ledger: bool = False) -> List[Dict]:
    """Per-wallet ledger docs (side/quantity) or the admin pool ledger (type/amount) -> one shape, oldest first."""
    out = []
    for d in docs:
        ts = d.get("timestamp")
        side = d.get("type") if admin_ledger else d.get("side")
        if side not in ("buy", "sell"):
            continue
        out.append({
            "date": ts.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts, "strftime") else str(ts or ""),
            "coin": d.get("coin", ""), "side": side,
            "quantity": d.get("amount") if admin_ledger else d.get("quantity"),
            "price": d.get("price"),
            "orderId": d.get("swyftxId") if admin_ledger else d.get("orderId"),
            "source": d.get("source", "auto"),
        })
    out.sort(key=lambda r: r["date"])
    return out
