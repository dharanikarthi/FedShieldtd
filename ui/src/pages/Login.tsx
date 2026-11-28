import { useEffect, useState } from "react";
import { BANK_COLOR, get, post, setSession } from "../api";
import { Icon, Logo } from "../components/icons";

type Persona = { user: string; role: string; bank: string | null; name: string; scope: { can: string[]; cannot: string[] } };

const accent = (p: Persona) => (p.role === "bank" ? BANK_COLOR[p.bank!] : p.role === "admin" ? "var(--c-ink)" : "#d55181");
const GROUPS = [
  { role: "bank", title: "Member banks", icon: "bank", d: "Fraud officers see only their own bank's accounts" },
  { role: "admin", title: "Network operator", icon: "network", d: "Runs federated training; sees no customer rows" },
  { role: "rbi", title: "Regulator", icon: "building", d: "Pseudonymised cross-bank view and audit trail" },
];

export default function Login({ theme, toggleTheme }: { theme: string; toggleTheme: () => void }) {
  const [ps, setPs] = useState<Persona[]>([]);
  const [sel, setSel] = useState<Persona | null>(null);
  const [pw, setPw] = useState("fedshield");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<Persona[]>("/personas").then(setPs).catch((e) => setErr(String(e.message))); }, []);

  async function go(p: Persona) {
    setErr(undefined); setBusy(true);
    try { setSession(await post("/login", { username: p.user, password: pw })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1.15fr]">
      {/* Brand panel */}
      <aside className="hidden lg:flex flex-col justify-between p-10 bg-[#0f1f4b] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]" aria-hidden
          style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="#fff" /><path d="M8.5 12l2.5 2.5 4.5-5" stroke="#0f1f4b" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          <span className="text-lg font-semibold tracking-tight">FedShield</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">Banks learn together.<br />Customer data stays home.</h1>
          <p className="text-white/70 mt-4 leading-relaxed">Federated mule-account intelligence for India's banking network, built to work alongside MuleHunter.AI and DPIP.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              ["0 customer records shared", "only masked model updates leave a bank"],
              ["99.6% of pooled accuracy", "without pooling any data"],
              ["Small banks gain the most", "co-op bank: 0.53 → 0.76 AUC-PR on day one"],
            ].map(([a, b]) => (
              <li key={a} className="flex gap-3"><span className="mt-0.5 w-5 h-5 rounded-full bg-white/10 grid place-items-center"><Icon name="check" size={12} /></span>
                <span><span className="font-medium">{a}</span><span className="text-white/60"> — {b}</span></span></li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-white/50">Demo on RBIH NFPC Phase-2 · 96,091 accounts · 3 simulated banks</div>
      </aside>

      {/* Sign-in panel */}
      <main className="flex flex-col p-6 md:p-10 bg-page">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible"><Logo /><span className="font-semibold">FedShield</span></div>
          <button className="btn text-xs px-2" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        </div>
        <div className="flex-1 flex flex-col justify-center max-w-2xl w-full mx-auto py-8">
          <h2 className="text-2xl font-semibold tracking-tight">Choose a role</h2>
          <p className="text-ink-2 text-sm mt-1">Each role sees a different, server-enforced slice of the system.</p>
          {err && !ps.length && <div className="card p-3 mt-4 text-sm text-critical">API unreachable: {err}</div>}

          <div className="mt-6 space-y-5">
            {GROUPS.map((g) => {
              const items = ps.filter((p) => p.role === g.role);
              if (!items.length) return null;
              return (
                <div key={g.role}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={g.icon} className="text-ink-muted" />
                    <span className="text-sm font-medium">{g.title}</span>
                    <span className="text-xs text-ink-muted">· {g.d}</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {items.map((p) => {
                      const on = sel?.user === p.user;
                      return (
                        <button key={p.user} onClick={() => setSel(p)}
                          className={`card text-left px-4 py-3 transition-all hover:border-axis ${on ? "ring-2 ring-brand border-brand" : ""}`}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent(p) }} />
                            <span className="font-medium text-sm">{p.name}</span>
                          </div>
                          <div className="text-[11px] text-ink-muted mt-1 font-mono">{p.user}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {sel && (
            <div className="card mt-6 p-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <div className="label mb-1.5">Can see</div>
                  <ul className="text-sm text-ink-2 space-y-1">{sel.scope.can.map((c) => <li key={c} className="flex gap-1.5"><Icon name="check" size={14} className="text-good mt-0.5" />{c}</li>)}</ul>
                </div>
                <div>
                  <div className="label mb-1.5">Cannot see</div>
                  <ul className="text-sm text-ink-2 space-y-1">{sel.scope.cannot.map((c) => <li key={c} className="flex gap-1.5"><Icon name="lock" size={14} className="text-ink-muted mt-0.5" />{c}</li>)}</ul>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3 mt-5 pt-4 border-t border-line">
                <label className="flex-1 min-w-[200px]">
                  <span className="label">Password</span>
                  <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(sel)}
                    className="sel w-full mt-1 outline-none focus:ring-2 focus:ring-brand/40" />
                </label>
                <button className="btn-primary px-5 py-2 inline-flex items-center gap-1.5" disabled={busy} onClick={() => go(sel)}>
                  Sign in as {sel.name} <Icon name="arrow" size={14} />
                </button>
              </div>
              <div className="text-[11px] text-ink-muted mt-2">Demo password: fedshield</div>
              {err && <div className="text-xs text-critical mt-2">{err}</div>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
