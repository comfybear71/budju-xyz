# ==========================================
# MongoDB Database Handler
# ==========================================
# Share-based (NAV) accounting for fair multi-user pools.
# NAV per share = totalPoolValue / totalShares
# On deposit: sharesIssued = depositAmount / currentNAV
# User value = userShares x currentNAV
# ==========================================

import os
from datetime import datetime
from typing import Optional, Dict, List
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

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]

# Collections
users_collection = db["users"]
trades_collection = db["trades"]
deposits_collection = db["deposits"]
withdrawals_collection = db["withdrawals"]
trader_state_collection = db["trader_state"]
pool_state_collection = db["pool_state"]

# Create indexes
users_collection.create_index("walletAddress", unique=True)
trades_collection.create_index([("userId", 1), ("timestamp", -1)])
deposits_collection.create_index([("userId", 1), ("timestamp", -1)])
deposits_collection.create_index("txHash", unique=True)
trades_collection.create_index("swyftxId", unique=True, sparse=True)


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
        return {"totalShares": 0, "initialized": None}
    return {
        "totalShares": doc.get("totalShares", 0),
        "initialized": doc.get("initialized")
    }


def get_user_shares_total() -> float:
    """Sum of shares held by non-admin users only.
    The admin operates the pool but doesn't own a share of it — all value
    belongs to the investors.  Pool-state totalShares may include phantom
    shares from initialize_pool, so we always derive the real denominator
    from actual user documents."""
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
        "initialized": datetime.utcnow()
    })

    return {
        "success": True,
        "totalShares": total_pool_value,
        "nav": 1.0,
        "alreadyInitialized": False
    }


def get_nav(total_pool_value: float) -> float:
    total_shares = get_user_shares_total()
    if total_shares <= 0 or total_pool_value <= 0:
        return 1.0
    return total_pool_value / total_shares


# ── User Position ───────────────────────────────────────────────────────────

def get_user_position(wallet_address: str, total_pool_value: float) -> Dict:
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        return {
            "shares": 0, "nav": 1.0, "currentValue": 0,
            "allocation": 0, "totalDeposited": 0
        }

    total_shares = get_user_shares_total()
    user_shares = user.get("shares", 0.0)
    nav = total_pool_value / total_shares if total_shares > 0 else 1.0

    return {
        "shares": user_shares,
        "nav": nav,
        "currentValue": user_shares * nav,
        "allocation": (user_shares / total_shares * 100) if total_shares > 0 else 0,
        "totalDeposited": user.get("totalDeposited", 0.0)
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


# ── Deposit with Share Issuance ─────────────────────────────────────────────

def record_deposit(wallet_address: str, amount: float, tx_hash: str,
                   total_pool_value: float, currency: str = "USDC") -> Dict:
    user = users_collection.find_one({"walletAddress": wallet_address})
    if not user:
        raise ValueError("User not found")

    pool = get_pool_state()
    if pool["totalShares"] <= 0:
        initialize_pool(total_pool_value)
        pool = get_pool_state()

    pre_deposit_value = total_pool_value - amount
    if pre_deposit_value <= 0:
        nav = 1.0
    else:
        nav = pre_deposit_value / pool["totalShares"]

    shares_issued = amount / nav

    deposit = {
        "userId": wallet_address,
        "amount": amount,
        "currency": currency,
        "txHash": tx_hash,
        "shares": shares_issued,
        "nav": nav,
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

    return {
        "success": True,
        "shares": shares_issued,
        "nav": nav,
        "totalShares": pool["totalShares"] + shares_issued,
        "newTotalDeposited": new_total_deposited,
        "userShares": new_shares
    }


def _recalculate_allocations():
    total_shares = get_user_shares_total()
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


def get_all_active_users() -> List[Dict]:
    users = users_collection.find({"isActive": True})
    return [format_user_data(user) for user in users]


def get_leaderboard(total_pool_value: float) -> List[Dict]:
    total_shares = get_user_shares_total()
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
    total_shares = get_user_shares_total()
    nav = total_pool_value / total_shares if total_shares > 0 else 1.0

    # User stats exclude admin wallets (admins manage the pool, not investors)
    non_admin_users = list(users_collection.find({
        "isActive": True,
        "walletAddress": {"$nin": ADMIN_WALLETS}
    }))
    user_count = len(non_admin_users)
    total_deposited = sum(u.get("totalDeposited", 0) for u in non_admin_users)
    total_value = sum(u.get("shares", 0) * nav for u in non_admin_users)

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
        "pnlPercent": round(((total_value / total_deposited) - 1) * 100, 2) if total_deposited > 0 else 0
    }


def get_all_transactions(wallet_address: str = None, is_admin_request: bool = False) -> List[Dict]:
    transactions = []

    if is_admin_request:
        for dep in deposits_collection.find({}).sort("timestamp", -1):
            user_wallet = dep.get("userId", "")
            transactions.append({
                "type": "deposit",
                "wallet": user_wallet,
                "walletShort": user_wallet[:4] + "..." + user_wallet[-4:] if len(user_wallet) > 8 else user_wallet,
                "amount": dep.get("amount", 0),
                "currency": dep.get("currency", "USDC"),
                "txHash": dep.get("txHash", ""),
                "timestamp": dep["timestamp"].isoformat() if dep.get("timestamp") else None,
                "shares": dep.get("shares", 0),
                "nav": dep.get("nav", 0),
                "isAdmin": user_wallet in ADMIN_WALLETS
            })

        for trade in trades_collection.find({}).sort("timestamp", -1):
            transactions.append({
                "type": "buy" if trade.get("type") == "buy" else "sell",
                "coin": trade.get("coin", ""),
                "amount": trade.get("amount", 0),
                "price": trade.get("price", 0),
                "timestamp": trade["timestamp"].isoformat() if trade.get("timestamp") else None,
                "wallet": "pool",
                "walletShort": "Pool Trade",
                "swyftxId": trade.get("swyftxId", "")
            })

        for wd in withdrawals_collection.find({}).sort("timestamp", -1):
            user_wallet = wd.get("userId", "")
            transactions.append({
                "type": "withdrawal",
                "wallet": user_wallet,
                "walletShort": user_wallet[:4] + "..." + user_wallet[-4:] if len(user_wallet) > 8 else user_wallet,
                "amount": wd.get("amount", 0),
                "currency": wd.get("currency", "USDC"),
                "timestamp": wd["timestamp"].isoformat() if wd.get("timestamp") else None,
                "isAdmin": user_wallet in ADMIN_WALLETS
            })

        transactions.sort(key=lambda x: x.get("timestamp") or "", reverse=True)

    else:
        if not wallet_address:
            return []

        for dep in deposits_collection.find({"userId": wallet_address}).sort("timestamp", -1):
            transactions.append({
                "type": "deposit",
                "amount": dep.get("amount", 0),
                "currency": dep.get("currency", "USDC"),
                "txHash": dep.get("txHash", ""),
                "timestamp": dep["timestamp"].isoformat() if dep.get("timestamp") else None,
                "shares": dep.get("shares", 0),
                "nav": dep.get("nav", 0)
            })

        for wd in withdrawals_collection.find({"userId": wallet_address}).sort("timestamp", -1):
            transactions.append({
                "type": "withdrawal",
                "amount": wd.get("amount", 0),
                "currency": wd.get("currency", "USDC"),
                "timestamp": wd["timestamp"].isoformat() if wd.get("timestamp") else None
            })

        for trade in trades_collection.find({}).sort("timestamp", -1):
            transactions.append({
                "type": "buy" if trade.get("type") == "buy" else "sell",
                "coin": trade.get("coin", ""),
                "amount": trade.get("amount", 0),
                "price": trade.get("price", 0),
                "timestamp": trade["timestamp"].isoformat() if trade.get("timestamp") else None,
                "wallet": "pool",
                "walletShort": "Pool Trade",
                "swyftxId": trade.get("swyftxId", "")
            })

        transactions.sort(key=lambda x: x.get("timestamp") or "", reverse=True)

    return transactions


# ── Persistent Trader State ──────────────────────────────────────────────────

def get_trader_state() -> Dict:
    doc = trader_state_collection.find_one({"_id": "admin_state"})
    if not doc:
        return {
            "pendingOrders": [],
            "autoTiers": {"tier1": {"deviation": 2, "allocation": 10}, "tier2": {"deviation": 5, "allocation": 5}},
            "autoCooldowns": {},
            "autoTradeLog": []
        }
    doc.pop("_id", None)
    return doc


def save_trader_state(state: Dict) -> Dict:
    trader_state_collection.update_one(
        {"_id": "admin_state"},
        {"$set": state},
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

        trade_doc = {
            "coin": coin,
            "type": trade_type,
            "amount": quantity if quantity > 0 else amount,
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
    total_shares = get_user_shares_total()

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
