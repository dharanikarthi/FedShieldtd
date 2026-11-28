import { Fragment, useEffect, useState } from "react";
import { BANK_COLOR, get, pct } from "../api";
import { Icon } from "../components/icons";
import { Section } from "../components/ui";

const LAYERS = [
  { n: "Bank-side features and label shield", d: "169 MuleHunter-style behavioural features computed inside each bank; doubtful labels are down-weighted, not trusted blindly.", code: "features/, patterns/", status: "built" },
  { n: "Federated boosting with secure aggregation", d: "Banks send masked gradient histograms; the aggregator decodes only their sum. A min-cell rule keeps any released cell from describing fewer than k accounts.", code: "fl/gbdt.py, fl/privacy.py", status: "built" },
  { n: "Robustness gates", d: "Peer AUC-PR probe at the start and gradient-direction consensus every round exclude a bank whose updates are corrupt.", code: "fl/federation.py", status: "built" },
  { n: "Contribution weighting", d: "Each bank's update is weighted by how well its probe model scores on the other banks' data.", code: "fl/federation.py", status: "built" },
  { n: "Hashed consortium registry", d: "Rare counterparties and devices of confirmed mules are shared as HMAC digests; the key sits with the operator, never with the banks.", code: "registry.py", status: "built" },
  { n: "Pattern library and versioned rounds", d: "Typologies move emerging → confirmed → dormant → retired; every round is logged with participants, weights and privacy budget.", code: "patterns/library.py", status: "built" },
  { n: "Local inference and three-condition alerts", d: "Scoring runs on the bank's own systems. Alerts rank by (1) high risk, (2) a strong cross-bank link, (3) an active I4C case, with plain-language reasons and an STR draft.", code: "api/, stream/", status: "partial" },
];

const THREATS = [
  { t: "Aggregator reads a bank's statistics", s: "Protected", d: "Pairwise masks cancel only in the sum; one bank's histogram is never visible." },
  { t: "Inference about a small segment from the sum", s: "Mitigated", d: "Min-cell rule: no released histogram cell describes fewer than k accounts." },
  { t: "A bank's broken or poisoned updates", s: "Protected", d: "Two gates exclude outlying updates; tested against label flipping and gradient scaling." },
  { t: "Bank looks up competitors' customers in the registry", s: "Mitigated", d: "Keyed HMAC with the key held by the operator; lookups are rate-limited and audited." },
  { t: "Membership inference from the final model", s: "Partial", d: "Optional differential privacy, but its accuracy cost is high at this scale. Reported, not hidden." },
  { t: "Compromised aggregator colluding with a bank", s: "Not covered", d: "Out of scope for the prototype; production would use threshold secure aggregation." },
];
const TONE: Record<string, string> = { Protected: "text-good", Mitigated: "text-brand", Partial: "text-warn", "Not covered": "text-critical" };

function Delta({ a, b }: { a?: number; b?: number }) {
  if (a == null || b == null) return <span>—</span>;
  const d = b - a;
  return <span className={d >= 0 ? "text-good" : "text-critical"}>{d >= 0 ? "+" : ""}{d.toFixed(3)}</span>;
}

export default function Trust() {
  const [g, setG] = useState<any>();
  const [ops, setOps] = useState<any>();
  useEffect(() => { get("/gaps").then(setG).catch(() => setG(null)); get("/ops").then(setOps).catch(() => setOps(null)); }, []);
  const banks = g ? Object.keys(g.baseline) : [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-2 max-w-3xl">What a regulator or a bank's CISO asks before joining: how it is built, what it survives, what it does not protect, who runs it and what it costs.</p>

      <Section title="Architecture: seven layers, each mapped to code" sub="Every layer below exists in the repository. Partial means one input is an interface (no public I4C feed).">
        <ol className="grid md:grid-cols-2 gap-3">
          {LAYERS.map((l, i) => (
            <li key={l.n} className="rounded-lg border border-line p-3 flex gap-3">
              <span className="w-7 h-7 rounded-full bg-brand/10 text-brand grid place-items-center text-sm font-semibold shrink-0">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{l.n}</span>
                  <span className={`text-[10px] px-1.5 py-px rounded ${l.status === "built" ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>{l.status === "built" ? "built" : "partial"}</span>
                </div>
                <p className="text-xs text-ink-2 mt-1 leading-relaxed">{l.d}</p>
                <code className="text-[10px] text-ink-muted">{l.code}</code>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {ops?.contract && <ContractPanel c={ops.contract} />}
      {ops?.monitor && <MonitorPanel m={ops.monitor} />}

      {g === null && <div className="card p-4 text-sm text-ink-2">Stress-test results not generated yet: run <code>python -m fedshield.experiments.gaps</code>.</div>}
      {g && (
        <>
          <Section title="Stress test: banks are not identical" sub="Real NFPC features. AUC-PR on each bank's own held-out accounts; compact model.">
            <table className="data w-full">
              <thead><tr><th>Scenario</th>{banks.map((b) => <th key={b} style={{ color: BANK_COLOR[b] }}>{b}: alone → FedShield</th>)}</tr></thead>
              <tbody>
                {[["Identical schemas (baseline)", g.baseline],
                  [`${g.schema.missing_features.bank} lacks ${g.schema.missing_features.features_missing} of its features`, g.schema.missing_features.per_bank],
                  [`${g.schema.noisy_measurement.bank} measures every value with ±25% error`, g.schema.noisy_measurement.per_bank]].map(([lab, pb]: any) => (
                  <tr key={lab}><td>{lab}</td>{banks.map((b) => (
                    <td key={b}>{pb[b].local.toFixed(3)} → <b>{pb[b].federated.toFixed(3)}</b> <span className="text-xs">(<Delta a={pb[b].local} b={pb[b].federated} />)</span></td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-muted mt-2">The bank with damaged data gains the most from the network. A bank with missing or noisy data still trains and scores; missing values go to a dedicated bin, so no schema harmonisation is required to join.</p>
          </Section>

          <div className="grid lg:grid-cols-2 gap-5">
            <Section title="MuleHunter companion: does the network add lift?" sub="Input = the bank's own model score (cross-fitted). FedShield adds the network signal on top.">
              <table className="data w-full">
                <thead><tr><th>Bank</th><th>Own model alone</th><th>Own model + FedShield</th><th>Lift</th></tr></thead>
                <tbody>{banks.map((b) => (
                  <tr key={b}><td style={{ color: BANK_COLOR[b] }}>{b}</td><td>{g.companion[b].own_model_alone.toFixed(3)}</td>
                    <td className="font-medium">{g.companion[b].own_model_plus_fedshield.toFixed(3)}</td>
                    <td><Delta a={g.companion[b].own_model_alone} b={g.companion[b].own_model_plus_fedshield} /></td></tr>
                ))}</tbody>
              </table>
              <p className="text-xs text-ink-muted mt-2">Honest result: the lift is clear for the bank with the weakest own model and roughly neutral where the own model is already strong. The larger value of the network is the cross-bank signal (condition 2) and the cold start for small banks. In deployment the input is the bank's MuleHunter.AI score; here a local model stands in for it.</p>
            </Section>

            <Section title="Three-condition alert engine" sub={`Canonical model, held-out accounts. Base rate ${pct(g.alerts.base_rate)}. Condition 2 = rare counterparties shared with confirmed mules, top 3% of training accounts.`}>
              <table className="data w-full">
                <thead><tr><th>Condition</th><th>Alerts</th><th>Precision</th><th>Recall</th></tr></thead>
                <tbody>
                  {[["1 · High model risk", g.alerts.condition_1_high_risk], ["2 · Strong cross-bank link", g.alerts.condition_2_cross_bank_links],
                    ["1 and 2", g.alerts.both], ["1 or 2", g.alerts.either]].map(([l, r]: any) => (
                    <tr key={l}><td>{l}</td><td>{r.alerts.toLocaleString("en-IN")}</td><td>{pct(r.precision)}</td><td>{pct(r.recall)}</td></tr>
                  ))}
                  <tr className="text-ink-muted"><td>Rejected rule: any 2+ links to confirmed mules</td><td>{g.alerts.rejected_rule_broad_links.alerts.toLocaleString("en-IN")}</td><td>{pct(g.alerts.rejected_rule_broad_links.precision)}</td><td>{pct(g.alerts.rejected_rule_broad_links.recall)}</td></tr>
                  <tr><td>3 · Active I4C case</td><td colSpan={3} className="text-xs text-ink-muted">Interface only: no public I4C feed exists.</td></tr>
                </tbody>
              </table>
            </Section>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Section title="Privacy rule cost: min-cell (k-anonymity)" sub="No released histogram cell may describe fewer than k accounts.">
              <table className="data w-full">
                <thead><tr><th>Rule</th>{banks.map((b) => <th key={b}>{b}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Off</td>{banks.map((b) => <td key={b}>{g.baseline[b].federated.toFixed(3)}</td>)}</tr>
                  {Object.entries(g.min_cell).map(([k, pb]: any) => (
                    <tr key={k}><td>k = {k}</td>{banks.map((b) => <td key={b}>{pb[b].federated.toFixed(3)} <span className="text-xs">(<Delta a={g.baseline[b].federated} b={pb[b].federated} />)</span></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Cost and scale (measured)" sub="Measured on this run; upload per bank does not grow with network size">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-muted">Upload per bank, full model</dt><dd className="font-medium">{g.scale.mb_per_bank_per_model} MB</dd>
                <dt className="text-ink-muted">Per tree, per bank</dt><dd>{(g.scale.bytes_per_bank_per_tree / 1e6).toFixed(2)} MB</dd>
                <dt className="text-ink-muted">Time per tree (3 banks, laptop)</dt><dd>{g.scale.seconds_per_tree_3_banks} s</dd>
                <dt className="text-ink-muted">Full model (3 banks, laptop)</dt><dd>{g.scale.seconds_full_model_3_banks} s</dd>
                <dt className="text-ink-muted">Accounts used</dt><dd>{g.scale.rows_used.toLocaleString("en-IN")}</dd>
              </dl>
              <p className="text-xs text-ink-muted mt-2">{g.scale.note} Measured as raw float64 arrays, including zeroed cells for features not sampled that round; float32 and sending only sampled features would cut this by about 65%. A nightly retrain fits a batch window; no GPU needed.</p>
            </Section>
          </div>
        </>
      )}

      <Section title="Threat model" sub="What is protected, what is mitigated, and what is not covered">
        <div className="grid md:grid-cols-2 gap-3">
          {THREATS.map((t) => (
            <div key={t.t} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t.t}</span><span className={`text-xs font-medium ${TONE[t.s]}`}>{t.s}</span></div>
              <p className="text-xs text-ink-2 mt-1">{t.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Governance" sub="Who runs what">
          <ul className="space-y-2 text-sm text-ink-2">
            {[["Operator", "A neutral body (RBIH, or the DPIP operator) runs the aggregator and holds the registry key."],
              ["Members", "Regulated entities join by agreement; each runs the bank-side node on its own infrastructure."],
              ["Decisions stay with banks", "FedShield ranks and explains; freezing remains the bank officer's decision, with a second approver."],
              ["Audit", "Every round and every officer action is logged; the supervisor sees pseudonymised trails."],
              ["Model changes", "A new global model ships only after every bank's own validation accepts it."]].map(([h, d]) => (
              <li key={h} className="flex gap-2"><Icon name="check" size={14} className="text-good mt-1" /><span><b className="text-ink">{h}.</b> {d}</span></li>
            ))}
          </ul>
        </Section>
        <Section title="Business model" sub="How it sustains itself">
          <ul className="space-y-2 text-sm text-ink-2">
            {[["Public good core", "The federation and registry are run as shared infrastructure, like other DPI."],
              ["Tiered membership", "Large banks pay a membership fee scaled by size; co-operative banks and RRBs join at low or no cost, because their data adds the most new patterns."],
              ["Contribution credits", "Banks whose data improves others (measured leave-one-out lift) earn fee credits."],
              ["Integration partners", "Fraud-platform vendors integrate the bank-side node into existing EFRM and MuleHunter stacks."]].map(([h, d]) => (
              <li key={h} className="flex gap-2"><Icon name="check" size={14} className="text-good mt-1" /><span><b className="text-ink">{h}.</b> {d}</span></li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function ContractPanel({ c }: { c: any }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title={`Joining the network: feature contract v${c.version}`}
      sub={`${c.n_features} features, each with a definition, unit, valid range and expected missing rate. A bank validates its own data locally; only the pass/fail report leaves the bank.`}>
      <table className="data w-full">
        <thead><tr><th>Bank</th><th>Pass</th><th>Fail</th><th>Not computed</th><th>Ready to join</th><th></th></tr></thead>
        <tbody>
          {c.reports.map((r: any) => (
            <Fragment key={r.bank}>
              <tr>
                <td>{r.bank}</td><td>{r.pass}</td><td className={r.fail ? "text-critical font-medium" : ""}>{r.fail}</td><td>{r.missing}</td>
                <td>{r.ready_to_join ? <span className="text-good font-medium">Yes</span> : <span className="text-critical font-medium">Fix first</span>}</td>
                <td>{r.checks.length > 0 && <button className="btn text-xs" onClick={() => setOpen(open === r.bank ? null : r.bank)}>{open === r.bank ? "Hide" : "Show issues"}</button>}</td>
              </tr>
              {open === r.bank && (
                <tr><td colSpan={6}>
                  <ul className="text-xs space-y-0.5">
                    {r.checks.slice(0, 16).map((k: any) => <li key={k.feature}><code>{k.feature}</code>: <span className={k.status === "fail" ? "text-critical" : "text-ink-muted"}>{k.detail}</span></li>)}
                  </ul>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-muted mt-2">The last row is a deliberately broken bank: balances in paise instead of rupees and no registry features. The validator catches the unit error before it can corrupt the shared model; missing features are allowed. Run: <code>python -m fedshield.contract validate your_features.parquet</code></p>
    </Section>
  );
}

function MonitorPanel({ m }: { m: any }) {
  const banks = Object.keys(m.drift);
  const tc = m.releases.test_check ?? {};
  const keys = Object.keys(tc);
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Section title="Can a bank rely on it? Release rule with rollback" sub={m.releases.rule}>
        <div className="flex flex-wrap gap-1.5">
          {m.releases.versions.map((v: any) => (
            <span key={v.round} title={Object.entries(v.val).map(([b, x]: any) => `${b} ${x}`).join(" · ")}
              className={`text-xs px-2 py-1 rounded border ${v.decision === "release" ? (v.round === m.releases.live_round ? "border-good bg-good/10 text-good font-medium" : "border-line") : "border-warn/50 text-warn"}`}>
              round {v.round}: {v.decision === "release" ? (v.round === m.releases.live_round ? "LIVE" : "released") : `held${Object.keys(v.regressions).length ? ` (${Object.keys(v.regressions).join(", ")} dropped)` : ""}`}
            </span>
          ))}
        </div>
        {keys.length === 2 && (
          <table className="data w-full mt-3">
            <thead><tr><th>Held-out test</th><th>Overall</th>{banks.map((b) => <th key={b} style={{ color: BANK_COLOR[b] }}>{b}</th>)}</tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k}><td>Round {k}{+k === m.releases.live_round ? " (released)" : " (latest)"}</td><td>{tc[k].overall.toFixed(3)}</td>
                {banks.map((b) => <td key={b}>{tc[k][b].toFixed(3)}</td>)}</tr>
            ))}</tbody>
          </table>
        )}
        <p className="text-xs text-ink-muted mt-2">Bank C's own validation fell after round 100, so the network keeps round 100. On held-out accounts that version is equal overall and better for Banks A and C; Bank B gives up a little. Every bank can veto a regression on its own data.</p>
      </Section>
      <Section title="Drift and calibration" sub="PSI: under 0.1 stable · 0.1–0.25 watch · over 0.25 act">
        <table className="data w-full">
          <thead><tr><th>Bank</th><th>Score PSI</th><th>Worst top-feature PSI</th><th>Status</th></tr></thead>
          <tbody>{banks.map((b) => {
            const fv = Object.values(m.drift[b].features).filter((x) => x != null) as number[];
            return <tr key={b}><td style={{ color: BANK_COLOR[b] }}>{b}</td><td>{m.drift[b].score_psi.toFixed(3)}</td><td>{Math.max(...fv).toFixed(3)}</td>
              <td className={m.drift[b].status === "stable" ? "text-good" : "text-warn"}>{m.drift[b].status}</td></tr>;
          })}</tbody>
        </table>
        <div className="mt-3 label">Calibration · observed mule rate by score band (ECE {m.calibration.ece})</div>
        <div className="flex items-end gap-1 h-24 mt-1">
          {m.calibration.bands.map((c: any) => (
            <div key={c.band} className="flex-1 flex flex-col items-center justify-end h-full" title={`${c.band}: predicted ${(c.predicted * 100).toFixed(0)}%, observed ${(c.observed * 100).toFixed(1)}% (n=${c.n})`}>
              <div className="w-full flex items-end gap-px h-full">
                <div className="flex-1 bg-axis rounded-t" style={{ height: `${c.predicted * 100}%` }} />
                <div className="flex-1 bg-brand rounded-t" style={{ height: `${c.observed * 100}%` }} />
              </div>
              <span className="text-[9px] text-ink-muted mt-0.5">{c.band.split("-")[0]}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-muted mt-2">Grey = score, blue = observed rate. {m.calibration.note}</p>
      </Section>
    </div>
  );
}
