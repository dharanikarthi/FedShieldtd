// API location: same origin by default; set VITE_API_BASE (e.g. https://fedshield-api.example.com) for a
// static deployment such as Vercel where the API runs elsewhere.
export const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE || "").replace(/\/$/, "");
export const wsUrl = (path: string) => {
  const base = API_BASE || `${location.protocol}//${location.host}`;
  return base.replace(/^http/, "ws") + path;
};
export type Session = {
  token: string; user: string; role: "bank" | "admin" | "rbi"; bank: string | null; name: string;
  scope: { can: string[]; cannot: string[] };
};
const KEY = "fedshield.session";
export const session = (): Session | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
};
export const setSession = (s: Session | null) => {
  if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("fedshield-session"));
};
export class ApiError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = session();
  const r = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
  });
  if (r.status === 401 && s) setSession(null);
  if (!r.ok) {
    let d = `${r.status}`;
    try { d = (await r.json()).detail ?? d; } catch { /* not json */ }
    throw new ApiError(r.status, d);
  }
  return r.json();
}
export const get = <T = any>(path: string) => call<T>(path);
export const post = <T = any>(path: string, body: unknown = {}) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const pct = (v?: number | null, d = 1) => (v == null || isNaN(v) ? "—" : `${(v * 100).toFixed(d)}%`);
export const num = (v?: number | null, d = 3) => (v == null || isNaN(v) ? "—" : v.toFixed(d));
export const inr = (v: number) =>
  v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`;
// categorical slots (dark, validated): banks / model families
export const SERIES = ["#3987e5", "#d95926", "#199e70"];
export const BANK_COLOR: Record<string, string> = { "Bank-A": SERIES[0], "Bank-B": SERIES[1], "Bank-C": SERIES[2] };
// role accents: banks wear their series colour, aggregator neutral, RBI slot 5 (validated)
export const ROLE_ACCENT = (s: Session | null) =>
  !s ? "var(--c-muted)" : s.role === "bank" ? BANK_COLOR[s.bank!] : s.role === "admin" ? "var(--c-ink)" : "#d55181";
// Resolve a theme variable to a concrete colour (for libraries that can't read CSS vars, e.g. cytoscape)
export const cssColor = (v: string) =>
  v.replace(/var\((--[\w-]+)\)/g, (_, n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888");
