"""Shared fixtures for BUDJU API tests."""

import sys
import os

# Add the api/ directory to Python path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

import pytest


@pytest.fixture(autouse=True)
def _no_one_time_repair(request, monkeypatch):
    """The one-time repair (api/repair_unsaved_buys.py) marks real coins as just bought; keep it out of every other test.
    tests/test_repair_unsaved_buys.py exercises it directly."""
    if "test_repair_unsaved_buys" in request.node.nodeid:
        return
    import repair_unsaved_buys
    monkeypatch.setattr(repair_unsaved_buys, "UNSAVED_BUYS", [])


@pytest.fixture(autouse=True)
def _no_t1_reset(request, monkeypatch):
    """The one-time Tier 1 sell reset (api/t1_sell_reset.py) rewrites T1 sell levels; keep it out of every other test.
    tests/test_t1_sell_reset.py switches it on."""
    if "test_t1_sell_reset" in request.node.nodeid:
        return
    import t1_sell_reset
    monkeypatch.setattr(t1_sell_reset, "ENABLED", False)
