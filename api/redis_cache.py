"""
Redis Cache Helper — Upstash REST API
======================================
Lightweight cache layer using Upstash Redis via HTTP REST.
No pip dependencies — uses stdlib urllib only.

Usage:
    from redis_cache import cache_get, cache_set, cache_delete

    # Read
    data = cache_get("perp:strategy_status:AEWv...")
    if data is None:
        data = expensive_query()
        cache_set("perp:strategy_status:AEWv...", data, ttl=90)

    # Write with TTL (seconds)
    cache_set("key", {"any": "json-serializable"}, ttl=60)

    # Delete
    cache_delete("key")
"""

import os
import json
from urllib.request import Request, urlopen

KV_REST_API_URL = os.getenv("KV_REST_API_URL", "")
KV_REST_API_TOKEN = os.getenv("KV_REST_API_TOKEN", "")

_ENABLED = bool(KV_REST_API_URL and KV_REST_API_TOKEN)


def _redis_cmd(*args) -> any:
    """Execute a Redis command via Upstash REST API."""
    if not _ENABLED:
        return None

    # Upstash REST: POST with body = array of command parts
    url = KV_REST_API_URL
    headers = {
        "Authorization": f"Bearer {KV_REST_API_TOKEN}",
        "Content-Type": "application/json",
    }
    body = json.dumps(list(args)).encode()

    try:
        req = Request(url, data=body, headers=headers, method="POST")
        with urlopen(req, timeout=3) as resp:
            result = json.loads(resp.read().decode())
            return result.get("result")
    except Exception as e:
        print(f"[redis_cache] Error: {e}")
        return None


def cache_get(key: str) -> any:
    """Get a cached value. Returns None on miss or error."""
    raw = _redis_cmd("GET", key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


def cache_set(key: str, value: any, ttl: int = 90) -> bool:
    """Set a cached value with TTL in seconds. Returns True on success."""
    try:
        serialized = json.dumps(value, default=str)
    except (TypeError, ValueError):
        return False

    result = _redis_cmd("SET", key, serialized, "EX", str(ttl))
    return result == "OK"


def cache_delete(key: str) -> bool:
    """Delete a cached key. Returns True if deleted."""
    result = _redis_cmd("DEL", key)
    return result is not None and result > 0


def is_enabled() -> bool:
    """Check if Redis caching is available."""
    return _ENABLED
