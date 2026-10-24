# ==========================================
# Per-instance Swyftx API client
# ==========================================
# auto-trade-cron.py talks to Swyftx through module-level globals tied to
# the single master SWYFTX_API_KEY env var — that only works for one account.
# This is the same auth/request pattern, but as a class so each user's own
# key gets its own isolated client instance (own token, own cache), with no
# risk of one user's calls reusing another user's cached token.

import hashlib
import json
import os
import time
from typing import Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SWYFTX_BASE = "https://api.swyftx.com.au"

MARKET_BUY = 1
MARKET_SELL = 2

TOKEN_TTL_MS = 50 * 60 * 1000  # 50 minutes, mirrors the master client

# Process-local token cache, keyed by API key — the fast path, avoiding a
# Mongo round trip on every call within the same warm instance.
_TOKEN_CACHE: Dict[str, Tuple[str, float]] = {}

# Lazily-created handle to a tiny shared MongoDB collection used ONLY as a
# cross-process token cache. Deliberately its own standalone connection
# (not database.py's) — database.py imports this module, so importing
# database.py back here would be circular. If MONGODB_URI is unset or the
# connection fails for any reason, every function below falls back to the
# process-local cache only; nothing here ever raises or blocks a real
# Swyftx call on a Mongo problem.
#
# Why this exists: multiple independent serverless functions/runtimes can
# all hold the SAME physical Swyftx API key — the admin's personal entry
# can be "linked" to the server's own master SWYFTX_API_KEY (see
# link_admin_master_key in database.py), which is ALSO used by
# auto-trade-cron.py's cron (its own separate process/cache) and proxy.ts's
# public portfolio proxy (yet another runtime/cache). Each one refreshing
# its own token independently hits Swyftx's tightly rate-limited
# /auth/refresh/ endpoint for the same key from unrelated processes —
# confirmed live on 2026-10-24: linking the admin wallet's key (== the
# master bot's key), then loading the leaderboard and personal-holdings
# endpoints seconds apart, immediately 429'd and silently dropped that
# wallet from the leaderboard. A shared cache means whichever process
# refreshes first "wins" and everyone else reuses that token for its full
# 50-minute life instead of re-authenticating independently.
_token_cache_collection = None
_token_cache_collection_attempted = False


def _get_token_cache_collection():
    global _token_cache_collection, _token_cache_collection_attempted
    if _token_cache_collection_attempted:
        return _token_cache_collection
    _token_cache_collection_attempted = True
    try:
        from pymongo import MongoClient
        uri = os.getenv("MONGODB_URI")
        if not uri:
            return None
        db_name = os.getenv("DB_NAME", "flub")
        mongo_client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        _token_cache_collection = mongo_client[db_name]["swyftx_token_cache"]
    except Exception:
        _token_cache_collection = None
    return _token_cache_collection


def _extract_history_records(data, list_key: str) -> List[Dict]:
    """Swyftx's history endpoints may return a bare list, {"deposits": [...]}
    / {"withdrawals": [...]}, or some other wrapper key — the docs only show
    the key name, not a full example. Accept any shape that yields a list."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if isinstance(data.get(list_key), list):
            return data[list_key]
        for v in data.values():
            if isinstance(v, list):
                return v
    return []


def _http_json(url: str, method: str = "GET", body: Optional[dict] = None,
                headers: Optional[dict] = None, timeout: int = 20) -> dict:
    hdrs = dict(headers) if headers else {}
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        hdrs.setdefault("Content-Type", "application/json")
    hdrs.setdefault("User-Agent", "SwyftxTrader/1.0")
    req = Request(url, data=data, headers=hdrs, method=method)
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def get_cached_token(api_key: str) -> str:
    """Resolve a valid Swyftx access token for api_key — process-local cache
    first, then the shared Mongo cache, then a fresh /auth/refresh/ call as
    a last resort. Shared by SwyftxClient (below) and auto-trade-cron.py's
    own token fetching, so every caller holding the same api_key converges
    on one token instead of each independently hammering Swyftx."""
    now = time.time() * 1000
    cached = _TOKEN_CACHE.get(api_key)
    if cached and now < cached[1]:
        return cached[0]

    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    coll = _get_token_cache_collection()
    if coll is not None:
        try:
            doc = coll.find_one({"_id": key_hash})
            if doc and doc.get("token") and doc.get("expiresAt", 0) > now:
                _TOKEN_CACHE[api_key] = (doc["token"], doc["expiresAt"])
                return doc["token"]
        except Exception:
            pass  # Mongo unavailable — fall through to a fresh auth call

    try:
        data = _http_json(
            SWYFTX_BASE + "/auth/refresh/",
            method="POST",
            body={"apiKey": api_key},
        )
    except HTTPError as e:
        raise SwyftxAuthError(f"Swyftx auth failed: HTTP {e.code}")
    except Exception as e:
        raise SwyftxAuthError(f"Swyftx auth failed: {e}")
    if not data.get("accessToken"):
        raise SwyftxAuthError("Swyftx auth failed: no access token returned")

    token = data["accessToken"]
    expiry = now + TOKEN_TTL_MS
    _TOKEN_CACHE[api_key] = (token, expiry)
    if coll is not None:
        try:
            coll.update_one(
                {"_id": key_hash},
                {"$set": {"token": token, "expiresAt": expiry}},
                upsert=True,
            )
        except Exception:
            pass  # Shared cache write failing never blocks the caller
    return token


class SwyftxAuthError(Exception):
    """Raised when a user's stored API key fails to authenticate against
    Swyftx — e.g. revoked, rotated, or never valid. Callers should surface
    this as a per-user error, not crash a loop iterating many users."""


class SwyftxClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key

    def _http_json(self, url: str, method: str = "GET", body: Optional[dict] = None,
                    headers: Optional[dict] = None, timeout: int = 20) -> dict:
        return _http_json(url, method=method, body=body, headers=headers, timeout=timeout)

    def _get_token(self) -> str:
        return get_cached_token(self._api_key)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
            "User-Agent": "SwyftxTrader/1.0",
        }

    def test_connection(self) -> Tuple[bool, Optional[str]]:
        """Validate the key actually authenticates. Does not reveal or log
        the key itself — only success/failure and a short reason."""
        try:
            self._get_token()
            return True, None
        except SwyftxAuthError as e:
            return False, str(e)

    def get_balances(self) -> List[Dict]:
        """Raw per-asset balances: [{assetId, availableBalance, ...}, ...]."""
        headers = self._headers()
        try:
            return self._http_json(SWYFTX_BASE + "/user/balance/", headers=headers)
        except HTTPError as e:
            raise SwyftxAuthError(f"Swyftx balance fetch failed: HTTP {e.code}")

    def get_asset_map(self) -> Dict[str, str]:
        """Swyftx numeric asset ID -> code (e.g. "36" -> "BTC")."""
        headers = self._headers()
        assets_list = self._http_json(SWYFTX_BASE + "/markets/assets/", headers=headers)
        asset_map = {}
        if isinstance(assets_list, list):
            for a in assets_list:
                if a.get("id") is not None:
                    asset_map[str(a["id"])] = a.get("code", "")
        return asset_map

    def get_holdings(self) -> Dict[str, float]:
        """{coinCode: availableBalance} for every asset with a non-zero
        balance, including USDC/AUD cash. One call does the asset-id lookup
        + balance fetch together (mirrors fetch_portfolio() in
        auto-trade-cron.py, just scoped to this instance's own key)."""
        balances = self.get_balances()
        asset_map = self.get_asset_map()

        holdings: Dict[str, float] = {}
        for item in (balances if isinstance(balances, list) else []):
            asset_id = item.get("assetId") or (item.get("asset", {}).get("id"))
            code = item.get("asset", {}).get("code") or (
                asset_map.get(str(asset_id), "") if asset_id is not None else ""
            )
            balance = float(item.get("availableBalance", 0) or 0)
            if code and balance > 0:
                holdings[code] = holdings.get(code, 0.0) + balance
        return holdings

    def get_deposit_history(self, max_pages: int = 20, page_size: int = 200) -> List[Dict]:
        """Every deposit this wallet's own Swyftx account has ever recorded
        (fiat + crypto), paginated. Confirmed real endpoint — Swyftx's own
        API docs (https://docs.swyftx.com.au, "History > All Deposit
        History") list GET /history/deposit/?limit&page&sortby, same as the
        open-source pyswyft client's HistoryAllDeposit. Swyftx does not
        publish the exact record schema for this endpoint, so the caller
        (get_user_live_cash_flows in database.py) must parse each record
        defensively rather than assume specific field names."""
        return self._get_history_pages("/history/deposit/", "deposits", max_pages, page_size)

    def get_withdrawal_history(self, max_pages: int = 20, page_size: int = 200) -> List[Dict]:
        """Same as get_deposit_history() but for GET /history/withdraw/."""
        return self._get_history_pages("/history/withdraw/", "withdrawals", max_pages, page_size)

    def _get_history_pages(self, path: str, list_key: str, max_pages: int, page_size: int) -> List[Dict]:
        headers = self._headers()
        all_records: List[Dict] = []
        for page in range(1, max_pages + 1):
            data = self._http_json(
                SWYFTX_BASE + f"{path}?limit={page_size}&page={page}&sortby=date",
                headers=headers,
            )
            records = _extract_history_records(data, list_key)
            if not records:
                break
            all_records.extend(records)
            if len(records) < page_size:
                break  # Short page — this was the last one
        return all_records

    def get_code_to_id_map(self) -> Dict[str, str]:
        """code -> Swyftx numeric asset ID (inverse of get_asset_map), needed
        to place orders which address assets by ID, not code."""
        headers = self._headers()
        assets_list = self._http_json(SWYFTX_BASE + "/markets/assets/", headers=headers)
        code_to_id: Dict[str, str] = {}
        if isinstance(assets_list, list):
            for a in assets_list:
                if a.get("code") and a.get("id") is not None:
                    code_to_id[str(a["code"]).upper()] = str(a["id"])
        return code_to_id

    def place_market_order(self, asset_code: str, side: str, amount_usdc: float,
                            code_to_id: Dict[str, str]) -> Tuple[bool, Optional[str], Optional[str]]:
        """Place a market buy/sell order sized in USDC. Mirrors
        auto-trade-cron.py's place_market_order(), scoped to this instance's
        own key/token. Returns (success, order_id, error)."""
        if amount_usdc < 7:
            return False, None, "Below $7 minimum"

        usdc_id = code_to_id.get("USDC")
        asset_id = code_to_id.get(asset_code.upper())
        if not usdc_id or not asset_id:
            return False, None, f"Cannot resolve IDs for USDC/{asset_code}"

        payload = {
            "primary": usdc_id,
            "secondary": asset_id,
            "quantity": str(round(amount_usdc, 2)),
            "assetQuantity": usdc_id,
            "orderType": MARKET_BUY if side == "buy" else MARKET_SELL,
            "trigger": "",
        }

        try:
            data = self._http_json(SWYFTX_BASE + "/orders/", method="POST",
                                    body=payload, headers=self._headers())
        except HTTPError as e:
            body_text = e.read().decode() if e.fp else ""
            return False, None, f"HTTP {e.code}: {body_text[:200]}"

        order_id = data.get("orderUuid") or data.get("orderId") or data.get("order_id")
        msg = str(data.get("message", "")).lower()
        has_error = data.get("error") or "error" in msg or "fail" in msg

        if order_id and not has_error:
            try:
                time.sleep(1)
                verify = self._http_json(SWYFTX_BASE + f"/orders/{order_id}/", headers=self._headers())
                status = verify.get("status", 0)
                # Swyftx statuses: 2=pending, 3=open, 4=filled, 5=partially_filled, 6=cancelled, 7=failed
                if status in (6, 7):
                    return False, None, f"Order {order_id} rejected by Swyftx (status={status})"
            except Exception:
                pass  # Verification failed — assume order is OK (don't block on verify failure)
            return True, order_id, None
        err = data.get("error") or data.get("message") or "No order confirmation"
        return False, None, str(err) if isinstance(err, str) else json.dumps(err)
