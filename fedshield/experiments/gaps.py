"""Experiments that answer the hardest evaluator questions. All on real NFPC features, compact model
(same settings as the Theatre) so every block finishes in minutes. Writes results/gaps.json.

  schema      Banks are not identical. (a) Bank B's core-banking system lacks 30% of the features.
              (b) Bank C measures every feature with 25% multiplicative error. Does federation still help?
  min_cell    k-anonymity on released histograms (no released cell describes < k accounts):
              what does it cost in accuracy?
  companion   FedShield as a MuleHunter add-on: the bank's own model score (cross-fitted) is an input;
              does the network signal add lift on top of it?
  alerts      Three-condition alert engine: precision/recall of each condition and their combination.
  scale       Measured bytes per bank and seconds per round, extrapolated to a 100-bank network.

    python -m fedshield.experiments.gaps
"""
import json
import sys
import time

import numpy as np
from sklearn.metrics import average_precision_score as ap

from fedshield.adapters import load
from fedshield.config import RESULTS
from fedshield.experiments.common import class_weights
from fedshield.fl.federation import Bank, FedConfig, federate
from fedshield.fl.gbdt import GBDTParams

P = dict(n_trees=60, max_depth=5, learning_rate=0.1, colsample=0.7, subsample=0.8, n_bins=64)


def mk(name, X, y, seed=0):
    rs = np.random.RandomState(seed)
    v = rs.rand(len(y)) < 0.1
    return Bank(name, X, y, class_weights(y, cap=30.0), X[v], y[v])


def fit(banks, feats, **kw):
    ev = kw.pop("on_event", None)
    cfg = FedConfig(params=GBDTParams(**P), secure_agg=len(banks) > 1, byzantine=False, weighting=False,
                    eval_every=10_000, on_event=ev, **kw)
    return federate(banks, cfg, feats)[0]


def per_bank(model, tests, local=None):
    out = {}
    for n, (X, y) in tests.items():
        out[n] = {"federated": round(ap(y, model.predict_proba(X)), 4)}
        if local:
            out[n]["local"] = round(ap(y, local[n].predict_proba(X)), 4)
    return out


def three_conditions():
    """Three-condition alert engine evaluated on the canonical full model's held-out scores.
    Condition 2 threshold = top 3% of TRAINING accounts on rare shared counterparties."""
    import pandas as pd
    from fedshield.config import WORK
    f = pd.read_parquet(WORK / "models" / "nfpc_full_features.parquet", columns=["acct", "reg_cp_rare", "reg_cp_flagged"])
    sc = pd.read_parquet(WORK / "models" / "nfpc_full_scores.parquet", columns=["acct", "is_mule", "split", "score"])
    d = sc.merge(f, on="acct")
    tr, te = d[d.split != "test"], d[d.split == "test"]
    import pickle
    thr = pickle.load(open(WORK / "models" / "nfpc_full.pkl", "rb"))["threshold"]
    q = float(tr["reg_cp_rare"].quantile(0.97))
    y = te["is_mule"].to_numpy()
    c1 = te["score"].to_numpy() >= thr
    c2 = te["reg_cp_rare"].fillna(0).to_numpy() >= q
    broad = te["reg_cp_flagged"].fillna(0).to_numpy() >= 2

    def pr(m):
        return {"alerts": int(m.sum()), "precision": round(float(y[m].mean()) if m.any() else 0, 4),
                "recall": round(float(m[y == 1].mean()), 4)}
    return {"model": "canonical full model", "threshold": round(float(thr), 4), "link_threshold": round(q, 4),
            "base_rate": round(float(y.mean()), 4),
            "condition_1_high_risk": pr(c1), "condition_2_cross_bank_links": pr(c2),
            "both": pr(c1 & c2), "either": pr(c1 | c2),
            "rejected_rule_broad_links": pr(broad),
            "condition_3_i4c": "interface only: no public I4C data; simulated evidence would be circular"}


def main():
    t0 = time.time()
    p = load("nfpc")
    f, feats = p.frame, p.features
    tr, te = f[f.split == "train"], f[f.split == "test"]
    names = p.banks()
    TR = {n: (tr.loc[tr.bank == n, feats].to_numpy(np.float64), tr.loc[tr.bank == n, "y"].to_numpy().astype(int)) for n in names}
    TE = {n: (te.loc[te.bank == n, feats].to_numpy(np.float64), te.loc[te.bank == n, "y"].to_numpy().astype(int)) for n in names}
    out = {"params": P}
    log = lambda *a: print(*a, f"{time.time() - t0:.0f}s", flush=True)

    # ------------------------------------------------------------------ baseline + scale measurement
    traffic, tree_t = {n: 0 for n in names}, []
    last = [time.time()]

    def ev(e):
        if e["stage"] == "histograms":
            for n, s in e["sent"].items():
                traffic[n] += s["bytes"]
        if e["stage"] == "tree":
            tree_t.append(time.time() - last[0]); last[0] = time.time()
    base = fit([mk(n, *TR[n]) for n in names], feats, on_event=ev)
    local = {n: fit([mk(n, *TR[n])], feats) for n in names}
    out["baseline"] = per_bank(base, TE, local)
    log("baseline", out["baseline"])
    per_tree = {n: traffic[n] / P["n_trees"] for n in names}
    out["scale"] = {
        "bytes_per_bank_per_tree": round(float(np.mean(list(per_tree.values())))),
        "mb_per_bank_per_model": round(float(np.mean(list(traffic.values()))) / 1e6, 1),
        "seconds_per_tree_3_banks": round(float(np.median(tree_t)), 2),
        "seconds_full_model_3_banks": round(float(np.sum(tree_t)), 1),
        "note": "Upload per bank does not grow with the number of banks (each bank sends its own masked "
                "histograms). Aggregator work grows linearly with banks; bank-side compute runs in parallel.",
        "rows_used": int(sum(len(v[1]) for v in TR.values())),
    }
    log("scale", out["scale"])

    # ------------------------------------------------------------------ schema mismatch
    rs = np.random.RandomState(11)
    sch = {}
    # (a) Bank B lacks 30% of the features entirely
    miss = rs.rand(len(feats)) < 0.30
    XB, XBt = TR[names[1]][0].copy(), TE[names[1]][0].copy()
    XB[:, miss] = np.nan; XBt[:, miss] = np.nan
    TRa, TEa = dict(TR), dict(TE)
    TRa[names[1]] = (XB, TR[names[1]][1]); TEa[names[1]] = (XBt, TE[names[1]][1])
    m = fit([mk(n, *TRa[n]) for n in names], feats)
    loc = {n: fit([mk(n, *TRa[n])], feats) for n in names}
    sch["missing_features"] = {"bank": names[1], "features_missing": int(miss.sum()), "per_bank": per_bank(m, TEa, loc)}
    log("schema missing", sch["missing_features"])
    # (b) Bank C measures every feature with 25% multiplicative error (train and test)
    noise = lambda X, s: X * rs.lognormal(0, 0.25, X.shape) if s else X
    TRb, TEb = dict(TR), dict(TE)
    TRb[names[2]] = (noise(TR[names[2]][0], 1), TR[names[2]][1]); TEb[names[2]] = (noise(TE[names[2]][0], 1), TE[names[2]][1])
    m = fit([mk(n, *TRb[n]) for n in names], feats)
    loc = {n: fit([mk(n, *TRb[n])], feats) for n in names}
    sch["noisy_measurement"] = {"bank": names[2], "noise": "lognormal sigma 0.25 per value", "per_bank": per_bank(m, TEb, loc)}
    log("schema noisy", sch["noisy_measurement"])
    out["schema"] = sch

    # ------------------------------------------------------------------ min-cell rule
    mc = {}
    for k in (10, 50):
        m = fit([mk(n, *TR[n]) for n in names], feats, min_cell=k)
        mc[str(k)] = per_bank(m, TE)
        log("min_cell", k, mc[str(k)])
    out["min_cell"] = mc

    # ------------------------------------------------------------------ MuleHunter companion
    # each bank's own model score, cross-fitted on train (2 folds) so it is not in-sample
    comp = {}
    TRc, TEc = {}, {}
    for n in names:
        X, y = TR[n]
        fold = np.random.RandomState(5).rand(len(y)) < 0.5
        s = np.zeros(len(y))
        for a in (True, False):
            mm = fit([mk(n, X[fold == a], y[fold == a])], feats)
            s[fold != a] = mm.predict_proba(X[fold != a])
        TRc[n] = (np.c_[X, s], y)
        TEc[n] = (np.c_[TE[n][0], local[n].predict_proba(TE[n][0])], TE[n][1])
    m = fit([mk(n, *TRc[n]) for n in names], feats + ["bank_own_model_score"])
    for n in names:
        Xt, yt = TEc[n]
        comp[n] = {"own_model_alone": round(ap(yt, Xt[:, -1]), 4),
                   "own_model_plus_fedshield": round(ap(yt, m.predict_proba(Xt)), 4)}
    out["companion"] = comp
    log("companion", comp)

    out["alerts"] = three_conditions()
    log("alerts", out["alerts"])
    out["seconds"] = round(time.time() - t0)
    (RESULTS / "gaps.json").write_text(json.dumps(out, indent=1))
    print("wrote", RESULTS / "gaps.json")


if __name__ == "__main__":
    if sys.argv[1:] == ["alerts"]:                         # refresh only the alert block
        g = json.loads((RESULTS / "gaps.json").read_text())
        g["alerts"] = three_conditions()
        (RESULTS / "gaps.json").write_text(json.dumps(g, indent=1))
        print(json.dumps(g["alerts"], indent=1))
    else:
        sys.exit(main())
