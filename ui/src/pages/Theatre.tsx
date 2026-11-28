import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BANK_COLOR, get, pct } from "../api";
import { Legend, Section, Stat, axis, tooltipStyle } from "../components/ui";

const LOCAL = "#d95926", FED = "#3987e5", POOL = "var(--c-muted)";
const BANK_LABEL: Record<string, string> = {
  "Bank-A": "Bank A · large private bank",
  "Bank-B": "Bank B · PSU bank",
  "Bank-C": "Bank C · co-operative bank",
};
const hex = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");

// ------------------------------------------------------------------ animated federation diagram
function FlowDiagram({ banks, phase, round }: { banks: string[]; phase: number; round: number }) {
  // phase 0 idle · 1 banks compute · 2 masked packets fly up · 3 aggregator sums · 4 tree broadcast
  const W = 640, H = 300, ax = W / 2, ay = 60;
  const pos = banks.map((_, i) => ({ x: 110 + i * ((W - 220) / Math.max(1, banks.length - 1)), y: 260 }));
  const [noise, setNoise] = useState<string[]>(banks.map(hex));
  useEffect(() => { setNoise(banks.map(hex)); }, [round, phase]);
  const t = phase === 2 ? 1 : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label="Banks send masked gradient histograms to the aggregator, which decodes only the sum and broadcasts a new tree">
      {pos.map((p, i) => (
        <line key={i} x1={p.x} y1={p.y - 30} x2={ax} y2={ay + 30} stroke="var(--c-axis)" strokeDasharray="4 5" />
      ))}
      {/* aggregator */}
      <g>
        <rect x={ax - 120} y={ay - 32} width={240} height={64} rx={12}
          fill="var(--c-surface)" stroke={phase === 3 ? "var(--c-ink)" : "var(--c-axis)"} strokeWidth={phase === 3 ? 2 : 1} />
        <text x={ax} y={ay - 8} textAnchor="middle" fill="var(--c-ink)" fontSize={16} fontWeight={600}>Neutral aggregator</text>
        <text x={ax} y={ay + 14} textAnchor="middle" fill={phase === 3 ? "#12a150" : "var(--c-muted)"} fontSize={12}>
          {phase === 3 ? "Σ masks cancel → only the SUM is visible" : phase === 4 ? `tree ${round} → all banks` : "sees no rows, no single bank"}
        </text>
      </g>
      {/* packets */}
      {pos.map((p, i) => {
        const up = phase === 2, down = phase === 4;
        const x = up ? ax + (i - 1) * 40 : down ? p.x : p.x, y = up ? ay + 46 : down ? p.y - 44 : p.y - 44;
        const show = up || down;
        return (
          <g key={`pk${i}`} style={{ transform: `translate(${show ? x : p.x}px, ${show ? y : p.y - 44}px)`, transition: "transform 0.9s ease-in-out", opacity: show ? 1 : 0 }}>
            <rect x={-46} y={-12} width={92} height={24} rx={6} fill={down ? "var(--c-raised)" : "var(--c-raised)"} stroke={down ? "#12a150" : BANK_COLOR[banks[i]]} />
            <text x={0} y={4} textAnchor="middle" fontSize={11} fontFamily="ui-monospace,monospace" fill={down ? "#12a150" : "var(--c-ink-2)"}>
              {down ? "🌳 new tree" : `0x${noise[i]}…`}
            </text>
          </g>
        );
      })}
      {/* banks */}
      {pos.map((p, i) => (
        <g key={banks[i]}>
          <rect x={p.x - 92} y={p.y - 30} width={184} height={60} rx={12} fill="var(--c-surface)"
            stroke={BANK_COLOR[banks[i]]} strokeWidth={phase === 1 ? 2.5 : 1.5} />
          <text x={p.x} y={p.y - 6} textAnchor="middle" fill="var(--c-ink)" fontSize={16} fontWeight={600}>{banks[i]}</text>
          <text x={p.x} y={p.y + 14} textAnchor="middle" fill="var(--c-muted)" fontSize={12}>
            {phase === 1 ? "computing gradients on own data…" : "🔒 raw data stays here"}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 4} textAnchor="middle" fill="var(--c-muted)" fontSize={11}>
        {t ? "Each packet is a gradient histogram + a random mask. Alone it is noise." : " "}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ page
export default function Theatre() {
  const [d, setD] = useState<any>();
  const [err, setErr] = useState<string>();
  const [idx, setIdx] = useState(0);            // rounds revealed (index into d.rounds)
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frac, setFrac] = useState<string>("0.05");
  const [scamIdx, setScamIdx] = useState(0);
  const [scamPlaying, setScamPlaying] = useState(false);
  const timer = useRef<number>();

  const auto = useRef(new URLSearchParams(location.search).has("autoplay"));
  useEffect(() => {
    get("/theatre").then((x) => {
      setD(x);
      if (auto.current) { setSpeed(4); setPhase(1); setPlaying(true); }
    }).catch((e) => setErr(e.message));
  }, []);

  // round animation: compute → masked up → sum → broadcast, then reveal next point
  useEffect(() => {
    if (!playing || !d) return;
    const ms = 700 / speed;
    timer.current = window.setTimeout(() => {
      if (phase < 4) setPhase(phase + 1);
      else if (idx < d.rounds.length) { setIdx(idx + 1); setPhase(1); }
      else {
        setPlaying(false); setPhase(0);
        if (auto.current) { auto.current = false; document.getElementById("act3")?.scrollIntoView({ behavior: "smooth" }); setScamIdx(0); setScamPlaying(true); }
      }
    }, ms);
    return () => window.clearTimeout(timer.current);
  }, [playing, phase, idx, d, speed]);

  useEffect(() => {
    if (!scamPlaying || !d) return;
    const h = window.setTimeout(() => {
      if (scamIdx < d.rounds.length) setScamIdx(scamIdx + 1); else setScamPlaying(false);
    }, 260);
    return () => window.clearTimeout(h);
  }, [scamPlaying, scamIdx, d]);

  const banks: string[] = useMemo(() => (d ? Object.keys(d.race) : []), [d]);
  if (err) return <div className="card p-4 text-sm">Theatre data not available: {err}</div>;
  if (!d) return <div className="text-ink-muted text-sm">Loading…</div>;

  const R: number[] = d.rounds;
  const series = (b: string) => R.map((r, i) => ({
    round: r,
    local: i < idx ? d.race[b].local[i] : null,
    federated: i < idx ? d.race[b].federated[i] : null,
    pooled: d.race[b].pooled[i],
  }));
  const last = (b: string, k: string) => d.race[b][k][Math.max(0, Math.min(idx, R.length) - 1)];
  const C = d.cold_start, CR = C.runs[frac] ?? Object.values(C.runs)[0];
  const si = Math.max(0, Math.min(scamIdx, R.length) - 1);
  const totalAccts = banks.reduce((a, b) => a + d.banks[b].train_accounts + d.banks[b].test_accounts, 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink-2 max-w-3xl">
          Three banks with different customers learn one mule-detection model together. No customer row ever leaves a bank.
          Every curve below is a real training run on NFPC Phase-2 ({totalAccts.toLocaleString("en-IN")} accounts), replayed tree by tree.
        </p>
      </div>

      {/* Act 1 */}
      <Section title="1 · The banks are different" sub="Split by branch state, so each bank has its own customer mix and fraud rate">
        <div className="grid md:grid-cols-3 gap-3">
          {banks.map((b) => (
            <div key={b} className="rounded-lg border p-3" style={{ borderColor: BANK_COLOR[b] }}>
              <div className="font-medium" style={{ color: BANK_COLOR[b] }}>{BANK_LABEL[b] ?? b}</div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div><div className="label">Accounts</div>{(d.banks[b].train_accounts + d.banks[b].test_accounts).toLocaleString("en-IN")}</div>
                <div><div className="label">Known mules</div>{d.banks[b].train_mules.toLocaleString("en-IN")}</div>
                <div><div className="label">Mule rate</div>{pct(d.banks[b].mule_rate, 2)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Act 2 */}
      <Section title="2 · Train together, share nothing"
        sub="Each round = one tree. Banks send masked histograms; the aggregator can only decode their sum."
        right={
          <div className="flex items-center gap-2">
            <select className="btn text-xs" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
            </select>
            <button className="btn text-xs" onClick={() => { if (idx >= R.length) { setIdx(0); } setPhase(1); setPlaying(!playing); }}>
              {playing ? "Pause" : idx >= R.length ? "Replay" : idx ? "Resume" : "▶ Start training"}
            </button>
            <button className="btn text-xs" onClick={() => { setPlaying(false); setIdx(R.length); setPhase(0); }}>Skip to end</button>
            <button className="btn text-xs" onClick={() => { setPlaying(false); setIdx(0); setPhase(0); }}>Reset</button>
          </div>
        }>
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-center">
          <FlowDiagram banks={banks} phase={phase} round={R[Math.max(0, idx - 1)] ?? 0} />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Trees built" value={`${idx ? R[idx - 1] : 0} / ${R[R.length - 1]}`} />
            <Stat label="Customer rows shared" value={<span className="text-good">0</span>} sub="only binned G/H sums" />
            <Stat label="Payload per tree node" value={`${(d.traffic.histogram_bytes_per_node / 1024).toFixed(0)} KB`} sub="per bank, masked" />
            <Stat label="Federated vs pooled" value={idx ? `${(100 * banks.reduce((a, b) => a + last(b, "federated") / last(b, "pooled"), 0) / banks.length).toFixed(1)}%` : "—"} sub="of the pooled-data AUPRC" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Legend items={[{ label: "This bank alone", color: LOCAL }, { label: "FedShield (all banks, no data shared)", color: FED }, { label: "Pooled data (not legally possible)", color: POOL, dash: true }]} />
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-2">
          {banks.map((b) => (
            <div key={b} className="rounded-lg bg-page/40 p-2">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-sm font-medium" style={{ color: BANK_COLOR[b] }}>{b}</span>
                {idx > 0 && (
                  <span className="text-xs text-ink-2">
                    alone {last(b, "local").toFixed(3)} → <span style={{ color: FED }} className="font-semibold">{last(b, "federated").toFixed(3)}</span>
                  </span>
                )}
              </div>
              <div className="h-44">
                <ResponsiveContainer>
                  <LineChart data={series(b)} margin={{ left: -10, right: 8, top: 8 }}>
                    <CartesianGrid stroke="var(--c-line)" vertical={false} />
                    <XAxis dataKey="round" {...axis} />
                    <YAxis {...axis} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => v?.toFixed(3)} labelFormatter={(l) => `tree ${l}`} />
                    <Line dataKey="pooled" stroke={POOL} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line dataKey="local" stroke={LOCAL} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                    <Line dataKey="federated" stroke={FED} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
        {idx >= R.length && banks.every((b) => d.race[b].personalised != null) && (
          <div className="mt-3 rounded-lg border border-line p-3">
            <div className="text-sm font-medium">Personalised layer: each bank decides on its own data</div>
            <p className="text-xs text-ink-muted mt-0.5">Each bank picks, on its own held-out accounts, the best of: the shared model, the shared model fine-tuned on its own data, or a blend with its own model. Nothing leaves the bank. Differences of about 0.01 are within noise at this test size (roughly 130–200 test mules per bank).</p>
            <div className="grid sm:grid-cols-3 gap-2 mt-2 text-sm">
              {banks.map((b) => {
                const loc = d.race[b].local.at(-1), fedv = d.race[b].federated.at(-1), per = d.race[b].personalised;
                return (
                  <div key={b} className="flex items-baseline justify-between rounded-md bg-raised px-3 py-2">
                    <span style={{ color: BANK_COLOR[b] }} className="font-medium">{b}</span>
                    <span className="text-xs text-ink-2">alone {loc.toFixed(3)} · shared {fedv.toFixed(3)} · <b className={per >= loc ? "text-good" : "text-critical"}>final {per.toFixed(3)}</b> <span className="text-ink-muted">({d.race[b].personalised_choice})</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-ink-muted mt-2">AUC-PR on each bank's own held-out accounts. Theatre runs use a compact model ({d.params.n_trees} trees, depth {d.params.max_depth}); the full model's numbers are on the Evidence page.</p>
      </Section>

      {/* Act 3 */}
      <div id="act3" />
      <Section title="3 · A small bank joins with almost no fraud history"
        sub={`${C.bank} (co-operative bank) keeps only a few labelled mules. How well can it detect mules on day one? Scored on its ${C.test_accounts.toLocaleString("en-IN")} held-out accounts.`}
        right={
          <div className="flex items-center gap-2">
            <select className="btn text-xs" value={frac} onChange={(e) => { setFrac(e.target.value); setScamIdx(0); }} aria-label="labelled mules">
              {Object.keys(C.runs).map((f) => <option key={f} value={f}>{C.runs[f].labelled_mules} labelled mules</option>)}
            </select>
            <button className="btn text-xs" onClick={() => { setScamIdx(0); setScamPlaying(true); }}>▶ Join the network</button>
          </div>
        }>
        <JoinDiagram joined={scamIdx > 0} progress={scamIdx / R.length} />
        <div className="grid md:grid-cols-[1fr_1fr_1.2fr] gap-4 items-center mt-3">
          {[["local", `${C.bank} alone`, LOCAL], ["federated", `${C.bank} in FedShield`, FED]].map(([k, label, c]) => {
            const v = scamIdx ? CR[k as string][si] : C.random_auprc;
            return (
              <div key={k as string} className="card p-4">
                <div className="label">{label as string}</div>
                <div className="text-3xl font-semibold mt-1" style={{ color: c as string }}>{v.toFixed(3)}</div>
                <div className="text-xs text-ink-muted">AUC-PR (random guessing = {C.random_auprc.toFixed(3)})</div>
                <div className="h-2 rounded-full bg-raised mt-3"><div className="h-2 rounded-full transition-all duration-200" style={{ width: `${v * 100}%`, background: c as string }} /></div>
              </div>
            );
          })}
          <div className="text-sm text-ink-2 space-y-2">
            <p>With <b className="text-ink">{CR.labelled_mules}</b> labelled mules, {C.bank} alone reaches <b className="text-ink">{CR.local[CR.local.length - 1].toFixed(3)}</b>.
              In the federation it gets <b style={{ color: FED }}>{CR.federated[CR.federated.length - 1].toFixed(3)}</b> on day one, close to what it would reach with its full history.</p>
            <p className="text-xs text-ink-muted">India has 1,400+ urban co-operative banks and dozens of RRBs. Most can't build a mule model alone; this is how they get one.</p>
          </div>
        </div>
      </Section>

      {/* Act 5 */}
      <FeedbackLoop />

      {/* Act 4 */}
      <Section title="5 · One engine, every RBI-regulated entity" sub="The federated core is the same; each entity plugs in through one adapter">
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          {[
            ["Banks, co-op banks, RRBs", "Mule accounts", "NFPC adapter · live", true],
            ["Banks + payment rails", "Cross-institution laundering", "IBM AMLworld adapter · live", true],
            ["NBFCs & digital lenders", "Onboarding / loan-application fraud", "BAF adapter · live", true],
            ["PPI wallets & payment aggregators", "Wallet mules, QR/merchant fraud", "Next adapter", false],
          ].map(([e, f, s, live]) => (
            <div key={e as string} className="rounded-lg border border-line p-3">
              <div className="font-medium">{e as string}</div>
              <div className="text-ink-2 text-xs mt-1">{f as string}</div>
              <div className={`text-xs mt-2 ${live ? "text-good" : "text-ink-muted"}`}>{live ? "● " : "○ "}{s as string}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-muted mt-3">Designed to sit beside MuleHunter.AI at each bank, as its cross-bank learning layer, and to feed privacy-safe signals to DPIP.</p>
      </Section>
    </div>
  );
}

function JoinDiagram({ joined, progress }: { joined: boolean; progress: number }) {
  const W = 640, H = 150, ax = 250, ay = 75;
  const members = [{ n: "Bank-A", x: 90, y: 30 }, { n: "Bank-B", x: 90, y: 120 }, { n: "Bank-C", x: 410, y: 30 }];
  const nx = joined ? 520 : 640, ny = 110;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-44" role="img" aria-label="A new co-operative bank joins the federation">
      {members.map((m) => <line key={m.n} x1={m.x} y1={m.y} x2={ax} y2={ay} stroke="var(--c-axis)" />)}
      <line x1={nx} y1={ny} x2={ax} y2={ay} stroke={joined ? FED : "transparent"} strokeWidth={2} strokeDasharray="5 5"
        style={{ transition: "all 0.8s ease" }}>
        {joined && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.8s" repeatCount="indefinite" />}
      </line>
      <circle cx={ax} cy={ay} r={32} fill="var(--c-surface)" stroke="var(--c-ink)" />
      <text x={ax} y={ay + 4} textAnchor="middle" fontSize={10} fill="var(--c-ink)">Aggregator</text>
      {members.map((m) => (
        <g key={m.n}>
          <circle cx={m.x} cy={m.y} r={18} fill="var(--c-surface)" stroke={BANK_COLOR[m.n]} strokeWidth={2} />
          <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize={10} fill="var(--c-ink)">{m.n.slice(-1)}</text>
        </g>
      ))}
      <g style={{ transform: `translate(${nx}px, ${ny}px)`, transition: "transform 0.9s cubic-bezier(.2,.8,.2,1)" }}>
        <circle r={22} fill="var(--c-surface)" stroke={FED} strokeWidth={2.5} />
        <circle r={22} fill="none" stroke={FED} strokeWidth={2.5} strokeDasharray={`${progress * 138} 138`} transform="rotate(-90)" opacity={0.35} />
        <text y={4} textAnchor="middle" fontSize={10} fill="var(--c-ink)">Co-op</text>
        <text y={38} textAnchor="middle" fontSize={10} fill="var(--c-muted)">{joined ? "receives the network model" : ""}</text>
      </g>
    </svg>
  );
}

const LOOP = [
  { t: "Victim calls 1930", d: "An I4C cybercrime complaint names the beneficiary account." },
  { t: "Bank confirms the mule", d: "The bank's investigator verifies and marks the account." },
  { t: "Label shield checks it", d: "Doubtful labels (flag before any activity, no reason) are down-weighted, not trusted blindly." },
  { t: "Next federation round", d: "The confirmed case becomes training signal at its own bank only. Its data never moves." },
  { t: "Every bank is protected", d: "The updated shared model reaches all member banks the same day." },
];

function FeedbackLoop() {
  const [k, setK] = useState(0);
  useEffect(() => { const h = window.setInterval(() => setK((x) => (x + 1) % LOOP.length), 2200); return () => window.clearInterval(h); }, []);
  return (
    <Section title="4 · The network keeps learning" sub="Every confirmed case anywhere makes every member bank better. This is how the loop closes.">
      <ol className="grid md:grid-cols-5 gap-2">
        {LOOP.map((s, i) => (
          <li key={s.t} className={`rounded-lg border p-3 transition-all duration-500 ${i === k ? "border-brand bg-brand/5 shadow-sm" : "border-line opacity-70"}`}>
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold ${i === k ? "bg-brand text-white" : "bg-raised text-ink-2"}`}>{i + 1}</span>
              <span className="text-sm font-medium">{s.t}</span>
            </div>
            <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">{s.d}</p>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-ink-muted mt-2">Process view. In this prototype, I4C/EFRM/AML evidence feeds are simulated from NFPC labels; no public complaint data exists.</p>
    </Section>
  );
}
