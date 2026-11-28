import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ROLE_ACCENT, Session, get, session, setSession } from "./api";
import { Icon, Logo } from "./components/icons";
import Console from "./pages/Console";
import Federation from "./pages/Federation";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Pipeline from "./pages/Pipeline";
import Results from "./pages/Results";
import Stream from "./pages/Stream";
import Supervisor from "./pages/Supervisor";
import Theatre from "./pages/Theatre";
import Simulator from "./pages/Simulator";
import Trust from "./pages/Trust";

type Item = { to: string; label: string; icon: string; el: JSX.Element; hint: string };
type Group = { title: string; items: Item[] };

// Information architecture: Overview (why) → Operate (the role's daily work) → Understand (how + proof)
const OVERVIEW: Item = { to: "/", label: "Overview", icon: "home", el: <Overview />, hint: "What FedShield does and the headline results" };
const UNDERSTAND: Item[] = [
  { to: "/scam-simulator", label: "Scam simulator", icon: "spark", el: <Simulator />, hint: "Follow a real scam across three banks: alone vs FedShield" },
  { to: "/how-it-works", label: "How it works", icon: "play", el: <Theatre />, hint: "Animated federated training, replayed from real runs" },
  { to: "/evidence", label: "Evidence", icon: "chart", el: <Results />, hint: "Every experiment, metric and limitation" },
  { to: "/trust", label: "Deployment & trust", icon: "lock", el: <Trust />, hint: "Architecture, stress tests, threat model, governance, cost" },
];
const OPERATE: Record<Session["role"], Item[]> = {
  bank: [
    { to: "/alerts", label: "Alert queue", icon: "inbox", el: <Console />, hint: "Accounts flagged at your bank, with reasons" },
    { to: "/stream", label: "Live transactions", icon: "pulse", el: <Stream />, hint: "Real-time scoring of incoming payments" },
  ],
  admin: [
    { to: "/training", label: "Run federation", icon: "cpu", el: <Pipeline />, hint: "Launch a live federated training round" },
    { to: "/network", label: "Network health", icon: "network", el: <Federation />, hint: "Member banks, gates, privacy budget" },
  ],
  rbi: [
    { to: "/supervision", label: "Supervisory view", icon: "building", el: <Supervisor />, hint: "Cross-bank mule clusters and audit trail" },
  ],
};
const ROLE_NAME = { bank: "Bank fraud officer", admin: "Network operator", rbi: "RBI supervisor" };

// Presentation mode: a captioned auto-tour that doubles as the backup if a live demo fails
const TOUR = [
  { to: "/", ms: 11000, cap: "The problem: mule money crosses banks, but each bank only sees its own accounts." },
  { to: "/scam-simulator?autoplay", ms: 11000, cap: "A real scam, two outcomes: each bank alone vs the same banks with FedShield." },
  { to: "/how-it-works?autoplay", ms: 34000, cap: "How it works: banks train together and only masked summaries move. A small bank gets the network's model on day one." },
  { to: "/evidence", ms: 9000, cap: "Every number is reproducible, and the limitations are reported too." },
  { to: "/trust", ms: 10000, cap: "Deployment: who runs it, what it survives, what it does not protect, and what it costs." },
];

function useTheme() {
  const [t, setT] = useState<string>(() => { try { return localStorage.getItem("fedshield.theme") || "light"; } catch { return "light"; } });
  useEffect(() => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("fedshield.theme", t); } catch { /* private mode */ }
  }, [t]);
  return [t, () => setT(t === "light" ? "dark" : "light")] as const;
}

export default function App() {
  const [s, setS] = useState<Session | null>(session());
  const [me, setMe] = useState<any>(null);
  const [probe, setProbe] = useState<string>();
  const [theme, toggle] = useTheme();
  const [tour, setTour] = useState<number | null>(null);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const h = () => setS(session());
    window.addEventListener("fedshield-session", h);
    return () => window.removeEventListener("fedshield-session", h);
  }, []);
  useEffect(() => {
    if (tour == null) return;
    if (tour >= TOUR.length) { setTour(null); return; }
    nav(TOUR[tour].to);
    const h = window.setTimeout(() => setTour(tour + 1), TOUR[tour].ms);
    return () => window.clearTimeout(h);
  }, [tour]);
  useEffect(() => { if (s) get("/me").then(setMe).catch(() => {}); else setMe(null); }, [s?.token]);
  if (!s) return <Login theme={theme} toggleTheme={toggle} />;

  const accent = ROLE_ACCENT(s);
  const groups: Group[] = [
    { title: "", items: [OVERVIEW] },
    { title: "Operate", items: OPERATE[s.role] },
    { title: "Understand", items: UNDERSTAND },
  ];
  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => i.to === loc.pathname) ?? OVERVIEW;

  async function runProbe() {
    const t = me?.probe_target;
    if (!t) return;
    try { await get(`/accounts/${t.account_id}`); setProbe(`Unexpected: ${t.bank} account was returned`); }
    catch (e: any) { setProbe(`${e.status} Forbidden — ${s!.bank} asked for ${t.account_id} (${t.bank}) and the server refused.`); }
    setTimeout(() => setProbe(undefined), 7000);
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-line bg-surface hidden md:flex flex-col sticky top-0 h-screen">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-line">
          <Logo size={26} />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">FedShield</div>
            <div className="text-[11px] text-ink-muted">Federated mule intelligence</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((g) => (
            <div key={g.title || "top"}>
              {g.title && <div className="label px-3 mb-1.5">{g.title}</div>}
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end title={n.hint} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                    <Icon name={n.icon} />{n.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <div className="rounded-lg bg-raised p-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
              <span className="text-sm font-medium truncate">{s.name}</span>
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">{ROLE_NAME[s.role]} · <span className="font-mono">{s.user}</span></div>
            <button className="btn text-xs w-full mt-2.5" onClick={() => setSession(null)}>Switch role</button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-line bg-surface/90 backdrop-blur sticky top-0 z-20">
          <div className="h-full px-6 flex items-center gap-4">
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold truncate">{current.label}</h1>
              <p className="text-xs text-ink-muted truncate">{current.hint}</p>
            </div>
            {/* mobile nav */}
            <select className="sel md:hidden ml-auto max-w-[45%]" value={current.to} onChange={(e) => nav(e.target.value)} aria-label="Navigate">
              {all.map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
            </select>
            <div className="ml-auto hidden md:flex items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded-md border border-line text-ink-2">Demo · NFPC Phase-2 · 96,091 accounts</span>
              {s.role === "bank" && (
                <span className={`text-[11px] px-2 py-1 rounded-md border ${me?.deployed ? "border-good/50 text-good bg-good/5" : "border-line text-ink-2"}`}>
                  {me?.deployed ? "● Federated model live" : "○ Local model only"}
                </span>
              )}
              {s.role === "rbi" && <span className="text-[11px] px-2 py-1 rounded-md border border-line text-ink-2">Read-only</span>}
              {s.role === "bank" && <button className="btn text-xs" onClick={runProbe} title="Ask the server for another bank's account">Privacy probe</button>}
              <button className="btn-primary text-xs inline-flex items-center gap-1" onClick={() => setTour(tour == null ? 0 : null)} title="Auto-play a 1-minute guided tour">
                <Icon name="play" size={13} />{tour == null ? "Present" : "Stop"}
              </button>
              <button className="btn text-xs px-2" onClick={toggle} aria-label="Toggle theme" title="Toggle light / dark">
                <Icon name={theme === "light" ? "moon" : "sun"} />
              </button>
            </div>
          </div>
        </header>
        {probe && (
          <div className="px-6 pt-4">
            <div className="card p-3 text-sm border-good/50 flex gap-2 items-start">
              <Icon name="shield" className="text-good mt-0.5" /><div><span className="text-good font-medium">Scope enforced.</span> <span className="text-ink-2">{probe}</span></div>
            </div>
          </div>
        )}
        <main className="flex-1 px-6 py-6 max-w-[1500px] w-full">
          <Routes>
            {all.map((n) => <Route key={n.to} path={n.to} element={n.el} />)}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {tour != null && tour < TOUR.length && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(760px,92vw)]">
            <div className="rounded-xl bg-[#0f1f4b] text-white shadow-2xl px-5 py-3.5 flex items-center gap-4">
              <span className="text-xs font-mono text-white/60">{tour + 1}/{TOUR.length}</span>
              <span className="text-sm flex-1">{TOUR[tour].cap}</span>
              <button className="text-xs text-white/70 hover:text-white" onClick={() => setTour(tour + 1)}>Next →</button>
              <button className="text-xs text-white/70 hover:text-white" onClick={() => setTour(null)}>Stop</button>
            </div>
          </div>
        )}
        <footer className="px-6 pb-5 text-[11px] text-ink-muted">
          Signed in as {s.name}. Can see: {s.scope.can.join(" · ")}. Cannot see: {s.scope.cannot.join(" · ")}. Enforced server-side.
        </footer>
      </div>
    </div>
  );
}
