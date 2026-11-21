"""Every /api/... route served by api/index.py must have a rewrite in vercel.json, or the live site returns the web page
(or a 404) instead of the data. `/api/value-history` was missing for weeks: the hourly value readings were recorded but the
Home chart never received them."""

import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _covered(path, rewrites):
    for src in rewrites:
        if src == path:
            return True
        m = re.match(r"^(.*)/:path\*$", src)
        if m and (path == m.group(1) or path.startswith(m.group(1) + "/")):
            return True
    return False


def test_every_index_py_route_has_a_vercel_rewrite():
    rewrites = [r["source"] for r in json.load(open(os.path.join(ROOT, "vercel.json")))["rewrites"]]
    idx = open(os.path.join(ROOT, "api", "index.py")).read()
    paths = set(re.findall(r"path == '(/api/[^']+)'", idx))
    for grp in re.findall(r"path in \(([^)]*)\)", idx):
        paths |= set(re.findall(r"'(/api/[^']+)'", grp))
    missing = sorted(p for p in paths if not _covered(p, rewrites))
    assert not missing, f"routes in api/index.py with no rewrite in vercel.json: {missing}"
    assert "/api/value-history" in paths                    # the route this guards
