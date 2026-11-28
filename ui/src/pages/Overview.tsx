import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { session, get } from "../api";
import { Icon } from "../components/icons";
import { axis } from "../components/ui";

const STEPS = [
  { icon: "bank", t: "Each bank trains on its own data", d: "Transactions, KYC and confirmed mule labels stay inside the bank." },
  { icon: "lock", t: "Only masked summaries leave", d: "Gradient histograms, masked so no single bank's numbers can be read." },
  { icon: "network", t: "Aggregator decodes the sum", d: "Builds one shared model, without seeing any bank's data." },
  { icon: "shield", t: "Every bank gets the network model", d: "Plugs in beside MuleHunter.AI; signals can feed DPIP." },
];

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className="text-3xl font-semibold mt-2 tracking-tight" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="text-xs text-ink-muted mt-1 leading-relaxed">{sub}</div>
    </div>
  );
}

export default function Overview() {
  const [s, setS] = useState<any>();
  const [t, setT] = useState<any>();
  useEffect(() => {
    get("/summary").then(setS).catch(() => {});
    get("/theatre").then(setT).catch(() => {});
  }, []);
  const role = session()?.role;
  const fed = s?.nfpc_registry?.fed;
  const fm = s?.final_model?.test;
  const cold = t?.cold_start?.runs?.["0.05"];
  const bars = fed ? [
    { k: "Each bank alone", v: fed.local_own_auprc_mean, c: "#d95926" },
    { k: "FedShield", v: fed.fed_own_auprc_mean, c: "var(--c-brand)" },
    { k: "Pooled data*", v: fed.central_overall_auprc, c: "var(--c-axis)" },
  ] : [];
  const next = role === "bank" ? { to: "/alerts", l: "Open alert queue" } : role === "admin" ? { to: "/training", l: "Run a federation round" } : { to: "/supervision", l: "Open supervisory view" };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="card p-7 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand/5" aria-hidden />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-brand/10 text-brand">
            <Icon name="shield" size={12} /> Track 1 · Privacy-preserving fraud-intelligence sharing
          </div>
          <h2 className="text-2xl md:text-[28px] font-semibold tracking-tight mt-3 leading-snug">
            Mule money crosses banks. Each bank sees only its own accounts.
            <span className="text-brand"> FedShield lets banks learn together without sharing customer data.</span>
          </h2>
          <p className="text-ink-2 mt-3 text-[15px] leading-relaxed">
            A federated learning layer for India's banks: each bank's model, MuleHunter.AI included, learns from the whole network's
            fraud patterns, while customer data never leaves the bank. Compliant by design with the DPDP Act 2023.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <Link to="/how-it-works" className="btn-primary inline-flex items-center gap-1.5"><Icon name="play" size={14} /> See how it works</Link>
            <Link to="/scam-simulator" className="btn inline-flex items-center gap-1.5"><Icon name="spark" size={14} /> Run the scam simulator</Link>
            <Link to={next.to} className="btn inline-flex items-center gap-1.5">{next.l} <Icon name="arrow" size={14} /></Link>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Customer records shared" value="0" tone="#12a150" sub="Only masked gradient histograms cross bank lines" />
        <Kpi label="Detection quality (AUC-PR)" value={fed ? fed.fed_own_auprc_mean.toFixed(3) : "—"}
          sub={fed ? `vs ${fed.central_overall_auprc.toFixed(3)} if all data were pooled — ${(100 * fed.fed_own_auprc_mean / fed.central_overall_auprc).toFixed(1)}% of the ceiling` : ""} />
        <Kpi label="Small bank, day one" value={cold ? `${cold.local.at(-1).toFixed(2)} → ${cold.federated.at(-1).toFixed(2)}` : "—"} tone="var(--c-brand)"
          sub={cold ? `A co-op bank with only ${cold.labelled_mules} known mules, alone vs in the network` : ""} />
        <Kpi label="Top 1% of alerts" value={fm ? `${Math.round(fm.precision_at_1pct * 100)}%` : "—"}
          sub="are confirmed mules — a short, high-quality review queue" />
      </section>

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6">
        {/* How it works */}
        <section className="card p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">How it works</h3>
            <Link to="/how-it-works" className="text-sm text-brand inline-flex items-center gap-1">Watch it live <Icon name="arrow" size={14} /></Link>
          </div>
          <ol className="mt-4 grid sm:grid-cols-2 gap-4">
            {STEPS.map((x, i) => (
              <li key={x.t} className="flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={x.icon} size={18} /></div>
                <div>
                  <div className="text-sm font-medium"><span className="text-ink-muted mr-1">{i + 1}.</span>{x.t}</div>
                  <div className="text-xs text-ink-muted mt-0.5 leading-relaxed">{x.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Headline chart */}
        <section className="card p-6">
          <h3 className="font-semibold">Federated matches pooled — without pooling</h3>
          <p className="text-xs text-ink-muted mt-0.5">AUC-PR on each bank's held-out accounts · NFPC Phase-2</p>
          <div className="h-52 mt-3">
            <ResponsiveContainer>
              <BarChart data={bars} margin={{ top: 20, left: -18, right: 8 }}>
                <CartesianGrid stroke="var(--c-line)" vertical={false} />
                <XAxis dataKey="k" {...axis} />
                <YAxis {...axis} domain={[0.7, 0.8]} tickFormatter={(v) => v.toFixed(2)} />
                <Bar dataKey="v" radius={[6, 6, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                  {bars.map((b) => <Cell key={b.k} fill={b.c} />)}
                  <LabelList dataKey="v" position="top" formatter={(v: number) => v.toFixed(3)} fill="var(--c-ink-2)" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-ink-muted">*Pooling customer data across banks is not legally possible; shown as the ceiling.</p>
        </section>
      </div>

      {/* Where it fits */}
      <section className="card p-6">
        <h3 className="font-semibold">Where it fits in India's fraud stack</h3>
        <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm">
          {[
            ["Complements MuleHunter.AI", "MuleHunter scores accounts inside each bank. FedShield adds the cross-bank learning layer on top, so every bank learns from the whole network."],
            ["Feeds DPIP", "The hashed suspect registry and pattern library are privacy-safe signals a national platform can use."],
            ["Brings in small banks", "Co-operative banks and RRBs get network-grade detection without building their own model or sharing their data."],
          ].map(([h, d]) => (
            <div key={h} className="rounded-lg border border-line p-4">
              <div className="font-medium flex items-center gap-2"><Icon name="check" className="text-good" />{h}</div>
              <p className="text-ink-2 text-[13px] mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
