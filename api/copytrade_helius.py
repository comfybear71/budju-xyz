# ==========================================
# Signals / Copy Trading — Helius webhook sync + swap event parsing
# ==========================================
# Two separate concerns kept in one small module since both are "talk to
# Helius": (1) keep one Enhanced webhook's tracked-address list in sync
# with copytrade_wallets' active set, and (2) turn one Helius-delivered
# "SWAP" transaction into a normalized {wallet, side, tokenMint, ...} event
# that api/copytrade-webhook.py and api/copytrade-cron.py can act on.
#
# Pure functions only — no DB access. Callers (the cron + the webhook
# receiver) read/write via database.py.
# ==========================================

import hashlib
import json
import os
from typing import Dict, List, Optional, Set
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
HELIUS_WEBHOOKS_BASE = "https://api.helius.xyz/v0/webhooks"
# Where Helius should POST delivered events — production domain by default,
# overridable (e.g. for a preview deployment) via env.
COPYTRADE_WEBHOOK_URL = os.getenv("COPYTRADE_WEBHOOK_URL", "https://budju.xyz/api/copytrade-webhook")
# Shared secret Helius echoes back as the `Authorization` header on every
# delivery — set the same value in both places. Webhook receiver rejects
# any delivery that doesn't match once this is configured.
COPYTRADE_WEBHOOK_SECRET = os.getenv("COPYTRADE_WEBHOOK_SECRET", "")

SOL_MINT = "So11111111111111111111111111111111111111"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
_STABLE_OR_NATIVE = {SOL_MINT, USDC_MINT}


def addresses_hash(addresses: List[str]) -> str:
    """Stable hash of the address set, used to skip a Helius API call when
    the tracked-wallet list hasn't actually changed since the last sync —
    each webhook create/update call costs Helius credits."""
    return hashlib.sha256(",".join(sorted(addresses)).encode()).hexdigest()


def sync_helius_webhook(addresses: List[str], existing_webhook_id: Optional[str]) -> Dict:
    """Create (first run) or update (every run after) the one Enhanced
    webhook covering every active tracked wallet. No-ops cleanly if
    HELIUS_API_KEY isn't set. Returns {"ok", "webhookId", "error"?}."""
    if not HELIUS_API_KEY:
        return {"ok": False, "error": "HELIUS_API_KEY not set"}
    if not addresses:
        return {"ok": False, "error": "no active wallets to track"}

    body = json.dumps({
        "webhookURL": COPYTRADE_WEBHOOK_URL,
        "transactionTypes": ["SWAP"],
        "accountAddresses": addresses,
        "webhookType": "enhanced",
        "authHeader": COPYTRADE_WEBHOOK_SECRET,
    }).encode()

    try:
        if existing_webhook_id:
            url = f"{HELIUS_WEBHOOKS_BASE}/{existing_webhook_id}?api-key={HELIUS_API_KEY}"
            req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="PUT")
        else:
            url = f"{HELIUS_WEBHOOKS_BASE}?api-key={HELIUS_API_KEY}"
            req = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        webhook_id = data.get("webhookID") or existing_webhook_id
        return {"ok": True, "webhookId": webhook_id}
    except HTTPError as e:
        detail = e.read().decode(errors="ignore") if hasattr(e, "read") else str(e)
        print(f"[copytrade_helius] webhook sync HTTP error: {e.code} {detail}")
        return {"ok": False, "error": f"HTTP {e.code}: {detail[:200]}"}
    except (URLError, TimeoutError) as e:
        print(f"[copytrade_helius] webhook sync network error: {e}")
        return {"ok": False, "error": str(e)}
    except Exception as e:
        print(f"[copytrade_helius] webhook sync unexpected error: {e}")
        return {"ok": False, "error": str(e)}


def list_helius_webhooks() -> Dict:
    """Diagnostic only — GET every webhook currently registered on this
    Helius API key, so we can tell from the OUTSIDE whether sync_helius_
    webhook() has ever actually succeeded (and what it's really pointing
    at / tracking), without needing server log access. Never called from
    the cron/webhook hot path, only from the admin debug endpoint."""
    if not HELIUS_API_KEY:
        return {"ok": False, "error": "HELIUS_API_KEY not set"}
    try:
        url = f"{HELIUS_WEBHOOKS_BASE}?api-key={HELIUS_API_KEY}"
        with urlopen(Request(url), timeout=15) as resp:
            data = json.loads(resp.read().decode())
        webhooks = data if isinstance(data, list) else []
        return {
            "ok": True,
            "webhooks": [
                {
                    "webhookID": w.get("webhookID"),
                    "webhookURL": w.get("webhookURL"),
                    "transactionTypes": w.get("transactionTypes"),
                    "webhookType": w.get("webhookType"),
                    "accountAddressCount": len(w.get("accountAddresses") or []),
                    "hasAuthHeader": bool(w.get("authHeader")),
                }
                for w in webhooks
            ],
        }
    except HTTPError as e:
        detail = e.read().decode(errors="ignore") if hasattr(e, "read") else str(e)
        return {"ok": False, "error": f"HTTP {e.code}: {detail[:300]}"}
    except (URLError, TimeoutError) as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _is_tracked(account: Optional[str], tracked: Set[str]) -> bool:
    return bool(account) and account in tracked


def parse_helius_swap(tx: Dict, tracked: Set[str]) -> Optional[Dict]:
    """One Helius Enhanced "SWAP" transaction -> a normalized event dict,
    or None if it doesn't involve a tracked wallet or can't be parsed into
    a clean buy/sell. Paper position sizing never depends on the real
    trader's own trade size (BUDJU always sizes its own paper trade at a
    fixed COPYTRADE_PAPER_SIZE_USD), so `amountUsd` here is informational
    only for the public signals feed, not load-bearing."""
    if tx.get("type") != "SWAP":
        return None
    signature = tx.get("signature")
    if not signature:
        return None

    swap = (tx.get("events") or {}).get("swap") or {}
    token_inputs = swap.get("tokenInputs") or []
    token_outputs = swap.get("tokenOutputs") or []
    native_input = swap.get("nativeInput") or {}
    native_output = swap.get("nativeOutput") or {}

    # Identify the tracked wallet: prefer the fee payer (the actual
    # signer), fall back to any tokenInput/tokenOutput userAccount that's
    # tracked (covers swaps routed through an aggregator where feePayer
    # can differ from the end trader in some edge cases).
    wallet = tx.get("feePayer") if _is_tracked(tx.get("feePayer"), tracked) else None
    if not wallet:
        for leg in (*token_inputs, *token_outputs):
            account = leg.get("userAccount")
            if _is_tracked(account, tracked):
                wallet = account
                break
    if not wallet:
        return None

    # Which side did THIS wallet give vs. receive?
    given_mints = {SOL_MINT} if native_input.get("account") == wallet and float(native_input.get("amount") or 0) > 0 else set()
    received_mints = {SOL_MINT} if native_output.get("account") == wallet and float(native_output.get("amount") or 0) > 0 else set()
    given_mints |= {t.get("mint") for t in token_inputs if t.get("userAccount") == wallet and t.get("mint")}
    received_mints |= {t.get("mint") for t in token_outputs if t.get("userAccount") == wallet and t.get("mint")}

    given_other = given_mints - _STABLE_OR_NATIVE
    received_other = received_mints - _STABLE_OR_NATIVE

    if received_other and not given_other:
        side = "buy"
        token_mint = next(iter(received_other))
    elif given_other and not received_other:
        side = "sell"
        token_mint = next(iter(given_other))
    else:
        # Token-for-token swap (neither leg is SOL/USDC) or couldn't tell
        # which side is "the" position — not something Phase 1 tries to
        # paper-trade.
        return None

    amount_usd = None
    for t in token_outputs if side == "buy" else token_inputs:
        if t.get("mint") == USDC_MINT and t.get("userAccount") == wallet:
            try:
                amount_usd = float(t.get("tokenAmount") or 0)
            except (TypeError, ValueError):
                amount_usd = None

    return {
        "walletAddress": wallet,
        "signature": signature,
        "side": side,
        "tokenMint": token_mint,
        "amountUsd": amount_usd,
        "slot": tx.get("slot"),
        "blockTime": tx.get("timestamp"),
        "source": "helius",
    }
