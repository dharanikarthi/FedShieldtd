"""Model monitoring for the canonical federated model: can a bank rely on it?

  calibration   observed mule rate per score band (does "90%" mean ~90%?) + expected calibration error
  drift         population stability index (PSI) of each bank's score distribution and top features,
                train vs held-out (PSI < 0.1 stable, 0.1-0.25 watch, > 0.25 act)
  releases      versioned rounds: a round is released only if no bank's own validation AUC-PR falls
                more than 0.01 below its best released version; otherwise the network keeps (rolls
                back to) the last good version

    python -m fedshield.experiments.monitor     -> results/monitor.json
"""
import json
import pickle

import numpy as np
import pandas as pd

from fedshield.config import RESULTS, WORK


def psi(a, b, bins=10):
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    if len(a) == 0 or len(b) == 0:
        return None
    edges = np.unique(np.quantile(a, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return 0.0
    pa = np.histogram(np.clip(a, edges[0], edges[-1]), edges)[0] / len(a)
    pb = np.histogram(np.clip(b, edges[0], edges[-1]), edges)[0] / len(b)
    pa, pb = np.clip(pa, 1e-4, None), np.clip(pb, 1e-4, None)
    return float(np.sum((pb - pa) * np.log(pb / pa)))


def main():
    art = pickle.load(open(WORK / "models" / "nfpc_full.pkl", "rb"))
    sc = pd.read_parquet(WORK / "models" / "nfpc_full_scores.parquet")
    feats = pd.read_parquet(WORK / "models" / "nfpc_full_features.parquet")
    names = art["bank_names"]
    te, tr = sc[sc.split == "test"], sc[sc.split != "test"]
    out = {}

    # calibration
    bands = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1.0001]
    cal, ece = [], 0.0
    for lo, hi in zip(bands[:-1], bands[1:]):
        m = (te.score >= lo) & (te.score < hi)
        if m.sum():
            obs, pred = float(te.is_mule[m].mean()), float(te.score[m].mean())
            cal.append({"band": f"{int(lo * 100)}-{min(100, int(hi * 100))}%", "n": int(m.sum()),
                        "predicted": round(pred, 4), "observed": round(obs, 4)})
            ece += m.mean() * abs(obs - pred)
    out["calibration"] = {"bands": cal, "ece": round(float(ece), 4),
                          "note": "Scores rank well but are not probabilities (class weighting inflates them). "
                                  "Use the risk tier, or calibrate per bank before quoting a score as a probability."}

    # drift: per bank, score and top-feature PSI, train vs held-out
    top = [f for f, _ in art.get("top_features", [])[:8]] or ["bidir_ratio", "n_cp", "reg_cp_rare"]
    f = feats.set_index("acct")
    drift = {}
    for b, nm in enumerate(names):
        a, c = tr[tr.bank == b], te[te.bank == b]
        d = {"score_psi": round(psi(a.score.to_numpy(), c.score.to_numpy()), 4),
             "network_vs_bank_psi": round(psi(sc[sc.bank != b].score.to_numpy(), sc[sc.bank == b].score.to_numpy()), 4),
             "features": {}}
        for col in top:
            if col in f.columns:
                v = psi(f.loc[a.acct, col].to_numpy(float), f.loc[c.acct, col].to_numpy(float))
                d["features"][col] = None if v is None else round(v, 4)
        worst = max([d["score_psi"]] + [v for v in d["features"].values() if v is not None])
        d["status"] = "stable" if worst < 0.1 else "watch" if worst < 0.25 else "act"
        drift[nm] = d
    out["drift"] = drift

    # releases with rollback rule, from the canonical run's round log
    res = json.loads((RESULTS / "nfpc_full.json").read_text())
    log = (res.get("registry", {}).get("fed") or res.get("main", {})).get("fed_log", {})
    rounds = [r for r in log.get("rounds", []) if any(k.startswith("val_auprc_") for k in r)]
    best, rel, current = {}, [], None
    for r in rounds:
        v = {k.replace("val_auprc_", ""): r[k] for k in r if k.startswith("val_auprc_")}
        drop = {b: round(best[b] - x, 4) for b, x in v.items() if b in best and best[b] - x > 0.01}
        ok = not drop
        if ok:
            current = r["round"]
            for b, x in v.items():
                best[b] = max(best.get(b, 0), x)
        rel.append({"round": r["round"], "val": {b: round(x, 4) for b, x in v.items()},
                    "decision": "release" if ok else "hold (keep round %s)" % current, "regressions": drop})
    out["releases"] = {"rule": "release only if no bank's validation AUC-PR drops > 0.01 below its best released version",
                       "versions": rel, "live_round": current}
    # does the rule's choice hold up on held-out test accounts?
    from sklearn.metrics import average_precision_score as ap
    X = f.loc[te.acct, art["features"]].astype("float32").to_numpy()
    y = te.is_mule.to_numpy()
    chk = {}
    for k in sorted({current, len(art["model"].trees)}):
        p = art["model"].predict_proba(X, n_trees=k)
        chk[str(k)] = {"overall": round(float(ap(y, p)), 4),
                       **{nm: round(float(ap(y[(te.bank == b).to_numpy()], p[(te.bank == b).to_numpy()])), 4) for b, nm in enumerate(names)}}
    out["releases"]["test_check"] = chk
    (RESULTS / "monitor.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({"ece": out["calibration"]["ece"], "drift": {k: v["status"] for k, v in drift.items()},
                      "live_round": current, "holds": sum(1 for x in rel if x["decision"] != "release")}, indent=1))


if __name__ == "__main__":
    main()
