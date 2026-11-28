# Demo runbook (offline, on stage)

Everything runs on the laptop. No internet is needed once the steps below are done.

## Before you leave for the venue
1. `cd FedShield` and start the app:
   ```
   .venv\Scripts\python -m uvicorn fedshield.api.server:app --port 8077
   ```
   (Port 8000 is taken on this machine. Wait for `Application startup complete`, about 10–20 s.)
2. Open `http://localhost:8077` in Chrome. Pick a role and click **Sign in** (no password).
3. Run the click-through test once: `set UI_BROWSER=chrome && .venv\Scripts\python tests\ui_smoke.py` (expect `0 problem(s)`).
4. Record the backup video: sign in as **Bank A**, press **Present** (top bar), screen-record the 70-second tour.
5. Charge the laptop, disable sleep, close other heavy apps (the server needs ~3 GB RAM).

## Five-minute pitch, mapped to screens
| Time | Say | Show |
|---|---|---|
| 0:00 | Mule money crosses banks; each bank sees one hop. | **Overview** |
| 0:30 | One real scam, two outcomes. | **Scam simulator** → Launch scam |
| 1:30 | Not an illustration: 202 real laundering chains across banks; 60% → 81% interrupted, fewer false alarms. | **Scam simulator** → Real laundering chains → toggle |
| 2:15 | How: banks share masked summaries only. A co-op bank with 25 known mules goes 0.53 → 0.76. | **How it works** (4×, Skip to end, section 3) |
| 3:15 | What an officer sees: ranked queue, reasons in Hindi/Kannada, STR draft. | **Alert queue** (Bank A) |
| 3:45 | Can a bank rely on it? Feature contract, release rule with rollback, threat model. | **Deployment & trust** |
| 4:30 | Ask: shadow-mode pilot with 2–3 co-op banks beside MuleHunter.AI. | **Overview** |

## If something fails
- **Page blank or API error:** restart the server (step 1); hard-refresh the browser (Ctrl+Shift+R).
- **Port in use:** use `--port 8078` and open that port instead.
- **Laptop dies or projector issue:** play the recorded Present video.
- **Judge asks for a number not on screen:** `docs/FedShield_onepager_v2.pdf` has every headline figure.

## Regenerate results (only if data changed; takes ~45 min total)
```
python -m fedshield.experiments.theatre      # How it works curves (~11 min)
python -m fedshield.experiments.gaps         # stress tests (~12 min)
python -m fedshield.experiments.aml_chains   # real chains (~4 min; needs AMLworld in archive/ and FEDSHIELD_AML_DIR)
python -m fedshield.contract demo            # feature contract
python -m fedshield.experiments.monitor      # drift, calibration, releases
```
