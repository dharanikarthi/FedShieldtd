"""Cross-bank laundering chains on IBM AMLworld (HI-Small): real linked transfers, not an illustration.

A chain = a connected component of laundering transfers (is_laundering = 1). We keep chains that
span >= 3 of the 5 consortium institutions and judge detection only on chain accounts in the
held-out test split (their labels were never used, not even by the registry).

  each bank alone         every bank scores its own accounts with a model trained on its own data
  FedShield + registry    federated model + hashed-registry features from all banks' confirmed cases

Per chain: is at least one held-out account flagged (the chain can be interrupted), and what share
of its held-out accounts is flagged. Writes results/aml_chains.json (aggregates + one showcase
chain with hashed ids; no raw identifiers).

    python -m fedshield.experiments.aml_chains
"""
import hashlib
import json
import sys
import time

import numpy as np
import pandas as pd

from fedshield.config import AML_WORK, RESULTS
from fedshield.eval.metrics import pick_threshold
from fedshield.experiments.aml import NON_FEATURES, build_banks, make_splits, registry_features
from fedshield.experiments.common import run_fed, run_local
from fedshield.fl.gbdt import GBDTParams
from fedshield.registry import SuspectRegistry

P = GBDTParams(n_trees=100, max_depth=6, learning_rate=0.1, subsample=0.8, colsample=0.8, n_bins=64,
               min_child_weight=5.0, seed=42)
H = lambda i: "H-" + hashlib.sha256(f"aml:{i}".encode()).hexdigest()[:8]


def components(src, dst):
    """Union-find over laundering edges -> component id per account."""
    nodes = np.unique(np.concatenate([src, dst]))
    idx = {n: i for i, n in enumerate(nodes)}
    parent = np.arange(len(nodes))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b in zip(src, dst):
        ra, rb = find(idx[a]), find(idx[b])
        if ra != rb:
            parent[ra] = rb
    return {n: find(idx[n]) for n in nodes}


def main(variant="HI-Small"):
    t0 = time.time()
    d = AML_WORK / variant
    df = make_splits(pd.read_parquet(d / "features.parquet")).reset_index(drop=True)
    names = {i: f"Bank-{chr(65 + i)}" for i in sorted(df["inst"].unique())}
    base = [c for c in df.columns if c not in NON_FEATURES]
    tx = pd.read_parquet(d / "txns.parquet", columns=["ts", "src", "dst", "src_inst", "dst_inst", "usd", "y"])
    legs = pd.concat([
        pd.DataFrame({"acct": tx.src, "cp": tx.dst, "inst": tx.src_inst, "usd": tx.usd, "dir": "out"}),
        pd.DataFrame({"acct": tx.dst, "cp": tx.src, "inst": tx.dst_inst, "usd": tx.usd, "dir": "in"})], ignore_index=True)
    print(f"loaded {len(df):,} accounts, {len(tx):,} txns  {time.time() - t0:.0f}s", flush=True)

    # --- each bank alone (base features, own data only)
    banks, _, _ = build_banks(df, base, names)
    Xb = df[base].astype("float32").to_numpy()
    va = (df["split"] == "val").to_numpy()
    local_s, local_thr = np.zeros(len(df)), np.zeros(len(df))
    for b in banks:
        m = run_local(b, P, base)
        own = (df["inst"].map(names) == b.name).to_numpy()
        local_s[own] = m.predict_proba(Xb[own])
        local_thr[own] = pick_threshold(m.predict_proba(Xb[own & va]), df["y"].to_numpy()[own & va])
        print(f"  local {b.name}  {time.time() - t0:.0f}s", flush=True)

    # --- FedShield + federated registry (confirmed = training-split positives only)
    reg = SuspectRegistry()
    confirmed = df.loc[(df.split == "train") & (df.y == 1), "acct_id"].to_numpy()
    rf = registry_features(df, legs, confirmed, "fed", reg, names)
    dfr = pd.concat([df, rf], axis=1)
    feats = base + list(rf.columns)
    banks_r, _, splits = build_banks(dfr, feats, names)
    fed, _ = run_fed(banks_r, P, feats, secure_agg=True, byzantine=True, weighting=True, min_cell=10)
    Xr = dfr[feats].astype("float32").to_numpy()
    fed_s = fed.predict_proba(Xr)
    fed_thr = pick_threshold(fed.predict_proba(splits["X_val"]), splits["y_val"])
    print(f"  fed+registry  {time.time() - t0:.0f}s", flush=True)

    # --- chains
    lt = tx[tx.y == 1]
    comp = components(lt.src.to_numpy(), lt.dst.to_numpy())
    pos = df.set_index("acct_id")
    row = pd.Series(np.arange(len(df)), index=df["acct_id"])
    acc = pd.DataFrame({"acct_id": list(comp.keys()), "chain": list(comp.values())})
    acc = acc[acc.acct_id.isin(pos.index)]
    acc["inst"] = pos.loc[acc.acct_id, "inst"].to_numpy()
    acc["split"] = pos.loc[acc.acct_id, "split"].to_numpy()
    r = row.loc[acc.acct_id].to_numpy()
    acc["local_flag"] = local_s[r] >= local_thr[r]
    acc["fed_flag"] = fed_s[r] >= fed_thr
    acc["local_score"], acc["local_thr"], acc["fed_score"] = local_s[r], local_thr[r], fed_s[r]
    g = acc.groupby("chain")
    span = g["inst"].nunique()
    ntest = g["split"].apply(lambda s: (s == "test").sum())
    keep = span[(span >= 3) & (ntest >= 1)].index
    te = acc[acc.chain.isin(keep) & (acc.split == "test")]
    per = te.groupby("chain").agg(local_any=("local_flag", "any"), fed_any=("fed_flag", "any"),
                                  local_share=("local_flag", "mean"), fed_share=("fed_flag", "mean"), n=("acct_id", "size"))
    res = {
        "variant": variant, "institutions": len(names),
        "laundering_chains_total": int(len(span)), "chains_spanning_3plus_banks": int((span >= 3).sum()),
        "chains_evaluated": int(len(per)), "held_out_chain_accounts": int(len(te)),
        "chains_interrupted": {"each_bank_alone": round(float(per.local_any.mean()), 4),
                               "fedshield_registry": round(float(per.fed_any.mean()), 4)},
        "chain_accounts_flagged": {"each_bank_alone": round(float(te.local_flag.mean()), 4),
                                   "fedshield_registry": round(float(te.fed_flag.mean()), 4)},
        "chains_only_fedshield_interrupts": int((per.fed_any & ~per.local_any).sum()),
        "chains_only_local_interrupts": int((per.local_any & ~per.fed_any).sum()),
        "fed_threshold": round(float(fed_thr), 4),
    }
    # false-alarm context: flag rate on held-out NON-laundering accounts
    clean = (df["split"] == "test").to_numpy() & (df["y"] == 0).to_numpy()
    res["false_alarm_rate"] = {"each_bank_alone": round(float((local_s[clean] >= local_thr[clean]).mean()), 5),
                               "fedshield_registry": round(float((fed_s[clean] >= fed_thr).mean()), 5)}

    # --- showcase: a 3+-bank chain FedShield interrupts and no single bank does, ordered by time
    # prefer chains with many held-out accounts, then the most of them caught
    cand = per[per.fed_any & ~per.local_any & (per.n >= 2)].assign(caught=lambda t: t.fed_share * t.n)
    cand = cand.sort_values(["caught", "n"], ascending=False)
    if len(cand):
        cid = cand.index[0]
        members = set(acc.loc[acc.chain == cid, "acct_id"])
        e = lt[lt.src.isin(members) & lt.dst.isin(members)].sort_values("ts")
        a = acc[acc.chain == cid].set_index("acct_id")
        res["showcase"] = {
            "banks": sorted({names[int(i)] for i in a.inst}),
            "nodes": [{"id": H(i), "bank": names[int(x.inst)], "held_out": x.split == "test",
                       "local_score": round(float(x.local_score), 3), "local_thr": round(float(x.local_thr), 3),
                       "fed_score": round(float(x.fed_score), 3), "fed_thr": round(float(fed_thr), 3)}
                      for i, x in a.iterrows()],
            "edges": [{"src": H(s), "dst": H(t), "usd": round(float(u), 2), "ts": str(ts)}
                      for ts, s, t, u in e[["ts", "src", "dst", "usd"]].head(40).itertuples(index=False)],
        }
    res["seconds"] = round(time.time() - t0)
    (RESULTS / "aml_chains.json").write_text(json.dumps(res, indent=1, default=str))
    print(json.dumps({k: v for k, v in res.items() if k != "showcase"}, indent=1))


if __name__ == "__main__":
    sys.exit(main(*(sys.argv[1:] or ["HI-Small"])))
