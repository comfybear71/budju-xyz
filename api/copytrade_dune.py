# ==========================================
# Signals / Copy Trading — Dune Analytics seed list
# ==========================================
# Pulls candidate wallet addresses from a public Dune dashboard's saved
# queries (e.g. tobirama's Solana Top Traders dashboard). Schema-tolerant
# on purpose: this repo has no live DUNE_API_KEY to verify the dashboard's
# exact column names against, so instead of hardcoding a column like
# "wallet_address" (which would silently return nothing if the real column
# is "trader" or "maker"), every row is scanned for any string value that
# *looks* like a Solana address and that's taken as a candidate. Columns
# whose name suggests a token mint rather than a wallet are skipped.
#
# Graceful no-op when DUNE_API_KEY isn't set — Phase 1 ships with this off
# by default; nothing breaks, the tracked-wallet list just stays empty
# until the key is added (or wallets are seeded manually).
# ==========================================

import json
import os
import re
from typing import Dict, List
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DUNE_API_KEY = os.getenv("DUNE_API_KEY", "")
# tobirama's "Solana Top Traders / Wallet List" dashboard — overridable via
# env in case the dashboard's query IDs change or a different seed list is
# preferred.
DEFAULT_DUNE_QUERY_IDS = "5044809,5048731,5051582,5049338"
DUNE_QUERY_IDS = [
    q.strip() for q in os.getenv("DUNE_QUERY_IDS", DEFAULT_DUNE_QUERY_IDS).split(",") if q.strip()
]

_SOLANA_ADDRESS_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_MINT_LIKE_COLUMN_RE = re.compile(r"token|mint|pair|pool", re.IGNORECASE)
_WALLET_LIKE_COLUMN_RE = re.compile(r"wallet|trader|maker|address|owner|account", re.IGNORECASE)


def _looks_like_solana_address(value) -> bool:
    if not isinstance(value, str):
        return False
    return bool(_SOLANA_ADDRESS_RE.match(value))


def _extract_addresses_from_row(row: Dict) -> List[str]:
    """Prefer columns whose name reads like a wallet column; fall back to
    any address-shaped string in the row if none match by name."""
    wallet_col_hits: List[str] = []
    other_hits: List[str] = []
    for col, value in row.items():
        if not _looks_like_solana_address(value):
            continue
        if _MINT_LIKE_COLUMN_RE.search(col or ""):
            continue
        if _WALLET_LIKE_COLUMN_RE.search(col or ""):
            wallet_col_hits.append(value)
        else:
            other_hits.append(value)
    return wallet_col_hits or other_hits


def _fetch_dune_query_results(query_id: str, limit: int = 1000) -> List[Dict]:
    url = f"https://api.dune.com/api/v1/query/{query_id}/results?limit={limit}"
    req = Request(url, headers={"X-Dune-API-Key": DUNE_API_KEY, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, TimeoutError) as e:
        print(f"[copytrade_dune] query {query_id} fetch error: {e}")
        return []
    except Exception as e:
        print(f"[copytrade_dune] query {query_id} unexpected error: {e}")
        return []
    rows = (((data or {}).get("result") or {}).get("rows")) or []
    return rows if isinstance(rows, list) else []


def fetch_dune_candidate_wallets() -> List[Dict]:
    """Returns deduped [{"address", "source": "dune", "sourceQueryId"}].
    Empty (never raises) if DUNE_API_KEY is unset or every query fails."""
    if not DUNE_API_KEY:
        return []

    seen = set()
    candidates: List[Dict] = []
    for query_id in DUNE_QUERY_IDS:
        rows = _fetch_dune_query_results(query_id)
        for row in rows:
            if not isinstance(row, dict):
                continue
            for address in _extract_addresses_from_row(row):
                if address in seen:
                    continue
                seen.add(address)
                candidates.append({
                    "address": address,
                    "source": "dune",
                    "sourceQueryId": query_id,
                })
    print(f"[copytrade_dune] found {len(candidates)} candidate wallets across {len(DUNE_QUERY_IDS)} queries")
    return candidates
