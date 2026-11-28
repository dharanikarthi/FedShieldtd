import { useEffect, useMemo, useState } from "react";
import { Area, Bar, ComposedChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { get, inr, pct, post, session } from "../api";
import FlowGraph from "../components/FlowGraph";
import { axis, Legend, ScoreBar, Section, Tier, tooltipStyle } from "../components/ui";

type Alert = { account_id: string; score: number; threshold: number; model: string; tier: string; bank: string; state: string; window: [string, string] | null; status?: string; ground_truth: number; conditions?: string[]; at_risk?: number };

export default function Console() {
  const bank = session()?.bank ?? "";
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const refresh = () => get<Alert[]>(`/alerts?limit=300`).then(setAlerts);
  useEffect(() => {
    get<Alert[]>(`/alerts?limit=300`).then((a) => { setAlerts(a); setSel(a[0]?.account_id ?? null); });
    get(`/demo/cases`).then((d) => setCases(d.cases ?? [])).catch(() => {});
  }, [bank]);
  const thr = alerts[0]?.threshold ?? 0.5;
  const model = alerts[0]?.model;
  const shown = alerts.filter((a) => !q || a.account_id.toLowerCase().includes(q.toLowerCase()));
  const counts = useMemo(() => ({
    review: alerts.filter((a) => a.score >= thr).length,
    monitor: alerts.filter((a) => a.score < thr).length,
    actioned: alerts.filter((a) => a.status).length,
  }), [alerts, thr]);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 xl:col-span-4 space-y-3">
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <span className="label">Scoring model</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded border ${model === "federated" ? "border-good" : "border-axis text-ink-2"}`}>
              {model === "federated" ? "Federated global model" : `${bank} local model`}
            </span>
          </div>
          <div className="text-xs text-ink-muted mt-1.5">
            {model === "federated" ? "Trained across the consortium: patterns from every bank, none of their data."
              : "Trained on this bank's accounts only. It has never seen fraud patterns from other banks."}
          </div>
          {cases.length > 0 && (
            <div className="mt-3">
              <div className="label mb-1.5">Watch list · test mules this bank's local model scores below its threshold</div>
              <div className="flex flex-wrap gap-1.5">
                {cases.slice(0, 6).map((c) => (
                  <button key={c.account_id} onClick={() => setSel(c.account_id)}
                    className={`btn text-xs py-1 ${sel === c.account_id ? "bg-raised border-ink-muted" : ""}`}>{c.account_id}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card py-2"><div className="label">To review</div><div className="text-xl font-semibold">{counts.review}</div></div>
          <div className="card py-2"><div className="label">Monitor</div><div className="text-xl font-semibold">{counts.monitor}</div></div>
          <div className="card py-2"><div className="label">Actioned</div><div className="text-xl font-semibold">{counts.actioned}</div></div>
        </div>
        <div className="card overflow-hidden">
          <div className="p-3 border-b border-line flex items-center gap-2">
            <div>
              <h3 className="text-sm font-semibold">Work queue</h3>
              <span className="text-[11px] text-ink-muted">ordered by conditions met, then ₹ still at risk</span>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account…"
              className="ml-auto bg-page border border-line rounded-md px-2 py-1 text-sm w-36 outline-none focus:border-ink-muted" />
          </div>
          <div className="max-h-[calc(100vh-290px)] overflow-y-auto">
            <table className="data w-full">
              <thead className="sticky top-0 bg-surface"><tr><th>Account</th><th>Risk</th><th className="text-right">₹ at risk</th></tr></thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.account_id} onClick={() => setSel(a.account_id)}
                    className={`cursor-pointer ${sel === a.account_id ? "bg-raised" : "hover:bg-raised/60"}`}>
                    <td>
                      <div className="font-medium">{a.account_id}</div>
                      <div className="text-[11px] text-ink-muted">{a.state}{a.status ? ` · ${a.status}` : ""}</div>
                      <div className="flex gap-1 mt-1">
                        {a.conditions?.includes("high_risk") && <span className="text-[10px] px-1.5 py-px rounded bg-critical/10 text-critical">High risk</span>}
                        {a.conditions?.includes("cross_bank") && <span className="text-[10px] px-1.5 py-px rounded bg-brand/10 text-brand">Cross-bank links</span>}
                      </div>
                    </td>
                    <td><ScoreBar v={a.score} thr={thr} /><div className="mt-1"><Tier tier={a.tier} /></div></td>
                    <td className="text-right text-sm tabular-nums">{a.at_risk ? inr(a.at_risk) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="col-span-12 xl:col-span-8">
        {sel ? <AccountView id={sel} onAction={refresh} /> : <div className="card p-10 text-center text-ink-muted">No alerts</div>}
      </div>
    </div>
  );
}

function AccountView({ id, onAction }: { id: string; onAction: () => void }) {
  const [d, setD] = useState<any>(null);
  const [g, setG] = useState<any>(null);
  const [note, setNote] = useState("");
  const [lang, setLang] = useState<string>(() => { try { return localStorage.getItem("fedshield.lang") || "en"; } catch { return "en"; } });
  const [str, setStr] = useState(false);
  const load = () => get(`/accounts/${id}?lang=${lang}`).then(setD);
  useEffect(() => { setD(null); setG(null); load(); get(`/accounts/${id}/graph`).then(setG).catch(() => setG({ nodes: [], edges: [] })); }, [id]);
  useEffect(() => { try { localStorage.setItem("fedshield.lang", lang); } catch { /* private mode */ } if (d) load(); }, [lang]);
  if (!d) return <div className="card p-10 text-center text-ink-muted">Loading…</div>;
  const act = async (a: string) => { await post(`/accounts/${id}/action`, { action: a, note }); setNote(""); load(); onAction(); };
  const win = d.window?.[0] ? [d.window[0].slice(0, 7), d.window[1].slice(0, 7)] : null;
  const reg = d.registry ?? {};
  return (
    <div className="space-y-4">
      {str && <StrDraft d={d} onClose={() => setStr(false)} />}
      {d.model === "federated" && d.local_score != null && (
        <div className={`card p-4 flex flex-wrap items-center gap-6 ${d.local_score < d.local_threshold && d.score >= d.threshold ? "border-critical" : ""}`}>
          <div className="label w-full -mb-3">MuleHunter companion · bank's own model + FedShield network signal</div>
          <div><div className="text-xs text-ink-muted">{d.bank}'s own model (MuleHunter-style, local data only)</div>
            <div className="text-2xl font-semibold text-ink-2">{(d.local_score * 100).toFixed(1)}%</div>
            <div className="text-[11px] text-ink-muted">{d.local_score >= d.local_threshold ? "flagged" : "not flagged"} · threshold {(d.local_threshold * 100).toFixed(0)}%</div></div>
          <div className="text-2xl text-ink-muted" aria-hidden>→</div>
          <div><div className="text-xs text-ink-muted">With FedShield network signal</div>
            <div className="text-2xl font-semibold">{(d.score * 100).toFixed(1)}%</div>
            <div className="text-[11px] text-ink-muted">{d.score >= d.threshold ? "flagged" : "not flagged"} · threshold {(d.threshold * 100).toFixed(0)}%</div></div>
          {d.local_score < d.local_threshold && d.score >= d.threshold && (
            <div className="text-sm text-ink-2 max-w-md">The federated model learned this pattern from other banks' confirmed cases. None of their data left their bank.</div>
          )}
        </div>
      )}
      <div className="card p-4 flex flex-wrap items-center gap-6">
        <div>
          <div className="label">Account</div>
          <div className="text-xl font-semibold">{d.account_id}</div>
          <div className="text-xs text-ink-muted">{d.bank} · {d.state}</div>
        </div>
        <div><div className="label">Mule risk · {d.model === "federated" ? "federated" : "local"} model</div><div className="text-3xl font-semibold">{(d.score * 100).toFixed(1)}%</div></div>
        <div><div className="label">Decision</div><div className="mt-1"><Tier tier={d.tier} /></div></div>
        <div>
          <div className="label">Suspicious window</div>
          <div className="text-sm mt-1">{d.window?.[0] ? `${d.window[0]} → ${d.window[1]}` : "—"}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="label">Consortium registry</div>
          <div className="text-sm mt-1">{reg.strong_link ? "Strong cross-bank link" : "No strong link"}</div>
          <div className="text-xs text-ink-2">{reg.strong_link ? <><span style={{ color: "#ec835a" }}>▲</span> shares rare counterparties with mules confirmed at other banks (top 3%)</> : "rare-counterparty overlap below the top-3% line"}</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <Section title="Why this alert" sub={`Top drivers of this score (tree-path feature attribution, ${d.model === "federated" ? "federated" : "local"} model)`}
            right={
              <div className="inline-flex rounded-md border border-line overflow-hidden text-xs" role="group" aria-label="Reason language">
                {[["en", "EN"], ["hi", "हिंदी"], ["kn", "ಕನ್ನಡ"]].map(([k, l]) => (
                  <button key={k} onClick={() => setLang(k)} className={`px-2 py-1 ${lang === k ? "bg-brand text-white" : "hover:bg-raised"}`}>{l}</button>
                ))}
              </div>
            }>
            <ol className="space-y-2.5">
              {d.reasons.map((r: any, i: number) => (
                <li key={r.feature} className="flex gap-3">
                  <span className="text-ink-muted text-xs w-4 pt-0.5">{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-sm">{r.text}</div>
                    <div className="mt-1 h-1 rounded-full bg-raised">
                      <div className="h-1 rounded-full bg-critical" style={{ width: `${Math.min(100, (r.impact / d.reasons[0].impact) * 100)}%` }} />
                    </div>
                  </div>
                </li>
              ))}
              {!d.reasons.length && <li className="text-sm text-ink-muted">No risk-raising factors.</li>}
              {d.mitigating && <li className="text-sm text-ink-2 pl-7">↓ {d.mitigating.text}</li>}
            </ol>
          </Section>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Section title="Money flow" sub="Top counterparties by value, plus other accounts sharing rare counterparties">
            <FlowGraph data={g} />
          </Section>
        </div>
      </div>

      <Section title="Monthly activity" sub={win ? "Shaded band: predicted suspicious window" : undefined}
        right={<Legend items={[{ label: "Credits", color: "#3987e5" }, { label: "Debits", color: "#d95926" }]} />}>
        <div className="h-52">
          <ResponsiveContainer>
            <ComposedChart data={d.timeline} margin={{ left: 8, right: 8, top: 4 }}>
              <XAxis dataKey="month" {...axis} minTickGap={30} />
              <YAxis {...axis} tickFormatter={(v) => inr(v)} width={70} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => inr(v)} />
              {win && <ReferenceArea x1={win[0]} x2={win[1]} fill="#d03b3b" fillOpacity={0.08} stroke="#d03b3b" strokeOpacity={0.3} />}
              <Bar dataKey="credit" name="Credits" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={10} />
              <Area dataKey="debit" name="Debits" stroke="#d95926" strokeWidth={2} fill="#d95926" fillOpacity={0.08} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7">
          <Section title="Graduated response" sub="Proportionate action instead of an immediate freeze. Every action goes to the audit log and back into training as a label.">
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.actions).map(([k, v]: any) => (
                <button key={k} className="btn" onClick={() => act(k)}>{v}</button>
              ))}
            </div>
            <button className="btn-primary mt-3 inline-flex items-center gap-1.5" onClick={() => setStr(true)}>Draft STR for FIU-IND</button>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Case note (optional)"
              className="mt-3 w-full bg-page border border-line rounded-md px-2 py-1.5 text-sm outline-none focus:border-ink-muted" />
            {d.history.length > 0 && (
              <ul className="mt-3 text-xs text-ink-2 space-y-1">
                {d.history.map((h: any) => <li key={h.ts}>{h.ts.slice(0, 19).replace("T", " ")} · {h.officer} · {h.label}{h.note ? ` — ${h.note}` : ""}</li>)}
              </ul>
            )}
          </Section>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <Section title="Evaluation ground truth" sub="Prototype only; a real officer would not see this">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-ink-muted">Labelled mule</dt><dd>{d.label.is_mule ? "yes" : "no"}</dd>
              <dt className="text-ink-muted">Flag date</dt><dd>{d.label.flag_date ?? "—"}</dd>
              <dt className="text-ink-muted">Bank's alert reason</dt><dd>{d.label.alert_reason ?? "—"}</dd>
              <dt className="text-ink-muted">Label confidence</dt><dd>{pct(d.label.label_confidence, 0)}</dd>
              <dt className="text-ink-muted">Red-herring flags</dt><dd className="text-xs">{d.label.red_herring_flags ?? "none"}</dd>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}

function StrDraft({ d, onClose }: { d: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const total = (d.timeline ?? []).reduce((a: number, m: any) => a + (m.credit || 0), 0);
  const text = [
    `SUSPICIOUS TRANSACTION REPORT: DRAFT (for FIU-IND FINnet submission; review before filing)`,
    ``,
    `Reporting entity : ${d.bank}`,
    `Date of draft    : ${today}`,
    `Account          : ${d.account_id} (${d.state})`,
    `Suspicion window : ${d.window?.[0] ? `${d.window[0]} to ${d.window[1]}` : "not determined"}`,
    `Credits in data  : ${inr(total)}`,
    `Risk score       : ${(d.score * 100).toFixed(1)}% (${d.model === "federated" ? "FedShield federated model" : "bank's own model"}; alert threshold ${(d.threshold * 100).toFixed(0)}%)`,
    `Suspected typology: money-mule account`,
    ``,
    `GROUNDS OF SUSPICION`,
    ...d.reasons.map((r: any, i: number) => `${i + 1}. ${r.text}`),
    d.registry?.reg_cp_flagged ? `${d.reasons.length + 1}. ${d.registry.reg_cp_flagged} counterparties are linked to mule accounts confirmed at other member banks (hashed consortium registry; no other bank's customer data was disclosed).` : null,
    ``,
    `ACTION TAKEN`,
    ...(d.history?.length ? d.history.map((h: any) => `- ${h.ts.slice(0, 10)}: ${h.label}${h.note ? ` (${h.note})` : ""}`) : ["- None recorded yet."]),
    ``,
    `Prepared by the fraud-risk unit with FedShield decision support. The officer must verify every ground above before filing.`,
  ].filter((l) => l !== null).join(String.fromCharCode(10));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="STR draft">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">STR draft: {d.account_id}</h3>
          <span className="text-xs text-ink-muted">auto-filled from the alert; edit before filing</span>
          <button className="ml-auto btn text-xs" onClick={onClose}>Close</button>
        </div>
        <textarea defaultValue={text} className="mt-3 w-full h-80 sel font-mono text-xs leading-relaxed" aria-label="STR text" />
        <div className="flex gap-2 mt-3">
          <button className="btn-primary" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); }}>{copied ? "Copied" : "Copy text"}</button>
          <button className="btn" onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(`<pre style="font:13px/1.5 monospace;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>`); w.print(); } }}>Print</button>
        </div>
      </div>
    </div>
  );
}
