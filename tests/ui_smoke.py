"""Click-through UI test using the locally installed Microsoft Edge (no browser download).

    python tests/ui_smoke.py [base_url] [out_dir]

Logs in through the real login page, visits every page for each role, exercises the
interactive pieces (STR dialog, language toggle, scam simulator, Present tour) at desktop and
phone widths, and fails on any uncaught page error or console error.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8077"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "ui_test_shots")
OUT.mkdir(parents=True, exist_ok=True)
PAGES = {
    "Bank A · Fraud officer": ["/", "/alerts", "/stream", "/scam-simulator", "/how-it-works", "/evidence", "/trust"],
    "FedShield aggregation server": ["/training", "/network"],
    "RBI supervisory desk": ["/supervision"],
}
problems = []


def watch(page, tag):
    page.on("pageerror", lambda e: problems.append(f"[{tag}] page error: {e}"))
    page.on("console", lambda m: m.type == "error" and "favicon" not in m.text and
            problems.append(f"[{tag}] console error: {m.text[:200]}"))


def login(page, persona):
    page.goto(BASE + "/")
    page.evaluate("localStorage.clear()")
    page.goto(BASE + "/")
    page.get_by_role("button", name=persona).first.click()
    page.get_by_role("button", name=f"Sign in as {persona}").click()
    page.wait_for_selector("main", timeout=10000)


def check(cond, msg):
    if not cond:
        problems.append(msg)
    print(("ok   " if cond else "FAIL ") + msg)


with sync_playwright() as p:
    br = p.chromium.launch(channel=__import__("os").environ.get("UI_BROWSER", "msedge"), headless=True)
    for w, h, tag in ((1440, 1000, "desktop"), (390, 844, "phone")):
        ctx = br.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        watch(page, tag)
        for persona, paths in PAGES.items():
            login(page, persona)
            for path in paths:
                page.goto(BASE + path)
                page.wait_for_timeout(1500)
                name = f"{tag}_{persona.split()[0]}_{path.strip('/') or 'overview'}"
                page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
                sw = page.evaluate("document.documentElement.scrollWidth")
                check(sw <= w + 1, f"[{tag}] {path} no horizontal scroll (scrollWidth {sw} vs {w})")
        # interactive checks as Bank A
        login(page, "Bank A · Fraud officer")
        page.goto(BASE + "/alerts")
        page.wait_for_selector("text=Why this alert", timeout=10000)
        page.get_by_role("button", name="हिंदी").click()
        page.wait_for_timeout(1500)
        check(page.locator("text=सामान्य").count() > 0, f"[{tag}] Hindi reasons render")
        page.get_by_role("button", name="EN", exact=True).click()
        page.get_by_role("button", name="Draft STR for FIU-IND").click()
        check(page.get_by_role("dialog", name="STR draft").is_visible(), f"[{tag}] STR dialog opens")
        txt = page.get_by_label("STR text").input_value()
        check("GROUNDS OF SUSPICION" in txt and "Reporting entity" in txt, f"[{tag}] STR text is filled")
        page.screenshot(path=str(OUT / f"{tag}_str_dialog.png"))
        page.get_by_role("button", name="Close", exact=True).click()
        page.goto(BASE + "/scam-simulator")
        page.get_by_role("button", name="Launch scam", exact=True).click()
        page.wait_for_timeout(7000)
        check(page.locator("text=Frozen at minute").count() > 0, f"[{tag}] simulator freezes in FedShield lane")
        check(page.locator("text=Cashed out at minute").count() > 0, f"[{tag}] simulator cashes out in alone lane")
        if tag == "desktop":
            page.goto(BASE + "/")
            page.get_by_role("button", name="Present", exact=True).click()
            page.wait_for_timeout(2000)
            check(page.locator("text=1/").count() > 0, f"[{tag}] Present tour starts with caption")
            page.wait_for_timeout(11000)
            check("/scam-simulator" in page.url, f"[{tag}] tour advances to simulator ({page.url})")
            page.get_by_role("button", name="Stop").first.click()
        ctx.close()
    br.close()

print("\n%d problem(s)" % len(problems))
for x in problems:
    print(" -", x)
sys.exit(1 if problems else 0)
