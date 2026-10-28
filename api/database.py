# ==========================================
# MongoDB Database Handler
# ==========================================
# Share-based (NAV) accounting for fair multi-user pools.
# NAV per share = totalPoolValue / totalShares
# On deposit: sharesIssued = depositAmount / currentNAV
# User value = userShares x currentNAV
# ==========================================

import os
import json
import time
import urllib.request
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import base58
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "flub")

# Admin wallet addresses (set via env var, comma-separated)
ADMIN_WALLETS = [w.strip() for w in os.getenv("ADMIN_WALLETS", "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq").split(",") if w.strip()]

# On-chain deposit address and token mint — mirrors src/constants/addresses.ts
# and api/rpc.ts's endpoint selection (Helius if configured, else public RPC).
POOL_WALLET = os.getenv("POOL_WALLET", "2DfxgAZ655zkgt16r53e6qZ9Cf2Rse7iCGnypDk3nFhD")
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
# BUDJU token mint — mirrors src/constants/addresses.ts TOKEN_ADDRESS. Used
# to server-side-verify the "10M BUDJU" gate for the non-custodial trading
# feature; the client-side check in WalletConnect/Balance.tsx is UI-only and
# must not be the only thing standing between a wallet and saving exchange keys.
BUDJU_MINT = os.getenv("BUDJU_MINT", "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump")
BUDJU_GATE_REQUIRED = 10_000_000
_HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
_SOLANA_RPC_PRIMARY = (
    f"https://mainnet.helius-rpc.com/?api-key={_HELIUS_API_KEY}" if _HELIUS_API_KEY
    else "https://api.mainnet-beta.solana.com"
)
_SOLANA_RPC_FALLBACK = "https://api.mainnet-beta.solana.com"

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]

# Collections
users_collection = db["users"]
trades_collection = db["trades"]
deposits_collection = db["deposits"]
withdrawals_collection = db["withdrawals"]
trader_state_collection = db["trader_state"]
pool_state_collection = db["pool_state"]
user_preferences_collection = db["user_preferences"]
desk_notes_collection = db["desk_notes"]
desk_briefs_collection = db["desk_briefs"]
# Non-custodial trading (Oct 2026 pivot): each user's own, encrypted Swyftx
# API key. Deliberately a separate collection from `users` — this holds a
# secret, so it gets its own narrow set of accessors instead of riding along
# on every other users_collection read.
user_exchange_keys_collection = db["user_exchange_keys"]
# Per-user auto-trade tier settings/targets/cooldowns — mirrors
# trader_state_collection's shape but keyed by walletAddress instead of a
# single "admin_state" doc, so each connected user gets an independent bot.
user_trader_state_collection = db["user_trader_state"]
# Per-user trade log (Phase 2 execution). This is BUDJU's own ledger of what
# IT bought/sold for that wallet — the bot only ever trusts this, never the
# account's raw balance, so it can never touch coins the user holds that it
# didn't buy itself. Also backs each user's own Activity view.
user_trades_collection = db["user_trades"]
# code -> CoinGecko id, resolved once for any coin a connected wallet holds
# that isn't in the static ASSET_CG_IDS registry, then cached here forever
# (including a cached "not found" as cgId: None) so BUDJU never re-runs the
# full CoinGecko coin-list lookup for the same coin twice. This is what lets
# the bot price and trade literally any coin a user holds, not just the
# ~30 originally hand-picked ones.
dynamic_coin_registry_collection = db["dynamic_coin_registry"]
# How long a "CoinGecko id not found" resolution is trusted before
# resolve_coingecko_id() retries it. See that function's docstring —
# caching a negative result forever let one transient CoinGecko failure
# silently and permanently block a coin from ever being priced/traded.
NEGATIVE_CACHE_HOURS = 6
# Lifetime deposit/withdrawal ledger for the non-custodial model (Oct 2026).
# Deliberately separate from deposits_collection/withdrawals_collection —
# those mint/burn shares against the legacy shared-pool NAV, which no
# longer exists for a non-custodial wallet. This collection is just a plain
# dollar ledger per wallet: BUDJU never sees a user's real Swyftx deposit
# history, so an admin records it (in USD) from what that wallet's owner
# reports from their own Swyftx transaction history. Net P&L for a wallet is
# then: liveValue + totalWithdrawn - totalDeposited — same shape as the old
# share-based P&L, just against a live Swyftx balance instead of shares×NAV.
wallet_cash_flows_collection = db["wallet_cash_flows"]
# ── Signals / Copy Trading (Phase 1 — paper trading only, no real funds) ──
# Tracked Solana wallets (seeded from a public Dune dashboard + auto-filtered
# for wash-trading/bot behaviour), the raw swap events ingested for them via
# a Helius webhook, and the paper positions BUDJU simulates off those swaps.
# Entirely separate from every Swyftx/spot/perp collection above — this
# never touches real funds or a user's own exchange key.
copytrade_wallets_collection = db["copytrade_wallets"]
# Raw per-swap events, kept only for a bounded window (see TTL index below)
# so this can't repeat the "wrote every-minute candles until the free Mongo
# tier filled up" mistake perp_price_history already made once. Long-term
# per-wallet performance lives in copytrade_wallets' running stats instead,
# which is tiny and never pruned.
copytrade_events_collection = db["copytrade_events"]
copytrade_positions_collection = db["copytrade_positions"]
# Small singleton-style state docs (_id is a fixed string per concern) —
# e.g. the Helius webhook ID/address-list hash, last Dune refresh time.
copytrade_state_collection = db["copytrade_state"]

# Create indexes (create_index is idempotent — safe to run on every cold start)
users_collection.create_index("walletAddress", unique=True)
trades_collection.create_index([("timestamp", -1)])
deposits_collection.create_index([("userId", 1), ("timestamp", -1)])
deposits_collection.create_index("txHash", unique=True)
trades_collection.create_index("swyftxId", unique=True, sparse=True)
withdrawals_collection.create_index([("userId", 1), ("timestamp", -1)])
trades_collection.create_index([("coin", 1), ("timestamp", -1)])
users_collection.create_index([("isActive", 1), ("shares", -1)])
user_preferences_collection.create_index("walletAddress", unique=True)
desk_notes_collection.create_index([("createdAt", -1)])
desk_briefs_collection.create_index([("createdAt", -1)])
user_exchange_keys_collection.create_index("walletAddress", unique=True)
user_trader_state_collection.create_index("walletAddress", unique=True)
user_trades_collection.create_index([("walletAddress", 1), ("timestamp", -1)])
dynamic_coin_registry_collection.create_index("code", unique=True)
wallet_cash_flows_collection.create_index([("walletAddress", 1), ("timestamp", 1)])
copytrade_wallets_collection.create_index("address", unique=True)
copytrade_wallets_collection.create_index([("status", 1), ("stats.totalPnlUsd", -1)])
copytrade_events_collection.create_index("signature", unique=True)
copytrade_events_collection.create_index([("walletAddress", 1), ("blockTime", -1)])
# TTL index — raw swap events auto-expire 90 days after ingestion. This is
# the deliberate fix for the MongoDB-fills-up lesson: unlike perp candles,
# nothing here needs to survive past the retention window, because every
# number that matters long-term (wins/losses/P&L per wallet) is already
# rolled up onto copytrade_wallets_collection at close time.
copytrade_events_collection.create_index("createdAt", expireAfterSeconds=90 * 24 * 60 * 60)
copytrade_positions_collection.create_index([("walletAddress", 1), ("status", 1)])
copytrade_positions_collection.create_index([("status", 1), ("entryAt", -1)])
copytrade_positions_collection.create_index([("walletAddress", 1), ("tokenMint", 1), ("status", 1)])


def verify_wallet_signature(wallet_address: str, message: str, signature: List[int]) -> bool:
    try:
        public_key_bytes = base58.b58decode(wallet_address)
        verify_key = VerifyKey(public_key_bytes)
        signature_bytes = bytes(signature)
        message_bytes = message.encode('utf-8')
        verify_key.verify(message_bytes, signature_bytes)
        return True
    except (BadSignatureError, Exception) as e:
        print(f"Signature verification failed: {e}")
        return False


def register_user(wallet_address: str, signature: List[int] = None, message: str = None) -> Dict:
    if signature and message:
        if not verify_wallet_signature(wallet_address, message, signature):
            raise ValueError("Invalid signature")

    existing_user = users_collection.find_one({"walletAddress": wallet_address})
    if existing_user:
        users_collection.update_one(
            {"walletAddress": wallet_address},
            {"$set": {"lastLogin": datetime.utcnow()}}
        )
        return format_user_data(existing_user)

    new_user = {
        "walletAddress": wallet_address,
        "shares": 0.0,
        "allocation": 0.0,
        "totalDeposited": 0.0,
        "totalWithdrawn": 0.0,
        "holdings": {},
        "joinedDate": datetime.utcnow(),
        "lastLogin": datetime.utcnow(),
        "isActive": True
    }

    try:
        users_collection.insert_one(new_user)
        return format_user_data(new_user)
    except DuplicateKeyError:
        existing_user = users_collection.find_one({"walletAddress": wallet_address})
        return format_user_data(existing_user)


def is_admin(wallet_address: str) -> bool:
    return wallet_address in ADMIN_WALLETS


def format_user_data(user: Dict) -> Dict:
    wallet = user["walletAddress"]
    return {
        "walletAddress": wallet,
        "role": "admin" if is_admin(wallet) else "user",
        "shares": user.get("shares", 0.0),
        "allocation": user.get("allocation", 0.0),
        "totalDeposited": user.get("totalDeposited", 0.0),
        "totalWithdrawn": user.get("totalWithdrawn", 0.0),
        "holdings": user.get("holdings", {}),
        "joinedDate": user.get("joinedDate").isoformat() if user.get("joinedDate") else None,
        "isActive": user.get("isActive", True)
    }


# ── Pool Share State ────────────────────────────────────────────────────────

def get_pool_state() -> Dict:
    doc = pool_state_collection.find_one({"_id": "pool"})
    if not doc:
        return {"totalShares": 0, "initialized": None,
                "lastNav": None, "lastPoolValue": None, "navUpdatedAt": None}
    return {
        "totalShares": doc.get("totalShares", 0),
        "initialized": doc.get("initialized"),
        "lastNav": doc.get("lastNav"),
        "lastPoolValue": doc.get("lastPoolValue"),
        "navUpdatedAt": doc.get("navUpdatedAt"),
    }


# ── NAV snapshotting ────────────────────────────────────────────────────────
# A deposit must be priced at the NAV that existed *before* it landed. The old
# code fell back to NAV $1.00 whenever it could not work one out, which silently
# minted shares at the wrong price and moved every holder's P&L. We now keep a
# rolling snapshot of the last known-good NAV so there is always a sane price to
# fall back on, and refuse to guess when there isn't.

NAV_SANITY_FACTOR = 1.5   # reject a snapshot >50% away from the last one


def _snapshot_nav(total_pool_value: float, force: bool = False) -> Optional[float]:
    """Persist the current NAV on pool_state. Returns the NAV stored, or None.

    `total_pool_value` must be a live, real pool value. Garbage values (<= 0)
    are ignored, and a value that would move NAV by more than NAV_SANITY_FACTOR
    is rejected unless `force` is set (initialize / recalibrate).
    """
    try:
        total_pool_value = float(total_pool_value or 0)
    except (TypeError, ValueError):
        return None
    if total_pool_value <= 0:
        return None

    doc = pool_state_collection.find_one({"_id": "pool"})
    if not doc:
        return None
    total_shares = float(doc.get("totalShares", 0) or 0)
    if total_shares <= 0:
        return None

    nav = total_pool_value / total_shares
    if nav <= 0:
        return None

    prev = doc.get("lastNav")
    if not force and prev and float(prev) > 0:
        ratio = nav / float(prev)
        if ratio > NAV_SANITY_FACTOR or ratio < (1.0 / NAV_SANITY_FACTOR):
            return None

    pool_state_collection.update_one(
        {"_id": "pool"},
        {"$set": {
            "lastNav": nav,
            "lastPoolValue": total_pool_value,
            "navUpdatedAt": datetime.utcnow(),
        }},
    )
    return nav


def _resolve_deposit_nav(pre_deposit_value: float, total_shares: float) -> tuple:
    """Work out the NAV a deposit should be priced at.

    Returns (nav, source). Raises ValueError rather than guessing $1.00 when the
    pool already holds shares but no NAV can be established — minting at the
    wrong NAV is worse than failing the deposit.

    A "live" pool value is still just a client-supplied number — if the
    client's crypto/price fetch silently degraded (e.g. returned $0 for
    holdings instead of failing), it can produce a wildly wrong NAV and
    over/under-mint shares. Sanity-check a live value against the last known
    snapshot using the same NAV_SANITY_FACTOR bound used for snapshots
    themselves; a live value outside that band is rejected in favour of the
    snapshot (real fairness bug fixed 2026-10-22: a $5 self-service deposit
    was priced off a "pool value" that only counted USDC cash, not crypto
    holdings, minting ~140x too many shares).
    """
    if total_shares <= 0:
        # Genuinely the first money in: NAV is $1.00 by definition.
        return 1.0, "bootstrap"

    last_nav = get_pool_state().get("lastNav")
    has_last_nav = bool(last_nav and float(last_nav) > 0)

    if pre_deposit_value and pre_deposit_value > 0:
        live_nav = pre_deposit_value / total_shares
        if has_last_nav:
            ratio = live_nav / float(last_nav)
            if ratio > NAV_SANITY_FACTOR or ratio < (1.0 / NAV_SANITY_FACTOR):
                # Live value disagrees with the last snapshot by more than the
                # sanity band — trust the snapshot, not the live fetch.
                return float(last_nav), "last_snapshot_rejected_live"
        return live_nav, "live"

    if has_last_nav:
        return float(last_nav), "last_snapshot"

    raise ValueError(
        "Cannot price this deposit: no live pool value supplied and no NAV "
        "snapshot available. Open the admin dashboard (which refreshes the NAV "
        "snapshot) and try again."
    )


def get_user_shares_total() -> float:
    """Sum of shares held by non-admin users only.
    Used for diagnostics.  For NAV and allocation calculations, always use
    pool.totalShares which includes the admin's pre-existing capital
    (phantom shares from initialize_pool)."""
    pipeline = [
        {"$match": {"isActive": True, "shares": {"$gt": 0},
                     "walletAddress": {"$nin": ADMIN_WALLETS}}},
        {"$group": {"_id": None, "total": {"$sum": "$shares"}}}
    ]
    result = list(users_collection.aggregate(pipeline))
    return result[0]["total"] if result else 0.0


def initialize_pool(total_pool_value: float) -> Dict:
    existing = pool_state_collection.find_one({"_id": "pool"})
    if existing:
        return {
            "success": True,
            "totalShares": existing["totalShares"],
            "nav": 1.0,
            "alreadyInitialized": True
        }

    pool_state_collection.insert_one({
        "_id": "pool",
        "totalShares": total_pool_value,
        "initialized": datetime.utcnow(),
        "lastNav": 1.0,
        "lastPoolValue": total_pool_value,
        "navUpdatedAt": datetime.utcnow(),
    })

    return {
        "success": True,
        "totalShares": total_pool_value,
        "nav": 1.0,
        "alreadyInitialized": False
    }


def recalibrate_pool(total_pool_value: float) -> Dict:
    """Snapshot the pool: reset every user's deposit to their current value.

    Calculates each user's current share value, then sets:
      - totalDeposited = current value  (P&L resets to 0%)
      - shares = current value          (NAV resets to $1.00)
      - totalShares = total_pool_value

    After this, every user's P&L starts fresh from their actual position.
    """
    pool = get_pool_state()
    old_total_shares = pool["totalShares"]
    old_nav = (total_pool_value / old_total_shares) if old_total_shares > 0 else 1.0

    non_admin_users = list(users_collection.find({
        "isActive": True,
        "walletAddress": {"$nin": ADMIN_WALLETS}
    }))

    total_user_value = 0.0

    # Set each user's deposited = their current share value (P&L → 0%)
    for user in non_admin_users:
        old_shares = user.get("shares", 0.0)
        current_value = old_shares * old_nav
        allocation = (current_value / total_pool_value * 100) if total_pool_value > 0 else 0
        total_user_value += current_value

        users_collection.update_one(
            {"walletAddress": user["walletAddress"]},
            {"$set": {
                "totalDeposited": round(current_value, 2),
                "shares": current_value,
                "allocation": round(allocation, 2)
            }}
        )

    # Reset pool totalShares = current pool value (NAV → $1.00)
    pool_state_collection.update_one(
        {"_id": "pool"},
        {"$set": {
            "totalShares": total_pool_value,
            "recalibrated": datetime.utcnow(),
            "lastNav": 1.0,
            "lastPoolValue": total_pool_value,
            "navUpdatedAt": datetime.utcnow(),
        }},
        upsert=True
    )

    admin_capital = total_pool_value - total_user_value

    return {
        "success": True,
        "totalShares": total_pool_value,
        "nav": 1.0,
        "adminCapital": round(admin_capital, 2),
        "totalUserValue": round(total_user_value, 2),
        "usersRecalibrated": len(non_admin_users)
    }


def get_nav(total_pool_value: float) -> float:
    pool = get_pool_state()
    total_shares = pool["totalShares"]
    if total_shares <= 0 or total_pool_value <= 0:
        return 1.0
    return total_pool_value / total_shares


# ── User Position ───────────────────────────────────────────────────────────

def get_user_position(wallet_address: str, total_pool_value: float) -> Dict:
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        return {
            "shares": 0, "nav": 1.0, "currentValue": 0,
            "allocation": 0, "totalDeposited": 0, "totalWithdrawn": 0
        }

    pool = get_pool_state()
    total_shares = pool["totalShares"]
    user_shares = user.get("shares", 0.0)
    nav = total_pool_value / total_shares if total_shares > 0 else 1.0

    return {
        "shares": user_shares,
        "nav": nav,
        "currentValue": user_shares * nav,
        "allocation": (user_shares / total_shares * 100) if total_shares > 0 else 0,
        "totalDeposited": user.get("totalDeposited", 0.0),
        # P&L must be (currentValue + totalWithdrawn) - totalDeposited, not just
        # currentValue - totalDeposited — totalDeposited is a lifetime gross
        # figure that's never reduced by a withdrawal, so money already taken
        # out would otherwise look like a loss instead of realized value.
        "totalWithdrawn": user.get("totalWithdrawn", 0.0)
    }


def get_user_portfolio(wallet_address: str) -> Optional[Dict]:
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        return None

    wallet = user["walletAddress"]
    return {
        "walletAddress": wallet,
        "role": "admin" if is_admin(wallet) else "user",
        "shares": user.get("shares", 0.0),
        "allocation": user.get("allocation", 0.0),
        "totalDeposited": user.get("totalDeposited", 0.0),
        "holdings": user.get("holdings", {}),
        "joinedDate": user.get("joinedDate").isoformat() if user.get("joinedDate") else None
    }


def get_user_deposits(wallet_address: str) -> List[Dict]:
    cursor = deposits_collection.find(
        {"userId": wallet_address},
        {"_id": 0, "userId": 0}
    ).sort("timestamp", -1)

    deposits = []
    for doc in cursor:
        d = dict(doc)
        if "timestamp" in d and d["timestamp"]:
            d["timestamp"] = d["timestamp"].isoformat()
        deposits.append(d)
    return deposits


# ── On-chain Deposit Verification ───────────────────────────────────────────
# A wallet's signAndSendTransaction() only guarantees a transaction was
# signed and broadcast — not that it was ever confirmed. On Solana, a
# transaction can be silently dropped (e.g. its blockhash expires before any
# validator includes it) with no error surfaced to the app, yet the caller
# still gets back a perfectly valid-looking signature. Confirmed live on
# 2026-10-22: a self-service deposit was recorded and credited ~430 pool
# shares (~$350) for a transaction that does not exist anywhere on the
# Solana ledger — no USDC ever arrived. This verifies the transaction
# actually landed and moved the claimed amount before any shares are issued.

def _solana_rpc(method: str, params: list, timeout: int = 10) -> Dict:
    """Minimal stdlib-only Solana JSON-RPC call. Tries Helius first (if
    configured), falls back to the public RPC on any failure."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    endpoints = [_SOLANA_RPC_PRIMARY]
    if _SOLANA_RPC_PRIMARY != _SOLANA_RPC_FALLBACK:
        endpoints.append(_SOLANA_RPC_FALLBACK)
    last_error = None
    for url in endpoints:
        try:
            req = urllib.request.Request(
                url, data=body, headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            last_error = e
    raise last_error


def verify_onchain_usdc_deposit(tx_hash: str, sender_wallet: str, claimed_amount: float) -> Tuple[bool, Optional[str]]:
    """Confirm a self-service deposit's signature actually exists on-chain,
    succeeded, and moved at least `claimed_amount` USDC into POOL_WALLET.
    Returns (is_valid, error_message)."""
    if not tx_hash or len(str(tx_hash)) < 64:
        return False, "Invalid transaction signature"

    try:
        resp = _solana_rpc(
            "getTransaction",
            [tx_hash, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
        )
    except Exception:
        return False, "Could not reach Solana to verify this transaction. Please try again shortly."

    result = resp.get("result")
    if not result:
        return False, (
            "Transaction not found on-chain. If you just sent it, it may still be "
            "confirming — wait a few seconds and try again. If it keeps failing, "
            "the transfer likely didn't go through and no USDC left your wallet."
        )

    if result.get("meta", {}).get("err") is not None:
        return False, "This transaction failed on-chain — no USDC was transferred."

    meta = result.get("meta", {})
    pre_balances = {b.get("owner"): b for b in meta.get("preTokenBalances", []) if b.get("mint") == USDC_MINT}
    post_balances = {b.get("owner"): b for b in meta.get("postTokenBalances", []) if b.get("mint") == USDC_MINT}

    def _ui_amount(balances: dict, owner: str) -> float:
        return (balances.get(owner, {}).get("uiTokenAmount", {}) or {}).get("uiAmount") or 0

    pool_delta = _ui_amount(post_balances, POOL_WALLET) - _ui_amount(pre_balances, POOL_WALLET)
    if pool_delta <= 0:
        return False, "This transaction didn't transfer any USDC into the BUDJU pool wallet."

    if pool_delta < claimed_amount - 0.01:
        return False, (
            f"On-chain transfer (${pool_delta:.2f} USDC) is less than the claimed "
            f"deposit (${claimed_amount:.2f}). Not recording a deposit larger than "
            f"what actually arrived."
        )

    # Confirm the funds actually came from the wallet claiming the deposit —
    # otherwise anyone could replay someone else's real deposit signature.
    # The sender must appear in the transaction's own USDC balance deltas
    # with a decrease; absence from those deltas is just as suspicious as a
    # non-negative delta (it means this signature moved USDC into the pool
    # from someone else entirely).
    sender_delta = _ui_amount(post_balances, sender_wallet) - _ui_amount(pre_balances, sender_wallet)
    if sender_delta >= 0:
        return False, "This transaction wasn't sent from your wallet."

    return True, None


# ── Deposit with Share Issuance ─────────────────────────────────────────────

def record_deposit(wallet_address: str, amount: float, tx_hash: str,
                   total_pool_value: float, currency: str = "USDC",
                   value_includes_deposit: bool = True) -> Dict:
    """Record a deposit and issue shares at the PRE-deposit NAV.

    `value_includes_deposit` says whether `total_pool_value` already contains
    this deposit:
      True  — admin records a deposit after the money has landed in Swyftx, so
              the live pool value includes it and we subtract it back out.
      False — self-service Phantom deposit. The USDC went on-chain to
              POOL_WALLET, so the Swyftx-derived pool value does NOT include it
              and must be used as-is.
    Getting this wrong (or passing 0) is what used to mint shares at NAV $1.00
    and move every holder's P&L the moment a deposit was recorded.
    """
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        raise ValueError("User not found")

    # Guard against the same on-chain signature being recorded twice (e.g. a
    # resubmitted/replayed txHash double-minting shares for one real transfer).
    if deposits_collection.find_one({"txHash": tx_hash, "status": {"$ne": "voided"}}):
        raise ValueError("This transaction has already been recorded as a deposit.")

    # Idempotency guard: block an identical deposit recorded in the last 5 minutes
    # (prevents accidental double-clicks / retries from minting phantom shares).
    duplicate = deposits_collection.find_one({
        "userId": wallet_address,
        "amount": amount,
        "currency": currency,
        "status": {"$ne": "voided"},
        "timestamp": {"$gte": datetime.utcnow() - timedelta(minutes=5)},
    })
    if duplicate:
        raise ValueError("Duplicate deposit blocked: an identical deposit was recorded in the last 5 minutes.")

    pool = get_pool_state()
    if pool["totalShares"] <= 0:
        # Only bootstrap the pool from a real pool value. A 0/blank value here
        # would create a pool whose NAV is meaningless.
        if total_pool_value and total_pool_value > 0:
            initialize_pool(total_pool_value)
            pool = get_pool_state()

    try:
        supplied_value = float(total_pool_value or 0)
    except (TypeError, ValueError):
        supplied_value = 0.0

    if supplied_value > 0 and value_includes_deposit:
        pre_deposit_value = supplied_value - amount
    else:
        pre_deposit_value = supplied_value

    nav, nav_source = _resolve_deposit_nav(pre_deposit_value, pool["totalShares"])

    shares_issued = amount / nav

    deposit = {
        "userId": wallet_address,
        "amount": amount,
        "currency": currency,
        "txHash": tx_hash,
        "shares": shares_issued,
        "nav": nav,
        "navSource": nav_source,
        "valueIncludesDeposit": value_includes_deposit,
        "poolValueAtDeposit": supplied_value or None,
        "timestamp": datetime.utcnow(),
        "status": "completed"
    }
    deposits_collection.insert_one(deposit)

    pool_state_collection.update_one(
        {"_id": "pool"},
        {"$inc": {"totalShares": shares_issued}}
    )

    new_total_deposited = user.get("totalDeposited", 0.0) + amount
    new_shares = user.get("shares", 0.0) + shares_issued
    users_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": {
            "totalDeposited": new_total_deposited,
            "shares": new_shares
        }}
    )

    _recalculate_allocations()

    # NAV is unchanged by a deposit: new shares were priced at the old NAV, so
    # post-deposit pool value / post-deposit shares == nav. Re-snapshot it so
    # the next deposit has a fresh fallback even if no admin page is opened.
    _snapshot_nav(nav * (pool["totalShares"] + shares_issued), force=True)

    return {
        "success": True,
        "shares": shares_issued,
        "nav": nav,
        "navSource": nav_source,
        "totalShares": pool["totalShares"] + shares_issued,
        "newTotalDeposited": new_total_deposited,
        "userShares": new_shares
    }


def record_withdrawal(wallet_address: str, amount: float, total_pool_value: float,
                      currency: str = "USDC") -> Dict:
    """Record a withdrawal — burns shares proportional to amount at current NAV."""
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        raise ValueError("User not found")

    pool = get_pool_state()
    total_shares = pool.get("totalShares", 0)
    if total_shares <= 0:
        raise ValueError("Pool not initialized")

    # Snapshot the PRE-withdrawal NAV. The live total_pool_value passed in is
    # post-withdrawal (the money has already left Swyftx by the time the admin
    # records it), so add the amount back — mirrors record_deposit's
    # pre_deposit_value = total_pool_value - amount. Using the collapsed
    # post-withdrawal value here would over-burn shares and drift NAV.
    pre_withdrawal_value = total_pool_value + amount
    nav = pre_withdrawal_value / total_shares if total_shares > 0 else 1.0
    shares_to_burn = amount / nav
    user_shares = user.get("shares", 0.0)

    if shares_to_burn > user_shares:
        shares_to_burn = user_shares

    withdrawal = {
        "userId": wallet_address,
        "amount": amount,
        "currency": currency,
        "shares": shares_to_burn,
        "nav": nav,
        "timestamp": datetime.utcnow(),
        "status": "completed",
    }
    withdrawals_collection.insert_one(withdrawal)

    pool_state_collection.update_one(
        {"_id": "pool"},
        {"$inc": {"totalShares": -shares_to_burn}}
    )

    new_shares = max(0, user_shares - shares_to_burn)
    total_withdrawn = user.get("totalWithdrawn", 0.0) + amount
    users_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": {
            "shares": new_shares,
            "totalWithdrawn": total_withdrawn,
        }}
    )

    _recalculate_allocations()

    _snapshot_nav(nav * (total_shares - shares_to_burn), force=True)

    return {
        "success": True,
        "shares_burned": shares_to_burn,
        "nav": nav,
        "totalShares": total_shares - shares_to_burn,
        "newTotalWithdrawn": total_withdrawn,
        "userShares": new_shares,
    }


def correct_unrecorded_withdrawal(admin_wallet, amount, current_pool_value,
                                  dry_run=True, marker="admin_correction_2026_07_16"):
    """One-off, IDEMPOTENT correction for a withdrawal that was never recorded.

    Reconstructs the pre-withdrawal NAV = (current_pool_value + amount)/shares,
    burns ONLY the admin's shares at that NAV, which restores NAV and every
    other holder's dollar value to pre-withdrawal levels.

    dry_run=True (default) computes + returns the full before/after report and
    writes NOTHING. Applies only when dry_run=False AND not already applied.
    """
    from withdrawal_math import reconstruct

    pool = get_pool_state()
    total_shares = pool.get("totalShares", 0)
    if total_shares <= 0:
        raise ValueError("Pool not initialized")

    admin = users_collection.find_one({"walletAddress": admin_wallet})
    if not admin:
        raise ValueError("Admin wallet not found")
    admin_shares = float(admin.get("shares", 0.0))

    already = withdrawals_collection.find_one({"txHash": marker}) is not None

    r = reconstruct(current_pool_value, total_shares, amount, admin_shares)
    burn = r["sharesToBurn"]
    current_nav = r["currentNav"]
    restored_nav = r["restoredNav"]
    admin_set = set(ADMIN_WALLETS)

    holders = list(users_collection.find({"isActive": True}))
    report = []
    for u in holders:
        w = u.get("walletAddress")
        sh = float(u.get("shares", 0.0))
        new_sh = (sh - burn) if (w == admin_wallet) else sh
        report.append({
            "wallet": w,
            "isAdmin": w in admin_set,
            "sharesBefore": round(sh, 6),
            "sharesAfter": round(new_sh, 6),
            "valueBefore": round(sh * current_nav, 2),
            "valueAfter": round(new_sh * restored_nav, 2),
            "totalDeposited": round(float(u.get("totalDeposited", 0.0)), 2),
        })

    result = {
        "dryRun": dry_run,
        "alreadyApplied": already,
        "amount": round(amount, 2),
        "currentPoolValue": round(current_pool_value, 2),
        "totalShares": round(total_shares, 6),
        "adminShares": round(admin_shares, 6),
        "adminCoversAmount": (admin_shares * r["preWithdrawalNav"]) >= (amount - 0.01),
        "currentNav": round(current_nav, 6),
        "preWithdrawalNav": round(r["preWithdrawalNav"], 6),
        "restoredNav": round(restored_nav, 6),
        "sharesToBurn": round(burn, 6),
        "newTotalShares": round(r["newTotalShares"], 6),
        "holders": report,
    }

    if dry_run or already:
        return result

    # ── APPLY — only reached when dry_run=False and not already applied ──
    pool_state_collection.update_one({"_id": "pool"}, {"$inc": {"totalShares": -burn}})
    users_collection.update_one(
        {"walletAddress": admin_wallet},
        {"$inc": {"shares": -burn, "totalWithdrawn": amount}},
    )
    withdrawals_collection.insert_one({
        "userId": admin_wallet, "amount": amount, "currency": "AUD",
        "shares": burn, "nav": r["preWithdrawalNav"], "timestamp": datetime.utcnow(),
        "status": "completed", "txHash": marker,
        "note": "One-off correction for unrecorded 2026-07-16 withdrawal",
    })
    _recalculate_allocations()
    result["applied"] = True
    return result


def _recalculate_allocations():
    pool = get_pool_state()
    total_shares = pool["totalShares"]
    if total_shares <= 0:
        return

    users = list(users_collection.find({
        "isActive": True, "shares": {"$gt": 0},
        "walletAddress": {"$nin": ADMIN_WALLETS}
    }))
    for user in users:
        user_shares = user.get("shares", 0.0)
        allocation = (user_shares / total_shares) * 100.0
        users_collection.update_one(
            {"walletAddress": user["walletAddress"]},
            {"$set": {"allocation": allocation}}
        )


def record_trade(coin: str, trade_type: str, amount: float, price: float,
                  user_allocations: Dict[str, float],
                  swyftx_id: str = None, trade_timestamp: str = None) -> Dict:
    trade = {
        "coin": coin,
        "type": trade_type,
        "amount": amount,
        "price": price,
        "timestamp": datetime.fromisoformat(trade_timestamp.replace('Z', '+00:00')) if trade_timestamp else datetime.utcnow(),
        "userAllocations": user_allocations
    }
    if swyftx_id:
        trade["swyftxId"] = swyftx_id

    trade_id = trades_collection.insert_one(trade).inserted_id

    for wallet_address, allocation_pct in user_allocations.items():
        user_share = amount * (allocation_pct / 100.0)

        if trade_type == 'buy':
            users_collection.update_one(
                {"walletAddress": wallet_address},
                {"$inc": {f"holdings.{coin}": user_share}}
            )
        elif trade_type == 'sell':
            users_collection.update_one(
                {"walletAddress": wallet_address},
                {"$inc": {f"holdings.{coin}": -user_share}}
            )

    return {
        "success": True,
        "tradeId": str(trade_id),
        "usersUpdated": len(user_allocations)
    }


# Assets that are funding/cash rather than tradeable positions (excluded from coin cards)
FUNDING_ASSETS = {"USDC", "USD", "AUD", "AUDT", "USDT", "USDC.E"}


def get_coin_stats() -> Dict:
    """Read-only per-coin trading analytics aggregated from the trades collection.

    Returns average-cost (cost-basis) stats only. Current price / unrealized PnL
    are layered on the client with live prices, so this endpoint stays fast and
    price-source agnostic. USDC/AUD etc. are split out as `funding` (the AUD->USDC
    conversions that feed the bot), not treated as tradeable coins.
    """
    pipeline = [
        {"$match": {"coin": {"$ne": None}, "price": {"$gt": 0}, "amount": {"$gt": 0}}},
        {"$group": {
            "_id": "$coin",
            "buys": {"$sum": {"$cond": [{"$eq": ["$type", "buy"]}, 1, 0]}},
            "sells": {"$sum": {"$cond": [{"$eq": ["$type", "sell"]}, 1, 0]}},
            "qtyBought": {"$sum": {"$cond": [{"$eq": ["$type", "buy"]}, "$amount", 0]}},
            "qtySold": {"$sum": {"$cond": [{"$eq": ["$type", "sell"]}, "$amount", 0]}},
            "spent": {"$sum": {"$cond": [{"$eq": ["$type", "buy"]}, {"$multiply": ["$amount", "$price"]}, 0]}},
            "received": {"$sum": {"$cond": [{"$eq": ["$type", "sell"]}, {"$multiply": ["$amount", "$price"]}, 0]}},
            "cheapestBuy": {"$min": {"$cond": [{"$eq": ["$type", "buy"]}, "$price", None]}},
            "dearestBuy": {"$max": {"$cond": [{"$eq": ["$type", "buy"]}, "$price", None]}},
            "cheapestSell": {"$min": {"$cond": [{"$eq": ["$type", "sell"]}, "$price", None]}},
            "dearestSell": {"$max": {"$cond": [{"$eq": ["$type", "sell"]}, "$price", None]}},
            "firstTrade": {"$min": "$timestamp"},
            "lastTrade": {"$max": "$timestamp"},
        }},
        {"$sort": {"spent": -1}},
    ]

    rows = list(trades_collection.aggregate(pipeline))
    coins: List[Dict] = []
    funding: List[Dict] = []
    total_trades = 0

    for r in rows:
        coin = r["_id"]
        buys = int(r.get("buys", 0) or 0)
        sells = int(r.get("sells", 0) or 0)
        total = buys + sells
        total_trades += total

        qty_bought = float(r.get("qtyBought", 0) or 0)
        qty_sold = float(r.get("qtySold", 0) or 0)
        qty_held = qty_bought - qty_sold
        spent = float(r.get("spent", 0) or 0)
        received = float(r.get("received", 0) or 0)
        avg_cost = (spent / qty_bought) if qty_bought > 0 else 0.0
        # Average-cost realized PnL: sale proceeds minus cost of the qty sold
        realized = (received - (qty_sold * avg_cost)) if qty_bought > 0 else received

        first_ts = r.get("firstTrade")
        last_ts = r.get("lastTrade")
        per_week = 0.0
        try:
            if isinstance(first_ts, datetime) and isinstance(last_ts, datetime):
                span_days = max((last_ts - first_ts).total_seconds() / 86400.0, 1.0)
                per_week = round(total / span_days * 7, 1)
        except Exception:
            per_week = 0.0

        entry = {
            "coin": coin,
            "buys": buys,
            "sells": sells,
            "qtyBought": qty_bought,
            "qtySold": qty_sold,
            "qtyHeld": qty_held,
            "spent": round(spent, 2),
            "received": round(received, 2),
            "avgCost": avg_cost,
            "cheapestBuy": r.get("cheapestBuy"),
            "dearestBuy": r.get("dearestBuy"),
            "cheapestSell": r.get("cheapestSell"),
            "dearestSell": r.get("dearestSell"),
            "realizedPnL": round(realized, 2),
            "tradesPerWeek": per_week,
            "firstTrade": first_ts.isoformat() + "Z" if isinstance(first_ts, datetime) else first_ts,
            "lastTrade": last_ts.isoformat() + "Z" if isinstance(last_ts, datetime) else last_ts,
            # No buys but holdings/sells exist => transferred in from an outside wallet,
            # so the cost basis (and therefore PnL) is only partial. Flag it, don't lie.
            "costBasisPartial": (qty_bought <= 0 and sells > 0) or (qty_held < -1e-9),
        }

        if str(coin).upper() in FUNDING_ASSETS:
            entry["isFunding"] = True
            funding.append(entry)
        else:
            coins.append(entry)

    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "totalTrades": total_trades,
        "coinCount": len(coins),
        "coins": coins,
        "funding": funding,
    }


def get_coin_trades(coin: str, limit: int = 500) -> Dict:
    """Individual buy/sell points for one coin, oldest first — for the detail chart."""
    cursor = (
        trades_collection.find(
            {"coin": coin, "price": {"$gt": 0}, "amount": {"$gt": 0}},
            {"_id": 0, "type": 1, "price": 1, "amount": 1, "timestamp": 1},
        )
        .sort("timestamp", 1)
        .limit(limit)
    )
    trades = []
    for d in cursor:
        ts = d.get("timestamp")
        trades.append({
            "t": ts.isoformat() + "Z" if isinstance(ts, datetime) else ts,
            "side": d.get("type"),
            "price": float(d.get("price", 0) or 0),
            "qty": float(d.get("amount", 0) or 0),
        })
    return {"coin": coin, "count": len(trades), "trades": trades}


def get_deposit_summary(wallet: str = None) -> Dict:
    """Deposit totals + the deposit list in one call. Defaults to the admin's
    own deposits (userId in ADMIN_WALLETS) so it's correct regardless of which
    admin wallet is connected and excludes the small public users. Pass a
    specific wallet to scope to it. Totals exclude voided; list includes voided."""
    if wallet:
        query = {"userId": wallet}
    else:
        query = {"userId": {"$in": ADMIN_WALLETS}}
    deposits: List[Dict] = []
    total = 0.0
    count = 0
    by_currency: Dict[str, float] = {}
    for doc in deposits_collection.find(query, {"_id": 0, "userId": 0}).sort("timestamp", -1):
        d = dict(doc)
        ts = d.get("timestamp")
        if isinstance(ts, datetime):
            d["timestamp"] = ts.isoformat() + "Z"
        if isinstance(d.get("voidedAt"), datetime):
            d["voidedAt"] = d["voidedAt"].isoformat() + "Z"
        deposits.append(d)
        if d.get("status") != "voided":
            amt = float(d.get("amount", 0) or 0)
            total += amt
            count += 1
            ccy = d.get("currency", "USDC")
            by_currency[ccy] = by_currency.get(ccy, 0.0) + amt
    return {
        "totalDeposited": round(total, 2),
        "count": count,
        "byCurrency": {k: round(v, 2) for k, v in by_currency.items()},
        "deposits": deposits,
    }


def void_deposit(tx_hash: str) -> Dict:
    """Void a deposit (e.g. an accidental duplicate): reverse its shares from
    the pool and the user, decrement totalDeposited, and mark it voided.
    Soft-delete (status='voided') so it stays auditable."""
    dep = deposits_collection.find_one({"txHash": tx_hash})
    if not dep:
        raise ValueError("Deposit not found")
    if dep.get("status") == "voided":
        raise ValueError("Deposit already voided")

    shares = float(dep.get("shares", 0) or 0)
    amount = float(dep.get("amount", 0) or 0)
    user_id = dep.get("userId")

    pool_state_collection.update_one({"_id": "pool"}, {"$inc": {"totalShares": -shares}})
    if user_id:
        users_collection.update_one(
            {"walletAddress": user_id},
            {"$inc": {"shares": -shares, "totalDeposited": -amount}},
        )
    deposits_collection.update_one(
        {"txHash": tx_hash},
        {"$set": {"status": "voided", "voidedAt": datetime.utcnow()}},
    )
    _recalculate_allocations()

    pool = get_pool_state()
    return {
        "success": True,
        "voided": {"txHash": tx_hash, "amount": round(amount, 2), "shares": round(shares, 4)},
        "totalShares": pool.get("totalShares", 0),
    }


def reprice_deposit(tx_hash: str, correct_nav: float, dry_run: bool = True) -> Dict:
    """Re-issue a deposit's shares at the correct NAV.

    Use this to repair a deposit that was minted at the wrong NAV (e.g. the
    self-service Phantom deposits that fell back to NAV $1.00 and instantly
    shifted every holder's P&L). Adjusts the user's shares and the pool's
    totalShares by the difference — `amount` and `totalDeposited` are untouched
    because the money itself was correct.

    Always run with dry_run=True first and check the numbers.
    """
    if not correct_nav or correct_nav <= 0:
        raise ValueError("correct_nav must be greater than 0")

    dep = deposits_collection.find_one({"txHash": tx_hash})
    if not dep:
        raise ValueError("Deposit not found")
    if dep.get("status") == "voided":
        raise ValueError("Deposit is voided — nothing to reprice")

    amount = float(dep.get("amount", 0) or 0)
    old_shares = float(dep.get("shares", 0) or 0)
    old_nav = float(dep.get("nav", 0) or 0)
    user_id = dep.get("userId")
    if amount <= 0 or not user_id:
        raise ValueError("Deposit has no amount or user — cannot reprice")

    new_shares = amount / correct_nav
    delta = new_shares - old_shares

    pool = get_pool_state()
    result = {
        "txHash": tx_hash,
        "wallet": user_id,
        "amount": round(amount, 2),
        "oldNav": round(old_nav, 6),
        "newNav": round(correct_nav, 6),
        "oldShares": round(old_shares, 4),
        "newShares": round(new_shares, 4),
        "sharesDelta": round(delta, 4),
        "totalSharesBefore": round(float(pool.get("totalShares", 0) or 0), 4),
        "totalSharesAfter": round(float(pool.get("totalShares", 0) or 0) + delta, 4),
        "dryRun": dry_run,
    }

    if dry_run:
        result["success"] = True
        result["applied"] = False
        return result

    pool_state_collection.update_one({"_id": "pool"}, {"$inc": {"totalShares": delta}})
    users_collection.update_one({"walletAddress": user_id}, {"$inc": {"shares": delta}})
    deposits_collection.update_one(
        {"txHash": tx_hash},
        {"$set": {
            "shares": new_shares,
            "nav": correct_nav,
            "navSource": "repriced",
            "repricedAt": datetime.utcnow(),
            "repricedFrom": {"nav": old_nav, "shares": old_shares},
        }},
    )
    _recalculate_allocations()

    # The deposit that's being repriced is almost always the SAME deposit that
    # just force-wrote a wrong lastNav into pool_state (via record_deposit's
    # own force=True snapshot at the bad NAV). If we don't repair that
    # snapshot here too, it's left poisoned: _resolve_deposit_nav() sanity-
    # checks future live NAVs against it, so the NEXT deposit's correct NAV
    # looks like an outlier against the broken snapshot, gets rejected, and
    # falls back to the broken snapshot value — silently reintroducing this
    # exact bug. Re-snapshotting at correct_nav is safe to run even when
    # delta == 0 (e.g. re-running this after the fix ships): it only touches
    # pool_state.lastNav/lastPoolValue, never shares or totalDeposited.
    new_total_shares = float(pool.get("totalShares", 0) or 0) + delta
    _snapshot_nav(correct_nav * new_total_shares, force=True)

    result["success"] = True
    result["applied"] = True
    return result


# ── BUDJU Desk: captured notes + daily briefs ───────────────────────────────

def save_desk_note(note: Dict) -> Dict:
    """Store a captured note (text / link / transcribed voice) for the nightly brief."""
    doc = {
        "type": note.get("type", "text"),
        "raw": note.get("raw", ""),
        "transcript": note.get("transcript"),
        "url": note.get("url"),
        "source": note.get("source", "telegram"),
        "createdAt": datetime.utcnow(),
    }
    res = desk_notes_collection.insert_one(doc)
    return {"success": True, "id": str(res.inserted_id)}


def get_recent_desk_notes(days: int = 5, limit: int = 60) -> List[Dict]:
    since = datetime.utcnow() - timedelta(days=days)
    cursor = desk_notes_collection.find(
        {"createdAt": {"$gte": since}}, {"_id": 0}
    ).sort("createdAt", -1).limit(limit)
    notes = []
    for d in cursor:
        d = dict(d)
        if isinstance(d.get("createdAt"), datetime):
            d["createdAt"] = d["createdAt"].isoformat() + "Z"
        notes.append(d)
    return notes


def _serialize_brief(doc: Dict, full: bool) -> Dict:
    d = dict(doc)
    d.pop("_id", None)
    if isinstance(d.get("createdAt"), datetime):
        d["createdAt"] = d["createdAt"].isoformat() + "Z"
    if not full:
        # Public-lite: omit position-specific intelligence
        d.pop("contradictions", None)
        d.pop("notesConsidered", None)
    return d


def save_desk_brief(brief: Dict) -> Dict:
    doc = dict(brief)
    doc["createdAt"] = datetime.utcnow()
    res = desk_briefs_collection.insert_one(doc)
    return {"success": True, "id": str(res.inserted_id)}


def get_latest_desk_brief(full: bool = False) -> Optional[Dict]:
    doc = desk_briefs_collection.find_one({}, sort=[("createdAt", -1)])
    return _serialize_brief(doc, full) if doc else None


def get_desk_briefs(limit: int = 14, full: bool = False) -> List[Dict]:
    cursor = desk_briefs_collection.find({}).sort("createdAt", -1).limit(limit)
    return [_serialize_brief(d, full) for d in cursor]


def get_all_active_users() -> List[Dict]:
    users = users_collection.find({"isActive": True})
    return [format_user_data(user) for user in users]


def get_leaderboard(total_pool_value: float) -> List[Dict]:
    pool = get_pool_state()
    total_shares = pool["totalShares"]
    nav = total_pool_value / total_shares if total_shares > 0 else 1.0

    users = list(users_collection.find({
        "isActive": True,
        "walletAddress": {"$nin": ADMIN_WALLETS}
    }))

    leaderboard = []
    for user in users:
        wallet = user["walletAddress"]
        user_shares = user.get("shares", 0.0)
        current_value = user_shares * nav
        allocation = (user_shares / total_shares * 100) if total_shares > 0 else 0

        last_deposit = deposits_collection.find_one(
            {"userId": wallet},
            sort=[("timestamp", -1)]
        )

        leaderboard.append({
            "walletAddress": wallet,
            "walletShort": wallet[:4] + "..." + wallet[-4:],
            "joinedDate": user.get("joinedDate").isoformat() if user.get("joinedDate") else None,
            "lastDeposit": last_deposit["timestamp"].isoformat() if last_deposit and last_deposit.get("timestamp") else None,
            "lastDepositAmount": last_deposit.get("amount", 0) if last_deposit else 0,
            "totalDeposited": user.get("totalDeposited", 0.0),
            "currentValue": round(current_value, 2),
            "allocation": round(allocation, 2),
            "shares": user_shares
        })

    leaderboard.sort(key=lambda x: x["currentValue"], reverse=True)

    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    return leaderboard


def get_admin_stats(total_pool_value: float) -> Dict:
    pool = get_pool_state()
    total_shares = pool["totalShares"]
    nav = total_pool_value / total_shares if total_shares > 0 else 1.0

    # The admin dashboard polls this with a live Swyftx pool value — the best
    # regular source of truth for NAV. Keep the snapshot fresh so a later
    # self-service deposit has a correct price to fall back on.
    _snapshot_nav(total_pool_value)

    # User stats exclude admin wallets (admins manage the pool, not investors)
    non_admin_users = list(users_collection.find({
        "isActive": True,
        "walletAddress": {"$nin": ADMIN_WALLETS}
    }))
    user_count = len(non_admin_users)
    total_deposited = sum(u.get("totalDeposited", 0) for u in non_admin_users)
    total_value = sum(u.get("shares", 0) * nav for u in non_admin_users)

    # Combined P&L — the WHOLE pool's trading result, admin capital included.
    # Unlike totalUserDeposited/totalUserValue above (investors only), this
    # answers "has the pool as a whole made or lost money" across every
    # wallet. Must add back totalWithdrawn — it's never subtracted from
    # totalDeposited (same gross-vs-net issue as get_user_position()).
    all_active_users = list(users_collection.find({"isActive": True}))
    combined_deposited = sum(u.get("totalDeposited", 0) for u in all_active_users)
    combined_withdrawn = sum(u.get("totalWithdrawn", 0) for u in all_active_users)
    combined_value = sum(u.get("shares", 0) * nav for u in all_active_users)
    combined_pnl = combined_value + combined_withdrawn - combined_deposited

    last_dep = deposits_collection.find_one(sort=[("timestamp", -1)])
    last_user = users_collection.find_one(sort=[("joinedDate", -1)])
    trade_count = trades_collection.count_documents({})
    deposit_count = deposits_collection.count_documents({})
    withdrawal_count = withdrawals_collection.count_documents({})

    return {
        "userCount": user_count,
        "totalUserDeposited": round(total_deposited, 2),
        "totalUserValue": round(total_value, 2),
        "poolValue": round(total_pool_value, 2),
        "nav": round(nav, 6),
        "totalShares": round(total_shares, 2),
        "tradeCount": trade_count,
        "depositCount": deposit_count,
        "withdrawalCount": withdrawal_count,
        "lastDeposit": last_dep["timestamp"].isoformat() if last_dep and last_dep.get("timestamp") else None,
        "lastDepositWallet": (last_dep.get("userId", "")[:4] + "..." + last_dep.get("userId", "")[-4:]) if last_dep and len(last_dep.get("userId", "")) > 8 else None,
        "lastDepositAmount": last_dep.get("amount", 0) if last_dep else 0,
        "lastUserJoined": last_user.get("joinedDate").isoformat() if last_user and last_user.get("joinedDate") else None,
        "pnlPercent": round(((total_value / total_deposited) - 1) * 100, 2) if total_deposited > 0 else 0,
        "combinedDeposited": round(combined_deposited, 2),
        "combinedWithdrawn": round(combined_withdrawn, 2),
        "combinedValue": round(combined_value, 2),
        "combinedPnl": round(combined_pnl, 2),
        "combinedPnlPercent": round((combined_pnl / combined_deposited) * 100, 2) if combined_deposited > 0 else 0,
    }


def get_pool_nav_timeline() -> List[Dict]:
    """Reconstruct the pool's NAV over time from every deposit/withdrawal/reprice
    ever recorded (pool-wide, not scoped to one wallet). There's no stored daily
    NAV time series — each deposit/withdrawal already carries the NAV it was
    priced at, so this is real historical data, just sparse (one point per
    transaction). Wallet identity and dollar amounts are intentionally omitted —
    this endpoint is public and only exposes NAV + event type, nothing about
    who moved money or how much.
    """
    points: List[Dict] = []

    for dep in deposits_collection.find(
        {"status": {"$ne": "voided"}}, {"timestamp": 1, "nav": 1}
    ).sort("timestamp", 1):
        if not dep.get("timestamp") or not dep.get("nav"):
            continue
        points.append({
            "timestamp": dep["timestamp"].isoformat(),
            "nav": round(dep["nav"], 6),
            "type": "deposit",
        })

    for wd in withdrawals_collection.find(
        {"status": {"$ne": "voided"}}, {"timestamp": 1, "nav": 1}
    ).sort("timestamp", 1):
        if not wd.get("timestamp") or not wd.get("nav"):
            continue
        points.append({
            "timestamp": wd["timestamp"].isoformat(),
            "nav": round(wd["nav"], 6),
            "type": "withdrawal",
        })

    points.sort(key=lambda p: p["timestamp"])
    return points


def _short_wallet(addr: Optional[str]) -> str:
    return addr[:4] + "..." + addr[-4:] if addr and len(addr) > 8 else (addr or "")


def get_all_transactions(wallet_address: str = None, is_admin_request: bool = False) -> List[Dict]:
    """The Activity feed — every deposit/withdrawal (live from each
    wallet's own Swyftx account, or an admin-entered manual override) plus
    every bot buy/sell, for the non-custodial per-wallet era.

    This used to read deposits_collection/withdrawals_collection/
    trades_collection — the pooled era's collections. Those are now
    effectively frozen: the admin UI that ever wrote to
    deposits_collection/withdrawals_collection was removed once the app
    went non-custodial, and trades_collection has been empty since the
    pool itself was retired (every pooled-era trade happened directly on
    the shared Swyftx account, never recorded here). A wallet with a live
    non-custodial key and real trade history correctly saw almost nothing
    in Activity as a result — confirmed live on 2026-10-25: the admin's
    own $13,260.17 withdrawal from mid-pooled-era was the ONLY row, while
    every deposit/withdrawal since (live-fetched or manually recorded via
    CashFlowAdminView) and every bot trade (in user_trades_collection) was
    invisible here. Fixed to read the SAME sources already powering the
    Leaderboard's wallet drill-down, the Community Overview, and the
    per-user activity endpoints: get_wallet_cash_flows() /
    get_community-wide wallet iteration for deposits/withdrawals, and
    user_trades_collection for buy/sell."""
    transactions: List[Dict] = []

    if is_admin_request:
        # Not filtered to status="active" — see get_live_leaderboard()'s
        # docstring for why. get_wallet_cash_flows() below handles each
        # wallet's own failure safely and self-heals a wrongly-"invalid"
        # key on its next successful fetch.
        active_wallets = {
            d.get("walletAddress")
            for d in user_exchange_keys_collection.find({"encryptedApiKey": {"$exists": True}}, {"walletAddress": 1})
        }
        manual_wallets = {
            d.get("walletAddress")
            for d in wallet_cash_flows_collection.find({}, {"walletAddress": 1})
        }
        for wallet in (active_wallets | manual_wallets):
            if not wallet:
                continue
            result = get_wallet_cash_flows(wallet)
            for f in result.get("flows", []):
                transactions.append({
                    "type": f["type"],
                    "amount": f["amountUsd"],
                    "currency": "USD",
                    "wallet": wallet,
                    "walletShort": _short_wallet(wallet),
                    "timestamp": f.get("timestamp"),
                    "isAdmin": wallet in ADMIN_WALLETS,
                })

        for t in user_trades_collection.find({}).sort("timestamp", -1).limit(500):
            wallet = t.get("walletAddress")
            transactions.append({
                "type": "buy" if t.get("side") == "buy" else "sell",
                "coin": t.get("coin", ""),
                "amount": t.get("quantity", 0),
                "price": t.get("price", 0),
                "timestamp": t["timestamp"].isoformat() if t.get("timestamp") else None,
                "wallet": wallet,
                "walletShort": _short_wallet(wallet),
                "swyftxId": t.get("orderId", ""),
                "isAdmin": wallet in ADMIN_WALLETS,
            })

    else:
        if not wallet_address:
            return []

        result = get_wallet_cash_flows(wallet_address)
        for f in result.get("flows", []):
            transactions.append({
                "type": f["type"],
                "amount": f["amountUsd"],
                "currency": "USD",
                "timestamp": f.get("timestamp"),
            })

        for t in user_trades_collection.find({"walletAddress": wallet_address}).sort("timestamp", -1).limit(200):
            transactions.append({
                "type": "buy" if t.get("side") == "buy" else "sell",
                "coin": t.get("coin", ""),
                "amount": t.get("quantity", 0),
                "price": t.get("price", 0),
                "timestamp": t["timestamp"].isoformat() if t.get("timestamp") else None,
                "swyftxId": t.get("orderId", ""),
            })

    transactions.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return transactions


# ── Persistent Trader State ──────────────────────────────────────────────────

DEFAULT_TRADER_STATE = {
    "pendingOrders": [],
    "autoTiers": {
        "tier1": {"deviation": 1, "allocation": 5},
        "tier2": {"deviation": 2, "allocation": 5},
        "tier3": {"deviation": 2, "allocation": 5},
    },
    "autoCooldowns": {},
    "autoTradeLog": [],
}


def get_trader_state() -> Dict:
    doc = trader_state_collection.find_one({"_id": "admin_state"})
    if not doc:
        return dict(DEFAULT_TRADER_STATE)
    doc.pop("_id", None)
    # Merge defaults for any missing keys
    for key, default_val in DEFAULT_TRADER_STATE.items():
        if key not in doc:
            doc[key] = default_val
    # Ensure all tier defaults are present
    if "autoTiers" in doc and isinstance(doc["autoTiers"], dict):
        for tier_key, tier_defaults in DEFAULT_TRADER_STATE["autoTiers"].items():
            if tier_key not in doc["autoTiers"]:
                doc["autoTiers"][tier_key] = dict(tier_defaults)
            elif isinstance(doc["autoTiers"][tier_key], dict):
                for k, v in tier_defaults.items():
                    doc["autoTiers"][tier_key].setdefault(k, v)
    return doc


def save_trader_state(state: Dict) -> Dict:
    # Deep-merge autoTiers so partial tier updates don't wipe other tiers
    if "autoTiers" in state:
        existing = trader_state_collection.find_one({"_id": "admin_state"})
        if existing and "autoTiers" in existing:
            merged = dict(existing["autoTiers"])
            for tier_key, tier_val in state["autoTiers"].items():
                if tier_key in merged and isinstance(tier_val, dict):
                    merged[tier_key] = {**merged[tier_key], **tier_val}
                else:
                    merged[tier_key] = tier_val
            state["autoTiers"] = merged

    trader_state_collection.update_one(
        {"_id": "admin_state"},
        {"$set": state},
        upsert=True
    )
    return {"success": True}


# ── User Preferences (per-wallet) ──────────────────────────────────────────

def get_user_preferences(wallet_address: str) -> Dict:
    """Get user preferences by wallet address."""
    doc = user_preferences_collection.find_one({"walletAddress": wallet_address})
    if not doc:
        return {"walletAddress": wallet_address, "darkMode": True, "cart": []}
    doc.pop("_id", None)
    return doc


def save_user_preferences(wallet_address: str, updates: Dict) -> Dict:
    """Save user preferences (partial update). Allowed keys: darkMode, cart."""
    allowed_keys = {"darkMode", "cart"}
    filtered = {k: v for k, v in updates.items() if k in allowed_keys}
    if not filtered:
        return {"success": False, "error": "No valid preference keys provided"}

    filtered["updatedAt"] = datetime.utcnow().isoformat()
    user_preferences_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": filtered, "$setOnInsert": {"walletAddress": wallet_address, "createdAt": datetime.utcnow().isoformat()}},
        upsert=True
    )
    return {"success": True}


def sync_deposits_from_client(wallet_address: str, deposits: List[Dict], total_pool_value: float) -> Dict:
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        register_user(wallet_address)
        user = users_collection.find_one({"walletAddress": wallet_address})

    pool = get_pool_state()
    if pool["totalShares"] <= 0 and total_pool_value > 0:
        initialize_pool(total_pool_value)
        pool = get_pool_state()

    imported = 0
    skipped = 0
    total_new_shares = 0.0
    total_new_deposited = 0.0

    for dep in deposits:
        tx_hash = dep.get("txHash", "")
        amount = dep.get("amount", 0)
        if not tx_hash or amount <= 0:
            skipped += 1
            continue

        existing = deposits_collection.find_one({"txHash": tx_hash})
        if existing:
            skipped += 1
            continue

        nav = dep.get("nav", 1.0)
        shares = dep.get("shares", 0)
        if shares <= 0:
            shares = amount / nav if nav > 0 else amount

        deposit_doc = {
            "userId": wallet_address,
            "amount": amount,
            "currency": dep.get("currency", "USDC"),
            "txHash": tx_hash,
            "shares": shares,
            "nav": nav,
            "timestamp": datetime.utcnow(),
            "status": "completed",
            "source": "client_sync"
        }

        try:
            deposits_collection.insert_one(deposit_doc)
            total_new_shares += shares
            total_new_deposited += amount
            imported += 1
        except DuplicateKeyError:
            skipped += 1

    if total_new_shares > 0 or total_new_deposited > 0:
        users_collection.update_one(
            {"walletAddress": wallet_address},
            {"$inc": {
                "shares": total_new_shares,
                "totalDeposited": total_new_deposited
            }}
        )

        pool_state_collection.update_one(
            {"_id": "pool"},
            {"$inc": {"totalShares": total_new_shares}}
        )

        _recalculate_allocations()

    return {
        "success": True,
        "imported": imported,
        "skipped": skipped,
        "newShares": total_new_shares,
        "newDeposited": total_new_deposited
    }


def get_db_debug() -> Dict:
    try:
        db.command("ping")
        connected = True
    except Exception as e:
        connected = False
        return {"connected": False, "error": str(e)}

    counts = {
        "users": users_collection.count_documents({}),
        "deposits": deposits_collection.count_documents({}),
        "trades": trades_collection.count_documents({}),
        "withdrawals": withdrawals_collection.count_documents({}),
        "pool_state": pool_state_collection.count_documents({}),
        "trader_state": trader_state_collection.count_documents({})
    }

    pool_doc = pool_state_collection.find_one({"_id": "pool"})
    pool_info = {
        "totalShares": pool_doc.get("totalShares", 0) if pool_doc else None,
        "initialized": pool_doc.get("initialized").isoformat() if pool_doc and pool_doc.get("initialized") else None,
        "exists": pool_doc is not None
    }

    sample_users = []
    for u in users_collection.find().limit(10):
        w = u.get("walletAddress", "")
        sample_users.append({
            "wallet": w[:6] + "..." + w[-4:] if len(w) > 10 else w,
            "shares": u.get("shares", 0),
            "totalDeposited": u.get("totalDeposited", 0),
            "allocation": u.get("allocation", 0),
        })

    return {
        "connected": connected,
        "database": DB_NAME,
        "collections": db.list_collection_names(),
        "counts": counts,
        "poolState": pool_info,
        "adminConfig": {
            "count": len(ADMIN_WALLETS),
            "wallets": [w[:6] + "..." + w[-4:] if len(w) > 10 else w for w in ADMIN_WALLETS]
        },
        "sampleUsers": sample_users
    }


def admin_import_user(wallet_address: str, deposit_amount: float,
                       total_pool_value: float, tx_hash: str = None) -> Dict:
    existing = users_collection.find_one({"walletAddress": wallet_address})
    if not existing:
        register_user(wallet_address)

    if not tx_hash:
        tx_hash = f"admin_import_{wallet_address[:8]}_{int(datetime.utcnow().timestamp())}"

    existing_dep = deposits_collection.find_one({"txHash": tx_hash})
    if existing_dep:
        return {
            "success": False,
            "error": "Deposit with this txHash already exists",
            "existingAmount": existing_dep.get("amount", 0)
        }

    try:
        result = record_deposit(
            wallet_address, deposit_amount, tx_hash,
            total_pool_value, "USDC"
        )
        return {
            "success": True,
            "wallet": wallet_address,
            "walletShort": wallet_address[:4] + "..." + wallet_address[-4:],
            "amount": deposit_amount,
            "shares": result.get("shares", 0),
            "nav": result.get("nav", 0),
            "txHash": tx_hash
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def sync_trades_from_swyftx(trades: List[Dict]) -> Dict:
    allocations = calculate_pool_allocations()

    imported = 0
    skipped = 0

    for t in trades:
        swyftx_id = t.get("swyftxId", "")
        if not swyftx_id:
            skipped += 1
            continue

        existing = trades_collection.find_one({"swyftxId": swyftx_id})
        if existing:
            skipped += 1
            continue

        coin = t.get("coin", "")
        trade_type = t.get("type", "buy")
        quantity = float(t.get("quantity", 0))
        trigger = float(t.get("trigger", 0))
        amount = float(t.get("amount", quantity))
        timestamp_str = t.get("timestamp", "")
        price = trigger if trigger > 0 else float(t.get("price", 0))

        if not coin or amount <= 0:
            skipped += 1
            continue

        try:
            if timestamp_str:
                ts = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            else:
                ts = datetime.utcnow()
        except (ValueError, TypeError):
            ts = datetime.utcnow()

        # Swyftx BUY: quantity = AUD spent; SELL: quantity = crypto sold
        # Store 'amount' as AUD value for consistency
        if trade_type == "buy":
            aud_amount = quantity  # quantity IS the AUD amount for buys
        else:
            aud_amount = quantity * price if price > 0 else amount

        trade_doc = {
            "coin": coin,
            "type": trade_type,
            "amount": aud_amount,
            "price": price,
            "timestamp": ts,
            "swyftxId": swyftx_id,
            "userAllocations": allocations,
            "source": "swyftx_sync"
        }

        try:
            trades_collection.insert_one(trade_doc)
            imported += 1
        except DuplicateKeyError:
            skipped += 1

    return {
        "success": True,
        "imported": imported,
        "skipped": skipped
    }


def calculate_pool_allocations() -> Dict[str, float]:
    pool = get_pool_state()
    total_shares = pool["totalShares"]

    if total_shares <= 0:
        return {}

    users = list(users_collection.find({
        "isActive": True, "shares": {"$gt": 0},
        "walletAddress": {"$nin": ADMIN_WALLETS}
    }))

    if not users:
        return {}

    allocations = {}
    for user in users:
        user_shares = user.get("shares", 0.0)
        allocation_pct = (user_shares / total_shares) * 100.0
        allocations[user["walletAddress"]] = allocation_pct

        users_collection.update_one(
            {"walletAddress": user["walletAddress"]},
            {"$set": {"allocation": allocation_pct}}
        )

    return allocations


# ── Non-custodial trading: per-user Swyftx API keys ─────────────────────────
# Oct 2026 architecture pivot — BUDJU never holds or pools user funds. Each
# user supplies their OWN Swyftx API key (trade-only permissions; withdraw
# disabled on their end) and the bot trades directly in their account. This
# section replaces the deposit/share/NAV flow for any wallet that sets one up.
#
# The existing pooled accounting (users.shares, pool_state, deposits,
# withdrawals) is untouched and keeps serving existing pool members until
# they're paid out — the two models coexist during the transition.

from crypto_utils import encrypt_secret, decrypt_secret, mask_secret
from swyftx_client import SwyftxClient, SwyftxAuthError
from asset_registry import ASSET_CG_IDS
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor, as_completed

# Every connected wallet's own Swyftx account used to be read in a plain
# `for doc in docs:` loop in get_live_leaderboard(), get_community_
# aggregate_holdings(), and get_community_cash_flows() — each wallet's
# fetch (token refresh + balance call, or two separate deposit/withdrawal
# history calls) is a blocking network round trip to Swyftx, so N wallets
# meant N round trips back-to-back. Confirmed live on 2026-10-26: the
# Trade page's "Loading trading data..." screen and the Leaderboard both
# felt sluggish with just 4 connected wallets, because THREE separate
# endpoints each ran their own full sequential loop over those same 4
# wallets on every page load. These are I/O-bound (waiting on Swyftx's
# servers, not CPU), so Python threads parallelize them for real despite
# the GIL — pymongo's MongoClient and the module-level token/asset-map
# caches above are safe to hit from multiple threads at once.
_WALLET_FETCH_MAX_WORKERS = 8


def _fetch_wallets_in_parallel(items: list, worker) -> list:
    """Runs `worker(item)` for every item in `items` concurrently, returning
    `[(item, result, error), ...]` in the SAME order as `items` (result is
    None on error, error is None on success) — callers can loop over this
    exactly like the sequential `for item in items: try: ... except ...`
    blocks it replaces. A single item's exception is captured per-item, not
    raised, so one wallet's Swyftx error can never abort every other
    wallet's fetch."""
    if not items:
        return []
    results: list = [None] * len(items)
    with ThreadPoolExecutor(max_workers=min(_WALLET_FETCH_MAX_WORKERS, len(items))) as pool:
        future_to_index = {pool.submit(worker, item): i for i, item in enumerate(items)}
        for future in as_completed(future_to_index):
            i = future_to_index[future]
            try:
                results[i] = (items[i], future.result(), None)
            except Exception as e:
                results[i] = (items[i], None, e)
    return results


def _fetch_one_wallet_holdings(doc: Dict) -> Dict:
    """Shared worker for get_live_leaderboard() and
    get_community_aggregate_holdings() — both just want {code: amount}
    for one wallet's own Swyftx account."""
    api_key = decrypt_secret(doc["encryptedApiKey"])
    client = SwyftxClient(api_key)
    return client.get_holdings()


def get_budju_token_balance(wallet_address: str) -> float:
    """On-chain BUDJU balance for a wallet, via the same RPC path as deposit
    verification. The client-side check in WalletConnect/Balance.tsx is
    UI-only (a wallet could lie about passing it) — this is the real gate
    that must be checked again server-side before accepting an API key."""
    try:
        resp = _solana_rpc(
            "getTokenAccountsByOwner",
            [wallet_address, {"mint": BUDJU_MINT}, {"encoding": "jsonParsed", "commitment": "confirmed"}],
        )
    except Exception:
        raise ValueError("Could not reach Solana to verify your BUDJU balance. Please try again shortly.")

    result = resp.get("result", {})
    accounts = result.get("value", []) if isinstance(result, dict) else []
    total = 0.0
    for acct in accounts:
        info = acct.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
        ui_amount = (info.get("tokenAmount", {}) or {}).get("uiAmount")
        if ui_amount:
            total += float(ui_amount)
    return total


def check_budju_gate(wallet_address: str) -> Tuple[bool, float]:
    """Returns (passes_gate, current_budju_balance)."""
    balance = get_budju_token_balance(wallet_address)
    return balance >= BUDJU_GATE_REQUIRED, balance


def save_user_swyftx_key(wallet_address: str, api_key: str) -> Dict:
    """Validate the BUDJU gate, test-connect the supplied key against Swyftx,
    then store it encrypted. Never stores (or returns) the key if either
    check fails — a key that doesn't even authenticate is worse than no key,
    since the trading loop would otherwise waste cycles on a dead account."""
    if not wallet_address:
        raise ValueError("wallet_address is required")
    if not api_key or len(api_key.strip()) < 10:
        raise ValueError("That doesn't look like a valid Swyftx API key")
    api_key = api_key.strip()

    passes_gate, balance = check_budju_gate(wallet_address)
    if not passes_gate:
        raise ValueError(
            f"This wallet holds {balance:,.0f} BUDJU — the bot requires "
            f"{BUDJU_GATE_REQUIRED:,.0f} BUDJU to connect a trading key."
        )

    client = SwyftxClient(api_key)
    ok, auth_error = client.test_connection()
    if not ok:
        raise ValueError(f"Swyftx rejected this API key: {auth_error}")

    encrypted = encrypt_secret(api_key)
    now = datetime.utcnow()
    user_exchange_keys_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": {
            "walletAddress": wallet_address,
            "exchange": "swyftx",
            "encryptedApiKey": encrypted,
            "maskedApiKey": mask_secret(api_key),
            "status": "active",
            "lastValidatedAt": now,
            "lastError": None,
            "updatedAt": now,
        }, "$setOnInsert": {"addedAt": now}},
        upsert=True,
    )
    return {"success": True, "status": "active", "maskedApiKey": mask_secret(api_key)}


def get_user_swyftx_key_status(wallet_address: str) -> Dict:
    """Status only — never returns the key itself, encrypted or otherwise."""
    doc = user_exchange_keys_collection.find_one({"walletAddress": wallet_address})
    if not doc:
        return {"configured": False}
    return {
        "configured": True,
        "exchange": doc.get("exchange", "swyftx"),
        "status": doc.get("status", "unknown"),
        "maskedApiKey": doc.get("maskedApiKey"),
        "addedAt": doc.get("addedAt").isoformat() if doc.get("addedAt") else None,
        "lastValidatedAt": doc.get("lastValidatedAt").isoformat() if doc.get("lastValidatedAt") else None,
        "lastError": doc.get("lastError"),
    }


def remove_user_swyftx_key(wallet_address: str) -> Dict:
    result = user_exchange_keys_collection.delete_one({"walletAddress": wallet_address})
    return {"success": True, "removed": result.deleted_count > 0}


def link_admin_master_key(wallet_address: str) -> Dict:
    """Admin-only convenience: the admin's Swyftx key is already configured
    server-side as SWYFTX_API_KEY (it's what powers the legacy pooled bot)
    — this reuses that exact key for the admin's own entry in the per-user
    system instead of asking them to paste it again into the UI. Only ever
    links to a wallet that's already an admin; never usable for anyone
    else's wallet, and never returns or logs the key itself."""
    if not is_admin(wallet_address):
        raise ValueError("Admin access required")

    master_key = os.getenv("SWYFTX_API_KEY", "")
    if not master_key:
        raise ValueError("SWYFTX_API_KEY is not configured on the server")

    client = SwyftxClient(master_key)
    ok, auth_error = client.test_connection()
    if not ok:
        raise ValueError(f"The server's master Swyftx key failed to authenticate: {auth_error}")

    now = datetime.utcnow()
    user_exchange_keys_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": {
            "walletAddress": wallet_address,
            "exchange": "swyftx",
            "encryptedApiKey": encrypt_secret(master_key),
            "maskedApiKey": mask_secret(master_key),
            "status": "active",
            "lastValidatedAt": now,
            "lastError": None,
            "updatedAt": now,
        }, "$setOnInsert": {"addedAt": now}},
        upsert=True,
    )
    return {"success": True, "status": "active", "maskedApiKey": mask_secret(master_key)}


def _get_user_swyftx_client(wallet_address: str) -> SwyftxClient:
    """Internal only — decrypts a user's key and returns a scoped client.
    Never call this from a request handler that echoes the result back
    verbatim; only the derived data (balances, trade results) may leave
    this process, never the key or client object."""
    doc = user_exchange_keys_collection.find_one({"walletAddress": wallet_address})
    if not doc or not doc.get("encryptedApiKey"):
        raise ValueError("No Swyftx API key on file for this wallet")
    api_key = decrypt_secret(doc["encryptedApiKey"])
    return SwyftxClient(api_key)


def _is_transient_swyftx_error(err: Exception) -> bool:
    """Only a genuine 401/403 reliably proves a key itself is bad (revoked,
    wrong scope, or never worked). Everything else — 429 (rate limited),
    5xx, 400 (a request-shape problem on OUR side), timeouts, or any other
    transport failure — must NOT flip status away from "active": doing so
    silently drops the wallet out of every `find({"status": "active"})`
    query (leaderboard, aggregate holdings, Activity, ...) until someone
    notices and manually re-links it.

    Confirmed live TWICE: on 2026-10-24, a single 429 right after linking
    the admin's master key marked it "invalid" and the leaderboard
    immediately stopped even attempting that wallet. On 2026-10-25, the
    deposit/withdrawal history endpoint's sortby=date param (since removed
    — see swyftx_client.py) got rejected with a 400 on literally every
    call, which this function originally treated as non-transient — so
    EVERY connected wallet's key got marked "invalid" within minutes,
    even though not a single one was actually bad. The old allowlist
    approach (name only 429/5xx as safe) kept getting the policy backwards
    whenever a NEW kind of non-credential failure showed up; a denylist of
    just 401/403 is the only version of this that can't repeat that."""
    msg = str(err)
    return "HTTP 401" not in msg and "HTTP 403" not in msg


def _mark_key_valid(wallet_address: str) -> None:
    """Self-heal: a successful live call proves this wallet's key works
    right now, so always reset status -> "active" and clear lastError,
    regardless of what status was before. This is what lets a wallet that
    got wrongly marked "invalid" by a past bug (e.g. the 2026-10-25 sortby
    400 misclassification) recover automatically on its very next
    successful fetch, with no manual DB fix or admin action required."""
    user_exchange_keys_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": {"status": "active", "lastValidatedAt": datetime.utcnow(), "lastError": None}},
    )


def get_user_personal_holdings(wallet_address: str) -> Dict:
    """Live coin holdings for one user, fetched from THEIR OWN Swyftx
    account via their own key — not from the pooled share ledger."""
    client = _get_user_swyftx_client(wallet_address)
    try:
        holdings = client.get_holdings()
    except SwyftxAuthError as e:
        update = {"lastError": str(e)}
        if not _is_transient_swyftx_error(e):
            update["status"] = "invalid"
        user_exchange_keys_collection.update_one({"walletAddress": wallet_address}, {"$set": update})
        raise ValueError(f"Could not fetch your Swyftx balance: {e}")
    _mark_key_valid(wallet_address)
    return {"walletAddress": wallet_address, "holdings": holdings}


def get_user_live_position(wallet_address: str) -> Dict:
    """Live cumulative cash + crypto balance for one user, read straight
    from THEIR OWN Swyftx account via their own key. This replaces the old
    pooled shares/NAV "position" entirely — no allocation%, no shares, no
    stale pool math. Mirrors the cash/crypto split get_live_leaderboard()
    computes for every wallet, but for just this one."""
    client = _get_user_swyftx_client(wallet_address)
    try:
        holdings = client.get_holdings()
    except SwyftxAuthError as e:
        update = {"lastError": str(e)}
        if not _is_transient_swyftx_error(e):
            update["status"] = "invalid"
        user_exchange_keys_collection.update_one({"walletAddress": wallet_address}, {"$set": update})
        raise ValueError(f"Could not fetch your Swyftx balance: {e}")
    _mark_key_valid(wallet_address)

    crypto_codes = [c for c in holdings.keys() if c not in ("USDC", "USD", "AUD", "USDT")]
    prices = get_prices_for_coins(crypto_codes)
    aud_to_usd = get_aud_to_usd_rate()

    cash_value = 0.0
    crypto_value = 0.0
    # Raw per-currency amounts, in that currency's OWN units — not
    # converted/blended. The combined cash_value above is useful for a
    # single total, but a wallet holding AUD + USDC must be able to see
    # each currency separately rather than one number mislabeled "USDC".
    cash_by_currency = {"AUD": 0.0, "USD": 0.0, "USDC": 0.0, "USDT": 0.0}
    for code, amount in holdings.items():
        if code == "AUD":
            # AUD is worth less than 1 USD — must convert, not count 1:1.
            cash_value += amount * aud_to_usd
            cash_by_currency["AUD"] += amount
        elif code in ("USDC", "USD", "USDT"):
            cash_value += amount
            cash_by_currency[code] += amount
        else:
            crypto_value += amount * prices.get(code, 0.0)

    total_value = cash_value + crypto_value
    return {
        "walletAddress": wallet_address,
        "cashValue": round(cash_value, 2),
        "cryptoValue": round(crypto_value, 2),
        "totalValue": round(total_value, 2),
        "pctCash": round((cash_value / total_value * 100), 1) if total_value > 0 else 0,
        "pctCrypto": round((crypto_value / total_value * 100), 1) if total_value > 0 else 0,
        "cashByCurrency": {k: round(v, 2) for k, v in cash_by_currency.items()},
    }


def get_user_priced_holdings(wallet_address: str) -> Dict:
    """This wallet's own per-coin holdings, each priced in USD via their
    own account. get_user_live_position() above only returns the
    cash/crypto *totals* — the Trade page's "Mine" Holdings grid needs
    each coin kept separate so it can show a wallet's actual coins (e.g.
    FLR, ARB, CC — whatever Swyftx lists, not just BUDJU's ~30-coin
    registry) instead of a slice of the pooled master account."""
    client = _get_user_swyftx_client(wallet_address)
    try:
        holdings = client.get_holdings()
    except SwyftxAuthError as e:
        update = {"lastError": str(e)}
        if not _is_transient_swyftx_error(e):
            update["status"] = "invalid"
        user_exchange_keys_collection.update_one({"walletAddress": wallet_address}, {"$set": update})
        raise ValueError(f"Could not fetch your Swyftx balance: {e}")
    _mark_key_valid(wallet_address)

    crypto_codes = [
        c for c, amount in holdings.items()
        if c not in ("USDC", "USD", "AUD", "USDT") and amount > 0
    ]
    prices = get_prices_for_coins(crypto_codes)
    changes = get_price_changes_for_coins(crypto_codes)

    assets = []
    for code in crypto_codes:
        balance = holdings[code]
        price = prices.get(code, 0.0)
        assets.append({
            "code": code,
            "balance": balance,
            "priceUsd": price,
            "usdValue": round(balance * price, 2),
            "change24h": round(changes.get(code, 0.0), 2),
        })
    assets.sort(key=lambda a: a["usdValue"], reverse=True)
    return {"walletAddress": wallet_address, "assets": assets}


def get_community_aggregate_holdings() -> Dict:
    """Admin view: iterate every wallet with a key on file and fetch its
    holdings via that wallet's OWN credentials, then sum into a per-coin
    community total. This is the "cumulative total" view the non-custodial
    model replaces the pooled NAV/leaderboard with — it's a live read
    across everyone's own accounts, not a shared ledger BUDJU controls.
    One wallet's key failing (revoked, invalid) is logged and skipped —
    never allowed to crash the whole aggregate.

    Does not pre-filter by status="active" for the same self-healing
    reason as get_live_leaderboard() above — see that docstring."""
    docs = list(user_exchange_keys_collection.find({"encryptedApiKey": {"$exists": True}}))
    per_wallet = []
    totals: Dict[str, float] = {}
    errors = 0

    for doc, holdings, err in _fetch_wallets_in_parallel(docs, _fetch_one_wallet_holdings):
        wallet = doc.get("walletAddress")
        if err is None:
            per_wallet.append({"walletAddress": wallet, "holdings": holdings})
            for coin, amount in holdings.items():
                totals[coin] = totals.get(coin, 0.0) + amount
            _mark_key_valid(wallet)
        elif isinstance(err, SwyftxAuthError):
            errors += 1
            update = {"lastError": str(err)}
            if not _is_transient_swyftx_error(err):
                update["status"] = "invalid"
            user_exchange_keys_collection.update_one({"walletAddress": wallet}, {"$set": update})
        else:
            errors += 1

    return {
        "walletCount": len(docs),
        "activeWallets": len(per_wallet),
        "erroredWallets": errors,
        "totals": totals,
        "perWallet": per_wallet,
    }


# ── Phase 2: per-user auto-trading ──────────────────────────────────────────
# There is only ONE bot — one brain, one set of tier settings, one coin
# list, one on/off switch — the SAME "Auto Trade" screen the admin edits
# (trader_state_collection, see get_trader_state()/DEFAULT_TRADER_STATE
# above). The single unified cron (api/auto-trade-cron.py) reads that
# shared rulebook and carries it out inside every connected wallet's own
# Swyftx account — including the admin's — with that wallet's own key,
# sized from that wallet's own USDC balance.
#
# Only this per-wallet document remains: each account's own computed price
# targets, cooldown timers, and trade history. Those aren't decisions —
# they're just where that particular account's own ratchet currently sits,
# which naturally differs wallet to wallet based on when each one actually
# traded (same as the pooled bot's own single-account state always has).
# Before 2026-10-25 this document also held its own copy of autoTiers/
# tierActive/tierAssignments, defaulting every coin in the registry to all
# three tiers — that let coins get auto-enrolled and traded without ever
# being added to T1/T2/T3 on the admin's screen (concrete LUMIA incident).
# Removed.

DEFAULT_USER_TRADER_STATE = {
    "targets": {},
    "cooldowns": {},
}


def get_user_trader_state(wallet_address: str) -> Dict:
    """Per-wallet computed targets/cooldowns/trade history only — tier
    settings, coin assignments, and on/off state all come from the shared
    get_trader_state() (the admin's "Auto Trade" screen) instead."""
    doc = user_trader_state_collection.find_one({"walletAddress": wallet_address})
    if not doc:
        return {"walletAddress": wallet_address, **json.loads(json.dumps(DEFAULT_USER_TRADER_STATE))}
    doc.pop("_id", None)
    for key, default_val in DEFAULT_USER_TRADER_STATE.items():
        if key not in doc:
            doc[key] = default_val
    return doc


def save_user_trader_state(wallet_address: str, state: Dict) -> Dict:
    state = dict(state)
    state["walletAddress"] = wallet_address
    state["updatedAt"] = datetime.utcnow()
    user_trader_state_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": state},
        upsert=True,
    )
    return {"success": True}


def get_user_auto_trade_status(wallet_address: str) -> Dict:
    """Whether this wallet's own bot is turned on. Connecting a key alone
    never enables trading — that's a separate, explicit opt-in."""
    doc = user_exchange_keys_collection.find_one({"walletAddress": wallet_address})
    if not doc:
        return {"configured": False, "autoTradeEnabled": False}
    return {
        "configured": True,
        "status": doc.get("status"),
        "autoTradeEnabled": bool(doc.get("autoTradeEnabled", False)),
        "autoTradeEnabledAt": doc.get("autoTradeEnabledAt"),
    }


def set_user_auto_trade_enabled(wallet_address: str, enabled: bool, requester_wallet: str = None) -> Dict:
    """Opt-in/opt-out for one wallet's trading bot. A wallet can toggle its
    own bot; an admin can toggle ANY wallet's bot from the admin's own
    session (e.g. the Leaderboard's per-wallet admin controls), without
    that wallet owner having to do anything themselves. Requires an
    already-connected, already-validated key — you can't enable trading on
    a key that doesn't exist or has gone invalid.

    `requester_wallet` defaults to `wallet_address` so existing self-service
    callers (a wallet toggling its own bot) keep working unchanged."""
    if requester_wallet is None:
        requester_wallet = wallet_address
    if requester_wallet != wallet_address and not is_admin(requester_wallet):
        raise ValueError("Not authorized to change this wallet's auto-trade setting")

    doc = user_exchange_keys_collection.find_one({"walletAddress": wallet_address})
    if not doc:
        raise ValueError("Connect a Swyftx key first")
    if enabled and doc.get("status") != "active":
        raise ValueError("Your key isn't active — fix or replace it before enabling auto-trading")

    update = {"autoTradeEnabled": bool(enabled)}
    if enabled:
        update["autoTradeEnabledAt"] = datetime.utcnow()
    user_exchange_keys_collection.update_one(
        {"walletAddress": wallet_address},
        {"$set": update},
    )
    return {"success": True, "autoTradeEnabled": bool(enabled)}


def record_user_trade(wallet_address: str, coin: str, side: str, quantity: float,
                       price: float, tier: int = None, order_id: str = None,
                       source: str = "auto") -> Dict:
    """BUDJU's own record of a trade it placed for this wallet. This ledger
    — not the account's raw balance — is what the bot consults before
    selling, so it can never sell coins the user holds that it didn't buy
    itself. Also backs this wallet's own Activity view.

    `source` distinguishes a real recurring auto-trade ("auto", the
    default — what auto-trade-cron.py always passes) from a one-off
    manual "test" buy (see execute_test_buy below), so Activity can label
    the latter distinctly without it looking like the bot fired on its
    own schedule."""
    doc = {
        "walletAddress": wallet_address,
        "coin": coin,
        "side": side,
        "quantity": quantity,
        "price": price,
        "tier": tier,
        "orderId": order_id,
        "source": source,
        "timestamp": datetime.utcnow(),
    }
    user_trades_collection.insert_one(doc)
    return {"success": True}


def get_user_bot_position(wallet_address: str, coin: str) -> float:
    """Net quantity of `coin` this wallet's bot has bought and not yet
    sold, per BUDJU's own ledger — never the raw Swyftx balance. Used to
    cap sells so the bot only ever touches what it itself bought."""
    net = 0.0
    for t in user_trades_collection.find({"walletAddress": wallet_address, "coin": coin}):
        qty = float(t.get("quantity", 0) or 0)
        net += qty if t.get("side") == "buy" else -qty
    return max(0.0, net)


def get_user_avg_cost(wallet_address: str, coin: str) -> float:
    """Weighted average BUY price for `coin` from this wallet's own full
    trade ledger (user_trades_collection, not the 50-entry-capped display
    log in user_trader_state) — same spent/qtyBought formula get_coin_stats()
    uses for the pooled admin account, scoped to one wallet. Backs the
    per-wallet "never sell below cost" guard in the unified auto-trade
    cron. Returns 0 (= unknown, sells allowed) if this wallet has no
    recorded buys for this coin."""
    spent = 0.0
    qty_bought = 0.0
    for t in user_trades_collection.find({"walletAddress": wallet_address, "coin": coin, "side": "buy"}):
        q = float(t.get("quantity", 0) or 0)
        p = float(t.get("price", 0) or 0)
        if q > 0 and p > 0:
            spent += q * p
            qty_bought += q
    return (spent / qty_bought) if qty_bought > 0 else 0.0


# Mirrors auto-trade-cron.py's own MIN_USDC_RESERVE / MIN_ORDER_USDC constants —
# duplicated here (not imported) because database.py must stay import-clean of
# the cron module; keep both in sync if either changes.
TEST_BUY_MIN_BALANCE_USDC = float(os.getenv("USER_MIN_USDC_RESERVE", "30"))
TEST_BUY_FLAT_USDC = 10.0
TEST_BUY_PCT_OF_BALANCE = 4.0


def execute_test_buy(wallet_address: str, requester_wallet: str, coin: str = "BTC") -> Dict:
    """One-off, real-money manual BUY — lets a wallet owner (or admin) fire
    a single test trade through the EXACT same per-user, non-custodial
    pipeline auto-trade-cron.py uses for a real auto-trade buy
    (place_market_order -> record_user_trade), without waiting for a real
    price dip to trigger it naturally. This is how to prove the whole
    buy -> ledger -> Activity pipeline actually works end-to-end on a live
    account before trusting the recurring cron to do it unattended.

    Sized at max($10, 4% of this wallet's own live USDC balance) — refuses
    outright (no partial/shrunk trade) if the balance isn't already above
    the $30 reserve floor, or if the full computed amount would drop it
    below that floor, exactly mirroring the real auto-trader's own guard."""
    if requester_wallet != wallet_address and not is_admin(requester_wallet):
        raise ValueError("Not authorized to trade on this wallet")

    coin = coin.upper()
    client = _get_user_swyftx_client(wallet_address)
    try:
        holdings = client.get_holdings()
    except SwyftxAuthError as e:
        update = {"lastError": str(e)}
        if not _is_transient_swyftx_error(e):
            update["status"] = "invalid"
        user_exchange_keys_collection.update_one({"walletAddress": wallet_address}, {"$set": update})
        raise ValueError(f"Could not fetch your Swyftx balance: {e}")
    _mark_key_valid(wallet_address)

    usdc_balance = sum(v for k, v in holdings.items() if k in ("USDC", "USD", "USDT"))
    if usdc_balance <= TEST_BUY_MIN_BALANCE_USDC:
        raise ValueError(
            f"Your USDC balance (${usdc_balance:.2f}) must be above "
            f"${TEST_BUY_MIN_BALANCE_USDC:.0f} to run a test buy"
        )

    trade_amount = max(TEST_BUY_FLAT_USDC, usdc_balance * (TEST_BUY_PCT_OF_BALANCE / 100))
    if usdc_balance - trade_amount < TEST_BUY_MIN_BALANCE_USDC:
        raise ValueError(
            f"A ${trade_amount:.2f} buy would drop your balance below the "
            f"${TEST_BUY_MIN_BALANCE_USDC:.0f} reserve floor — not placed"
        )

    price = get_prices_for_coins([coin]).get(coin, 0)
    if price <= 0:
        raise ValueError(f"No live price available for {coin}")

    try:
        code_to_id = client.get_code_to_id_map()
    except Exception as e:
        raise ValueError(f"Could not fetch the asset list: {e}")

    ok, order_id, err = client.place_market_order(coin, "buy", trade_amount, code_to_id)
    if not ok:
        raise ValueError(err or "Order failed")

    quantity = round(trade_amount / price, 8)
    record_user_trade(wallet_address, coin, "buy", quantity, price, tier=None,
                       order_id=order_id, source="test")

    return {
        "success": True,
        "coin": coin,
        "quantity": quantity,
        "usdcSpent": round(trade_amount, 2),
        "price": price,
        "orderId": order_id,
    }


def get_user_trade_activity(target_wallet: str, requester_wallet: str) -> List[Dict]:
    """A wallet's own bot-trade activity. Only that wallet itself, or an
    admin, may view it — everyone else gets nothing, not even a count."""
    if requester_wallet != target_wallet and not is_admin(requester_wallet):
        raise ValueError("Not authorized to view this wallet's activity")

    out = []
    for t in user_trades_collection.find({"walletAddress": target_wallet}).sort("timestamp", -1).limit(200):
        out.append({
            "coin": t.get("coin"),
            "side": t.get("side"),
            "quantity": t.get("quantity"),
            "price": t.get("price"),
            "tier": t.get("tier"),
            "orderId": t.get("orderId"),
            "timestamp": t["timestamp"].isoformat() if t.get("timestamp") else None,
        })
    return out


def get_all_users_trade_activity(requester_wallet: str) -> List[Dict]:
    """Admin-only: every connected wallet's bot-trade activity in one feed."""
    if not is_admin(requester_wallet):
        raise ValueError("Admin access required")
    out = []
    for t in user_trades_collection.find({}).sort("timestamp", -1).limit(500):
        out.append({
            "walletAddress": t.get("walletAddress"),
            "coin": t.get("coin"),
            "side": t.get("side"),
            "quantity": t.get("quantity"),
            "price": t.get("price"),
            "tier": t.get("tier"),
            "orderId": t.get("orderId"),
            "timestamp": t["timestamp"].isoformat() if t.get("timestamp") else None,
        })
    return out


# ── Pricing any coin, not just the ~30 in ASSET_CG_IDS ──────────────────────
# A user's Swyftx account can hold anything Swyftx lists (hundreds of
# coins) — not just BUDJU's hand-picked registry. These two functions let
# the bot (and the leaderboard) price and trade whatever a wallet actually
# holds. Resolution is cached forever in `dynamic_coin_registry` so the
# expensive full CoinGecko coin-list lookup only ever runs once per coin,
# across every wallet, for the lifetime of the app.

# Paid CoinGecko plan (any tier — Analyst/Lite/Pro/Enterprise) all serve from
# pro-api.coingecko.com with an x-cg-pro-api-key header, regardless of tier.
# Falls back to the free, keyless public API if no key is configured — the
# free tier's low rate limit is exactly what caused prices (and therefore
# the leaderboard's cash/crypto split) to silently zero out under load.
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
COINGECKO_BASE_URL = (
    "https://pro-api.coingecko.com/api/v3" if COINGECKO_API_KEY else "https://api.coingecko.com/api/v3"
)

# Last-known-good price cache (process-local + shared Mongo), per coin code.
# get_prices_for_coins() used to return {} on ANY CoinGecko failure — one
# flaky free-tier rate limit meant every wallet's crypto priced at $0 for
# that single request: "100% cash, 0% crypto" for every connected wallet
# simultaneously on the Leaderboard AND the Pool Total doughnut AND "My
# Position", self-healing on the next successful request. Confirmed live
# on 2026-10-25 — the leaderboard flipped between a correct ~$25K combined
# value and an all-wallets-100%-cash ~$8.7K value from one page load to the
# next, with no code change in between. A transient price-fetch failure is
# never truer than reusing the last real price we saw a few minutes ago, so
# failures now fall back to this cache instead of zeroing every holding.
_PRICE_CACHE_TTL_S = 120  # how long a price is served without re-fetching
_price_cache: Dict[str, Tuple[float, float]] = {}  # code -> (price, fetchedAtEpochS)
coingecko_price_cache_collection = db["coingecko_price_cache"]

# 24h % change, populated as a side effect of the SAME CoinGecko call
# get_prices_for_coins() already makes (include_24hr_change=true costs
# nothing extra on CoinGecko's /simple/price endpoint — one request,
# two fields back). Kept in its own cache, separate from _price_cache,
# so a display-only read of change% can never alter the price dict
# shape every trading call site depends on.
_change_cache: Dict[str, Tuple[float, float]] = {}  # code -> (pct24h, fetchedAtEpochS)


def _get_cached_prices(codes: List[str]) -> Dict[str, float]:
    """Best-effort last-known price for each code, however stale — used
    only as a fallback when a live fetch fails, never as the primary path."""
    now = time.time()
    result: Dict[str, float] = {}
    missing = []
    for code in codes:
        cached = _price_cache.get(code)
        if cached:
            result[code] = cached[0]
        else:
            missing.append(code)
    if missing:
        try:
            for doc in coingecko_price_cache_collection.find({"_id": {"$in": missing}}):
                price = doc.get("price")
                if price:
                    result[doc["_id"]] = float(price)
                    _price_cache[doc["_id"]] = (float(price), now)
        except Exception:
            pass
    return result


def _store_fresh_prices(prices: Dict[str, float]) -> None:
    now = time.time()
    for code, price in prices.items():
        _price_cache[code] = (price, now)
    try:
        for code, price in prices.items():
            coingecko_price_cache_collection.update_one(
                {"_id": code},
                {"$set": {"price": price, "updatedAt": datetime.utcnow()}},
                upsert=True,
            )
    except Exception:
        pass  # Shared cache write failing never blocks the caller


def _coingecko_get(path_and_query: str, timeout: int = 15):
    """GET a CoinGecko endpoint, authenticated with the paid Pro API key
    when configured. Centralizes the base URL/header choice so every call
    site automatically benefits once COINGECKO_API_KEY is set."""
    headers = {"Accept": "application/json"}
    if COINGECKO_API_KEY:
        headers["x-cg-pro-api-key"] = COINGECKO_API_KEY
    req = Request(f"{COINGECKO_BASE_URL}{path_and_query}", headers=headers)
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


_coingecko_coin_list_cache: Optional[List[Dict]] = None


def _get_coingecko_coin_list() -> List[Dict]:
    """Full CoinGecko coin list (id, symbol, name) — ~15k entries. Cached
    in-process only (this is the one-time cost of resolving a brand-new
    coin; after that, resolve_coingecko_id() never needs this again for
    that coin)."""
    global _coingecko_coin_list_cache
    if _coingecko_coin_list_cache is not None:
        return _coingecko_coin_list_cache
    try:
        data = _coingecko_get("/coins/list", timeout=20)
        _coingecko_coin_list_cache = data if isinstance(data, list) else []
    except Exception:
        _coingecko_coin_list_cache = []
    return _coingecko_coin_list_cache


def resolve_coingecko_id(code: str) -> Optional[str]:
    """Map a Swyftx asset code (e.g. "SUI") to a CoinGecko coin id, so any
    coin a connected wallet holds can be priced — not just the static
    ASSET_CG_IDS registry. Resolved once, then cached in
    `dynamic_coin_registry`. A successful resolution is cached forever. A
    "not found" result is only cached for NEGATIVE_CACHE_HOURS and then
    retried — caching it forever was wrong: a transient CoinGecko hiccup
    (rate limit, timeout, or the market-cap tie-break call failing) during
    the FIRST resolution attempt would otherwise permanently block pricing
    for a coin CoinGecko actually lists just fine on any later attempt.
    Confirmed live 2026-10-25: STRK ("starknet") resolves correctly when
    tried fresh, despite a stale cached-null entry blocking it for hours.
    Several coins can share a ticker symbol; when that happens this picks
    whichever candidate has the highest market cap, since that's
    overwhelmingly the coin a licensed AU exchange like Swyftx actually
    lists — never a scam token sharing the same ticker."""
    code = code.upper()
    if code in ASSET_CG_IDS:
        return ASSET_CG_IDS[code]

    cached = dynamic_coin_registry_collection.find_one({"code": code})
    if cached is not None:
        if cached.get("cgId"):
            return cached["cgId"]
        resolved_at = cached.get("resolvedAt")
        if resolved_at and (datetime.utcnow() - resolved_at) < timedelta(hours=NEGATIVE_CACHE_HOURS):
            return None
        # Negative cache expired — fall through and retry below.

    cg_id = None
    try:
        candidates = [c for c in _get_coingecko_coin_list() if str(c.get("symbol", "")).upper() == code]
        if len(candidates) == 1:
            cg_id = candidates[0].get("id")
        elif len(candidates) > 1:
            ids = ",".join(c["id"] for c in candidates if c.get("id"))
            ranked = _coingecko_get(f"/coins/markets?vs_currency=usd&ids={ids}&order=market_cap_desc&per_page=1")
            if isinstance(ranked, list) and ranked:
                cg_id = ranked[0].get("id")
    except Exception:
        cg_id = None

    dynamic_coin_registry_collection.update_one(
        {"code": code},
        {"$set": {"cgId": cg_id, "resolvedAt": datetime.utcnow()}},
        upsert=True,
    )
    return cg_id


def get_prices_for_coins(codes: List[str]) -> Dict[str, float]:
    """Live USD prices for an arbitrary set of coin codes. Resolves any
    code outside ASSET_CG_IDS via resolve_coingecko_id() first, then does
    one combined CoinGecko price fetch for everything — this is what makes
    "any coin a user holds" both tradeable and correctly valued, instead
    of silently pricing at $0 the moment a wallet holds something outside
    the original ~30-coin list.

    Within _PRICE_CACHE_TTL_S of the last successful fetch, every requested
    code is served from cache with no CoinGecko call at all. On a live
    fetch failure (or for any code CoinGecko didn't return this time), falls
    back to the last known price however stale, rather than returning {}
    and letting every caller price that coin at $0."""
    requested = sorted(set(c.upper() for c in codes))
    if not requested:
        return {}

    now = time.time()
    if all(code in _price_cache and now - _price_cache[code][1] < _PRICE_CACHE_TTL_S for code in requested):
        return {code: _price_cache[code][0] for code in requested}

    code_to_cgid: Dict[str, str] = {}
    for code in requested:
        cg_id = resolve_coingecko_id(code)
        if cg_id:
            code_to_cgid[code] = cg_id

    if not code_to_cgid:
        return {}

    ids_param = ",".join(sorted(set(code_to_cgid.values())))
    try:
        # include_24hr_change=true is free on this endpoint — same one
        # request, CoinGecko just adds a second field per coin. Captured
        # into _change_cache below so get_price_changes_for_coins() never
        # needs a CoinGecko call of its own.
        data = _coingecko_get(f"/simple/price?ids={ids_param}&vs_currencies=usd&include_24hr_change=true")
    except Exception:
        return _get_cached_prices(list(code_to_cgid.keys()))

    prices: Dict[str, float] = {}
    changes: Dict[str, float] = {}
    for code, cg_id in code_to_cgid.items():
        entry = data.get(cg_id)
        if entry and entry.get("usd"):
            prices[code] = float(entry["usd"])
            pct = entry.get("usd_24h_change")
            if pct is not None:
                changes[code] = float(pct)

    _store_fresh_prices(prices)
    _store_fresh_changes(changes)

    missing = [c for c in code_to_cgid if c not in prices]
    if missing:
        prices.update(_get_cached_prices(missing))
    return prices


def _store_fresh_changes(changes: Dict[str, float]) -> None:
    now = time.time()
    for code, pct in changes.items():
        _change_cache[code] = (pct, now)


def get_price_changes_for_coins(codes: List[str]) -> Dict[str, float]:
    """24h % change for each code, piggybacking entirely on
    get_prices_for_coins()'s own CoinGecko call — this function never
    issues a request of its own. Call get_prices_for_coins() for the same
    codes first (every caller already does, to price the same holdings) so
    this is a pure cache read. A code with no cached change (never priced,
    or CoinGecko omitted usd_24h_change for it) returns 0.0 rather than
    being left out, so the frontend never needs a null-check."""
    requested = sorted(set(c.upper() for c in codes))
    now = time.time()
    result: Dict[str, float] = {}
    for code in requested:
        cached = _change_cache.get(code)
        # A generous multiple of the price TTL — a slightly stale % change
        # is harmless (it's a display figure, not a trading input), so this
        # favors showing last-known movement over flashing back to 0.0%.
        if cached and now - cached[1] < _PRICE_CACHE_TTL_S * 5:
            result[code] = cached[0]
        else:
            result[code] = 0.0
    return result


# Price-history chart cache, per (code, days) — the Holdings grid's new
# "expand a coin card" feature fetches this on demand (user interaction),
# so it's not covered by get_prices_for_coins()'s cache at all. Cached
# longer than live price (15 min) since a history chart doesn't need to
# be any fresher than that, and CoinGecko's free tier rate limit is easily
# exhausted if every card expand on every page load hit it fresh.
_PRICE_HISTORY_CACHE_TTL_S = 900
_price_history_cache: Dict[Tuple[str, int], Tuple[List[List[float]], float]] = {}


def get_coin_price_history(code: str, days: int = 7) -> Dict:
    """[[timestampMs, priceUsd], ...] for one coin over the last `days`
    days, via CoinGecko's /coins/{id}/market_chart — works for ANY coin
    resolve_coingecko_id() can find, not just the ~30-coin registry, same
    as get_prices_for_coins(). Returns {"code", "points": [...]}; points
    is [] (never an error) if the coin can't be resolved or CoinGecko's
    call fails, so the frontend can show a simple "not enough data"
    message instead of needing its own error-shape handling."""
    code = code.upper()
    days = max(1, min(int(days), 90))
    cache_key = (code, days)

    now = time.time()
    cached = _price_history_cache.get(cache_key)
    if cached and now - cached[1] < _PRICE_HISTORY_CACHE_TTL_S:
        return {"code": code, "points": cached[0]}

    cg_id = resolve_coingecko_id(code)
    if not cg_id:
        return {"code": code, "points": []}

    try:
        data = _coingecko_get(f"/coins/{cg_id}/market_chart?vs_currency=usd&days={days}")
        points = data.get("prices") if isinstance(data, dict) else None
        if not isinstance(points, list):
            points = []
    except Exception:
        # Serve the last good chart rather than nothing, however stale
        if cached:
            return {"code": code, "points": cached[0]}
        return {"code": code, "points": []}

    _price_history_cache[cache_key] = (points, now)
    return {"code": code, "points": points}


# ── Live, non-custodial leaderboard ─────────────────────────────────────────
# Replaces the old pool/NAV leaderboard. No shares, no NAV — just each
# connected wallet's own current holdings, read live from their own account,
# split into cash (USDC/AUD) vs. crypto.


def get_live_leaderboard() -> Dict:
    """Rank every connected wallet with a key on file by current total
    account value (read live from their own Swyftx account), with a
    %cash vs %crypto breakdown. No shares, no NAV — this entirely replaces
    the pool leaderboard for the non-custodial era.

    Deliberately does NOT filter by status="active" here — a wallet
    wrongly marked "invalid" by a past bug (e.g. the 2026-10-25 sortby 400
    misclassification, which flipped EVERY connected wallet's status at
    once) would otherwise never get a chance to self-heal, since it would
    never be attempted again. Each wallet's own try/except already skips
    it safely on a real failure (see `errored` below), and a success
    resets status -> "active" via _mark_key_valid()."""
    docs = list(user_exchange_keys_collection.find({"encryptedApiKey": {"$exists": True}}))

    # One shared price fetch AND one shared asset-ID-to-code fetch for
    # every wallet's holdings, not one per wallet. Skipping the latter
    # used to mean 4 wallets = 4 extra calls to Swyftx's asset list within
    # one request; when that got rate-limited partway through, every
    # wallet from that point on would have every non-cash balance's asset
    # ID silently fail to resolve (see get_holdings()'s docstring) —
    # showing up as a healthy-looking "100% cash, 0% crypto" instead of an
    # error. get_holdings() now caches that fetch globally, so this loop
    # only triggers it once across the whole process regardless of how
    # many wallets are iterated.
    all_coins = set()
    wallet_holdings = {}
    for doc, holdings, err in _fetch_wallets_in_parallel(docs, _fetch_one_wallet_holdings):
        wallet = doc.get("walletAddress")
        if err is None:
            wallet_holdings[wallet] = holdings
            all_coins.update(holdings.keys())
            _mark_key_valid(wallet)
        elif isinstance(err, SwyftxAuthError):
            wallet_holdings[wallet] = None
            update = {"lastError": str(err)}
            if not _is_transient_swyftx_error(err):
                update["status"] = "invalid"
            user_exchange_keys_collection.update_one({"walletAddress": wallet}, {"$set": update})
        else:
            wallet_holdings[wallet] = None

    prices = get_prices_for_coins(list(all_coins))
    aud_to_usd = get_aud_to_usd_rate()

    entries = []
    errored = 0
    combined_cash_by_currency = {"AUD": 0.0, "USD": 0.0, "USDC": 0.0, "USDT": 0.0}
    # Per-coin quantity summed across EVERY connected wallet (admin included)
    # — e.g. {"BTC": 0.06023299, ...}. This is what actually backs the
    # "Pool Total" doughnut's dollar figure; coin_totals breaks that same
    # figure down coin-by-coin instead of wallet-by-wallet, so the Holdings
    # grid can show the true combined coin list (ARB, LEVER, STRK, LUMIA,
    # etc. from wallets other than the admin's own) when viewing "Pool",
    # not just whatever the admin's own account happens to hold.
    coin_totals: Dict[str, float] = {}
    for doc in docs:
        wallet = doc.get("walletAddress")
        holdings = wallet_holdings.get(wallet)
        if holdings is None:
            errored += 1
            continue

        cash_value = 0.0
        crypto_value = 0.0
        cash_by_currency = {"AUD": 0.0, "USD": 0.0, "USDC": 0.0, "USDT": 0.0}
        for code, amount in holdings.items():
            if code == "AUD":
                # AUD is worth less than 1 USD — was previously counted
                # 1:1 as USD here, overstating cash value for any wallet
                # holding AUD. Convert at the live rate instead.
                cash_value += amount * aud_to_usd
                cash_by_currency["AUD"] += amount
            elif code in ("USDC", "USD", "USDT"):
                cash_value += amount
                cash_by_currency[code] += amount
            else:
                crypto_value += amount * prices.get(code, 0.0)
                coin_totals[code] = coin_totals.get(code, 0.0) + amount

        for k in combined_cash_by_currency:
            combined_cash_by_currency[k] += cash_by_currency[k]

        total_value = cash_value + crypto_value
        entries.append({
            "walletAddress": wallet,
            "walletShort": wallet[:4] + "..." + wallet[-4:] if wallet and len(wallet) > 8 else wallet,
            "totalValue": round(total_value, 2),
            "cashValue": round(cash_value, 2),
            "cryptoValue": round(crypto_value, 2),
            "pctCash": round((cash_value / total_value * 100), 1) if total_value > 0 else 0,
            "pctCrypto": round((crypto_value / total_value * 100), 1) if total_value > 0 else 0,
            "cashByCurrency": {k: round(v, 2) for k, v in cash_by_currency.items()},
            "isAdmin": wallet in ADMIN_WALLETS,
        })

    entries.sort(key=lambda e: e["totalValue"], reverse=True)

    coin_changes = get_price_changes_for_coins(list(coin_totals.keys()))
    coin_total_list = [
        {
            "code": code,
            "balance": balance,
            "priceUsd": prices.get(code, 0.0),
            "usdValue": round(balance * prices.get(code, 0.0), 2),
            "change24h": round(coin_changes.get(code, 0.0), 2),
        }
        for code, balance in coin_totals.items()
    ]
    coin_total_list.sort(key=lambda c: c["usdValue"], reverse=True)

    return {
        "entries": entries,
        "walletCount": len(docs),
        "erroredWallets": errored,
        "combinedValue": round(sum(e["totalValue"] for e in entries), 2),
        "cashByCurrency": {k: round(v, 2) for k, v in combined_cash_by_currency.items()},
        "coinTotals": coin_total_list,
    }


# ── Wallet cash-flow ledger (lifetime deposited/withdrawn, non-custodial) ───
# First cut of this (Oct 2026) assumed BUDJU had no way to see a connected
# wallet's real Swyftx deposit/withdrawal history and required an admin to
# type lifetime totals in by hand. That assumption was wrong: Swyftx's own
# API (https://docs.swyftx.com.au) publishes GET /history/deposit/ and
# GET /history/withdraw/ — confirmed against Swyftx's live Apiary docs and
# the open-source pyswyft client, which both document these exact paths —
# and the non-custodial model already stores every connected wallet's OWN
# encrypted Swyftx key (user_exchange_keys_collection), so BUDJU can call
# these endpoints with THAT wallet's own credentials, for every wallet, not
# just the admin's. get_user_live_cash_flows() below does that live fetch.
#
# What Swyftx does NOT publish is the exact JSON record schema for these
# two endpoints (their docs show only a wrapper key, e.g. {"deposits": []},
# no field-level example) — so the parser below is intentionally tolerant
# of several plausible field-name variants (matching the camelCase already
# observed elsewhere in Swyftx's API: audValue, availableBalance, assetId)
# and SKIPS (never guesses) any record it can't confidently price. Use
# The admin UI for manually entering/deleting wallet_cash_flows_collection
# entries was removed (Oct 2026) — live Swyftx history is accurate enough
# day-to-day that the override was never needed. get_wallet_cash_flows()
# below still checks this collection first and prefers any entry already
# in it, purely so a pre-existing manual override (if one was ever made)
# keeps working — nothing can write a new one anymore.

def _get_manual_wallet_cash_flows(wallet_address: str) -> Dict:
    """One wallet's admin-entered lifetime deposits/withdrawals (oldest
    first), plus running totals. This is the override ledger — empty for
    any wallet nobody has manually corrected/supplemented."""
    docs = list(
        wallet_cash_flows_collection.find({"walletAddress": wallet_address}).sort("timestamp", 1)
    )
    flows = []
    total_deposited = 0.0
    total_withdrawn = 0.0
    for d in docs:
        amount = float(d.get("amountUsd", 0) or 0)
        if d.get("type") == "deposit":
            total_deposited += amount
        else:
            total_withdrawn += amount
        flows.append({
            "id": str(d["_id"]),
            "type": d.get("type"),
            "amountUsd": amount,
            "timestamp": d["timestamp"].isoformat() if d.get("timestamp") else None,
            "note": d.get("note"),
        })
    return {
        "walletAddress": wallet_address,
        "flows": flows,
        "totalDepositedUsd": round(total_deposited, 2),
        "totalWithdrawnUsd": round(total_withdrawn, 2),
    }


# Live AUD→USD rate, derived from CoinGecko the same way the frontend does
# (BTC/ETH USD vs AUD cross-rate) — cached briefly since it barely moves
# minute to minute and every cash-flow fetch needs it.
_aud_to_usd_cache = {"rate": 0.65, "expiry": 0.0}


def get_aud_to_usd_rate() -> float:
    now = time.time()
    if now < _aud_to_usd_cache["expiry"]:
        return _aud_to_usd_cache["rate"]
    try:
        data = _coingecko_get("/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,aud")
        ref = (data.get("bitcoin") or {}) if isinstance(data, dict) else {}
        if not ref.get("usd") or not ref.get("aud"):
            ref = (data.get("ethereum") or {}) if isinstance(data, dict) else {}
        if ref.get("usd") and ref.get("aud"):
            rate = float(ref["usd"]) / float(ref["aud"])
            _aud_to_usd_cache["rate"] = rate
            _aud_to_usd_cache["expiry"] = now + 300
    except Exception:
        pass  # Keep the last known (or default) rate — never block a cash-flow fetch on this
    return _aud_to_usd_cache["rate"]


# Swyftx's real "History Entry" response shape — confirmed directly from
# its Apiary API docs' typed data-structure definition (not just an example
# body, which the docs reuse as unhelpful copy-pasted boilerplate across
# unrelated endpoints): {"asset": <numeric id>, "amount": <number>,
# "updated": <unix epoch>, "actionType": "Deposit"|"Withdrawal"|...,
# "status": <1-11 enum>}. An earlier version of this parser guessed wrong
# field names entirely (assetId/currency/createdAt/audValue, string status)
# and silently skipped every real record as a result — these are the
# verified names, with the old guesses kept only as defensive fallbacks.
_HISTORY_STATUS_COMPLETED = 2  # "Processed and completed" — the only status that means money actually moved
_CASH_FLOW_FAILED_STATUS_STRINGS = {"failed", "cancelled", "canceled", "rejected", "expired", "declined", "pending"}


def _history_record_is_settled(rec: Dict) -> bool:
    """True only for a fully completed transfer. Swyftx's real schema uses
    a NUMERIC status enum (2 = Processed and completed; 1/6/7/8/9 are
    Created/Pending variants, 3/4/5 are Rejected/Failed, 10 is Refunded) —
    none of those besides 2 represent money that has actually moved, so
    counting them would overstate lifetime deposited/withdrawn."""
    status = rec.get("status")
    if isinstance(status, bool):
        return True
    if isinstance(status, (int, float)):
        return int(status) == _HISTORY_STATUS_COMPLETED
    if isinstance(status, str):
        s = status.strip().lower()
        if s in ("completed", "processed", "processed and completed", "success", "settled"):
            return True
        return s not in _CASH_FLOW_FAILED_STATUS_STRINGS
    return True


def _history_record_matches_flow_type(rec: Dict, flow_type: str) -> bool:
    """Cross-check against the record's own `actionType`, if present — the
    enum includes more than just Deposit/Withdrawal ("..." in Swyftx's
    docs), so a record whose actionType clearly contradicts which endpoint
    returned it (e.g. actionType=Withdrawal from /history/deposit/) is
    dropped rather than silently mis-labelled."""
    action = rec.get("actionType")
    if not isinstance(action, str) or not action:
        return True
    action = action.strip().lower()
    if flow_type == "deposit":
        return action != "withdrawal"
    return action != "deposit"


def _history_record_currency(rec: Dict, asset_map: Dict[str, str]) -> str:
    """Resolve this record's asset to a coin code. Swyftx's real schema
    identifies the asset only by the numeric `asset` id (the same id->code
    map get_holdings() already resolves via) — not a currency/code string.
    Those string-keyed shapes are kept as fallbacks in case of API drift."""
    asset_id = rec.get("asset")
    if asset_id is not None and not isinstance(asset_id, dict):
        code = asset_map.get(str(asset_id), "")
        if code:
            return code.upper()
    for key in ("currency", "assetCode", "code"):
        v = rec.get(key)
        if isinstance(v, str) and v:
            return v.upper()
    if isinstance(asset_id, dict) and asset_id.get("code"):
        return str(asset_id["code"]).upper()
    legacy_id = rec.get("assetId") if rec.get("assetId") is not None else rec.get("asset_id")
    if legacy_id is not None:
        return asset_map.get(str(legacy_id), "")
    return ""


def _history_record_amount_usd(
    rec: Dict, currency: str, aud_to_usd: float, crypto_prices: Dict[str, float]
) -> Optional[float]:
    """USD value of one deposit/withdrawal record. Swyftx's real `amount`
    field is in the asset's OWN units (no ready-made USD/AUD value) —
    priced here as: USDC/USD/USDT 1:1, AUD at the live FX rate, any other
    coin (a direct crypto deposit/withdrawal) at its current live price —
    the same simplification already used for the leaderboard's cash/crypto
    split (not historically accurate, but the best available without a
    historical price feed). Returns None only if no amount can be read at all."""
    raw_amount = None
    for key in ("amount", "quantity"):
        if key in rec:
            try:
                raw_amount = abs(float(rec[key]))
                break
            except (TypeError, ValueError):
                continue
    if raw_amount is None:
        return None

    if currency in ("USDC", "USD", "USDT"):
        return round(raw_amount, 2)
    if currency == "AUD":
        return round(raw_amount * aud_to_usd, 2)
    if currency and crypto_prices.get(currency):
        return round(raw_amount * crypto_prices[currency], 2)

    # Legacy fallback — an alternate response shape that ships a ready-made
    # AUD reference value instead of a resolvable currency code.
    for key in ("audValue", "aud_value", "amountAud", "value"):
        if key in rec:
            try:
                aud = abs(float(rec[key]))
                if aud > 0:
                    return round(aud * aud_to_usd, 2)
            except (TypeError, ValueError):
                continue

    return None


def _history_record_timestamp(rec: Dict) -> Optional[str]:
    """Swyftx's real schema calls this field `updated` — a Unix epoch
    number (seconds or milliseconds; magnitude-detected), not an ISO
    string. Other key names/shapes are kept as defensive fallbacks."""
    for key in ("updated", "time", "createdAt", "created_at", "timestamp", "created"):
        v = rec.get(key)
        if v is None or v == "":
            continue
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            epoch = float(v) / 1000.0 if v > 10_000_000_000 else float(v)
            try:
                return datetime.utcfromtimestamp(epoch).isoformat()
            except (OverflowError, OSError, ValueError):
                continue
        return str(v)
    date_part = rec.get("Date") or rec.get("date")
    time_part = rec.get("Time") or rec.get("time")
    if date_part and time_part:
        return f"{date_part}T{time_part}"
    return None


_live_cash_flow_cache: Dict[str, Tuple[Dict, float]] = {}
_LIVE_CASH_FLOW_TTL = 120  # seconds — a wallet's history doesn't change fast enough to need fresher reads


def get_user_live_cash_flows(wallet_address: str) -> Dict:
    """Live lifetime deposited/withdrawn for one wallet, fetched straight
    from THEIR OWN Swyftx deposit/withdrawal history via their own key — no
    admin data entry required. See the module docstring above this section
    for the real endpoints used and the parsing caveats."""
    now = time.time()
    cached = _live_cash_flow_cache.get(wallet_address)
    if cached and now < cached[1]:
        return cached[0]

    client = _get_user_swyftx_client(wallet_address)
    try:
        asset_map = client.get_asset_map()
    except Exception:
        asset_map = {}

    try:
        deposits_raw = client.get_deposit_history()
        withdrawals_raw = client.get_withdrawal_history()
    except SwyftxAuthError as e:
        update = {"lastError": str(e)}
        if not _is_transient_swyftx_error(e):
            update["status"] = "invalid"
        user_exchange_keys_collection.update_one({"walletAddress": wallet_address}, {"$set": update})
        raise ValueError(f"Could not fetch your Swyftx deposit/withdrawal history: {e}")
    _mark_key_valid(wallet_address)

    aud_to_usd = get_aud_to_usd_rate()
    all_records = [(r, "deposit") for r in deposits_raw] + [(r, "withdrawal") for r in withdrawals_raw]

    # One shared price fetch for every non-cash currency seen across both
    # lists, not one CoinGecko call per record.
    currencies = {_history_record_currency(rec, asset_map) for rec, _ in all_records}
    crypto_codes = [c for c in currencies if c and c not in ("USDC", "USD", "USDT", "AUD")]
    crypto_prices = get_prices_for_coins(crypto_codes) if crypto_codes else {}

    flows: List[Dict] = []
    skipped = 0

    for rec, flow_type in all_records:
        if not _history_record_is_settled(rec):
            continue  # Pending/failed/rejected/refunded — not a parse failure, correctly excluded
        if not _history_record_matches_flow_type(rec, flow_type):
            continue
        currency = _history_record_currency(rec, asset_map)
        amount_usd = _history_record_amount_usd(rec, currency, aud_to_usd, crypto_prices)
        ts = _history_record_timestamp(rec)
        if amount_usd is None or amount_usd <= 0 or not ts:
            skipped += 1
            continue
        flows.append({
            "id": str(rec.get("uuid") or rec.get("id") or f"{flow_type}-{len(flows)}"),
            "type": flow_type,
            "amountUsd": amount_usd,
            "timestamp": ts,
            "note": currency or None,
        })

    flows.sort(key=lambda f: f["timestamp"])
    total_deposited = round(sum(f["amountUsd"] for f in flows if f["type"] == "deposit"), 2)
    total_withdrawn = round(sum(f["amountUsd"] for f in flows if f["type"] == "withdrawal"), 2)

    result = {
        "walletAddress": wallet_address,
        "flows": flows,
        "totalDepositedUsd": total_deposited,
        "totalWithdrawnUsd": total_withdrawn,
        "parseWarnings": skipped,
    }
    _live_cash_flow_cache[wallet_address] = (result, now + _LIVE_CASH_FLOW_TTL)
    return result


def get_wallet_cash_flows(wallet_address: str) -> Dict:
    """One wallet's lifetime deposited/withdrawn + flows. Prefers an
    admin-entered manual override (if any exist for this wallet — e.g. to
    correct a bad live parse, or record pre-Swyftx history); otherwise
    fetches live from the wallet's own Swyftx account. If neither is
    available (no key on file, or the live fetch fails), returns the empty
    manual result with an `error` describing why live wasn't available."""
    manual = _get_manual_wallet_cash_flows(wallet_address)
    if manual["flows"]:
        manual["source"] = "manual"
        return manual

    try:
        live = get_user_live_cash_flows(wallet_address)
        live["source"] = "live"
        return live
    except Exception as e:
        manual["source"] = "manual"
        manual["error"] = str(e)
        return manual


def get_community_cash_flows() -> Dict:
    """Aggregate lifetime deposited/withdrawn across every wallet that has
    EITHER a Swyftx key on file (live-fetched) OR a manual override
    recorded — not assumed to cover every connected wallet, since a wallet
    with a revoked/missing key and no manual entry has nothing to read.

    Not filtered to status="active" — see get_live_leaderboard()'s
    docstring for why."""
    active_wallets = {
        d.get("walletAddress")
        for d in user_exchange_keys_collection.find({"encryptedApiKey": {"$exists": True}}, {"walletAddress": 1})
    }
    manual_wallets = {
        d.get("walletAddress")
        for d in wallet_cash_flows_collection.find({}, {"walletAddress": 1})
    }

    per_wallet: Dict[str, Dict] = {}
    all_flows: List[Dict] = []
    total_deposited = 0.0
    total_withdrawn = 0.0

    wallets = [w for w in (active_wallets | manual_wallets) if w]
    for wallet, result, err in _fetch_wallets_in_parallel(wallets, get_wallet_cash_flows):
        # get_wallet_cash_flows() already catches its own Swyftx errors and
        # falls back to the manual/empty result — `err` here would only
        # ever fire on a genuinely unexpected bug, not a normal API failure.
        if err is not None or not result or not result.get("flows"):
            continue
        per_wallet[wallet] = {
            "depositedUsd": result["totalDepositedUsd"],
            "withdrawnUsd": result["totalWithdrawnUsd"],
            "source": result.get("source", "manual"),
        }
        total_deposited += result["totalDepositedUsd"]
        total_withdrawn += result["totalWithdrawnUsd"]
        all_flows.extend(result["flows"])

    all_flows.sort(key=lambda f: f.get("timestamp") or "")
    timeline: List[Dict] = []
    cum_deposited = 0.0
    cum_withdrawn = 0.0
    for f in all_flows:
        if f["type"] == "deposit":
            cum_deposited += f["amountUsd"]
        else:
            cum_withdrawn += f["amountUsd"]
        timeline.append({
            "timestamp": f["timestamp"],
            "type": f["type"],
            "amountUsd": round(f["amountUsd"], 2),
            "cumulativeDepositedUsd": round(cum_deposited, 2),
            "cumulativeWithdrawnUsd": round(cum_withdrawn, 2),
        })

    return {
        "walletsWithData": len(per_wallet),
        "perWallet": per_wallet,
        "totalDepositedUsd": round(total_deposited, 2),
        "totalWithdrawnUsd": round(total_withdrawn, 2),
        "timeline": timeline,
    }


# ── Signals / Copy Trading (Phase 1) ────────────────────────────────────────
# Public, read-only leaderboard of auto-sourced Solana wallets + a paper
# trading sandbox that mirrors their buys/sells with simulated USDC, no real
# funds. See api/copytrade_dune.py (seed list), api/copytrade_filters.py
# (wash-trade/bot filtering), api/copytrade_helius.py (webhook + swap
# parsing) and api/copytrade_engine.py (entry/exit decisions) for the logic
# that calls into these accessors. Everything here follows the same
# "every DB access goes through database.py" rule as the rest of the file.

import copytrade_filters

COPYTRADE_STATE_ID = "copytrade"


def get_copytrade_state() -> Dict:
    doc = copytrade_state_collection.find_one({"_id": COPYTRADE_STATE_ID}) or {}
    return {
        "walletsRefreshedAt": doc.get("walletsRefreshedAt"),
        "heliusWebhookId": doc.get("heliusWebhookId"),
        "heliusAddressesHash": doc.get("heliusAddressesHash"),
    }


def save_copytrade_state(updates: Dict) -> None:
    copytrade_state_collection.update_one(
        {"_id": COPYTRADE_STATE_ID},
        {"$set": {**updates, "updatedAt": datetime.utcnow()}},
        upsert=True,
    )


def upsert_copytrade_wallets(candidates: List[Dict]) -> Dict:
    """Insert newly-seen tracked wallets, touch lastSeenAt on known ones.
    `candidates`: [{"address", "label"?, "source", "sourceQueryId"?}].
    Never overwrites an existing wallet's status/stats/filterFlags — those
    are only ever changed by the filter pipeline or by closing a paper
    position, not by re-seeding from Dune."""
    inserted = 0
    touched = 0
    for c in candidates:
        address = (c.get("address") or "").strip()
        if not address:
            continue
        now = datetime.utcnow()
        existing = copytrade_wallets_collection.find_one({"address": address})
        if existing:
            copytrade_wallets_collection.update_one(
                {"address": address}, {"$set": {"lastSeenAt": now}}
            )
            touched += 1
            continue
        copytrade_wallets_collection.insert_one({
            "address": address,
            "label": c.get("label") or f"{address[:4]}...{address[-4:]}",
            "source": c.get("source", "manual"),
            "sourceQueryId": c.get("sourceQueryId"),
            "firstSeenAt": now,
            "lastSeenAt": now,
            # Pending review by the filter pipeline — not shown on the
            # public leaderboard until it's run at least once.
            "status": "pending",
            "filterFlags": {},
            "stats": {
                "trades": 0, "wins": 0, "losses": 0,
                "totalPnlUsd": 0.0, "winRate": 0.0, "avgHoldMinutes": 0.0,
            },
        })
        inserted += 1
    return {"inserted": inserted, "touched": touched}


def get_copytrade_wallets_for_filtering(limit: int = 500) -> List[Dict]:
    """Wallets in 'pending' status (newly seeded, not yet scored) plus any
    'active'/'excluded' wallet whose stats have moved enough trades since
    last scored to be worth re-checking. Phase 1 keeps this simple: anything
    not already excluded gets re-scored every filter pass."""
    return list(
        copytrade_wallets_collection.find({"status": {"$ne": "excluded"}}).limit(limit)
    )


def apply_copytrade_filter_result(address: str, flags: Dict, status: str, reason: Optional[str] = None) -> None:
    update = {"filterFlags": flags, "status": status, "filteredAt": datetime.utcnow()}
    if reason:
        update["excludeReason"] = reason
    else:
        update["excludeReason"] = None
    copytrade_wallets_collection.update_one({"address": address}, {"$set": update})


def get_copytrade_wallet(address: str) -> Optional[Dict]:
    return copytrade_wallets_collection.find_one({"address": address})


def get_trackable_copytrade_wallet_addresses() -> List[str]:
    """Every wallet the Helius webhook should be watching — "pending"
    (freshly seeded, not yet scored) AND "active" (already proven),
    everything except "excluded". This is deliberately NOT status="active"
    only: a brand-new wallet needs its swaps actually flowing in via the
    webhook before it can ever accumulate the 10 closed trades
    copytrade_filters.MIN_TRADES_TO_SCORE requires to be promoted out of
    "pending" — tracking active-only wallets would mean no wallet could
    ever earn its first trade, a permanent bootstrap deadlock."""
    return [
        d["address"] for d in
        copytrade_wallets_collection.find({"status": {"$ne": "excluded"}}, {"address": 1})
    ]


def get_active_copytrade_wallet_addresses() -> List[str]:
    """Wallets that have PASSED the filter and appear on the public
    leaderboard. NOT the right set for Helius webhook tracking — see
    get_trackable_copytrade_wallet_addresses() for that."""
    return [
        d["address"] for d in
        copytrade_wallets_collection.find({"status": "active"}, {"address": 1})
    ]


def record_copytrade_event(event: Dict) -> bool:
    """Insert a raw swap event. Returns False (no-op) if this signature was
    already ingested — Helius can and does retry webhook deliveries."""
    try:
        copytrade_events_collection.insert_one({**event, "createdAt": datetime.utcnow()})
        return True
    except DuplicateKeyError:
        return False


def get_open_copytrade_position(wallet_address: str, token_mint: str) -> Optional[Dict]:
    return copytrade_positions_collection.find_one({
        "walletAddress": wallet_address, "tokenMint": token_mint, "status": "open",
    })


def open_copytrade_position(doc: Dict) -> Optional[Dict]:
    """Opens a new paper position, unless this wallet already has one open
    on this token (avoids piling up duplicate paper buys off repeated
    signals for the same position)."""
    if get_open_copytrade_position(doc["walletAddress"], doc["tokenMint"]):
        return None
    now = datetime.utcnow()
    full = {
        **doc,
        "status": "open",
        "entryAt": now,
        "currentPriceUsd": doc.get("entryPriceUsd"),
        "lastPricedAt": now,
    }
    res = copytrade_positions_collection.insert_one(full)
    full["_id"] = res.inserted_id
    return full


def get_open_copytrade_positions(token_mints: Optional[List[str]] = None) -> List[Dict]:
    query: Dict = {"status": "open"}
    if token_mints is not None:
        query["tokenMint"] = {"$in": token_mints}
    return list(copytrade_positions_collection.find(query))


def update_copytrade_position_price(position_id, price_usd: float) -> None:
    copytrade_positions_collection.update_one(
        {"_id": position_id},
        {"$set": {"currentPriceUsd": price_usd, "lastPricedAt": datetime.utcnow()}},
    )


def close_copytrade_position(position: Dict, exit_price_usd: float, reason: str) -> Dict:
    """Closes a paper position and rolls its P&L into the wallet's running
    leaderboard stats (so the public leaderboard is a cheap read, never a
    live aggregation over every trade ever made)."""
    entry_price = position.get("entryPriceUsd") or 0
    entry_usd = position.get("entryAmountUsd") or 0
    pnl_pct = ((exit_price_usd - entry_price) / entry_price * 100) if entry_price else 0.0
    pnl_usd = entry_usd * (pnl_pct / 100)
    now = datetime.utcnow()
    hold_minutes = max(0.0, (now - position["entryAt"]).total_seconds() / 60) if position.get("entryAt") else 0.0

    copytrade_positions_collection.update_one(
        {"_id": position["_id"]},
        {"$set": {
            "status": "closed",
            "exitPriceUsd": exit_price_usd,
            "exitAt": now,
            "exitReason": reason,
            "pnlUsd": round(pnl_usd, 4),
            "pnlPct": round(pnl_pct, 2),
            "holdMinutes": round(hold_minutes, 1),
        }},
    )

    wallet = copytrade_wallets_collection.find_one({"address": position["walletAddress"]})
    stats = (wallet or {}).get("stats") or {}
    trades = stats.get("trades", 0) + 1
    wins = stats.get("wins", 0) + (1 if pnl_usd > 0 else 0)
    losses = stats.get("losses", 0) + (1 if pnl_usd <= 0 else 0)
    total_pnl = round(stats.get("totalPnlUsd", 0.0) + pnl_usd, 4)
    prev_avg_hold = stats.get("avgHoldMinutes", 0.0)
    avg_hold = ((prev_avg_hold * (trades - 1)) + hold_minutes) / trades if trades else 0.0
    copytrade_wallets_collection.update_one(
        {"address": position["walletAddress"]},
        {"$set": {
            "stats": {
                "trades": trades, "wins": wins, "losses": losses,
                "totalPnlUsd": total_pnl,
                "winRate": round((wins / trades) * 100, 1) if trades else 0.0,
                "avgHoldMinutes": round(avg_hold, 1),
            },
        }},
    )
    return {"pnlUsd": round(pnl_usd, 4), "pnlPct": round(pnl_pct, 2)}


def reset_copytrade_helius_state() -> None:
    """Force the next webhook sync to run from scratch, ignoring whatever
    the current copytrade_state says — clears the wallet-refresh gate
    timestamp (so the hourly "already refreshed recently" check doesn't
    skip it) and the stored webhook id/address hash (so the "unchanged,
    skip" check doesn't treat a previously-"successful" sync as still
    valid). Needed after fixing a bug in sync_helius_webhook/its target
    host, where the stored state reflects a sync that returned "ok" while
    actually talking to a broken host — that stale state would otherwise
    make every future cron tick skip re-syncing forever, since nothing
    about the tracked-wallet list itself ever changed."""
    copytrade_state_collection.update_one(
        {"_id": COPYTRADE_STATE_ID},
        {"$set": {"heliusWebhookId": None, "heliusAddressesHash": None, "walletsRefreshedAt": None}},
        upsert=True,
    )


def get_copytrade_debug() -> Dict:
    """Admin-only diagnostic: raw copytrade_state, wallet status counts,
    and a few pending wallets' own trade counts/last-seen timestamps --
    everything needed to tell FROM THE DATABASE SIDE where the Signals
    pipeline might be stuck (seeding never ran? webhook never synced?
    wallets seeded but zero swaps ever recorded?) without needing server
    log access. Combined with copytrade_helius.list_helius_webhooks()
    (the view from Helius's own side) in the API layer above this."""
    state = copytrade_state_collection.find_one({"_id": COPYTRADE_STATE_ID}) or {}
    status_counts = {
        s: copytrade_wallets_collection.count_documents({"status": s})
        for s in ("pending", "active", "excluded")
    }
    sample_pending = list(
        copytrade_wallets_collection.find({"status": "pending"}, {"address": 1, "stats": 1, "lastSeenAt": 1})
        .sort("lastSeenAt", -1)
        .limit(5)
    )
    return {
        "walletsRefreshedAt": state.get("walletsRefreshedAt").isoformat() if state.get("walletsRefreshedAt") else None,
        "heliusWebhookId": state.get("heliusWebhookId"),
        "heliusAddressesHash": state.get("heliusAddressesHash"),
        "walletStatusCounts": status_counts,
        "totalEvents": copytrade_events_collection.count_documents({}),
        "totalPositions": copytrade_positions_collection.count_documents({}),
        "openPositions": copytrade_positions_collection.count_documents({"status": "open"}),
        "samplePendingWallets": [
            {
                "address": d["address"],
                "trades": d.get("stats", {}).get("trades", 0),
                "lastSeenAt": d.get("lastSeenAt").isoformat() if d.get("lastSeenAt") else None,
            }
            for d in sample_pending
        ],
    }


def get_copytrade_progress(limit: int = 30) -> Dict:
    """Public — wallets still in "pending" status (seeded, not yet proven
    OR excluded) that have logged at least one paper trade so far, sorted
    by trades-made descending so whichever wallets are closest to crossing
    copytrade_filters.MIN_TRADES_TO_SCORE and graduating onto the real
    leaderboard show first. Lets the public page show the tracked list
    visibly "growing" (trade counts ticking up, running win/loss, running
    P&L) during the long stretch before any wallet has 10 closed trades,
    instead of a flat "no ranked wallets yet" with zero visible progress."""
    docs = list(
        copytrade_wallets_collection.find({
            "status": "pending",
            "stats.trades": {"$gt": 0},
        })
        .sort("stats.trades", -1)
        .limit(limit)
    )
    entries = [{
        "address": d["address"],
        "label": d.get("label"),
        "trades": d.get("stats", {}).get("trades", 0),
        "wins": d.get("stats", {}).get("wins", 0),
        "losses": d.get("stats", {}).get("losses", 0),
        "winRate": d.get("stats", {}).get("winRate", 0.0),
        "totalPnlUsd": d.get("stats", {}).get("totalPnlUsd", 0.0),
        "tradesNeeded": max(0, copytrade_filters.MIN_TRADES_TO_SCORE - d.get("stats", {}).get("trades", 0)),
        "lastSeenAt": d.get("lastSeenAt").isoformat() if d.get("lastSeenAt") else None,
    } for d in docs]
    in_progress_count = copytrade_wallets_collection.count_documents({
        "status": "pending", "stats.trades": {"$gt": 0},
    })
    return {
        "entries": entries,
        "inProgressCount": in_progress_count,
        "minTradesToScore": copytrade_filters.MIN_TRADES_TO_SCORE,
    }


def get_copytrade_leaderboard(limit: int = 50) -> Dict:
    """Public — ranked tracked wallets with at least one closed paper trade,
    best totalPnlUsd first. Wallets still 'pending' filter review or
    'excluded' (wash-trade/bot) never appear here."""
    docs = list(
        copytrade_wallets_collection.find({"status": "active"})
        .sort("stats.totalPnlUsd", -1)
        .limit(limit)
    )
    entries = [{
        "address": d["address"],
        "label": d.get("label"),
        "trades": d.get("stats", {}).get("trades", 0),
        "winRate": d.get("stats", {}).get("winRate", 0.0),
        "totalPnlUsd": d.get("stats", {}).get("totalPnlUsd", 0.0),
        "avgHoldMinutes": d.get("stats", {}).get("avgHoldMinutes", 0.0),
        "lastSeenAt": d.get("lastSeenAt").isoformat() if d.get("lastSeenAt") else None,
    } for d in docs]
    total_tracked = copytrade_wallets_collection.count_documents({})
    total_active = copytrade_wallets_collection.count_documents({"status": "active"})
    total_excluded = copytrade_wallets_collection.count_documents({"status": "excluded"})
    return {
        "entries": entries,
        "walletCount": total_active,
        "trackedCount": total_tracked,
        "excludedCount": total_excluded,
    }


def _public_position(d: Dict) -> Dict:
    return {
        "id": str(d["_id"]),
        "walletAddress": d["walletAddress"],
        "walletLabel": d.get("walletLabel"),
        "tokenSymbol": d.get("tokenSymbol") or "?",
        "tokenMint": d.get("tokenMint"),
        "status": d.get("status"),
        "entryPriceUsd": d.get("entryPriceUsd"),
        "entryAmountUsd": d.get("entryAmountUsd"),
        "entryAt": d.get("entryAt").isoformat() if d.get("entryAt") else None,
        "currentPriceUsd": d.get("currentPriceUsd"),
        "exitPriceUsd": d.get("exitPriceUsd"),
        "exitAt": d.get("exitAt").isoformat() if d.get("exitAt") else None,
        "exitReason": d.get("exitReason"),
        "pnlUsd": d.get("pnlUsd") if d.get("status") == "closed" else (
            ((d.get("currentPriceUsd") or 0) - (d.get("entryPriceUsd") or 0))
            / (d.get("entryPriceUsd") or 1) * (d.get("entryAmountUsd") or 0)
            if d.get("entryPriceUsd") else 0.0
        ),
        "pnlPct": d.get("pnlPct") if d.get("status") == "closed" else (
            (((d.get("currentPriceUsd") or 0) - (d.get("entryPriceUsd") or 0))
             / (d.get("entryPriceUsd") or 1) * 100)
            if d.get("entryPriceUsd") else 0.0
        ),
    }


def get_copytrade_signals(limit: int = 60) -> Dict:
    """Public — most recent paper trades (open or closed), newest first.
    This is the "signals feed" — what the tracked wallets have been doing,
    translated into BUDJU's own simulated buys/sells."""
    docs = list(
        copytrade_positions_collection.find({}).sort("entryAt", -1).limit(limit)
    )
    return {"signals": [_public_position(d) for d in docs]}


def get_copytrade_overview() -> Dict:
    open_count = copytrade_positions_collection.count_documents({"status": "open"})
    closed_count = copytrade_positions_collection.count_documents({"status": "closed"})
    active_wallets = copytrade_wallets_collection.count_documents({"status": "active"})
    # Every wallet seeded so far, regardless of status — this is what a
    # "Tracked Wallets" stat should show. Only counting status="active"
    # here made the overview card read "0" right after the very first
    # Dune seed (every wallet starts "pending" until it earns 10 closed
    # trades), even though 100+ wallets were, in fact, already being
    # watched by the Helius webhook.
    tracked_wallets = copytrade_wallets_collection.count_documents({})
    pipeline = [
        {"$match": {"status": "closed"}},
        {"$group": {"_id": None, "totalPnlUsd": {"$sum": "$pnlUsd"}, "wins": {"$sum": {"$cond": [{"$gt": ["$pnlUsd", 0]}, 1, 0]}}}},
    ]
    agg = list(copytrade_positions_collection.aggregate(pipeline))
    total_pnl = agg[0]["totalPnlUsd"] if agg else 0.0
    wins = agg[0]["wins"] if agg else 0
    return {
        "trackedWallets": tracked_wallets,
        "activeWallets": active_wallets,
        "openPositions": open_count,
        "closedPositions": closed_count,
        "totalPaperPnlUsd": round(total_pnl, 2),
        "overallWinRate": round((wins / closed_count) * 100, 1) if closed_count else 0.0,
    }
