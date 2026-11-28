"""Federation Theatre: real training curves the UI replays as an animated story.

Two scenarios, both trained on the real NFPC features with the real federated GBDT:

  race  each bank trains alone vs all banks train together (secure aggregation) vs pooled.
        AUPRC on each bank's own held-out accounts after every few trees (= rounds).
  scam  a "new scam" typology has been seen and labelled only at Bank A. Banks B and C have
        no labelled examples of it. How many of Bank B's held-out mules of that typology get
        caught (top 2% of Bank B's accounts by score) by Bank B alone vs by the federation?
        Run for every typology, so the headline is the average, not a cherry-pick.

Only aggregate metrics are written (results/theatre.json); no account-level data.

    python -m fedshield.experiments.theatre
"""
import json
import sys
import time

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from fedshield.adapters import load
from fedshield.config import RESULTS, WORK
from fedshield.experiments.common import class_weights
from fedshield.fl.federation import Bank, FedConfig, federate
from fedshield.fl.gbdt import GBDTParams, HistParty, apply_bins, build_tree, _sigmoid

P = dict(n_trees=60, max_depth=5, learning_rate=0.1, colsample=0.7, subsample=0.8, n_bins=64)
STEP = 3
BUDGET = 0.02            # alert budget: top 2% of a bank's accounts get reviewed


def _bank(name, d, feats):
    y = d["y"].to_numpy().astype(int)
    v = d.sample(min(len(d), 3000), random_state=0)
    return Bank(name, d[feats].to_numpy(), y, class_weights(y, cap=30.0),
                v[feats].to_numpy(), v["y"].to_numpy().astype(int))


def _fit(banks, feats, secure=True):
    cfg = FedConfig(params=GBDTParams(**P), secure_agg=secure and len(banks) > 1,
                    byzantine=False, weighting=False, eval_every=10_000)
    return federate(banks, cfg, feats)


def _curve(model, X, fn):
    return [round(float(fn(model.predict_proba(X, n_trees=k))), 4) for k in range(STEP, P["n_trees"] + 1, STEP)]


def _personalise(fed, d, feats, k=12, lr=0.05, seed=0):
    """Personalised layer, decided by the bank on its own data. The bank holds out 20% of its
    training accounts and, on them, picks the best of:
      shared     the federated model as-is
      tuned      shared model + k small trees fitted on its own data
      blend      average of the shared model and its own local model
    Every candidate is fitted on the other 80%, so the choice is made on unseen accounts.
    Nothing leaves the bank. Returns (scorer refitted choice, name of the choice)."""
    rs = np.random.RandomState(seed)
    m = rs.rand(len(d)) < 0.8
    fit, val = d[m], d[~m]
    Xv, yv = val[feats].to_numpy(), val["y"].to_numpy()

    def tuned_on(df):
        pp = GBDTParams(**{**P, "n_trees": k, "learning_rate": lr, "max_depth": 3})
        y = df["y"].to_numpy().astype(int)
        B = apply_bins(df[feats].to_numpy(), fed.edges)
        hp = HistParty("own", B, y, class_weights(y, cap=30.0), pp, seed=seed)
        hp.raw[:] = fed.raw_bins(B)
        rng = np.random.RandomState(seed)
        trees = [build_tree([hp], lambda hs: hs[0], pp, rng) for _ in range(k)]

        def score(X):
            Bx = apply_bins(X, fed.edges)
            r = fed.raw_bins(Bx)
            for t in trees:
                r = r + t.predict_bins(Bx)
            return _sigmoid(r)
        return score

    def blend_on(df):
        loc = _fit([_bank("own", df, feats)], feats)[0]
        return lambda X: 0.5 * fed.predict_proba(X) + 0.5 * loc.predict_proba(X)

    cands = {"shared": lambda df: fed.predict_proba, "tuned": tuned_on, "blend": blend_on}
    val_ap = {n: average_precision_score(yv, f(fit)(Xv)) for n, f in cands.items()}
    best = max(val_ap, key=val_ap.get)
    return cands[best](d), best      # refit the chosen option on all of the bank's training data


def main():
    t0 = time.time()
    p = load("nfpc")
    f, feats = p.frame, p.features
    reasons = pd.read_parquet(WORK / "models" / "nfpc_full_scores.parquet", columns=["acct", "alert_reason"])
    f = f.merge(reasons.rename(columns={"acct": "entity"}), on="entity", how="left")
    tr, te = f[f.split == "train"], f[f.split == "test"]
    names = p.banks()
    out = {"params": P, "step": STEP, "rounds": list(range(STEP, P["n_trees"] + 1, STEP)),
           "banks": {}, "race": {}}

    # ------------------------------------------------------------------ race
    banks = [_bank(n, tr[tr.bank == n], feats) for n in names]
    fed, log = _fit(banks, feats)
    pooled = _fit([Bank("pooled", np.vstack([b.X for b in banks]), np.concatenate([b.y for b in banks]),
                        np.concatenate([b.w for b in banks]), banks[0].X_val, banks[0].y_val)], feats)[0]
    for b in banks:
        tb = te[te.bank == b.name]
        X, y = tb[feats].to_numpy(), tb["y"].to_numpy()
        ap = lambda s, y=y: average_precision_score(y, s)
        loc = _fit([b], feats)[0]
        out["banks"][b.name] = {"train_accounts": int(len(b.y)), "train_mules": int(b.y.sum()),
                                "test_accounts": int(len(y)), "test_mules": int(y.sum()),
                                "mule_rate": round(float(y.mean()), 4),
                                "states": sorted(f.loc[f.bank == b.name, "branch_state"].dropna().unique().tolist())
                                if "branch_state" in f else []}
        pers, kept = _personalise(fed, tr[tr.bank == b.name], feats)
        out["race"][b.name] = {"local": _curve(loc, X, ap), "federated": _curve(fed, X, ap),
                               "pooled": _curve(pooled, X, ap),
                               "personalised": round(float(ap(pers(X))), 4), "personalised_choice": kept}
        print(b.name, out["race"][b.name]["local"][-1], out["race"][b.name]["federated"][-1],
              out["race"][b.name]["pooled"][-1], "pers", out["race"][b.name]["personalised"], kept,
              f"{time.time() - t0:.0f}s", flush=True)
    hb = banks[0].X.shape[1] * (P["n_bins"] + 2) * 2 * 8
    out["traffic"] = {"histogram_bytes_per_node": hb, "rows_shared": 0}

    # ------------------------------------------------------------------ cold start
    # A small bank (C) joins with only a few labelled mules. Alone it can barely train;
    # in the federation it gets the network's model from day one.
    tgt = names[2]
    tb = te[te.bank == tgt]
    Xt, yt = tb[feats].to_numpy(), tb["y"].to_numpy()
    ap = lambda s: average_precision_score(yt, s)
    full = tr[tr.bank == tgt]
    rng = np.random.RandomState(7)
    cold = {}
    for frac in (0.05, 0.25, 1.0):
        pos = full[full.y == 1]
        keep = pos.iloc[rng.permutation(len(pos))[: max(3, int(frac * len(pos)))]]
        d = pd.concat([full[full.y == 0], keep])
        bc = _bank(tgt, d, feats)
        others = [_bank(n, tr[tr.bank == n], feats) for n in names if n != tgt]
        loc = _fit([bc], feats)[0]
        fedm = _fit(others + [bc], feats)[0]
        cold[str(frac)] = {"labelled_mules": int(bc.y.sum()), "local": _curve(loc, Xt, ap),
                           "federated": _curve(fedm, Xt, ap)}
        print(f"  cold {frac}: {bc.y.sum()} mules  local {cold[str(frac)]['local'][-1]:.3f}  "
              f"fed {cold[str(frac)]['federated'][-1]:.3f}  {time.time() - t0:.0f}s", flush=True)
    out["cold_start"] = {"bank": tgt, "test_mules": int(yt.sum()), "test_accounts": int(len(yt)),
                         "random_auprc": round(float(yt.mean()), 4), "runs": cold}
    out["seconds"] = round(time.time() - t0)
    (RESULTS / "theatre.json").write_text(json.dumps(out, indent=1))
    print("wrote", RESULTS / "theatre.json")


if __name__ == "__main__":
    sys.exit(main())
