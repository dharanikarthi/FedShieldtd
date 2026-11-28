import { useEffect, useRef, useState } from "react";
import { BANK_COLOR, get, inr } from "../api";
import { Icon } from "../components/icons";

type Hop = { bank: string; account: string; local_score: number; local_threshold: number; fed_score: number; fed_threshold: number; typology?: string };

const AMOUNT = 480000;           // ₹4.8 lakh "digital arrest" scam
const HOP_MIN = [6, 19, 34];     // minutes after the victim pays when money lands at each mule
const CASHOUT_MIN = 47;
const GOLDEN = 60;

const BANK_KIND: Record<string, string> = { "Bank-A": "Private bank · Delhi", "Bank-B": "PSU bank · Odisha", "Bank-C": "Co-op bank · Karnataka" };

function Lane({ title, sub, hops, mode, step }: { title: string; sub: string; hops: Hop[]; mode: "local" | "fed"; step: number }) {
  // which hop (if any) stops the money in this lane
  const stopAt = hops.findIndex((h) => (mode === "local" ? h.local_score >= h.local_threshold : h.fed_score >= h.fed_threshold));
  const stopped = stopAt >= 0 && step > stopAt;
  const cashed = stopAt < 0 && step > hops.length;
  const minute = step === 0 ? 0 : step > hops.length ? CASHOUT_MIN : HOP_MIN[step - 1];
  const lost = cashed ? AMOUNT : 0;
  const saved = stopped ? AMOUNT : 0;
  const nodes = ["victim", ...hops.map((_, i) => `h${i}`), "atm"];

  return (
    <div className={`card p-5 ${stopped ? "ring-2 ring-good/60" : cashed ? "ring-2 ring-critical/50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-ink-muted">{sub}</div>
        </div>
        <div className="text-right">
          {stopped && <div className="text-good font-semibold">Frozen at minute {HOP_MIN[stopAt]}</div>}
          {cashed && <div className="text-critical font-semibold">Cashed out at minute {CASHOUT_MIN}</div>}
          {!stopped && !cashed && <div className="text-ink-2 text-sm">{step ? `minute ${minute}` : "waiting"}</div>}
          <div className="text-xs text-ink-muted">{saved ? `${inr(saved)} frozen before cash-out` : lost ? `${inr(lost)} lost` : " "}</div>
        </div>
      </div>

      {/* chain */}
      <div className="mt-5 flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {nodes.map((n, i) => {
          const isHop = n.startsWith("h");
          const h = isHop ? hops[i - 1] : null;
          const reached = i <= step && !(stopped && i > stopAt + 1);
          const frozenHere = stopped && i === stopAt + 1;
          const score = h ? (mode === "local" ? h.local_score : h.fed_score) : 0;
          const thr = h ? (mode === "local" ? h.local_threshold : h.fed_threshold) : 1;
          const flagged = h && score >= thr;
          return (
            <div key={n} className="flex items-center gap-1.5 shrink-0">
              {i > 0 && (
                <div className={`h-0.5 w-6 rounded transition-colors duration-500 ${reached ? (frozenHere ? "bg-good" : "bg-critical") : "bg-line"}`} />
              )}
              <div className={`w-[118px] rounded-lg border p-2.5 transition-all duration-500 ${reached ? "opacity-100" : "opacity-40"} ${frozenHere ? "border-good bg-good/5" : reached && isHop ? "border-critical/50" : "border-line"}`}>
                {n === "victim" && (<><div className="text-xs font-medium flex items-center gap-1"><Icon name="users" size={13} />Victim, Pune</div><div className="text-[11px] text-ink-muted mt-1">pays {inr(AMOUNT)} via UPI</div></>)}
                {n === "atm" && (<><div className="text-xs font-medium flex items-center gap-1"><Icon name="arrow" size={13} />ATM cash-out</div><div className="text-[11px] text-ink-muted mt-1">money untraceable</div></>)}
                {h && (
                  <>
                    <div className="text-xs font-medium" style={{ color: BANK_COLOR[h.bank] }}>{h.bank}</div>
                    <div className="text-[10px] text-ink-muted font-mono">{h.account}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-raised relative">
                      <div className="absolute h-1.5 rounded-full transition-all duration-700" style={{ width: reached ? `${Math.max(3, score * 100)}%` : "0%", background: flagged ? "#d03b3b" : "var(--c-muted)" }} />
                      <div className="absolute -top-0.5 h-2.5 w-px bg-ink" style={{ left: `${thr * 100}%` }} />
                    </div>
                    <div className="text-[11px] mt-1">{reached ? <>risk <b>{Math.round(score * 100)}%</b> · {flagged ? <span className="text-critical font-medium">FLAG</span> : <span className="text-ink-muted">pass</span>}</> : " "}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Simulator() {
  const [hops, setHops] = useState<Hop[]>([]);
  const [err, setErr] = useState<string>();
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(false);
  const t = useRef<number>();
  useEffect(() => {
    get("/simulator").then((d) => {
      setHops(d.hops);
      if (new URLSearchParams(location.search).has("autoplay")) { setStep(1); setRun(true); }   // for kiosk/recording
    }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!run) return;
    if (step > hops.length) { setRun(false); return; }
    t.current = window.setTimeout(() => setStep(step + 1), 1500);
    return () => window.clearTimeout(t.current);
  }, [run, step, hops.length]);

  if (err) return <div className="card p-4 text-sm">Simulator unavailable: {err}</div>;
  if (!hops.length) return <div className="text-ink-muted text-sm">Loading…</div>;
  const minute = step === 0 ? 0 : step > hops.length ? CASHOUT_MIN : HOP_MIN[step - 1];

  return (
    <div className="space-y-5">
      <section className="card p-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex-1 min-w-[280px]">
            <div className="label">Scenario · "digital arrest" scam</div>
            <h2 className="text-xl font-semibold mt-1">A ₹4.8 lakh scam hops across three banks in 47 minutes.</h2>
            <p className="text-sm text-ink-2 mt-2 leading-relaxed">
              A caller posing as police frightens a retiree in Pune into paying ₹4.8 lakh over UPI. The money is layered through mule accounts
              at three banks, then withdrawn at an ATM. Each bank sees only its own hop. Recovery is realistic only in the <b>golden hour</b>,
              before the cash-out.
            </p>
          </div>
          <div className="w-full sm:w-72">
            <div className="flex items-baseline justify-between">
              <span className="label">Clock</span>
              <span className={`text-2xl font-semibold tabular-nums ${minute > GOLDEN ? "text-critical" : ""}`}>{String(minute).padStart(2, "0")}:00</span>
            </div>
            <div className="h-2 rounded-full bg-raised mt-2 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-brand transition-all duration-700" style={{ width: `${(minute / GOLDEN) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-ink-muted mt-1"><span>payment</span><span>golden hour ends · 60 min</span></div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5" disabled={run}
                onClick={() => { setStep(0); setTimeout(() => { setStep(1); setRun(true); }, 50); }}>
                <Icon name="play" size={14} /> {step ? "Replay scam" : "Launch scam"}
              </button>
              <button className="btn" onClick={() => { setRun(false); setStep(0); }}>Reset</button>
            </div>
          </div>
        </div>
      </section>

      <Lane title="Today: each bank alone" sub="Each bank's own model, trained only on its own accounts" hops={hops} mode="local" step={step} />
      <Lane title="With FedShield" sub="Same banks, same accounts. Each model has learned from the whole network." hops={hops} mode="fed" step={step} />

      <RealChain />

      <section className="card p-5 text-sm text-ink-2 leading-relaxed">
        <div className="font-medium text-ink mb-1 flex items-center gap-2"><Icon name="check" className="text-good" />What is real here</div>
        Each hop is a <b>real held-out mule account</b> from NFPC Phase-2 (shown hashed) that its own bank's model scored below the alert
        threshold, and the federated model scored above it. The risk scores and thresholds are the models' actual outputs. The chain, the
        amounts and the timings are illustrative: NFPC accounts at different simulated banks are not linked by real transfers.
        <div className="mt-2 text-xs text-ink-muted">On the full held-out set, FedShield caught 37 mules that the banks' own models missed, and missed 6 that they caught (net +31).</div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ real chain (IBM AMLworld)
const BANKS5 = ["Bank-A", "Bank-B", "Bank-C", "Bank-D", "Bank-E"];
const C5: Record<string, string> = { "Bank-A": "#3987e5", "Bank-B": "#d95926", "Bank-C": "#199e70", "Bank-D": "#9a5bd6", "Bank-E": "#c98a00" };

function RealChain() {
  const [c, setC] = useState<any>();
  const [mode, setMode] = useState<"local" | "fed">("local");
  useEffect(() => { get("/aml_chains").then(setC).catch(() => setC(null)); }, []);
  if (c === undefined) return null;
  if (c === null) return (
    <section className="card p-5 text-sm text-ink-2">Real-chain evidence not generated yet: run <code>python -m fedshield.experiments.aml_chains</code>.</section>
  );
  const sc = c.showcase;
  const W = 760, lanes = sc ? sc.banks : [];
  const laneY = (b: string) => 40 + lanes.indexOf(b) * 62;
  const H = 40 + Math.max(1, lanes.length) * 62;
  // place nodes left→right by first appearance in the time-ordered transfers
  const order: string[] = [];
  sc?.edges.forEach((e: any) => { [e.src, e.dst].forEach((n: string) => { if (!order.includes(n)) order.push(n); }); });
  sc?.nodes.forEach((n: any) => { if (!order.includes(n.id)) order.push(n.id); });
  const byId: Record<string, any> = Object.fromEntries((sc?.nodes ?? []).map((n: any) => [n.id, n]));
  const x = (id: string) => 70 + (order.indexOf(id) / Math.max(1, order.length - 1)) * (W - 140);
  const flagged = (n: any) => (mode === "local" ? n.local_score >= n.local_thr : n.fed_score >= n.fed_thr);
  const pct1 = (v: number) => (v < 0.05 ? `${(v * 100).toFixed(2)}%` : `${Math.round(v * 100)}%`);

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[280px]">
          <div className="label">Real data · IBM AMLworld (synthetic bank network, labelled laundering)</div>
          <h2 className="text-lg font-semibold mt-1">Real laundering chains cross banks. Does anyone catch them?</h2>
          <p className="text-sm text-ink-2 mt-1">A chain is a connected group of laundering transfers. We kept the {c.chains_evaluated.toLocaleString("en-IN")} chains that span 3 or more of {c.institutions} banks, and judged only accounts whose labels no model ever saw.</p>
        </div>
        <div className="inline-flex rounded-md border border-line overflow-hidden text-sm self-start" role="group" aria-label="Detection mode">
          <button onClick={() => setMode("local")} className={`px-3 py-1.5 ${mode === "local" ? "bg-[#d95926] text-white" : "hover:bg-raised"}`}>Each bank alone</button>
          <button onClick={() => setMode("fed")} className={`px-3 py-1.5 ${mode === "fed" ? "bg-brand text-white" : "hover:bg-raised"}`}>FedShield + registry</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        {[["Chains interrupted", c.chains_interrupted, "at least one held-out account in the chain flagged"],
          ["Chain accounts flagged", c.chain_accounts_flagged, "share of held-out chain accounts flagged"],
          ["False-alarm rate", c.false_alarm_rate, "held-out clean accounts flagged"]].map(([l, v, sub]: any) => (
          <div key={l} className="rounded-lg border border-line p-3">
            <div className="label">{l}</div>
            <div className="text-2xl font-semibold mt-1" style={{ color: mode === "local" ? "#d95926" : "var(--c-brand)" }}>
              {pct1(mode === "local" ? v.each_bank_alone : v.fedshield_registry)}
            </div>
            <div className="text-[11px] text-ink-muted">{sub} · other mode {pct1(mode === "local" ? v.fedshield_registry : v.each_bank_alone)}</div>
          </div>
        ))}
      </div>

      {sc && (
        <div className="mt-5">
          <div className="text-sm font-medium">One real chain across {sc.banks.length} banks, transfers in time order</div>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] h-auto" role="img" aria-label="Laundering chain across banks">
              {lanes.map((b: string) => (
                <g key={b}>
                  <line x1={60} y1={laneY(b)} x2={W - 20} y2={laneY(b)} stroke="var(--c-line)" />
                  <text x={8} y={laneY(b) + 4} fontSize={12} fill={C5[b] ?? "var(--c-ink)"} fontWeight={600}>{b}</text>
                </g>
              ))}
              {sc.edges.map((e: any, i: number) => byId[e.src] && byId[e.dst] && (
                <line key={i} x1={x(e.src)} y1={laneY(byId[e.src].bank)} x2={x(e.dst)} y2={laneY(byId[e.dst].bank)}
                  stroke="var(--c-muted)" strokeOpacity={0.6} markerEnd="url(#arr)" />
              ))}
              <defs><marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--c-muted)" /></marker></defs>
              {sc.nodes.map((n: any) => {
                const f = flagged(n);
                if (!n.held_out) return (
                  <g key={n.id} transform={`translate(${x(n.id)},${laneY(n.bank)})`}>
                    <circle r={4} fill="var(--c-axis)"><title>{n.id} · {n.bank} · training account (label used in training; not scored)</title></circle>
                  </g>
                );
                return (
                  <g key={n.id} transform={`translate(${x(n.id)},${laneY(n.bank)})`}>
                    <circle r={f ? 11 : 8} fill={f ? "#d03b3b" : "var(--c-surface)"} stroke={f ? "#d03b3b" : C5[n.bank]} strokeWidth={2} style={{ transition: "all .4s" }}>
                      <title>{n.id} · {n.bank} · own model {pct1(n.local_score)} (thr {pct1(n.local_thr)}) · FedShield {pct1(n.fed_score)} (thr {pct1(n.fed_thr)}){n.held_out ? " · held-out" : ""}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-[11px] text-ink-muted mt-1">Large circles = held-out accounts (red = flagged). Small grey dots = training accounts, whose labels were used for training, so they are not scored here. Hover a circle for both scores.</p>
        </div>
      )}
      <p className="text-xs text-ink-muted mt-3">
        Chains FedShield interrupts and no single bank does: <b>{c.chains_only_fedshield_interrupts}</b>; the reverse: <b>{c.chains_only_local_interrupts}</b>.
        Banks are 5 groups of AMLworld bank IDs; each sees only transfers touching its own accounts.
      </p>
    </section>
  );
}
