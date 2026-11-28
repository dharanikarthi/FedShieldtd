"""Feature contract: the shared, versioned definition every member bank must compute identically.

Federation only works if "credits within 3 minutes" means the same thing at every bank. The
contract is a JSON spec (one entry per feature: group, plain-language definition, unit, valid
range, expected missing rate) plus a validator a bank runs on ITS OWN data before joining. Only
the validation report (pass/fail per check) leaves the bank, never the data.

    python -m fedshield.contract build                 # write contracts/nfpc_v1.json from reference data
    python -m fedshield.contract validate <file.parquet> [bank-name]
    python -m fedshield.contract demo                  # validate each simulated bank -> results/contract.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from fedshield.config import RESULTS, ROOT, WORK

SPEC = ROOT / "contracts" / "nfpc_v1.json"
VERSION = "1.0"

GROUPS = [  # (prefix or name test, group, unit hint)
    (lambda f: f.startswith("reg_"), "consortium registry", "count / score"),
    (lambda f: f.startswith("mh_"), "MuleHunter-style windows", "per window"),
    (lambda f: f.startswith("ch_"), "payment channels", "share of transactions"),
    (lambda f: f.startswith("scheme_"), "government schemes", "flag"),
    (lambda f: any(k in f for k in ("passthrough", "drain", "bidir", "fan_", "cp")), "money flow", "ratio / count"),
    (lambda f: any(k in f for k in ("bal", "balance")), "balances", "INR / share"),
    (lambda f: any(k in f for k in ("age", "days", "span", "gap", "dormancy")), "account lifecycle", "days"),
    (lambda f: any(k in f for k in ("struct", "round", "digit")), "amount patterns", "share / count"),
    (lambda f: any(k in f for k in ("night", "weekend", "month_edge", "velocity", "burst", "txn")), "timing and velocity", "count / rate"),
    (lambda f: True, "account and KYC", "value / flag"),
]


def _group(f):
    for test, g, u in GROUPS:
        if test(f):
            return g, u


def build():
    from fedshield.api.reasons import TEMPLATES, _humanize
    feats = pd.read_parquet(WORK / "models" / "nfpc_full_features.parquet")
    cols = [c for c in feats.columns if c != "acct"]
    spec = {"name": "FedShield NFPC feature contract", "version": VERSION, "entity": "account",
            "missing_value": "NaN (goes to a dedicated bin; a bank may omit a feature it cannot compute)",
            "features": []}
    for c in cols:
        x = feats[c].astype(float)
        g, u = _group(c)
        lo, hi = np.nanquantile(x, [0.001, 0.999]) if x.notna().any() else (np.nan, np.nan)
        spec["features"].append({
            "name": c, "group": g, "unit": u,
            "definition": TEMPLATES[c][0] if c in TEMPLATES else _humanize(c),
            "valid_range": [None if np.isnan(lo) else round(float(lo), 6), None if np.isnan(hi) else round(float(hi), 6)],
            "expected_missing": round(float(x.isna().mean()), 4),
            "binary": bool(set(x.dropna().unique()) <= {0.0, 1.0}),
        })
    SPEC.parent.mkdir(exist_ok=True)
    SPEC.write_text(json.dumps(spec, indent=1))
    print(f"wrote {SPEC} ({len(cols)} features)")


def validate(df, bank="bank", spec=None):
    """Check one bank's feature table against the contract. Returns a report with no data in it."""
    spec = spec or json.loads(SPEC.read_text())
    rows, n = [], len(df)
    for f in spec["features"]:
        name = f["name"]
        if name not in df.columns:
            rows.append({"feature": name, "status": "missing", "detail": "column absent (allowed; treated as NaN)"})
            continue
        x = pd.to_numeric(df[name], errors="coerce")
        bad_type = int(df[name].notna().sum() - x.notna().sum())
        miss = float(x.isna().mean())
        lo, hi = f["valid_range"]
        out = float(((x < lo) | (x > hi)).mean()) if lo is not None and x.notna().any() else 0.0
        issues = []
        if bad_type:
            issues.append(f"{bad_type} non-numeric values")
        if miss > max(0.2, f["expected_missing"] + 0.2):
            issues.append(f"missing {miss:.0%} vs expected {f['expected_missing']:.0%}")
        if out > 0.05:
            issues.append(f"{out:.0%} outside valid range: check unit or definition")
        if f["binary"] and x.notna().any() and not set(x.dropna().unique()) <= {0.0, 1.0}:
            issues.append("expected 0/1 flag")
        rows.append({"feature": name, "status": "fail" if issues else "pass", "detail": "; ".join(issues)})
    extra = [c for c in df.columns if c not in {f["name"] for f in spec["features"]}]
    st = pd.Series([r["status"] for r in rows])
    return {"bank": bank, "contract_version": spec["version"], "rows_checked": n,
            "pass": int((st == "pass").sum()), "fail": int((st == "fail").sum()), "missing": int((st == "missing").sum()),
            "unknown_columns": len(extra), "ready_to_join": bool((st == "fail").sum() == 0),
            "checks": [r for r in rows if r["status"] != "pass"]}


def demo():
    """Validate each simulated bank, plus two deliberately broken banks to show what failure looks like."""
    feats = pd.read_parquet(WORK / "models" / "nfpc_full_features.parquet")
    sc = pd.read_parquet(WORK / "models" / "nfpc_full_scores.parquet", columns=["acct", "bank"])
    d = feats.merge(sc, on="acct")
    reports = []
    for b in sorted(d["bank"].unique()):
        reports.append(validate(d[d.bank == b].drop(columns=["acct", "bank"]), f"Bank-{'ABC'[int(b)]}"))
    # a bank that reports balances in paise instead of rupees, and lacks the registry features
    bad = d[d.bank == 2].drop(columns=["acct", "bank"]).copy()
    for c in [c for c in bad.columns if "bal" in c and not c.endswith("share")]:
        bad[c] = bad[c] * 100
    bad = bad.drop(columns=[c for c in bad.columns if c.startswith("reg_")])
    reports.append(validate(bad, "New co-op bank (balances in paise, no registry)"))
    out = {"contract": json.loads(SPEC.read_text())["name"], "version": VERSION,
           "n_features": len(json.loads(SPEC.read_text())["features"]), "reports": reports}
    (RESULTS / "contract.json").write_text(json.dumps(out, indent=1))
    for r in reports:
        print(f"{r['bank']:48s} pass {r['pass']:3d}  fail {r['fail']:2d}  missing {r['missing']:2d}  ready={r['ready_to_join']}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "build":
        build()
    elif cmd == "validate":
        print(json.dumps(validate(pd.read_parquet(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "bank"), indent=1))
    else:
        if not SPEC.exists():
            build()
        demo()
